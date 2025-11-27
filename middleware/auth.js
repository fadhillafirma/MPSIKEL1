// Middleware untuk memastikan user sudah login
export const requireAuth = (req, res, next) => {
  if (req.session && req.session.user) {
    return next();
  }
  res.redirect("/login");
};

// Middleware untuk memastikan user adalah superadmin
export const requireSuperAdmin = (req, res, next) => {
  if (req.session && req.session.user && req.session.user.role === "superadmin") {
    return next();
  }
  res.status(403).send("Akses ditolak. Hanya superadmin yang dapat mengakses halaman ini.");
};

// Middleware untuk check permission
export const requirePermission = (permission) => {
  return async (req, res, next) => {
    try {
      if (!req.session || !req.session.user) {
        return res.redirect("/login");
      }

      // Superadmin selalu punya akses penuh
      if (req.session.user.role === "superadmin") {
        return next();
      }

      // Ambil permissions dari session (lebih efisien)
      const permissions = req.session.user.permissions || {};

      // Debug: log permissions untuk troubleshooting
      console.log(`🔍 Checking permission '${permission}' for ${req.session.user.username} on path ${req.path}:`, {
        role: req.session.user.role,
        permissions: permissions,
        hasPermission: permissions[permission] === true
      });

      // Check permission
      if (permissions[permission] === true) {
        return next();
      }

      // Log untuk debugging (opsional, bisa dihapus di production)
      console.log(`⚠️ Akses ditolak: User ${req.session.user.username} (${req.session.user.role}) mencoba akses ${req.path} tanpa permission '${permission}'`);

      // Jika tidak ada permission, coba refresh dari database (fallback)
      try {
        const db = (await import("../config/db.js")).default;
        const userId = req.session.user.id;
        const [users] = await db.promise().execute(
          "SELECT permissions FROM admin_users WHERE id = ? AND is_active = 1",
          [userId]
        );

        if (users.length > 0 && users[0].permissions) {
          let dbPermissions = {};
          try {
            dbPermissions = typeof users[0].permissions === 'string' 
              ? JSON.parse(users[0].permissions) 
              : users[0].permissions;
            
            // Update session dengan permissions terbaru
            req.session.user.permissions = dbPermissions;
            
            if (dbPermissions[permission] === true) {
              return next();
            }
          } catch (e) {
            console.error("Error parsing permissions from DB:", e);
          }
        }
      } catch (dbError) {
        console.error("Error fetching permissions from DB:", dbError);
      }

      // Redirect ke dashboard dengan pesan error yang lebih informatif
      const permissionNames = {
        'riwayat': 'Riwayat Capaian',
        'upload': 'Upload Data CSV',
        'pembobotan': 'Pencatatan Pembobotan',
        'profile': 'Profil Admin',
        'manage_admin': 'Manajemen Admin'
      };
      const permissionName = permissionNames[permission] || permission;
      return res.redirect(`/dashboard?msg=${encodeURIComponent(`Akses ditolak. Anda tidak memiliki izin untuk mengakses: ${permissionName}`)}`);
    } catch (error) {
      console.error("❌ Error checking permission:", error);
      res.status(500).send("Terjadi kesalahan saat memeriksa izin");
    }
  };
};

