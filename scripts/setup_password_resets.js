import db from "../config/db.js";

async function setupPasswordResetsTable() {
  try {
    console.log("🔄 Membuat tabel password_resets...");

    const createTableQuery = `
      CREATE TABLE IF NOT EXISTS password_resets (
        id INT AUTO_INCREMENT PRIMARY KEY,
        user_id INT NOT NULL,
        email VARCHAR(150) NOT NULL,
        otp VARCHAR(6) NOT NULL,
        expires_at DATETIME NOT NULL,
        used TINYINT(1) DEFAULT 0,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        INDEX idx_email (email),
        INDEX idx_otp (otp),
        INDEX idx_expires (expires_at),
        FOREIGN KEY (user_id) REFERENCES admin_users(id) ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `;

    await db.promise().execute(createTableQuery);
    console.log("✅ Tabel password_resets berhasil dibuat!");

    // Hapus OTP yang sudah expired
    const cleanupQuery = `DELETE FROM password_resets WHERE expires_at < NOW() OR used = 1`;
    const [result] = await db.promise().execute(cleanupQuery);
    console.log(`🧹 Cleanup: ${result.affectedRows} OTP yang sudah expired dihapus.`);

    db.end();
    process.exit(0);
  } catch (error) {
    console.error("❌ Error:", error.message);
    db.end();
    process.exit(1);
  }
}

setupPasswordResetsTable();

