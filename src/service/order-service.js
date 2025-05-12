import axios from 'axios';
import { prismaClient } from '../application/database.js';
import { ResponseError } from '../error/response-error.js';

const getOrderList = async (userId, { page = 1, limit = 10 }) => {
  const skip = (page - 1) * limit;

  try {
    const [orders, totalOrders] = await Promise.all([
      prismaClient.order.findMany({
        where: { userId },
        select: {
          id: true,
          createdAt: true,
          status: true,
          trackingNumber: true,
          shipping_name: true,
          paymentStatus: true,
          totalAmount: true,
          items: {
            select: {
              quantity: true,
              price: true,
              productName: true,
              product: {
                select: {
                  name: true,
                  imageUrl: true
                }
              }
            }
          }
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit
      }),
      prismaClient.order.count({ where: { userId } })
    ]);

    if (orders.length === 0) {
      throw new ResponseError(404, 'No orders found for this user');
    }

    return {
      data: orders.map(order => ({
        ...order,
        items: order.items.map(item => ({
          name: item.productName || item.product.name,
          quantity: item.quantity,
          price: item.price,
          image: item.product.imageUrl,
          total: item.price * item.quantity
        }))
      })),
      meta: {
        currentPage: page,
        totalPages: Math.ceil(totalOrders / limit),
        totalItems: totalOrders
      }
    };
  } catch (error) {
    console.error('Failed to fetch orders:', error);
    throw error;
  }
};

const getOrderDetail = async (userId, orderId) => {
  try {
    const order = await prismaClient.order.findUnique({
      where: { 
        id: orderId,
        userId 
      },
      select: {
        id: true,
        createdAt: true,
        status: true,
        trackingNumber: true,
        shipping_name: true,
        totalAmount: true,
        shippingAddress: true,
        shippingCity: true,
        shippingProvince: true,
        shippingPostCode: true,
        customerName: true,
        customerPhone: true,
        shippingCost: true,
        estimatedDelivery: true,
        paymentUrl: true,
        // midtransResponse: true, // Tambahkan ini
        shippedAt: true,
        completedAt: true,
        cancelledAt: true,
        items: {
          select: {
            quantity: true,
            price: true,
            productName: true,
            weight: true,
            product: {
              select: {
                name: true,
                imageUrl: true
              }
            }
          }
        },
        paymentMethod: true,
        paymentStatus: true,
        paidAt: true,
        paymentVaNumber: true,
        paymentBank: true,
        midtransOrderId: true,
        paymentLogs: {
          orderBy: { createdAt: 'desc' },
          take: 1,
          select: {
            status: true,
            paymentMethod: true,
            amount: true,
            paymentTime: true,
            transactionId: true
          }
        }
      }
    });

    if (!order) {
      throw new ResponseError(404, 'Order not found or access denied');
    }

    // Parse midtrans response jika ada
    let paymentDetails = null;
    if (order.midtransResponse) {
      try {
        const midtransData = JSON.parse(order.midtransResponse);
        paymentDetails = {
          method: midtransData.payment_type,
          bank: midtransData.va_numbers?.[0]?.bank || midtransData.bank,
          vaNumber: midtransData.va_numbers?.[0]?.va_number,
          store: midtransData.store,
          billKey: midtransData.bill_key,
          billerCode: midtransData.biller_code,
          transactionTime: midtransData.transaction_time,
          settlementTime: midtransData.settlement_time,
          fraudStatus: midtransData.fraud_status
        };
      } catch (e) {
        console.error('Failed to parse midtrans response:', e);
      }
    }

    // Get tracking info jika order sudah dikirim
    let trackingInfo = null;
    let trackingError = null;
    
    if (order.status === 'SHIPPED' && order.trackingNumber && order.shipping_name) {
      try {
        trackingInfo = await trackShipping(
          order.shipping_name.toLowerCase(),
          order.trackingNumber
        );
      } catch (error) {
        trackingError = error.message;
      }
    }

    return {
      ...order,
      paymentDetails, // Tambahkan payment details
      trackingInfo,
      trackingError,
      shippingDetails: {
        recipientName: order.customerName,
        phoneNumber: order.customerPhone,
        address: order.shippingAddress,
        city: order.shippingCity,
        province: order.shippingProvince,
        postalCode: order.shippingPostCode
      },
      items: order.items.map(item => ({
        name: item.productName || item.product.name,
        quantity: item.quantity,
        price: item.price,
        weight: item.weight,
        image: item.product.imageUrl,
        total: item.price * item.quantity
      }))
    };
  } catch (error) {
    console.error('Failed to fetch order details:', error);
    throw error;
  }
};


const updateOrderAdmin = async (orderId, { status, trackingNumber, shipping_name

 }) => {
  return await prismaClient.$transaction(async (prisma) => {
    const existingOrder = await prisma.order.findUnique({
      where: { id: orderId },
      include: {
        user: {
          select: {
            fullName: true,
            email: true,
            phone: true
          }
        }
      }
    });

    if (!existingOrder) {
      throw new ResponseError(404, 'Order not found');
    }

    const validTransitions = {
      PENDING: ['PACKAGED', 'CANCELLED'],
      PACKAGED: ['SHIPPED', 'CANCELLED'],
      SHIPPED: ['COMPLETED'],
      COMPLETED: [],
      CANCELLED: []
    };

    if (!validTransitions[existingOrder.status]?.includes(status)) {
      throw new ResponseError(
        400, 
        `Invalid status transition from ${existingOrder.status} to ${status}`
      );
    }

    const updateData = {
      status,
      ...(trackingNumber && { trackingNumber }),
      ...(shipping_name && { shipping_name }),
      ...(status === 'SHIPPED' && { 
        shippedAt: new Date(),
        trackingNumber: trackingNumber || existingOrder.trackingNumber,
        shipping_name: shipping_name || existingOrder.shipping_name
      }),
      ...(status === 'COMPLETED' && { completedAt: new Date() })
    };

    if (status === 'SHIPPED' && !updateData.trackingNumber) {
      throw new ResponseError(400, 'Tracking number is required for SHIPPED status');
    }

    if (status === 'SHIPPED' && !updateData.shipping_name

    ) {
      throw new ResponseError(400, 'Shipping carrier name is required for SHIPPED status');
    }

    const updatedOrder = await prisma.order.update({
      where: { id: orderId },
      data: updateData,
      include: {
        user: true,
        items: {
          include: {
            product: {
              select: {
                name: true,
                imageUrl: true
              }
            }
          }
        }
      }
    });

    if (['SHIPPED', 'COMPLETED'].includes(status)) {
      await sendOrderNotification(updatedOrder);
    }

    return updatedOrder;
  });
};

const deleteOrderAdmin = async (orderId) => {
  return await prismaClient.$transaction(async (prisma) => {
    const order = await prisma.order.findUnique({
      where: { id: orderId },
      include: {
        items: true
      }
    });

    if (!order) {
      throw new ResponseError(404, 'Order not found');
    }

    if (order.status !== 'CANCELLED') {
      await Promise.all(
        order.items.map(item => 
          prisma.product.update({
            where: { id: item.productId },
            data: { 
              stock: { increment: item.quantity } 
            }
          })
        )
      );
    }

    await prisma.orderItem.deleteMany({
      where: { orderId }
    });

    await prisma.paymentLog.deleteMany({
      where: { orderId }
    });

    return await prisma.order.delete({
      where: { id: orderId }
    });
  });
};




const cancelUserOrder = async (userId, orderId) => {
  return await prismaClient.$transaction(async (prisma) => {
    // 1. Retrieve and validate the order
    const order = await prisma.order.findUnique({
      where: { 
        id: orderId,
        userId: userId // Direct ownership check in query
      },
      include: {
        items: {
          include: {
            product: {
              select: {
                id: true,
                name: true,
                stock: true
              }
            }
          }
        },
        user: {
          select: {
            id: true,
            email: true,
            fullName: true
          }
        }
      }
    });

    if (!order) {
      throw new ResponseError(404, 'Order not found or does not belong to you');
    }

    // 2. Validate order status
    const cancellableStatuses = ['PENDING', 'PACKAGED'];
    if (!cancellableStatuses.includes(order.status)) {
      throw new ResponseError(400, 
        `Order cannot be cancelled because it's already ${order.status}. ` +
        `Only orders with status ${cancellableStatuses.join(' or ')} can be cancelled`
      );
    }

    // 3. Handle Midtrans cancellation if needed
    let midtransResponse = null;
    if (order.midtransOrderId && order.paymentStatus === 'PAID') {
      try {
        const snap = new midtransClient.Snap({
          isProduction: process.env.NODE_ENV === 'production',
          serverKey: process.env.MIDTRANS_SERVER_KEY
        });
        midtransResponse = await snap.transaction.cancel(order.midtransOrderId);
      } catch (error) {
        console.error('Midtrans cancellation failed:', error);
        throw new ResponseError(500, 'Payment cancellation failed. Please contact customer support');
      }
    }

    // 4. Update order status
    const updatedOrder = await prisma.order.update({
      where: { id: orderId },
      data: {
        status: 'CANCELLED',
        paymentStatus: order.paymentStatus === 'PAID' ? 'REFUNDED' : 'FAILED',
        cancelledAt: new Date()
      }
    });

    // 5. Restore product stock
    await Promise.all(
      order.items.map(item =>
        prisma.product.update({
          where: { id: item.product.id },
          data: { stock: { increment: item.quantity } }
        })
      )
    );

    // 6. Create payment log - CORRECTED VERSION
    await prisma.paymentLog.create({
      data: {
        order: {
          connect: { id: orderId }
        },
        paymentMethod: order.paymentMethod || 'MANUAL_CANCELLATION',
        amount: order.totalAmount,
        status: order.paymentStatus === 'PAID' ? 'REFUNDED' : 'FAILED',
        transactionId: order.midtransOrderId || `cancel_${orderId}`,
        payload: {
          action: 'USER_CANCELLATION',
          userId: userId,
          timestamp: new Date().toISOString(),
          items: order.items.map(item => ({
            productId: item.product.id,
            name: item.product.name,
            quantity: item.quantity
          })),
          midtransResponse: midtransResponse ? {
            status: midtransResponse.status_message,
            transactionId: midtransResponse.transaction_id
          } : null
        }
      }
    });

    // 7. Send notifications
    await sendCancellationNotifications(updatedOrder, order.user);

    return {
      ...updatedOrder,
      items: order.items,
      midtransCancellation: midtransResponse ? {
        status: midtransResponse.status_message,
        transactionId: midtransResponse.transaction_id
      } : null
    };
  }, {
    maxWait: 20000, // 20 detik maksimal menunggu
    timeout: 15000  // 15 detik timeout
  });
};


// Notification helper (unchanged from your original)
async function sendCancellationNotifications(order, user) {
  try {
    const emailContent = {
      to: user.email,
      subject: `Your Order #${order.id} Has Been Cancelled`,
      html: `
        <h2>Order Cancellation Confirmation</h2>
        <p>Hello ${user.fullName},</p>
        <p>Your order <strong>#${order.id}</strong> has been successfully cancelled.</p>
        ${order.paymentStatus === 'REFUNDED' ? 
          '<p>Your refund will be processed within 3-5 business days.</p>' : ''}
        <p>Cancelled items:</p>
        <ul>
          ${order.items.map(item => `
            <li>${item.quantity}x ${item.product.name}</li>
          `).join('')}
        </ul>
        <p>Thank you for using our service.</p>
      `
    };
    await sendEmail(emailContent);

    if (order.paymentStatus === 'REFUNDED') {
      await prisma.notification.create({
        data: {
          type: 'ORDER_REFUND',
          title: `Order #${order.id} cancelled with refund`,
          message: `User ${user.email} cancelled paid order. Refund processed.`,
          metadata: {
            orderId: order.id,
            userId: user.id,
            amount: order.totalAmount
          }
        }
      });
    }
  } catch (error) {
    console.error('Failed to send cancellation notifications:', error);
  }
}




const trackShipping = async (courier, trackingNumber) => {
  try {
    const normalizedCourier = courier.toLowerCase().trim();
    
    const courierMap = {
      'jne': 'jne',
      'tiki': 'tiki',
      'pos': 'pos',
      'jnt': 'jnt',
      'sicepat': 'sicepat',
      'ninja': 'ninja',
      'wahana': 'wahana',
      'lion parcel': 'lion',
      'anteraja': 'anteraja',
      'idexpress': 'ide'
    };

    const apiCourier = courierMap[normalizedCourier] || normalizedCourier;

    // Using Binderbyte API as example
    const response = await axios.get(`https://api.binderbyte.com/v1/track`, {
      params: {
        api_key: process.env.BINDERBYTE_API_KEY,
        courier: apiCourier,
        awb: trackingNumber
      },
      timeout: 5000
    });

    if (response.data.status !== 200 || !response.data.data) {
      throw new ResponseError(404, 'Tracking information not found');
    }

    const trackingData = response.data.data;
    return {
      courier: trackingData.courier || courier,
      trackingNumber: trackingData.awb || trackingNumber,
      status: trackingData.status || 'In Transit',
      history: (trackingData.history || []).map(item => ({
        date: item.date,
        description: item.desc,
        location: item.location
      })),
      estimatedDelivery: trackingData.estimated_delivery || null,
      receiver: trackingData.receiver || null
    };
  } catch (error) {
    console.error('Tracking error:', error);
    if (error.response) {
      throw new ResponseError(error.response.status, error.response.data.message || 'Failed to get tracking information');
    } else if (error.request) {
      throw new ResponseError(503, 'Tracking service unavailable');
    } else {
      throw new ResponseError(500, 'Failed to get tracking information');
    }
  }
};


const completeOrder = async (userId, orderId) => {
  return await prismaClient.$transaction(async (prisma) => {
    // 1. Verify the order exists and belongs to the user
    const order = await prisma.order.findUnique({
      where: {
        id: orderId,
        userId: userId
      },
      include: {
        items: true
      }
    });

    if (!order) {
      throw new ResponseError(404, 'Order not found');
    }

    // 2. Validate order can be completed (must be SHIPPED status)
    if (order.status !== 'SHIPPED') {
      throw new ResponseError(400, `Order cannot be completed from current status: ${order.status}`);
    }

    // 3. Update order status to COMPLETED
    const updatedOrder = await prisma.order.update({
      where: { id: orderId },
      data: {
        status: 'COMPLETED',
        completedAt: new Date()
      },
      include: {
        items: {
          include: {
            product: {
              select: {
                id: true,
                name: true
              }
            }
          }
        }
      }
    });

    // 4. Send notification (optional)
    await sendOrderNotification(updatedOrder);

    return updatedOrder;
  });
};


const getAllOrdersAdmin = async ({ page = 1, limit = 10, status, paymentStatus, startDate, endDate }) => {
  const skip = (page - 1) * limit;
  
  const whereClause = {
    ...(status && { status }),
    ...(paymentStatus && { paymentStatus }),
    ...((startDate || endDate) && {
      createdAt: {
        ...(startDate && { gte: new Date(startDate) }),
        ...(endDate && { lte: new Date(endDate) })
      }
    })
  };

  try {
    const [orders, totalOrders] = await Promise.all([
      prismaClient.order.findMany({
        where: whereClause,
        select: {
          id: true,
          createdAt: true,
          status: true,
          trackingNumber: true,
          shipping_name: true,
          paymentStatus: true,
          totalAmount: true,
          customerName: true,
          customerPhone: true,
          user: {
            select: {
              id: true,
              email: true,
              fullName: true
            }
          },
          items: {
            select: {
              quantity: true,
              price: true,
              productName: true,
              product: {
                select: {
                  name: true,
                  imageUrl: true
                }
              }
            }
          }
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit
      }),
      prismaClient.order.count({ where: whereClause })
    ]);

    return {
      data: orders.map(order => ({
        ...order,
        items: order.items.map(item => ({
          name: item.productName || item.product.name,
          quantity: item.quantity,
          price: item.price,
          image: item.product.imageUrl,
          total: item.price * item.quantity
        })),
        user: {
          id: order.user.id,
          email: order.user.email,
          name: order.user.fullName
        }
      })),
      meta: {
        currentPage: page,
        totalPages: Math.ceil(totalOrders / limit),
        totalItems: totalOrders
      }
    };
  } catch (error) {
    console.error('Failed to fetch all orders:', error);
    throw error;
  }
};




export default {
  getOrderList,
  getOrderDetail,
  updateOrderAdmin,
  deleteOrderAdmin,
  trackShipping,
  completeOrder,
  cancelUserOrder,
  getAllOrdersAdmin,
};