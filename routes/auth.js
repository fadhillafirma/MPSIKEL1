import express from "express";
import db from "../config/db.js";
import bcrypt from "bcrypt";
import { requireAuth } from "../middleware/auth.js";

const router = express.Router();

// GET /login - Tampilkan halaman login
router.get("/login", (req, res) => {
  // Jika sudah login, redirect ke dashboard
  if (req.session && req.session.user) {
    return res.redirect("/dashboard");
  }
  const error = req.query.error || null;
  res.render("login", { error });
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

    // Set session
    req.session.user = {
      id: user.id,
      username: user.username,
      email: user.email,
      role: user.role
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
router.get("/profile", requireAuth, async (req, res) => {
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

export default router;

