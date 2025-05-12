import express from 'express';
// import snap from '../services/midtrans-service.js';
import { prismaClient } from '../application/database.js';
import snap from '../service/midtrans-service.js';

const webhookRouter = express.Router();

webhookRouter.post('/midtrans-notification', async (req, res) => {
  try {
    const notification = await snap.transaction.notification(req.body);
    const {
      transaction_status,
      payment_type,
      transaction_time,
      order_id,
      va_numbers,
      permata_va_number,
      store,
      biller_code,
      bill_key
    } = notification;

    let paymentStatus;
    switch (transaction_status) {
      case 'settlement':
      case 'capture':
        paymentStatus = 'PAID';
        break;
      case 'pending':
        paymentStatus = 'PENDING';
        break;
      case 'deny':
      case 'cancel':
      case 'expire':
        paymentStatus = 'FAILED';
        break;
      default:
        paymentStatus = 'UNKNOWN';
    }

    await prismaClient.order.update({
      where: { id: order_id },
      data: {
        paymentStatus,
        paymentMethod: payment_type,
        paidAt: ['settlement', 'capture'].includes(transaction_status) ? new Date(transaction_time) : null,
        midtransResponse: JSON.stringify(notification),
        paymentVaNumber: va_numbers?.[0]?.va_number || permata_va_number || null,
        paymentBank: va_numbers?.[0]?.bank || null,
      }
    });

    await prismaClient.paymentLog.create({
      data: {
        orderId: order_id,
        paymentMethod: payment_type,
        amount: notification.gross_amount,
        status: transaction_status.toUpperCase(),
        transactionId: notification.transaction_id,
        paymentTime: transaction_time,
        payload: notification
      }
    });

    res.status(200).json({ message: 'Notification handled successfully' });
  } catch (error) {
    console.error('Webhook error:', error);
    res.status(500).json({ error: 'Failed to handle webhook' });
  }
});

export default webhookRouter;
