import db from "../config/db.js";
import bcrypt from "bcrypt";

async function setupAdminTable() {
  try {
    // Buat tabel admin_users
    await db.promise().execute(`
      CREATE TABLE IF NOT EXISTS admin_users (
        id INT AUTO_INCREMENT PRIMARY KEY,
        username VARCHAR(100) NOT NULL UNIQUE,
        password VARCHAR(255) NOT NULL,
        email VARCHAR(150) UNIQUE,
        role ENUM('superadmin', 'admin') DEFAULT 'admin',
        is_active TINYINT(1) DEFAULT 1,
        createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
        updatedAt DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
      ) ENGINE=InnoDB 
        DEFAULT CHARSET=utf8mb4 
        COLLATE=utf8mb4_general_ci
    `);
    console.log("✅ Tabel admin_users berhasil dibuat");

    // Cek apakah sudah ada admin
    const [existing] = await db.promise().execute(
      "SELECT * FROM admin_users WHERE username = ?",
      ["admin"]
    );

    if (existing.length === 0) {
      // Hash password
      const hashedPassword = await bcrypt.hash("admin123", 10);
      
      // Insert admin default
      await db.promise().execute(
        `INSERT INTO admin_users (username, password, email, role, is_active) 
         VALUES (?, ?, ?, ?, ?)`,
        ["admin", hashedPassword, "admin@unand.ac.id", "superadmin", 1]
      );
      console.log("✅ Admin default berhasil dibuat");
      console.log("📧 Username: admin");
      console.log("🔑 Password: admin123");
      console.log("📧 Email: admin@unand.ac.id");
    } else {
      console.log("ℹ️  Admin sudah ada di database");
    }

    process.exit(0);
  } catch (error) {
    console.error("❌ Error setup admin:", error);
    process.exit(1);
  }
}

setupAdminTable();

