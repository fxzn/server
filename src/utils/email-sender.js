import nodemailer from 'nodemailer';

const transporter = nodemailer.createTransport({
    service: 'gmail',
    host: 'smtp.gmail.com',
    port: 587,
    secure: false,
    auth: {
      user: process.env.EMAIL_USERNAME,
      pass: process.env.EMAIL_PASSWORD 
    },
    tls: {
      ciphers: 'SSLv3', 
      rejectUnauthorized: false 
    }
  });



  export const sendResetPasswordEmail = async (email, resetUrl) => {
    const mailOptions = {
      from: process.env.EMAIL_FROM,
      to: email,
      subject: 'Reset Password untuk Akun Anda',
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; text-align: center;">
          <!-- Logo Wistia -->
          <div style="margin-bottom: 25px;">
            <img src="https://res.cloudinary.com/diirjy6z7/image/upload/v1745267973/user_avatars/lxqiwohdeovnnowljjbb.jpg" alt="Wistia Logo" style="max-width: 150px;">
          </div>
          
          <!-- Konten Utama -->
          <div style="background-color: #f9f9f9; padding: 30px; border-radius: 8px;">
            <h2 style="color: #333; margin-bottom: 20px;">Lupa Password?</h2>
            
            <p style="margin-bottom: 25px; line-height: 1.6; color: #555;">
              Kami menerima permintaan reset password untuk akun Anda. 
              Klik tombol di bawah untuk membuat password baru.
            </p>
            
            <a href="${resetUrl}" 
                style="display: inline-block; padding: 12px 30px; background-color: #3a7bd5; 
                      color: white; text-decoration: none; border-radius: 4px; font-weight: bold;
                      margin: 15px 0; font-size: 16px;">
                Reset Password Saya
            </a>
            
            <p style="font-size: 14px; color: #888; margin-top: 25px;">
              Link ini akan kadaluarsa dalam 1 jam.<br>
              Jika Anda tidak meminta ini, abaikan email ini.
            </p>
          </div>
          
          <!-- Footer -->
          <div style="margin-top: 30px; font-size: 12px; color: #999;">
            <p>© ${new Date().getFullYear()} Sawangan. All rights reserved.</p>
            <p style="margin-top: 5px;">
              Jika tombol tidak bekerja, salin dan tempel link ini di browser:<br>
              <span style="word-break: break-all;">${resetUrl}</span>
            </p>
          </div>
        </div>
      `
    };
  
    await transporter.sendMail(mailOptions);
  };

