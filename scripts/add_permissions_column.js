import db from "../config/db.js";

async function addPermissionsColumn() {
  try {
    // Tambahkan kolom permissions sebagai JSON
    await db.promise().execute(`
      ALTER TABLE admin_users 
      ADD COLUMN IF NOT EXISTS permissions JSON DEFAULT NULL
    `);
    console.log("✅ Kolom permissions berhasil ditambahkan");

    // Set default permissions untuk superadmin (tanpa dashboard karena semua user bisa akses)
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

    // Set default permissions untuk admin (tanpa dashboard karena semua user bisa akses)
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

    console.log("✅ Default permissions berhasil di-set");
    process.exit(0);
  } catch (error) {
    if (error.code === 'ER_DUP_FIELDNAME') {
      console.log("ℹ️  Kolom permissions sudah ada");
      process.exit(0);
    } else {
      console.error("❌ Error adding permissions column:", error);
      process.exit(1);
    }
  }
}

addPermissionsColumn();

