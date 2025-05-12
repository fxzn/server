// import midtransClient from 'midtrans-client';

// // // Initialize Snap client
// // const snap = new midtransClient.Snap({
// //   isProduction: false, // Set true untuk production
// //   serverKey: process.env.MIDTRANS_SERVER_KEY,
// //   clientKey: process.env.MIDTRANS_CLIENT_KEY
// // });

// // export default snap;


// // const midtransClient = require('midtrans-client');

// const snap = new midtransClient.Snap({
//   isProduction: false, // Ganti ke true untuk production
//   serverKey: process.env.MIDTRANS_SERVER_KEY,
//   clientKey: process.env.MIDTRANS_CLIENT_KEY
// });

// // Tambahkan error handling
// snap.httpClient.http_client.defaults.timeout = 5000;
// snap.httpClient.http_client.interceptors.response.use(
//   response => response,
//   error => {
//     console.error('[Midtrans] API Error:', error.message);
//     throw error;
//   }
// );

// // module.exports = snap;
// export default snap;


import midtransClient from 'midtrans-client';
import crypto from 'crypto';

// Initialize Snap client
const snap = new midtransClient.Snap({
  isProduction: process.env.NODE_ENV === 'production',
  serverKey: process.env.MIDTRANS_SERVER_KEY,
  clientKey: process.env.MIDTRANS_CLIENT_KEY
});

// Initialize Core API client (untuk mengecek status transaksi)
const core = new midtransClient.CoreApi({
  isProduction: process.env.NODE_ENV === 'production',
  serverKey: process.env.MIDTRANS_SERVER_KEY,
  clientKey: process.env.MIDTRANS_CLIENT_KEY
});

/**
 * Create Snap transaction
 */
export const createSnapTransaction = async (orderDetails) => {
  try {
    const parameter = {
      transaction_details: {
        order_id: orderDetails.orderId,
        gross_amount: orderDetails.amount
      },
      customer_details: {
        first_name: orderDetails.customerName,
        email: orderDetails.customerEmail,
        phone: orderDetails.customerPhone
      },
      item_details: orderDetails.items.map(item => ({
        id: item.productId,
        price: item.price,
        quantity: item.quantity,
        name: item.productName,
        category: item.category
      })),
      shipping_address: {
        address: orderDetails.shippingAddress,
        city: orderDetails.shippingCity,
        postal_code: orderDetails.shippingPostCode
      }
    };

    const transaction = await snap.createTransaction(parameter);
    return transaction;
  } catch (error) {
    console.error('Error creating Snap transaction:', error);
    throw error;
  }
};

/**
 * Check transaction status
 */
export const checkTransactionStatus = async (orderId) => {
  try {
    const statusResponse = await core.transaction.status(orderId);
    return statusResponse;
  } catch (error) {
    console.error('Error checking transaction status:', error);
    throw error;
  }
};

/**
 * Handle Midtrans notification
 */
export const handleNotification = async (notification) => {
  try {
    const statusResponse = await core.transaction.notification(notification);
    return statusResponse;
  } catch (error) {
    console.error('Error handling notification:', error);
    throw error;
  }
};


export const verifyNotification = (notification, serverKey) => {
  const signatureKey = crypto
    .createHash('sha512')
    .update(
      `${notification.order_id}${notification.status_code}${notification.gross_amount}${serverKey}`
    )
    .digest('hex');

  return signatureKey === notification.signature_key;
};


export const checkPaymentStatus = async (orderId) => {
  try {
    const statusResponse = await core.transaction.status(orderId);
    
    // Mapping status Midtrans ke status kita
    const statusMap = {
      'capture': 'PAID',
      'settlement': 'PAID',
      'pending': 'PENDING',
      'deny': 'FAILED',
      'expire': 'EXPIRED',
      'cancel': 'CANCELLED'
    };
    
    return {
      status: statusMap[statusResponse.transaction_status] || 'UNKNOWN',
      paymentMethod: statusResponse.payment_type,
      paymentTime: statusResponse.settlement_time || statusResponse.transaction_time,
      rawResponse: statusResponse
    };
  } catch (error) {
    console.error('Error checking payment status:', error);
    throw error;
  }
};

// export default {
//   createSnapTransaction,
//   checkTransactionStatus,
//   handleNotification
// };