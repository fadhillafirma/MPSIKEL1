import nodemailer from 'nodemailer';

// Konfigurasi email transporter
// Untuk production, gunakan environment variables
const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST || 'smtp.gmail.com',
  port: process.env.SMTP_PORT || 587,
  secure: false, // true untuk 465, false untuk port lain
  auth: {
    user: process.env.SMTP_USER || '', // Ganti dengan email Anda
    pass: process.env.SMTP_PASS || '', // Ganti dengan app password Anda
  },
});

/**
 * Generate OTP 6 digit
 */
export function generateOTP() {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

/**
 * Kirim OTP ke email
 */
export async function sendOTPEmail(email, otp, username) {
  try {
    const mailOptions = {
      from: process.env.SMTP_USER || 'cdc@unand.ac.id',
      to: email,
      subject: 'Kode OTP Reset Password - CDC Universitas Andalas',
      html: `
        <!DOCTYPE html>
        <html lang="id">
        <head>
          <meta charset="UTF-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <style>
            body {
              font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
              line-height: 1.6;
              color: #333;
              max-width: 600px;
              margin: 0 auto;
              padding: 20px;
              background-color: #f4f4f4;
            }
            .container {
              background-color: #ffffff;
              padding: 30px;
              border-radius: 10px;
              box-shadow: 0 2px 10px rgba(0,0,0,0.1);
            }
            .header {
              text-align: center;
              margin-bottom: 30px;
              padding-bottom: 20px;
              border-bottom: 2px solid #2F6B31;
            }
            .header h1 {
              color: #2F6B31;
              margin: 0;
              font-size: 24px;
            }
            .content {
              margin: 30px 0;
            }
            .otp-box {
              background-color: #f8f9fa;
              border: 2px dashed #2F6B31;
              border-radius: 8px;
              padding: 20px;
              text-align: center;
              margin: 30px 0;
            }
            .otp-code {
              font-size: 32px;
              font-weight: bold;
              color: #2F6B31;
              letter-spacing: 8px;
              font-family: 'Courier New', monospace;
            }
            .warning {
              background-color: #fff3cd;
              border-left: 4px solid #ffc107;
              padding: 15px;
              margin: 20px 0;
              border-radius: 4px;
            }
            .footer {
              margin-top: 30px;
              padding-top: 20px;
              border-top: 1px solid #e0e0e0;
              text-align: center;
              font-size: 12px;
              color: #666;
            }
            .btn {
              display: inline-block;
              padding: 12px 30px;
              background-color: #2F6B31;
              color: #ffffff;
              text-decoration: none;
              border-radius: 5px;
              margin: 20px 0;
            }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <h1>CDC Universitas Andalas</h1>
              <p>Career Development Center</p>
            </div>
            
            <div class="content">
              <p>Halo <strong>${username}</strong>,</p>
              
              <p>Kami menerima permintaan untuk mereset password akun Anda. Gunakan kode OTP berikut untuk melanjutkan proses reset password:</p>
              
              <div class="otp-box">
                <p style="margin: 0 0 10px 0; color: #666; font-size: 14px;">Kode OTP Anda:</p>
                <div class="otp-code">${otp}</div>
              </div>
              
              <div class="warning">
                <p style="margin: 0; font-size: 14px;">
                  <strong>⚠️ Penting:</strong> Kode OTP ini hanya berlaku selama 10 menit. Jangan bagikan kode ini kepada siapa pun.
                </p>
              </div>
              
              <p>Jika Anda tidak meminta reset password, abaikan email ini. Password Anda tidak akan diubah.</p>
            </div>
            
            <div class="footer">
              <p>© 2025 CDC Universitas Andalas. All rights reserved.</p>
              <p>Email ini dikirim secara otomatis, mohon tidak membalas email ini.</p>
            </div>
          </div>
        </body>
        </html>
      `,
      text: `
        CDC Universitas Andalas - Career Development Center
        
        Halo ${username},
        
        Kode OTP untuk reset password Anda adalah: ${otp}
        
        Kode ini hanya berlaku selama 10 menit. Jangan bagikan kode ini kepada siapa pun.
        
        Jika Anda tidak meminta reset password, abaikan email ini.
        
        © 2025 CDC Universitas Andalas
      `,
    };

    const info = await transporter.sendMail(mailOptions);
    console.log('✅ OTP email sent:', info.messageId);
    return { success: true, messageId: info.messageId };
  } catch (error) {
    console.error('❌ Error sending OTP email:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Verify transporter connection
 */
export async function verifyEmailConnection() {
  try {
    await transporter.verify();
    console.log('✅ Email server is ready');
    return true;
  } catch (error) {
    console.error('❌ Email server connection failed:', error);
    return false;
  }
}

