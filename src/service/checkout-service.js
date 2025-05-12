import { prismaClient } from '../application/database.js';
import { ResponseError } from '../error/response-error.js';
import komerceService from './komerce-service.js';
import snap from './midtrans-service.js';
import crypto from 'crypto';

const validateStock = (items) => {
  const outOfStock = items.filter(i => i.product.stock < i.quantity);
  if (outOfStock.length) {
    throw new ResponseError(400, 'Insufficient stock', { outOfStock });
  }
};

const calculateTotals = (items) => {
  return items.reduce((acc, item) => {
    const total = item.product.price * item.quantity;
    const weight = item.product.weight * item.quantity;
    acc.subTotal += total;
    acc.weight += weight;
    acc.details.push({
      productId: item.product.id,
      price: item.product.price,
      quantity: item.quantity,
      weight: item.product.weight,
      name: item.product.name
    });
    return acc;
  }, { subTotal: 0, weight: 0, details: [] });
};

const processCheckout = async (userId, data) => {
  return await prismaClient.$transaction(async (prisma) => {
    const cart = await prisma.cart.findUnique({
      where: { userId },
      include: { items: { include: { product: true } } }
    });

    if (!cart?.items.length) throw new ResponseError(400, 'Cart is empty');
    validateStock(cart.items);

    const user = await prisma.user.findUnique({ where: { id: userId } });
    const { subTotal, weight, details } = calculateTotals(cart.items);

    const shipping = await komerceService.calculateShippingCost({
      shipper_destination_id: process.env.WAREHOUSE_LOCATION_ID,
      receiver_destination_id: data.destinationId,
      weight,
      item_value: subTotal
    });

    const selected = shipping.find(s =>
      s.shipping_name.toLowerCase() === data.courier.toLowerCase() &&
      s.service_name.toLowerCase() === data.shippingService.toLowerCase()
    );

    if (!selected) throw new ResponseError(400, 'Invalid shipping option');

    const order = await prisma.order.create({
      data: {
        userId,
        status: 'PENDING',
        paymentStatus: 'PENDING',
        totalAmount: subTotal + selected.price,
        customerName: user.fullName,
        customerEmail: user.email,
        customerPhone: user.phone,
        shippingAddress: data.shippingAddress,
        shippingCity: data.shippingCity,
        shippingProvince: data.shippingProvince,
        shippingPostCode: data.shippingPostCode,
        shippingCost: selected.price,
        shipping_name: selected.shipping_name,
        service_name: selected.service_name,
        estimatedDelivery: selected.etd,
        items: {
          create: details.map(d => ({
            productId: d.productId,
            quantity: d.quantity,
            price: d.price,
            productName: d.name,
            weight: d.weight
          }))
        }
      },
      include: { items: true }
    });

    await prisma.cartItem.deleteMany({ where: { cartId: cart.id } });
    await Promise.all(cart.items.map(i =>
      prisma.product.update({
        where: { id: i.productId },
        data: { stock: { decrement: i.quantity } }
      })
    ));

    const midtrans = await snap.createTransaction({
      transaction_details: {
        order_id: order.id,
        gross_amount: order.totalAmount
      },
      item_details: [
        ...details.map(d => ({
          id: d.productId,
          name: d.name.substring(0, 50),
          price: d.price,
          quantity: d.quantity,
          category: 'General'
        })),
        {
          id: 'SHIPPING',
          name: `${selected.shipping_name} ${selected.service_name}`,
          price: selected.price,
          quantity: 1,
          category: 'Shipping'
        }
      ],
      customer_details: {
        first_name: user.fullName?.split(' ')[0] || 'Customer',
        last_name: user.fullName?.split(' ')[1] || '',
        email: user.email,
        phone: user.phone
      },
      callbacks: {
        finish: `${process.env.FRONTEND_URL}/orders/${order.id}`,
        error: `${process.env.FRONTEND_URL}/orders/${order.id}?status=failed`,
        pending: `${process.env.FRONTEND_URL}/orders/${order.id}?status=pending`
      },
      expiry: { unit: 'hours', duration: 24 }
    });

    return prisma.order.update({
      where: { id: order.id },
      data: {
        paymentToken: midtrans.token,
        paymentUrl: midtrans.redirect_url,
        midtransOrderId: order.id
      },
      include: { items: true }
    });
  }, {
    maxWait: 20000, // 20 detik maksimal menunggu
    timeout: 15000  // 15 detik timeout
  });
};

const verifyMidtransSignature = ({ order_id, status_code, gross_amount, signature_key }) => {
  const raw = order_id + status_code + gross_amount + process.env.MIDTRANS_SERVER_KEY;
  const expected = crypto.createHash('sha512').update(raw).digest('hex');
  return expected === signature_key;
};

const handlePaymentNotification = async (notification) => {
  if (!verifyMidtransSignature(notification)) {
    throw new ResponseError(403, 'Invalid signature from Midtrans');
  }

  const response = await snap.transaction.notification(notification);
  const orderId = response.order_id;

  const order = await prismaClient.order.findUnique({ where: { id: orderId } });
  if (!order) throw new ResponseError(404, 'Order not found');

  const update = {
    paymentMethod: response.payment_type,
    midtransResponse: JSON.stringify(response)
  };

  switch (response.transaction_status) {
    case 'capture':
      update.paymentStatus = response.fraud_status === 'accept' ? 'PAID' : 'CHALLENGE';
      update.status = update.paymentStatus === 'PAID' ? 'PAID' : 'PENDING';
      update.paidAt = new Date();
      break;
    case 'settlement':
      update.paymentStatus = 'PAID';
      update.status = 'PAID';
      update.paidAt = new Date();
      break;
    case 'cancel':
    case 'deny':
    case 'expire':
      update.paymentStatus = 'FAILED';
      update.status = 'CANCELLED';
      break;
    case 'pending':
      update.paymentStatus = 'PENDING';
      update.status = 'PENDING';
      break;
  }

  if (response.va_numbers?.length) {
    update.paymentVaNumber = response.va_numbers[0].va_number;
    update.paymentBank = response.va_numbers[0].bank;
  }

  const updatedOrder = await prismaClient.order.update({
    where: { id: orderId },
    data: update
  });

  await prismaClient.paymentLog.create({
    data: {
      orderId,
      paymentMethod: response.payment_type,
      amount: parseFloat(response.gross_amount),
      status: update.paymentStatus,
      transactionId: response.transaction_id,
      paymentVaNumber: update.paymentVaNumber,
      paymentTime: update.paidAt,
      paidAt: update.paidAt,
      payload: JSON.stringify(response)
    }
  });

  return updatedOrder;
};

export default {
  processCheckout,
  handlePaymentNotification
};
