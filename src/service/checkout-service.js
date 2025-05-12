import { prismaClient } from '../application/database.js';
import { ResponseError } from '../error/response-error.js';
import komerceService from './komerce-service.js';
import midtransService from './midtrans-service.js';


const calculateCartTotals = (items) => {
  return items.reduce((acc, item) => {
    const itemTotal = item.product.price * item.quantity;
    const itemWeight = item.product.weight * item.quantity;
    
    return {
      subTotal: acc.subTotal + itemTotal,
      totalWeight: acc.totalWeight + itemWeight,
      itemsWithPrice: [
        ...acc.itemsWithPrice,
        {
          productId: item.product.id,
          product: item.product,
          quantity: item.quantity,
          price: item.product.price,
          weight: item.product.weight
        }
      ]
    };
  }, { subTotal: 0, totalWeight: 0, itemsWithPrice: [] });
};

const validateStockAvailability = (items) => {
  const outOfStockItems = items.filter(item => item.product.stock < item.quantity);
  
  if (outOfStockItems.length > 0) {
    throw new ResponseError(400, 'Insufficient stock', {
      outOfStockItems: outOfStockItems.map(item => ({
        productId: item.product.id,
        productName: item.product.name,
        requested: item.quantity,
        available: item.product.stock
      }))
    });
  }
};

const createMidtransTransaction = async (order, user) => {
  try {
    // Use database order ID as Midtrans order ID for easier tracking
    const midtransOrderId = order.id;
    // const midtransOrderId = `ORDER-${order.id}-${Date.now()}`;

    const itemDetails = order.items.map(item => ({
      id: item.productId,
      name: item.product.name.substring(0, 50),
      price: item.price,
      quantity: item.quantity,
      category: 'General'
    }));

    if (order.shippingCost > 0) {
      itemDetails.push({
        id: 'SHIPPING_FEE',
        name: `${order.shipping_name} ${order.service_name} Shipping`,
        price: order.shippingCost,
        quantity: 1,
        category: 'Shipping'
      });
    }

    const parameter = {
      transaction_details: {
        order_id: midtransOrderId, // Use database order ID
        gross_amount: order.totalAmount
      },
      item_details: itemDetails,
      customer_details: {
        first_name: user.fullName?.split(' ')[0] || 'Customer',
        last_name: user.fullName?.split(' ')[1] || '',
        email: user.email,
        phone: user.phone || '',
        billing_address: {
          address: order.shippingAddress,
          city: order.shippingCity,
          postal_code: order.shippingPostCode,
          country_code: 'IDN'
        }
      },
      callbacks: {
        finish: `${process.env.FRONTEND_URL}/orders/${order.id}`,
        error: `${process.env.FRONTEND_URL}/orders/${order.id}?status=failed`,
        pending: `${process.env.FRONTEND_URL}/orders/${order.id}?status=pending`
      },
      expiry: {
        unit: 'hours',
        duration: 24
      },
      metadata: {
        internal_order_id: order.id // Additional reference
      }
    };

    const transaction = await midtransService.snap.createTransaction(parameter);
    
    return {
      paymentUrl: transaction.redirect_url,
      token: transaction.token,
      midtransOrderId
    };

  } catch (error) {
    console.error('Midtrans error:', {
      message: error.message,
      response: error.ApiResponse,
      stack: error.stack
    });
    throw new ResponseError(500, 'Failed to create payment transaction');
  }
};

const processCheckout = async (userId, checkoutData) => {
  return await prismaClient.$transaction(async (prisma) => {
    const cart = await prisma.cart.findUnique({
      where: { userId },
      include: { items: { include: { product: true } } }
    });

    if (!cart?.items?.length) throw new ResponseError(400, 'Cart is empty');

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { fullName: true, email: true, phone: true }
    });

    const { subTotal, totalWeight, itemsWithPrice } = calculateCartTotals(cart.items);
    validateStockAvailability(cart.items);

    const shippingOptions = await komerceService.calculateShippingCost({
      shipper_destination_id: process.env.WAREHOUSE_LOCATION_ID,
      receiver_destination_id: checkoutData.destinationId,
      weight: totalWeight,
      item_value: subTotal
    });

    const selectedService = shippingOptions.find(service => 
      service.shipping_name.toLowerCase() === checkoutData.courier.toLowerCase() && 
      service.service_name.toLowerCase() === checkoutData.shippingService.toLowerCase()
    );

    if (!selectedService) {
      throw new ResponseError(400, 'Selected shipping service not available');
    }

    // Update product stocks
    await Promise.all(
      cart.items.map(item => 
        prisma.product.update({
          where: { id: item.productId },
          data: { stock: { decrement: item.quantity } }
        })
      )
    );

    const order = await prisma.order.create({
      data: {
        userId,
        items: {
          create: itemsWithPrice.map(item => ({
            productId: item.productId,
            quantity: item.quantity,
            price: item.price,
            productName: item.product.name,
            weight: item.weight
          }))
        },
        status: 'PENDING',
        paymentStatus: 'PENDING',
        totalAmount: subTotal + selectedService.price,
        customerName: user.fullName,
        customerEmail: user.email,
        customerPhone: user.phone,
        shippingAddress: checkoutData.shippingAddress,
        shippingCity: checkoutData.shippingCity,
        shippingProvince: checkoutData.shippingProvince,
        shippingPostCode: checkoutData.shippingPostCode,
        shippingCost: selectedService.price,
        shipping_name: selectedService.shipping_name,
        service_name: selectedService.service_name,
        estimatedDelivery: selectedService.etd || '1-3 days',
        paymentMethod: checkoutData.paymentMethod // e.g., 'bank_transfer', 'gopay', etc.
      },
      include: { items: { include: { product: true } } }
    });

    await prisma.cartItem.deleteMany({ where: { cartId: cart.id } });

    const paymentData = await createMidtransTransaction(order, user);

    return await prisma.order.update({
      where: { id: order.id },
      data: {
        paymentToken: paymentData.token,
        paymentUrl: paymentData.paymentUrl,
        midtransOrderId: paymentData.midtransOrderId
      },
      include: { items: { include: { product: true } } }}
    )
  },  {
    maxWait: 20000, // 20 detik maksimal menunggu
    timeout: 15000  // 15 detik timeout
  });
};


const checkPaymentStatus = async (orderId) => {
  const order = await prismaClient.order.findUnique({
      where: { id: orderId },
      select: { midtransOrderId: true }
  });
  
  if (!order) throw new ResponseError(404, 'Order not found');
  
  const statusResponse = await midtransService.core.transaction.status(order.midtransOrderId);
  
  return {
      status: mapMidtransStatus(statusResponse.transaction_status),
      paymentMethod: statusResponse.payment_type,
      paidAt: statusResponse.settlement_time || null,
      vaNumber: statusResponse.va_numbers?.[0]?.va_number,
      bank: statusResponse.va_numbers?.[0]?.bank
  } ,  {
    maxWait: 20000, // 20 detik maksimal menunggu
    timeout: 15000  // 15 detik timeout
  };
};


export default {
  processCheckout,
  checkPaymentStatus
};

