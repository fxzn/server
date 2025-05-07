import { prismaClient } from '../application/database.js';
import midtransClient from 'midtrans-client';
import { ResponseError } from '../error/response-error.js';

// export const handleMidtransNotification = async (req, res) => {

//   try {
//     const notification = req.body;
    
//     // Validasi notifikasi
//     const snap = new midtransClient.Snap({
//       isProduction: process.env.NODE_ENV === 'production',
//       serverKey: process.env.MIDTRANS_SERVER_KEY
//     });

//     const statusResponse = await snap.transaction.notification(notification);
//     const orderId = statusResponse.order_id;
//     const transactionStatus = statusResponse.transaction_status;
//     const fraudStatus = statusResponse.fraud_status;

//     console.log(`Received transaction status: ${transactionStatus} for order ID: ${orderId}`);

//     // Cari order di database
//     const order = await prismaClient.order.findUnique({
//       where: { id: orderId }
//     });

//     if (!order) {
//       return res.status(404).json({ error: 'Order not found' });
//     }

//     // Update status berdasarkan notifikasi
//     let updatedStatus = order.status;
//     let paymentStatus = order.paymentStatus;

//     if (transactionStatus === 'capture') {
//       if (fraudStatus === 'challenge') {
//         updatedStatus = 'PENDING';
//         paymentStatus = 'CHALLENGE';
//       } else if (fraudStatus === 'accept') {
//         updatedStatus = 'PAID';
//         paymentStatus = 'PAID';
//       }
//     } else if (transactionStatus === 'settlement') {
//       updatedStatus = 'PAID';
//       paymentStatus = 'PAID';
//     } else if (transactionStatus === 'cancel' || 
//                transactionStatus === 'deny' ||
//                transactionStatus === 'expire') {
//       updatedStatus = 'CANCELLED';
//       paymentStatus = 'FAILED';
//     } else if (transactionStatus === 'pending') {
//       updatedStatus = 'PENDING';
//       paymentStatus = 'PENDING';
//     }

//     // Update order di database
//     await prismaClient.order.update({
//       where: { id: orderId },
//       data: {
//         status: updatedStatus,
//         paymentStatus,
//         paymentMethod: statusResponse.payment_type || order.paymentMethod,
//         paidAt: paymentStatus === 'PAID' ? new Date() : null
//       }
//     });

//     // Buat payment log
//     await prismaClient.paymentLog.create({
//       data: {
//         orderId,
//         paymentMethod: statusResponse.payment_type,
//         amount: parseFloat(statusResponse.gross_amount),
//         status: paymentStatus,
//         transactionId: statusResponse.transaction_id,
//         payload: JSON.stringify(statusResponse)
//       }
//     });

//     res.status(200).send('OK');
//   } catch (error) {
//     console.error('Error handling notification:', error);
//     res.status(500).json({ error: 'Internal server error' });
//   }
// };





// Initialize Snap client
const snap = new midtransClient.Snap({
  isProduction: process.env.NODE_ENV === 'production',
  serverKey: process.env.MIDTRANS_SERVER_KEY,
  clientKey: process.env.MIDTRANS_CLIENT_KEY
});

export const handleMidtransNotification = async (req, res) => {
  try {
    const notification = req.body;
    
    // Validasi notifikasi
    const statusResponse = await snap.transaction.notification(notification);
    const orderId = statusResponse.order_id;
    const transactionStatus = statusResponse.transaction_status;
    const fraudStatus = statusResponse.fraud_status;

    console.log(`Received transaction status: ${transactionStatus} for order ID: ${orderId}`);

    // Cari order di database
    const order = await prismaClient.order.findUnique({
      where: { id: orderId },
      include: {
        items: true,
        user: {
          select: {
            email: true,
            fullName: true
          }
        }
      }
    });

    if (!order) {
      return res.status(404).json({ error: 'Order not found' });
    }

    // Update status berdasarkan notifikasi
    let updatedStatus = order.status;
    let paymentStatus = order.paymentStatus;
    let additionalData = {};

    switch (transactionStatus) {
      case 'capture':
        if (fraudStatus === 'challenge') {
          updatedStatus = 'PENDING';
          paymentStatus = 'CHALLENGE';
        } else if (fraudStatus === 'accept') {
          updatedStatus = 'PAID';
          paymentStatus = 'PAID';
          additionalData.paidAt = new Date();
        }
        break;
        
      case 'settlement':
        updatedStatus = 'PAID';
        paymentStatus = 'PAID';
        additionalData.paidAt = new Date();
        break;
        
      case 'cancel':
      case 'deny':
      case 'expire':
        updatedStatus = 'CANCELLED';
        paymentStatus = 'FAILED';
        
        // Kembalikan stok produk jika order dibatalkan
        await returnProductStock(orderId);
        break;
        
      case 'pending':
        updatedStatus = 'PENDING';
        paymentStatus = 'PENDING';
        break;
        
      case 'refund':
      case 'partial_refund':
        updatedStatus = 'CANCELLED';
        paymentStatus = 'REFUNDED';
        
        // Kembalikan stok produk untuk refund
        await returnProductStock(orderId);
        break;
    }

    // Update order di database
    const updatedOrder = await prismaClient.order.update({
      where: { id: orderId },
      data: {
        status: updatedStatus,
        paymentStatus,
        paymentMethod: statusResponse.payment_type || order.paymentMethod,
        ...additionalData
      }
    });

    // Buat payment log
    await prismaClient.paymentLog.create({
      data: {
        orderId,
        paymentMethod: statusResponse.payment_type,
        amount: parseFloat(statusResponse.gross_amount),
        status: paymentStatus,
        transactionId: statusResponse.transaction_id,
        payload: JSON.stringify(statusResponse)
      }
    });

    // Kirim notifikasi ke user jika status berubah
    if (['PAID', 'CANCELLED', 'REFUNDED'].includes(paymentStatus)) {
      await sendOrderNotification(updatedOrder, order.user);
    }

    res.status(200).send('OK');
  } catch (error) {
    console.error('Error handling notification:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

export const cancelMidtransTransaction = async (req, res, next) => {
  try {
    const { orderId } = req.params;
    
    // 1. Cek order di database
    const order = await prismaClient.order.findUnique({
      where: { id: orderId },
      include: {
        items: true
      }
    });

    if (!order) {
      throw new ResponseError(404, 'Order not found');
    }

    // 2. Validasi order bisa dibatalkan
    if (!['PENDING', 'PAID'].includes(order.paymentStatus)) {
      throw new ResponseError(400, `Order cannot be cancelled in current status: ${order.status}`);
    }

    // 3. Batalkan transaksi di Midtrans jika sudah ada pembayaran
    if (order.midtransOrderId && order.paymentStatus === 'PAID') {
      try {
        const cancelResponse = await snap.transaction.cancel(order.midtransOrderId);
        console.log('Midtrans cancellation response:', cancelResponse);
      } catch (error) {
        console.error('Midtrans cancellation error:', error);
        throw new ResponseError(500, 'Failed to cancel payment transaction');
      }
    }

    // 4. Update status order
    const updatedOrder = await prismaClient.order.update({
      where: { id: orderId },
      data: {
        status: 'CANCELLED',
        paymentStatus: order.paymentStatus === 'PAID' ? 'REFUNDED' : 'FAILED'
      }
    });

    // 5. Kembalikan stok produk
    await returnProductStock(orderId);

    // 6. Buat log pembatalan
    await prismaClient.paymentLog.create({
      data: {
        orderId,
        paymentMethod: order.paymentMethod,
        amount: order.totalAmount,
        status: 'REFUNDED',
        transactionId: order.midtransOrderId,
        payload: JSON.stringify({
          action: 'MANUAL_CANCELLATION',
          cancelledBy: req.user?.id || 'system',
          cancelledAt: new Date()
        })
      }
    });

    res.status(200).json({
      status: 'success',
      data: updatedOrder,
      message: 'Order cancelled successfully'
    });
  } catch (error) {
    next(error);
  }
};

// Helper function untuk mengembalikan stok produk
async function returnProductStock(orderId) {
  const orderItems = await prismaClient.orderItem.findMany({
    where: { orderId },
    select: {
      productId: true,
      quantity: true
    }
  });

  await Promise.all(
    orderItems.map(item =>
      prismaClient.product.update({
        where: { id: item.productId },
        data: { stock: { increment: item.quantity } }
      })
    )
  );
}

// Helper function untuk mengirim notifikasi
async function sendOrderNotification(order, user) {
  try {
    // Implementasi pengiriman notifikasi (email/WhatsApp/dll)
    console.log(`Sending notification to ${user.email} about order ${order.id}`);
    console.log('Notification details:', {
      status: order.status,
      paymentStatus: order.paymentStatus,
      orderId: order.id,
      amount: order.totalAmount
    });

    // Contoh: Kirim email
    // await sendEmail({
    //   to: user.email,
    //   subject: `Order Update: ${order.id}`,
    //   text: `Your order status is now ${order.status}`
    // });
  } catch (error) {
    console.error('Failed to send notification:', error);
  }
}