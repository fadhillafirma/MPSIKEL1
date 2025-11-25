import nodemailer from 'nodemailer';
import dotenv from 'dotenv';

// Load environment variables dari .env file
dotenv.config();

// Konfigurasi email transporter
// Setup SMTP server sesuai provider email Anda
// Edit file .env atau set environment variables berikut:

const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST || 'smtp.gmail.com',
  port: process.env.SMTP_PORT || 587,
  secure: false, // true for 465, false for other ports (587)
  auth: {
    user: process.env.SMTP_USER || '', // Email pengirim
    pass: process.env.SMTP_PASS || ''  // Password email
  },
  // Untuk menghindari masalah SSL
  tls: {
    rejectUnauthorized: false
  }
});

// Verify connection configuration
transporter.verify((error, success) => {
  if (error) {
    console.error('❌ Email configuration error:', error);
    console.log('💡 Pastikan SMTP_USER dan SMTP_PASS sudah diatur di .env atau environment variables');
    console.log('💡 Untuk Gmail, gunakan App Password (bukan password biasa)');
  } else {
    console.log('✅ Email server siap digunakan');
  }
});

export default transporter;

