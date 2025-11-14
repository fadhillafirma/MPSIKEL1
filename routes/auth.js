import express from "express";
import db from "../config/db.js";
import bcrypt from "bcrypt";

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

export default router;

