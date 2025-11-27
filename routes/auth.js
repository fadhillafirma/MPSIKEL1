import express from "express";
import db from "../config/db.js";
import bcrypt from "bcrypt";
import { requireAuth, requirePermission } from "../middleware/auth.js";
import transporter from "../config/email.js";

const router = express.Router();

// GET /login - Tampilkan halaman login
router.get("/login", (req, res) => {
  // Jika sudah login, redirect ke dashboard
  if (req.session && req.session.user) {
    return res.redirect("/dashboard");
  }
  const error = req.query.error || null;
  const msg = req.query.msg || null;
  res.render("login", { error, msg });
});

// POST /login - Proses login
router.post("/login", async (req, res) => {
  try {
    const { username, password } = req.body;

    if (!username || !password) {
      return res.redirect("/login?error=" + encodeURIComponent("Username dan password harus diisi"));
    }

    // Cari user di database
    const [users] = await db.promise().execute(
      "SELECT * FROM admin_users WHERE username = ? AND is_active = 1",
      [username]
    );

    if (users.length === 0) {
      return res.redirect("/login?error=" + encodeURIComponent("Username atau password salah"));
    }

    const user = users[0];

    // Verifikasi password
    const isValidPassword = await bcrypt.compare(password, user.password);

    if (!isValidPassword) {
      return res.redirect("/login?error=" + encodeURIComponent("Username atau password salah"));
    }

    // Parse permissions dari database - PASTIKAN selalu menggunakan data dari database
    let permissions = {};
    if (user.permissions) {
      try {
        permissions = typeof user.permissions === 'string' 
          ? JSON.parse(user.permissions) 
          : user.permissions;
        console.log(`✅ Permissions loaded for ${username}:`, permissions);
      } catch (e) {
        console.error("❌ Error parsing permissions:", e);
        // Jika parsing gagal, set permissions kosong (user harus diatur ulang oleh superadmin)
        permissions = {};
      }
    } else {
      // Jika permissions null/undefined di database, set default berdasarkan role (tanpa dashboard karena semua user bisa akses)
      if (user.role === 'superadmin') {
        permissions = {
          riwayat: true,
          upload: true,
          pembobotan: true,
          profile: true,
          manage_admin: true // Superadmin selalu punya manage_admin
        };
        console.log(`⚠️ No permissions in DB for superadmin ${username}, using defaults`);
      } else {
        // Admin biasa tanpa permissions = hanya profile
        permissions = {
          riwayat: false,
          upload: false,
          pembobotan: false,
          profile: true,
          manage_admin: false
        };
        console.log(`⚠️ No permissions in DB for admin ${username}, using defaults`);
      }
    }

    // Set session dengan permissions
    req.session.user = {
      id: user.id,
      username: user.username,
      email: user.email,
      role: user.role,
      permissions: permissions
    };

    // Redirect ke dashboard
    res.redirect("/dashboard");
  } catch (error) {
    console.error("❌ Error login:", error);
    res.redirect("/login?error=" + encodeURIComponent("Terjadi kesalahan saat login"));
  }
});

// GET /logout - Logout
router.get("/logout", (req, res) => {
  req.session.destroy((err) => {
    if (err) {
      console.error("❌ Error logout:", err);
    }
    res.redirect("/login");
  });
});

// GET /profile - Tampilkan halaman profile
router.get("/profile", requireAuth, requirePermission('profile'), async (req, res) => {
  try {
    if (!req.session || !req.session.user) {
      return res.redirect("/login");
    }

    const userId = req.session.user.id;
    const [users] = await db.promise().execute(
      "SELECT id, username, email, role, is_active, createdAt, updatedAt FROM admin_users WHERE id = ? AND is_active = 1",
      [userId]
    );

    if (users.length === 0) {
      return res.redirect("/login?error=" + encodeURIComponent("User tidak ditemukan"));
    }

    const user = users[0];
    const msg = req.query.msg || undefined;

    // Format dates untuk ditampilkan
    const formatDate = (date) => {
      if (!date) return '-';
      try {
        const d = new Date(date);
        if (isNaN(d.getTime())) return '-';
        return d.toLocaleString('id-ID', { 
          year: 'numeric', 
          month: 'long', 
          day: 'numeric',
          hour: '2-digit',
          minute: '2-digit'
        });
      } catch (e) {
        return '-';
      }
    };

    res.render("profile", { 
      user: {
        id: user.id,
        username: user.username,
        email: user.email || "",
        role: user.role || "Admin",
        is_active: user.is_active,
        createdAt: formatDate(user.createdAt),
        updatedAt: formatDate(user.updatedAt)
      },
      msg: msg
    });
  } catch (error) {
    console.error("❌ Error loading profile:", error);
    res.redirect("/dashboard?msg=" + encodeURIComponent("Error: Gagal memuat halaman profil"));
  }
});

// POST /profile/update-username - Update username
router.post("/profile/update-username", requireAuth, async (req, res) => {
  try {
    if (!req.session || !req.session.user) {
      return res.redirect("/login");
    }

    const userId = req.session.user.id;
    const { newUsername } = req.body;

    if (!newUsername || newUsername.trim().length < 3 || newUsername.trim().length > 50) {
      return res.redirect("/profile?msg=" + encodeURIComponent("Error: Username harus terdiri dari 3-50 karakter"));
    }

    // Check if username already exists
    const [existing] = await db.promise().execute(
      "SELECT id FROM admin_users WHERE username = ? AND id != ?",
      [newUsername.trim(), userId]
    );

    if (existing.length > 0) {
      return res.redirect("/profile?msg=" + encodeURIComponent("Error: Username sudah digunakan"));
    }

    // Update username di database
    await db.promise().execute(
      "UPDATE admin_users SET username = ?, updatedAt = CURRENT_TIMESTAMP WHERE id = ?",
      [newUsername.trim(), userId]
    );

    // Update session
    req.session.user.username = newUsername.trim();

    res.redirect("/profile?msg=" + encodeURIComponent("Berhasil: Username berhasil diubah"));
  } catch (error) {
    console.error("❌ Error updating username:", error);
    res.redirect("/profile?msg=" + encodeURIComponent("Error: Gagal mengubah username"));
  }
});

// POST /profile/update-email - Update email
router.post("/profile/update-email", requireAuth, async (req, res) => {
  try {
    if (!req.session || !req.session.user) {
      return res.redirect("/login");
    }

    const userId = req.session.user.id;
    const { newEmail } = req.body;

    if (!newEmail || !newEmail.includes("@")) {
      return res.redirect("/profile?msg=" + encodeURIComponent("Error: Email tidak valid"));
    }

    // Check if email already exists
    const [existing] = await db.promise().execute(
      "SELECT id FROM admin_users WHERE email = ? AND id != ?",
      [newEmail.trim(), userId]
    );

    if (existing.length > 0) {
      return res.redirect("/profile?msg=" + encodeURIComponent("Error: Email sudah digunakan"));
    }

    // Update email di database
    await db.promise().execute(
      "UPDATE admin_users SET email = ?, updatedAt = CURRENT_TIMESTAMP WHERE id = ?",
      [newEmail.trim(), userId]
    );

    // Update session
    req.session.user.email = newEmail.trim();

    res.redirect("/profile?msg=" + encodeURIComponent("Berhasil: Email berhasil diubah"));
  } catch (error) {
    console.error("❌ Error updating email:", error);
    res.redirect("/profile?msg=" + encodeURIComponent("Error: Gagal mengubah email"));
  }
});

// POST /profile/change-password - Change password
router.post("/profile/change-password", requireAuth, async (req, res) => {
  try {
    if (!req.session || !req.session.user) {
      return res.redirect("/login");
    }

    const userId = req.session.user.id;
    const { currentPassword, newPassword, confirmPassword } = req.body;

    if (!currentPassword || !newPassword || !confirmPassword) {
      return res.redirect("/profile?msg=" + encodeURIComponent("Error: Semua field password harus diisi"));
    }

    if (newPassword.length < 6) {
      return res.redirect("/profile?msg=" + encodeURIComponent("Error: Password baru harus minimal 6 karakter"));
    }

    if (newPassword !== confirmPassword) {
      return res.redirect("/profile?msg=" + encodeURIComponent("Error: Password baru dan konfirmasi password tidak cocok"));
    }

    // Get current password hash
    const [users] = await db.promise().execute(
      "SELECT password FROM admin_users WHERE id = ? AND is_active = 1",
      [userId]
    );

    if (users.length === 0) {
      return res.redirect("/login?error=" + encodeURIComponent("User tidak ditemukan"));
    }

    const user = users[0];

    // Verify current password
    const isValidPassword = await bcrypt.compare(currentPassword, user.password);

    if (!isValidPassword) {
      return res.redirect("/profile?msg=" + encodeURIComponent("Error: Password saat ini tidak benar"));
    }

    // Hash new password
    const saltRounds = 10;
    const hashedPassword = await bcrypt.hash(newPassword, saltRounds);

    // Update password di database
    await db.promise().execute(
      "UPDATE admin_users SET password = ?, updatedAt = CURRENT_TIMESTAMP WHERE id = ?",
      [hashedPassword, userId]
    );

    res.redirect("/profile?msg=" + encodeURIComponent("Berhasil: Password berhasil diubah"));
  } catch (error) {
    console.error("❌ Error changing password:", error);
    res.redirect("/profile?msg=" + encodeURIComponent("Error: Gagal mengubah password"));
  }
});

// GET /forgot-password - Tampilkan halaman forgot password
router.get("/forgot-password", (req, res) => {
  // Jika sudah login, redirect ke dashboard
  if (req.session && req.session.user) {
    return res.redirect("/dashboard");
  }
  const error = req.query.error || null;
  const msg = req.query.msg || null;
  res.render("forgot-password", { error, msg });
});

// GET /forgot-username - Tampilkan halaman forgot username
router.get("/forgot-username", (req, res) => {
  // Jika sudah login, redirect ke dashboard
  if (req.session && req.session.user) {
    return res.redirect("/dashboard");
  }
  const error = req.query.error || null;
  const msg = req.query.msg || null;
  res.render("forgot-username", { error, msg });
});

// POST /forgot-username - Kirim username ke email
router.post("/forgot-username", async (req, res) => {
  try {
    const { email } = req.body;

    if (!email || email.trim().length === 0) {
      return res.redirect("/forgot-username?error=" + encodeURIComponent("Email harus diisi"));
    }

    // Cari user di database berdasarkan email
    const [users] = await db.promise().execute(
      "SELECT id, username, email FROM admin_users WHERE email = ? AND is_active = 1",
      [email.trim()]
    );

    console.log(`🔍 Mencari email: "${email.trim()}"`);
    console.log(`📊 Ditemukan ${users.length} user`);

    if (users.length === 0) {
      console.log(`❌ Email "${email.trim()}" tidak ditemukan di database`);
      // Jangan reveal jika user tidak ditemukan untuk keamanan
      return res.redirect("/forgot-username?msg=" + encodeURIComponent("Jika email terdaftar, username telah dikirim ke email Anda"));
    }

    const user = users[0];
    console.log(`✅ User ditemukan: username=${user.username}, email=${user.email}`);

    // Kirim username via email
    const mailOptions = {
      from: process.env.SMTP_USER || '"CDC Universitas Andalas" <noreply@unand.ac.id>',
      to: user.email,
      subject: "Username Anda - CDC Universitas Andalas",
      html: `
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="UTF-8">
          <style>
            body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
            .container { max-width: 600px; margin: 0 auto; padding: 20px; }
            .header { background: #2F6B31; color: white; padding: 20px; text-align: center; border-radius: 5px 5px 0 0; }
            .content { background: #f9f9f9; padding: 30px; border-radius: 0 0 5px 5px; }
            .username-box { background: white; border: 2px solid #2F6B31; border-radius: 8px; padding: 20px; text-align: center; margin: 20px 0; }
            .username-code { font-size: 24px; font-weight: bold; color: #2F6B31; letter-spacing: 2px; }
            .footer { text-align: center; margin-top: 20px; font-size: 12px; color: #666; }
            .warning { background: #fff3cd; border-left: 4px solid #ffc107; padding: 10px; margin: 15px 0; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <h1>CDC Universitas Andalas</h1>
              <p>Pemulihan Username</p>
            </div>
            <div class="content">
              <h2>Halo!</h2>
              <p>Anda telah meminta untuk mengirimkan username akun Anda. Berikut adalah username Anda:</p>
              
              <div class="username-box">
                <div class="username-code">${user.username}</div>
              </div>
              
              <div class="warning">
                <strong>⚠️ Keamanan:</strong> Jangan berbagi username ini dengan siapa pun. Jika Anda tidak meminta username ini, abaikan email ini atau hubungi administrator.
              </div>
              
              <p>Jika Anda lupa password, silakan gunakan fitur "Lupa Password" di halaman login.</p>
            </div>
            <div class="footer">
              <p>© 2025 CDC Universitas Andalas. All rights reserved.</p>
              <p>Email ini dikirim otomatis, mohon jangan membalas email ini.</p>
            </div>
          </div>
        </body>
        </html>
      `
    };

    try {
      await transporter.sendMail(mailOptions);
      console.log(`✅ Username berhasil dikirim ke ${user.email}`);
      
      res.redirect("/forgot-username?msg=" + encodeURIComponent("Username telah dikirim ke email Anda. Silakan cek inbox atau spam folder"));
    } catch (emailError) {
      console.error("❌ Error sending email:", emailError);
      return res.redirect("/forgot-username?error=" + encodeURIComponent("Gagal mengirim email. Pastikan konfigurasi email sudah benar atau hubungi administrator"));
    }

  } catch (error) {
    console.error("❌ Error forgot username:", error);
    console.error("❌ Error details:", error.message);
    console.error("❌ Stack trace:", error.stack);
    res.redirect("/forgot-username?error=" + encodeURIComponent("Terjadi kesalahan: " + error.message + ". Silakan coba lagi atau hubungi administrator"));
  }
});

// POST /forgot-password - Kirim OTP ke email
router.post("/forgot-password", async (req, res) => {
  try {
    const { username } = req.body;

    if (!username || username.trim().length === 0) {
      return res.redirect("/forgot-password?error=" + encodeURIComponent("Username harus diisi"));
    }

    // Cari user di database
    const [users] = await db.promise().execute(
      "SELECT id, username, email FROM admin_users WHERE username = ? AND is_active = 1",
      [username.trim()]
    );

    console.log(`🔍 Mencari username: "${username.trim()}"`);
    console.log(`📊 Ditemukan ${users.length} user`);

    if (users.length === 0) {
      console.log(`❌ Username "${username.trim()}" tidak ditemukan di database`);
      // Jangan reveal jika user tidak ditemukan untuk keamanan
      return res.redirect("/forgot-password?msg=" + encodeURIComponent("Jika username terdaftar, OTP telah dikirim ke email Anda"));
    }

    const user = users[0];
    console.log(`✅ User ditemukan: username=${user.username}, email=${user.email || '(kosong)'}`);

    // Cek apakah user punya email
    if (!user.email || user.email.trim().length === 0) {
      console.log(`❌ Email kosong untuk username: ${user.username}`);
      return res.redirect("/forgot-password?error=" + encodeURIComponent("Email tidak ditemukan. Silakan isi email di halaman profil admin terlebih dahulu"));
    }

    // Generate OTP 6 digit
    const otp = Math.floor(100000 + Math.random() * 900000).toString();

    // Set expired time (15 menit dari sekarang)
    const expiresAt = new Date();
    expiresAt.setMinutes(expiresAt.getMinutes() + 15);

    // Hapus OTP lama yang belum digunakan
    await db.promise().execute(
      "DELETE FROM password_resets WHERE user_id = ? AND used = 0",
      [user.id]
    );

    // Simpan OTP ke database
    await db.promise().execute(
      "INSERT INTO password_resets (user_id, email, otp, expires_at) VALUES (?, ?, ?, ?)",
      [user.id, user.email, otp, expiresAt]
    );

    // Kirim OTP via email
    const mailOptions = {
      from: process.env.SMTP_USER || '"CDC Universitas Andalas" <noreply@unand.ac.id>',
      to: user.email,
      subject: "Kode OTP Reset Password - CDC Universitas Andalas",
      html: `
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="UTF-8">
          <style>
            body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
            .container { max-width: 600px; margin: 0 auto; padding: 20px; }
            .header { background: #2F6B31; color: white; padding: 20px; text-align: center; border-radius: 5px 5px 0 0; }
            .content { background: #f9f9f9; padding: 30px; border-radius: 0 0 5px 5px; }
            .otp-box { background: white; border: 2px solid #2F6B31; border-radius: 8px; padding: 20px; text-align: center; margin: 20px 0; }
            .otp-code { font-size: 32px; font-weight: bold; color: #2F6B31; letter-spacing: 5px; }
            .footer { text-align: center; margin-top: 20px; font-size: 12px; color: #666; }
            .warning { background: #fff3cd; border-left: 4px solid #ffc107; padding: 10px; margin: 15px 0; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <h1>CDC Universitas Andalas</h1>
              <p>Reset Password</p>
            </div>
            <div class="content">
              <h2>Halo, ${user.username}!</h2>
              <p>Anda telah meminta untuk mereset password akun Anda. Gunakan kode OTP berikut untuk melanjutkan proses reset password:</p>
              
              <div class="otp-box">
                <div class="otp-code">${otp}</div>
              </div>
              
              <p>Kode OTP ini berlaku selama <strong>15 menit</strong> dan hanya dapat digunakan sekali.</p>
              
              <div class="warning">
                <strong>⚠️ Keamanan:</strong> Jangan berbagi kode OTP ini dengan siapa pun. Jika Anda tidak meminta reset password, abaikan email ini.
              </div>
              
              <p>Jika Anda tidak meminta reset password, silakan abaikan email ini atau hubungi administrator jika ada pertanyaan.</p>
            </div>
            <div class="footer">
              <p>© 2025 CDC Universitas Andalas. All rights reserved.</p>
              <p>Email ini dikirim otomatis, mohon jangan membalas email ini.</p>
            </div>
          </div>
        </body>
        </html>
      `
    };

    try {
      await transporter.sendMail(mailOptions);
      console.log(`✅ OTP berhasil dikirim ke ${user.email}`);
      
      // Simpan email di session untuk verifikasi berikutnya
      req.session.forgotPasswordEmail = user.email;
      req.session.forgotPasswordUserId = user.id;
      
      res.redirect("/verify-otp?msg=" + encodeURIComponent("OTP telah dikirim ke email Anda. Silakan cek inbox atau spam folder"));
    } catch (emailError) {
      console.error("❌ Error sending email:", emailError);
      return res.redirect("/forgot-password?error=" + encodeURIComponent("Gagal mengirim email. Pastikan konfigurasi email sudah benar atau hubungi administrator"));
    }

  } catch (error) {
    console.error("❌ Error forgot password:", error);
    console.error("❌ Error details:", error.message);
    console.error("❌ Stack trace:", error.stack);
    res.redirect("/forgot-password?error=" + encodeURIComponent("Terjadi kesalahan: " + error.message + ". Silakan coba lagi atau hubungi administrator"));
  }
});

// GET /verify-otp - Tampilkan halaman verify OTP
router.get("/verify-otp", (req, res) => {
  // Jika sudah login, redirect ke dashboard
  if (req.session && req.session.user) {
    return res.redirect("/dashboard");
  }
  
  // Cek apakah ada email di session
  if (!req.session.forgotPasswordEmail) {
    return res.redirect("/forgot-password?error=" + encodeURIComponent("Session expired. Silakan request OTP lagi"));
  }

  const error = req.query.error || null;
  const msg = req.query.msg || null;
  const maskedEmail = req.session.forgotPasswordEmail.replace(/(.{2})(.*)(@.*)/, '$1***$3');
  
  res.render("verify-otp", { error, msg, maskedEmail });
});

// POST /verify-otp - Verifikasi OTP
router.post("/verify-otp", async (req, res) => {
  try {
    const { otp } = req.body;

    if (!req.session.forgotPasswordEmail) {
      return res.redirect("/forgot-password?error=" + encodeURIComponent("Session expired. Silakan request OTP lagi"));
    }

    if (!otp || otp.trim().length !== 6) {
      return res.redirect("/verify-otp?error=" + encodeURIComponent("OTP harus 6 digit"));
    }

    const email = req.session.forgotPasswordEmail;
    const userId = req.session.forgotPasswordUserId;

    // Cari OTP di database
    const [otps] = await db.promise().execute(
      "SELECT * FROM password_resets WHERE user_id = ? AND email = ? AND otp = ? AND used = 0 AND expires_at > NOW() ORDER BY created_at DESC LIMIT 1",
      [userId, email, otp.trim()]
    );

    if (otps.length === 0) {
      return res.redirect("/verify-otp?error=" + encodeURIComponent("OTP tidak valid atau sudah expired. Silakan request OTP baru"));
    }

    const otpRecord = otps[0];

    // Mark OTP as used
    await db.promise().execute(
      "UPDATE password_resets SET used = 1 WHERE id = ?",
      [otpRecord.id]
    );

    // Set session untuk reset password
    req.session.resetPasswordUserId = userId;
    req.session.resetPasswordVerified = true;

    res.redirect("/reset-password?msg=" + encodeURIComponent("OTP berhasil diverifikasi. Silakan masukkan password baru Anda"));
  } catch (error) {
    console.error("❌ Error verifying OTP:", error);
    res.redirect("/verify-otp?error=" + encodeURIComponent("Terjadi kesalahan. Silakan coba lagi"));
  }
});

// GET /reset-password - Tampilkan halaman reset password
router.get("/reset-password", (req, res) => {
  // Jika sudah login, redirect ke dashboard
  if (req.session && req.session.user) {
    return res.redirect("/dashboard");
  }
  
  // Cek apakah sudah verified
  if (!req.session.resetPasswordVerified || !req.session.resetPasswordUserId) {
    return res.redirect("/forgot-password?error=" + encodeURIComponent("Session expired. Silakan request OTP lagi"));
  }

  const error = req.query.error || null;
  const msg = req.query.msg || null;
  
  res.render("reset-password", { error, msg });
});

// POST /reset-password - Reset password
router.post("/reset-password", async (req, res) => {
  try {
    const { newPassword, confirmPassword } = req.body;

    if (!req.session.resetPasswordVerified || !req.session.resetPasswordUserId) {
      return res.redirect("/forgot-password?error=" + encodeURIComponent("Session expired. Silakan request OTP lagi"));
    }

    if (!newPassword || !confirmPassword) {
      return res.redirect("/reset-password?error=" + encodeURIComponent("Semua field harus diisi"));
    }

    if (newPassword.length < 6) {
      return res.redirect("/reset-password?error=" + encodeURIComponent("Password harus minimal 6 karakter"));
    }

    if (newPassword !== confirmPassword) {
      return res.redirect("/reset-password?error=" + encodeURIComponent("Password dan konfirmasi password tidak cocok"));
    }

    const userId = req.session.resetPasswordUserId;

    // Hash new password
    const saltRounds = 10;
    const hashedPassword = await bcrypt.hash(newPassword, saltRounds);

    // Update password di database
    await db.promise().execute(
      "UPDATE admin_users SET password = ?, updatedAt = CURRENT_TIMESTAMP WHERE id = ?",
      [hashedPassword, userId]
    );

    // Clear session
    delete req.session.forgotPasswordEmail;
    delete req.session.forgotPasswordUserId;
    delete req.session.resetPasswordUserId;
    delete req.session.resetPasswordVerified;

    res.redirect("/login?msg=" + encodeURIComponent("Password berhasil diubah. Silakan login dengan password baru"));
  } catch (error) {
    console.error("❌ Error resetting password:", error);
    res.redirect("/reset-password?error=" + encodeURIComponent("Terjadi kesalahan. Silakan coba lagi"));
  }
});

export default router;

