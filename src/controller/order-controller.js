import { validate } from '../validation/validation.js';
import orderService from '../service/order-service.js';
import { orderAdminListValidation, orderAdminUpdateValidation, orderQueryValidation } from '../validation/order-validation.js';
import { prismaClient } from '../application/database.js';
import { ResponseError } from '../error/response-error.js';

export const getUserOrders = async (req, res, next) => {
  try {
    const userId = req.user.id;
    const query = validate(orderQueryValidation, req.query);
    
    const result = await orderService.getOrderList(userId, query);

    res.status(200).json({
      status: 'success',
      data: result.data,
      meta: result.meta
    });
  } catch (error) {
    next(error);
  }
};

export const getOrderDetails = async (req, res, next) => {
  try {
    const userId = req.user.id;
    const orderId = req.params.orderId;

    if (!orderId) {
      throw new ResponseError(400, 'Order ID is required');
    }

    const order = await orderService.getOrderDetail(userId, orderId);

    res.status(200).json({
      status: 'success',
      data: order
    });
  } catch (error) {
    next(error);
  }
};

export const adminUpdateOrder = async (req, res, next) => {
  try {
    const orderId = req.params.orderId;
    const request = validate(orderAdminUpdateValidation, req.body);
    
    const updatedOrder = await orderService.updateOrderAdmin(orderId, request);

    res.status(200).json({
      status: 'success',
      data: formatOrderResponse(updatedOrder)
    });
  } catch (error) {
    next(error);
  }
};

export const adminDeleteOrder = async (req, res, next) => {
  try {
    const orderId = req.params.orderId;
    
    await orderService.deleteOrderAdmin(orderId);

    res.status(200).json({
      status: 'success',
      message: 'Order deleted successfully'
    });
  } catch (error) {
    next(error);
  }
};

export const getOrderTracking = async (req, res, next) => {
  try {
    const userId = req.user.id;
    const orderId = req.params.orderId;

    const order = await orderService.getOrderDetail(userId, orderId);
    
    if (!order.trackingNumber) {
      throw new ResponseError(400, 'This order does not have a tracking number');
    }

    if (order.status !== 'SHIPPED' && order.status !== 'COMPLETED') {
      throw new ResponseError(400, 'Order has not been shipped yet');
    }

    const trackingInfo = await orderService.trackShipping(
      order.shipping_name.toLowerCase(),
      order.trackingNumber
    );

    res.status(200).json({
      status: 'success',
      data: {
        orderId: order.id,
        orderStatus: order.status,
        trackingNumber: order.trackingNumber,
        courier: order.shippingName,
        trackingInfo
      }
    });
  } catch (error) {
    next(error);
  }
};

export const cancelUserOrder = async (req, res, next) => {
  try {
    const userId = req.user.id; // Get user ID from auth middleware
    const orderId = req.params.orderId;
    
    // Add validation to ensure the order belongs to this user
    const order = await prismaClient.order.findUnique({
      where: { id: orderId }
    });

    if (!order) {
      throw new ResponseError(404, 'Order not found');
    }

    if (order.userId !== userId) {
      throw new ResponseError(403, 'You can only cancel your own orders');
    }

    // Proceed with cancellation
    const cancelledOrder = await orderService.cancelUserOrder(userId, orderId);
    
    res.status(200).json({
      status: 'success',
      data: cancelledOrder,
      message: 'Order cancelled successfully'
    });
  } catch (error) {
    next(error);
  }
};


export const getAllOrdersAdmin = async (req, res, next) => {
  try {
    const query = validate(orderAdminListValidation, req.query);
    
    const result = await orderService.getAllOrdersAdmin(query);

    res.status(200).json({
      status: 'success',
      data: result.data,
      meta: result.meta
    });
  } catch (error) {
    next(error);
  }
};

// export const paymentNotification = async (req, res, next) => {
//   try {
//     const notification = req.body;
    
//     // Verifikasi dan update data pembayaran
//     const updatedOrder = await orderService.handlePaymentNotification(notification);

//     res.status(200).json({
//       status: 'success',
//       data: {
//         orderId: updatedOrder.id,
//         paymentStatus: updatedOrder.paymentStatus,
//         paymentMethod: updatedOrder.paymentMethod,
//         paidAt: updatedOrder.paidAt
//       }
//     });
//   } catch (error) {
//     next(error);
//   }
// };


export const checkOrderPaymentStatus = async (req, res, next) => {
  try {
    const { orderId } = req.params;
    const { userId } = req;
    
    // Verifikasi order milik user
    const order = await prismaClient.order.findFirst({
      where: { id: orderId, userId },
      select: { midtransOrderId: true }
    });
    
    if (!order) {
      throw new ResponseError(404, 'Order not found');
    }
    
    // Cek status di Midtrans
    const paymentStatus = await checkPaymentStatus(order.midtransOrderId);
    
    // Update database
    await prismaClient.order.update({
      where: { id: orderId },
      data: {
        paymentStatus: paymentStatus.status,
        paymentMethod: paymentStatus.paymentMethod,
        paidAt: paymentStatus.paymentTime ? new Date(paymentStatus.paymentTime) : null,
        midtransResponse: JSON.stringify(paymentStatus.rawResponse)
      }
    });
    
    res.json({
      status: paymentStatus.status,
      method: paymentStatus.paymentMethod,
      paidAt: paymentStatus.paymentTime
    });
  } catch (error) {
    next(error);
  }
};



function formatOrderResponse(order) {
  return {
    id: order.id,
    status: order.status,
    trackingNumber: order.trackingNumber,
    shippingName: order.shipping_name,
    customer: {
      name: order.user.fullName,
      phone: order.user.phone,
      address: order.shippingAddress,
      postalCode: order.shippingPostCode
    },
    products: order.items.map(item => ({
      name: item.product.name,  
      price: item.price,
      quantity: item.quantity,
      total: item.price * item.quantity
    })),
    grandTotal: order.totalAmount,
    ...(order.trackingInfo && { trackingInfo: order.trackingInfo }),
    ...(order.trackingError && { trackingError: order.trackingError })
  };
}