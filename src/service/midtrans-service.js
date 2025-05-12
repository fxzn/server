import midtransClient from 'midtrans-client';

const isProduction = process.env.NODE_ENV === 'production';

const snap = new midtransClient.Snap({
  isProduction,
  serverKey: process.env.MIDTRANS_SERVER_KEY,
  clientKey: process.env.MIDTRANS_CLIENT_KEY
});

// Timeout default & error handling (optional tapi disarankan)
if (snap.httpClient && snap.httpClient.http_client) {
  snap.httpClient.http_client.defaults.timeout = 5000;

  snap.httpClient.http_client.interceptors.response.use(
    response => response,
    error => {
      console.error('[Midtrans Error]', {
        message: error.message,
        url: error.config?.url,
        data: error.response?.data
      });
      throw error;
    }
  );
}

export default snap;
