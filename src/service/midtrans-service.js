import midtransClient from 'midtrans-client';

// Initialize Snap client
const snap = new midtransClient.Snap({
  isProduction: false, // Set true untuk production
  serverKey: process.env.MIDTRANS_SERVER_KEY,
  clientKey: process.env.MIDTRANS_CLIENT_KEY
});

export default snap;