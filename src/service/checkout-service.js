import { prismaClient } from '../application/database.js';
import { ResponseError } from '../error/response-error.js';
import komerceService from './komerce-service.js';
import snap from './midtrans-service.js';

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

    const transaction = await snap.createTransaction(parameter);
    
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
        estimatedDelivery: selectedService.etd || '1-3 days'
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
  }, {
    maxWait: 20000, // 20 detik maksimal menunggu
    timeout: 15000  // 15 detik timeout
  });
};




const handlePaymentNotification = async (notification) => {
  try {
    // 1. Logging untuk debugging
    console.log('[Midtrans] Raw Notification Received:', JSON.stringify(notification, null, 2));

    // 2. Validasi payload yang lebih fleksibel
    if (!notification || typeof notification !== 'object') {
      throw new ResponseError(400, 'Notification must be a valid object');
    }

    // 3. Handle berbagai format field dari Midtrans
    const transactionStatus = notification.transaction_status || 
                           notification['transaction-status'] || 
                           notification.TransactionStatus;

    if (!transactionStatus) {
      throw new ResponseError(400, 'Missing transaction status in notification');
    }

    // 4. Verifikasi notifikasi dengan Midtrans API
    let statusResponse;
    try {
      console.log('[Midtrans] Verifying notification with Midtrans API...');
      statusResponse = await snap.transaction.notification(notification);
      console.log('[Midtrans] Verification Response:', statusResponse);
    } catch (verifyError) {
      console.error('[Midtrans] Verification Failed:', {
        error: verifyError.message,
        notification: notification
      });
      throw new ResponseError(400, 'Failed to verify notification with Midtrans');
    }

    // 5. Validasi response dari Midtrans
    const orderId = statusResponse.order_id || statusResponse.orderId;
    if (!orderId) {
      throw new ResponseError(400, 'Missing order ID in Midtrans response');
    }

    // 6. Cari order di database
    console.log(`[Midtrans] Looking for order: ${orderId}`);
    const order = await prismaClient.order.findUnique({
      where: { id: orderId },
      include: {
        user: {
          select: {
            id: true,
            email: true
          }
        }
      }
    });

    if (!order) {
      console.error(`[Midtrans] Order Not Found: ${orderId}`);
      throw new ResponseError(404, `Order not found: ${orderId}`);
    }

    // 7. Tentukan status baru berdasarkan notifikasi
    let newStatus = order.status;
    let paymentStatus = order.paymentStatus;
    let paidAt = order.paidAt;
    let paymentMethod = statusResponse.payment_type;

    console.log(`[Midtrans] Processing status: ${transactionStatus}`);
    switch (transactionStatus.toLowerCase()) {
      case 'capture':
        if (statusResponse.fraud_status === 'challenge') {
          newStatus = 'PENDING';
          paymentStatus = 'CHALLENGE';
          console.log('[Midtrans] Payment challenged by fraud detection');
        } else if (statusResponse.fraud_status === 'accept') {
          newStatus = 'PAID';
          paymentStatus = 'PAID';
          paidAt = new Date(statusResponse.settlement_time || statusResponse.transaction_time || new Date());
          console.log('[Midtrans] Payment captured successfully');
        }
        break;

      case 'settlement':
        newStatus = 'PAID';
        paymentStatus = 'PAID';
        paidAt = new Date(statusResponse.settlement_time || statusResponse.transaction_time || new Date());
        console.log('[Midtrans] Payment settled');
        break;

      case 'cancel':
      case 'deny':
      case 'expire':
        newStatus = 'CANCELLED';
        paymentStatus = 'FAILED';
        console.log('[Midtrans] Payment failed:', transactionStatus);
        break;

      case 'pending':
        newStatus = 'PENDING';
        paymentStatus = 'PENDING';
        console.log('[Midtrans] Payment pending');
        break;

      default:
        console.warn('[Midtrans] Unknown transaction status:', transactionStatus);
        throw new ResponseError(400, `Unknown transaction status: ${transactionStatus}`);
    }

    // 8. Update order di database
    console.log(`[Midtrans] Updating order ${orderId} to status: ${newStatus}`);
    const updatedOrder = await prismaClient.order.update({
      where: { id: orderId },
      data: {
        status: newStatus,
        paymentStatus,
        paymentMethod,
        paidAt,
        midtransResponse: JSON.stringify(statusResponse),
        ...(newStatus === 'PAID' && { paidAt: new Date() })
      }
    });

    // 9. Buat payment log
    console.log(`[Midtrans] Creating payment log for order ${orderId}`);
    await prismaClient.paymentLog.create({
      data: {
        orderId,
        paymentMethod,
        amount: parseFloat(statusResponse.gross_amount || '0'),
        status: paymentStatus,
        transactionId: statusResponse.transaction_id || `midtrans-${Date.now()}`,
        payload: JSON.stringify(statusResponse),
        paidAt: paymentStatus === 'PAID' ? 
          new Date(statusResponse.settlement_time || new Date()) : null,
        userId: order.user.id
      }
    });

    // 10. Kirim notifikasi ke user jika pembayaran berhasil
    if (newStatus === 'PAID') {
      try {
        console.log(`[Midtrans] Sending payment confirmation to ${order.user.email}`);
        await sendPaymentConfirmationEmail({
          email: order.user.email,
          orderId,
          amount: statusResponse.gross_amount,
          paymentMethod,
          paymentDate: paidAt
        });
      } catch (emailError) {
        console.error('[Midtrans] Failed to send confirmation email:', emailError);
      }
    }

    console.log('[Midtrans] Notification processed successfully');
    return { 
      status: newStatus, 
      paymentStatus,
      paymentMethod,
      paidAt,
      orderId
    };

  } catch (error) {
    console.error('[Midtrans] Notification Processing Error:', {
      error: error.message,
      notification: notification,
      stack: error.stack
    });
    
    // Tetap return 200 ke Midtrans untuk menghindari retry
    throw new ResponseError(200, `Notification processed with error: ${error.message}`);
  }
};

export default {
  processCheckout,
  handlePaymentNotification
};