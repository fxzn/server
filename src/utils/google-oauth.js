import { OAuth2Client } from "google-auth-library";

// const client = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);

// export const verifyGoogleToken = async (token) => {
//   try {
//     const ticket = await client.verifyIdToken({
//       idToken: token,
//       audience: process.env.GOOGLE_CLIENT_ID
//     });
    
//     const payload = ticket.getPayload();
    
//     if (!payload.email_verified) {
//       throw new Error('Google account not verified');
//     }

//     return {
//       name: payload.name,
//       email: payload.email,
//       picture: payload.picture
//     };
//   } catch (error) {
//     console.error('Google token verification error:', error);
//     throw new Error('Invalid Google token');
//   }
// };



// Gunakan constructor dengan option object untuk lebih jelas
const client = new OAuth2Client({
  clientId: process.env.GOOGLE_CLIENT_ID,
  clientSecret: process.env.GOOGLE_CLIENT_SECRET // Tambahkan jika ada
});

export const verifyGoogleToken = async (token) => {
  try {
    console.log('Verifying token for client ID:', process.env.GOOGLE_CLIENT_ID);
    
    const ticket = await client.verifyIdToken({
      idToken: token,
      audience: [
        process.env.GOOGLE_CLIENT_ID,
        '407408718192.apps.googleusercontent.com' // Client ID dari playground
      ]
    });
    
    const payload = ticket.getPayload();
    console.log('Token payload:', payload);

    if (!payload.email_verified) {
      throw new Error('Google account not verified');
    }

    return {
      name: payload.name,
      email: payload.email,
      picture: payload.picture
    };
  } catch (error) {
    console.error('Full verification error:', {
      message: error.message,
      stack: error.stack
    });
    throw new Error('Invalid Google token: ' + error.message);
  }
};