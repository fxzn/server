import midtransClient from 'midtrans-client';

// // Initialize Snap client
// const snap = new midtransClient.Snap({
//   isProduction: false, // Set true untuk production
//   serverKey: process.env.MIDTRANS_SERVER_KEY,
//   clientKey: process.env.MIDTRANS_CLIENT_KEY
// });

// export default snap;


// const midtransClient = require('midtrans-client');

const snap = new midtransClient.Snap({
  isProduction: false, // Ganti ke true untuk production
  serverKey: process.env.MIDTRANS_SERVER_KEY,
  clientKey: process.env.MIDTRANS_CLIENT_KEY
});

// Tambahkan error handling
snap.httpClient.http_client.defaults.timeout = 5000;
snap.httpClient.http_client.interceptors.response.use(
  response => response,
  error => {
    console.error('[Midtrans] API Error:', error.message);
    throw error;
  }
);

// Tambahkan Core API untuk verifikasi
const core = new midtransClient.CoreApi({
  isProduction: process.env.MIDTRANS_IS_PRODUCTION === 'true',
  serverKey: process.env.MIDTRANS_SERVER_KEY,
  clientKey: process.env.MIDTRANS_CLIENT_KEY
});

// module.exports = snap;
export default {
  snap,
  core
};