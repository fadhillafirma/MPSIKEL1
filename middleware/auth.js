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

