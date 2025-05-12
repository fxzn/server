import midtransClient from 'midtrans-client';

// Buat dan konfigurasi Snap client
const snap = new midtransClient.Snap({
  isProduction: process.env.MIDTRANS_IS_PRODUCTION === 'true',
  serverKey: process.env.MIDTRANS_SERVER_KEY,
  clientKey: process.env.MIDTRANS_CLIENT_KEY
});

// Konfigurasi timeout dan error handling untuk Snap
snap.httpClient.http_client.defaults.timeout = 5000;
snap.httpClient.http_client.interceptors.response.use(
  response => response,
  error => {
    console.error('[Midtrans Snap] API Error:', error.message);
    throw error;
  }
);

// Buat dan konfigurasi Core API client
const core = new midtransClient.CoreApi({
  isProduction: process.env.MIDTRANS_IS_PRODUCTION === 'true',
  serverKey: process.env.MIDTRANS_SERVER_KEY,
  clientKey: process.env.MIDTRANS_CLIENT_KEY
});

// Konfigurasi timeout dan error handling untuk Core API
core.httpClient.http_client.defaults.timeout = 5000;
core.httpClient.http_client.interceptors.response.use(
  response => response,
  error => {
    console.error('[Midtrans Core] API Error:', error.message);
    throw error;
  }
);

// Ekspor kedua client
export default {
  snap,
  core
};