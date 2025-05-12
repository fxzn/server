import { prismaClient } from '../application/database.js';
import midtransClient from 'midtrans-client';
import crypto from 'crypto';

const core = new midtransClient.CoreApi({
    isProduction: process.env.MIDTRANS_IS_PRODUCTION === 'true',
    serverKey: process.env.MIDTRANS_SERVER_KEY,
    clientKey: process.env.MIDTRANS_CLIENT_KEY
});

const validateSignature = (notification, serverKey) => {
    const signatureKey = notification.signature_key;
    const hash = crypto.createHash('sha512')
        .update(`${notification.order_id}${notification.status_code}${notification.gross_amount}${serverKey}`)
        .digest('hex');
    
    return signatureKey === hash;
};

const handlePaymentNotification = async (req, res) => {
  try {
      const rawBody = req.body.toString();
      const notification = JSON.parse(rawBody);
      
      // 1. Validasi signature
      if (!validateSignature(notification, process.env.MIDTRANS_SERVER_KEY)) {
          return res.status(401).send('Invalid signature');
      }

      // 2. Verifikasi transaksi
      const statusResponse = await core.transaction.notification(notification);
      
      // 3. Cari order berdasarkan midtransOrderId
      const order = await prismaClient.order.findUnique({
          where: { midtransOrderId: statusResponse.order_id }
      });

      if (!order) {
          console.error('Order not found with midtransOrderId:', statusResponse.order_id);
          return res.status(404).send('Order not found');
      }

      // 4. Data update
      const updateData = {
          paymentStatus: mapMidtransStatus(statusResponse.transaction_status),
          paymentMethod: statusResponse.payment_type,
          midtransResponse: JSON.stringify(statusResponse),
          ...(statusResponse.transaction_status === 'settlement' && {
              paidAt: new Date(statusResponse.settlement_time || statusResponse.transaction_time)
          }),
          ...(statusResponse.payment_type.includes('bank_transfer') && {
              paymentVaNumber: statusResponse.va_numbers?.[0]?.va_number,
              paymentBank: statusResponse.va_numbers?.[0]?.bank
          })
      };

      // 5. Update menggunakan ID order, bukan midtransOrderId
      await prismaClient.order.update({
          where: { id: order.id },  // Gunakan ID internal
          data: updateData
      });

      // 6. Buat payment log
      await createPaymentLog(order.id, statusResponse);

      res.status(200).send('OK');
  } catch (error) {
      console.error('Payment notification error:', error);
      res.status(500).send('Error processing notification');
  }
};

async function createPaymentLog(orderId, statusResponse) {
  return prismaClient.paymentLog.create({
      data: {
          orderId: orderId,
          paymentMethod: statusResponse.payment_type,
          amount: parseFloat(statusResponse.gross_amount),
          status: mapMidtransStatus(statusResponse.transaction_status),
          transactionId: statusResponse.transaction_id,
          paymentTime: new Date(statusResponse.transaction_time),
          ...(statusResponse.transaction_status === 'settlement' && {
              paidAt: new Date(statusResponse.settlement_time || statusResponse.transaction_time)
          }),
          payload: statusResponse
      }
  });
}

const mapMidtransStatus = (status) => {
    const statusMap = {
        'capture': 'PAID',
        'settlement': 'PAID',
        'pending': 'PENDING',
        'deny': 'FAILED',
        'cancel': 'FAILED',
        'expire': 'FAILED',
        'refund': 'REFUNDED',
        'challenge': 'CHALLENGE'
    };
    return statusMap[status] || 'PENDING';
};

export default {
    handlePaymentNotification
};