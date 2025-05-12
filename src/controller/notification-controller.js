import { prismaClient } from '../application/database.js';
import { handleNotification, verifyNotification } from '../service/midtrans-service.js';

export const handlePaymentNotification = async (req, res, next) => {
  try {
    // Verifikasi notifikasi
    const isValid = verifyNotification(
      req.body,
      process.env.MIDTRANS_SERVER_KEY
    );
    
    if (!isValid) {
      return res.status(400).json({ error: 'Invalid notification signature' });
    }

    // Handle notifikasi
    const notification = await handleNotification(req.body);
    const orderId = notification.order_id;

    // Update order berdasarkan status pembayaran
    let paymentStatus = 'PENDING';
    let paidAt = null;
    
    if (notification.transaction_status === 'capture' || 
        notification.transaction_status === 'settlement') {
      paymentStatus = 'PAID';
      paidAt = new Date(notification.settlement_time || notification.transaction_time);
    } else if (notification.transaction_status === 'expire') {
      paymentStatus = 'EXPIRED';
    } else if (notification.transaction_status === 'deny' || 
               notification.transaction_status === 'cancel') {
      paymentStatus = 'FAILED';
    }

    // Simpan data pembayaran
    await prismaClient.order.update({
      where: { midtransOrderId: orderId },
      data: {
        paymentStatus,
        paymentMethod: notification.payment_type,
        paidAt,
        midtransResponse: JSON.stringify(notification),
        ...(paymentStatus === 'PAID' && { status: 'PACKAGED' })
      }
    });

    // Buat payment log
    await prismaClient.paymentLog.create({
      data: {
        orderId: orderId,
        status: paymentStatus,
        paymentMethod: notification.payment_type,
        amount: notification.gross_amount,
        paymentTime: paidAt,
        transactionId: notification.transaction_id,
        payload: notification
      }
    });

    res.status(200).send('OK');
  } catch (error) {
    next(error);
  }
};

// export default {
//   handlePaymentNotification
// };