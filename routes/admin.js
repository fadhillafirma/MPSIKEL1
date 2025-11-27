import express from "express";
import db from "../config/db.js";
import bcrypt from "bcrypt";
import { requireAuth, requireSuperAdmin } from "../middleware/auth.js";

const router = express.Router();

// Apply auth middleware to all admin routes
router.use(requireAuth);
router.use(requireSuperAdmin); // Hanya superadmin yang bisa akses

// Helper function untuk memastikan kolom permissions ada
async function ensurePermissionsColumn() {
  try {
    // Cek apakah kolom permissions sudah ada
    const [columns] = await db.promise().execute(`
      SELECT COLUMN_NAME 
      FROM INFORMATION_SCHEMA.COLUMNS 
      WHERE TABLE_SCHEMA = DATABASE() 
      AND TABLE_NAME = 'admin_users' 
      AND COLUMN_NAME = 'permissions'
    `);

    if (columns.length === 0) {
      // Tambahkan kolom permissions
      await db.promise().execute(`
        ALTER TABLE admin_users 
        ADD COLUMN permissions JSON DEFAULT NULL
      `);

      // Set default permissions (tanpa dashboard karena semua user bisa akses)
      await db.promise().execute(`
        UPDATE admin_users 
        SET permissions = JSON_OBJECT(
          'riwayat', true,
          'upload', true,
          'pembobotan', true,
          'profile', true,
          'manage_admin', true
        )
        WHERE role = 'superadmin' AND permissions IS NULL
      `);

      await db.promise().execute(`
        UPDATE admin_users 
        SET permissions = JSON_OBJECT(
          'riwayat', false,
          'upload', false,
          'pembobotan', false,
          'profile', true,
          'manage_admin', false
        )
        WHERE role = 'admin' AND permissions IS NULL
      `);
    }
  } catch (error) {
    console.error("Error ensuring permissions column:", error);
  }
}

// GET /admin - Halaman manajemen admin
router.get("/", async (req, res) => {
  try {
    await ensurePermissionsColumn();

    const [admins] = await db.promise().execute(`
      SELECT 
        id, 
        username, 
        email, 
        role, 
        is_active, 
        permissions,
        createdAt, 
        updatedAt 
      FROM admin_users 
      ORDER BY createdAt DESC
    `);

    // Parse permissions JSON
    const adminsWithPermissions = admins.map(admin => ({
      ...admin,
      permissions: admin.permissions ? JSON.parse(admin.permissions) : null
    }));

    res.render("admin/manage", {
      admins: adminsWithPermissions,
      currentUser: req.session.user,
      msg: req.query.msg || null,
      error: req.query.error || null
    });
  } catch (error) {
    console.error("❌ Error loading admin management:", error);
    res.status(500).render("admin/manage", {
      admins: [],
      currentUser: req.session.user,
      error: "Gagal memuat data admin"
    });
  }
});

// GET /admin/create - Form tambah admin baru
router.get("/create", async (req, res) => {
  try {
    await ensurePermissionsColumn();
    res.render("admin/form", {
      admin: null,
      currentUser: req.session.user,
      mode: "create"
    });
  } catch (error) {
    console.error("❌ Error loading create form:", error);
    res.redirect("/admin?error=" + encodeURIComponent("Gagal memuat form"));
  }
});

// POST /admin - Tambah admin baru
router.post("/", async (req, res) => {
  try {
    await ensurePermissionsColumn();

    // Handle both JSON and form-urlencoded
    let { username, email, password, role, is_active, permissions } = req.body;
    
    // If permissions is a string, parse it
    if (typeof permissions === 'string') {
      try {
        permissions = JSON.parse(permissions);
      } catch (e) {
        permissions = null;
      }
    }

    if (!username || !password) {
      return res.redirect("/admin/create?error=" + encodeURIComponent("Username dan password harus diisi"));
    }

    // Cek apakah username sudah ada
    const [existing] = await db.promise().execute(
      "SELECT id FROM admin_users WHERE username = ?",
      [username]
    );

    if (existing.length > 0) {
      return res.redirect("/admin/create?error=" + encodeURIComponent("Username sudah digunakan"));
    }

    // Hash password
    const saltRounds = 10;
    const hashedPassword = await bcrypt.hash(password, saltRounds);

    // Parse permissions - handle both object and string
    let permissionsObj = {};
    if (permissions) {
      if (typeof permissions === 'string') {
        try {
          permissionsObj = JSON.parse(permissions);
        } catch (e) {
          // If parsing fails, try to build from form data
          permissionsObj = {};
        }
      } else {
        permissionsObj = permissions;
      }
    }
    
    // Jika superadmin, pastikan manage_admin selalu true
    if (role === 'superadmin') {
      permissionsObj.manage_admin = true;
    }
    
    // Jika permissions kosong, set defaults (tanpa dashboard karena semua user bisa akses)
    if (Object.keys(permissionsObj).length === 0) {
      permissionsObj = {
        riwayat: false,
        upload: false,
        pembobotan: false,
        profile: true,
        manage_admin: role === 'superadmin' // Superadmin selalu punya manage_admin
      };
    }

    // Insert admin baru
    await db.promise().execute(
      `INSERT INTO admin_users (username, password, email, role, is_active, permissions) 
       VALUES (?, ?, ?, ?, ?, ?)`,
      [
        username,
        hashedPassword,
        email || null,
        role || 'admin',
        is_active === '1' ? 1 : 0,
        JSON.stringify(permissionsObj)
      ]
    );

    res.redirect("/admin?msg=" + encodeURIComponent("Admin berhasil ditambahkan"));
  } catch (error) {
    console.error("❌ Error creating admin:", error);
    res.redirect("/admin/create?error=" + encodeURIComponent("Gagal menambahkan admin: " + error.message));
  }
});

// GET /admin/:id/edit - Form edit admin
router.get("/:id/edit", async (req, res) => {
  try {
    await ensurePermissionsColumn();

    const { id } = req.params;
    const [admins] = await db.promise().execute(
      "SELECT * FROM admin_users WHERE id = ?",
      [id]
    );

    if (admins.length === 0) {
      return res.redirect("/admin?error=" + encodeURIComponent("Admin tidak ditemukan"));
    }

    const admin = admins[0];
    admin.permissions = admin.permissions ? JSON.parse(admin.permissions) : null;

    res.render("admin/form", {
      admin: admin,
      currentUser: req.session.user,
      mode: "edit"
    });
  } catch (error) {
    console.error("❌ Error loading edit form:", error);
    res.redirect("/admin?error=" + encodeURIComponent("Gagal memuat form"));
  }
});

// PUT /admin/:id - Update admin
router.put("/:id", async (req, res) => {
  try {
    await ensurePermissionsColumn();

    const { id } = req.params;
    const { username, email, role, is_active, permissions, newPassword } = req.body;

    // Cek apakah admin ada
    const [existing] = await db.promise().execute(
      "SELECT id FROM admin_users WHERE id = ?",
      [id]
    );

    if (existing.length === 0) {
      return res.status(404).json({ success: false, message: "Admin tidak ditemukan" });
    }

    // Cek apakah username sudah digunakan oleh admin lain
    const [usernameCheck] = await db.promise().execute(
      "SELECT id FROM admin_users WHERE username = ? AND id != ?",
      [username, id]
    );

    if (usernameCheck.length > 0) {
      return res.status(400).json({ success: false, message: "Username sudah digunakan" });
    }

    // Parse permissions
    let permissionsObj = {};
    if (permissions) {
      try {
        permissionsObj = typeof permissions === 'string' ? JSON.parse(permissions) : permissions;
      } catch (e) {
        console.error("Error parsing permissions:", e);
        permissionsObj = {};
      }
    }
    
    // Jika superadmin, pastikan manage_admin selalu true
    if (role === 'superadmin') {
      permissionsObj.manage_admin = true;
    }

    // Handle is_active - bisa string '1'/'0', boolean, atau number
    let isActiveValue = 0;
    if (is_active === '1' || is_active === 1 || is_active === true || is_active === 'true') {
      isActiveValue = 1;
    }

    // Update admin
    let updateQuery = `
      UPDATE admin_users 
      SET username = ?, email = ?, role = ?, is_active = ?, permissions = ?, updatedAt = CURRENT_TIMESTAMP
    `;
    let updateParams = [username, email || null, role, isActiveValue, JSON.stringify(permissionsObj)];

    // Jika ada password baru, update password
    if (newPassword && newPassword.trim().length > 0) {
      if (newPassword.length < 6) {
        return res.status(400).json({ success: false, message: "Password harus minimal 6 karakter" });
      }
      const saltRounds = 10;
      const hashedPassword = await bcrypt.hash(newPassword, saltRounds);
      updateQuery += ", password = ?";
      updateParams.push(hashedPassword);
    }

    updateQuery += " WHERE id = ?";
    updateParams.push(id);

    await db.promise().execute(updateQuery, updateParams);

    res.json({ success: true, message: "Admin berhasil diperbarui" });
  } catch (error) {
    console.error("❌ Error updating admin:", error);
    res.status(500).json({ success: false, message: "Gagal memperbarui admin: " + error.message });
  }
});

// DELETE /admin/:id - Hapus admin
router.delete("/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const currentUserId = req.session.user.id;

    // Jangan izinkan menghapus diri sendiri
    if (parseInt(id) === currentUserId) {
      return res.status(400).json({ success: false, message: "Tidak dapat menghapus akun sendiri" });
    }

    // Hapus admin
    const [result] = await db.promise().execute(
      "DELETE FROM admin_users WHERE id = ?",
      [id]
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({ success: false, message: "Admin tidak ditemukan" });
    }

    res.json({ success: true, message: "Admin berhasil dihapus" });
  } catch (error) {
    console.error("❌ Error deleting admin:", error);
    res.status(500).json({ success: false, message: "Gagal menghapus admin: " + error.message });
  }
});

export default router;

