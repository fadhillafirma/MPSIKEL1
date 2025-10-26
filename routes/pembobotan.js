import express from "express";
import db from "../config/db.js";
const router = express.Router();

// Helper function to create table if not exists
async function ensureUMPTable() {
  try {
    await db.promise().execute(`
      CREATE TABLE IF NOT EXISTS ump_data (
        id INT AUTO_INCREMENT PRIMARY KEY,
        provinsi VARCHAR(100) NOT NULL,
        ump DECIMAL(15,2) NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        UNIQUE KEY unique_provinsi (provinsi)
      )
    `);
  } catch (error) {
    console.error("Error creating ump_data table:", error);
    throw error;
  }
}

// Route ke halaman Pembobotan
router.get("/", async (req, res) => {
  try {
    // Ensure table exists
    await ensureUMPTable();
    
    // Ambil data UMP dari database
    const [umpRows] = await db.promise().execute(`
      SELECT id, provinsi, ump, created_at, updated_at 
      FROM ump_data 
      ORDER BY provinsi ASC
    `);
    
    res.render("pembobotan", { ump: umpRows });
  } catch (error) {
    console.error("Error fetching UMP data:", error);
    res.render("pembobotan", { ump: [] });
  }
});

// API untuk menambah UMP baru (single)
router.post("/ump", async (req, res) => {
  try {
    await ensureUMPTable(); // Ensure table exists
    
    const { provinsi, ump, umpData } = req.body;
    
    // Handle bulk data from frontend
    if (umpData && Array.isArray(umpData)) {
      const results = [];
      
      for (const item of umpData) {
        if (!item.provinsi || !item.ump) continue;
        
        try {
          // Cek apakah provinsi sudah ada
          const [existing] = await db.promise().execute(
            "SELECT id FROM ump_data WHERE provinsi = ?",
            [item.provinsi]
          );

          if (existing.length > 0) {
            // Update existing data
            await db.promise().execute(
              "UPDATE ump_data SET ump = ?, updated_at = NOW() WHERE provinsi = ?",
              [item.ump, item.provinsi]
            );
            results.push({ provinsi: item.provinsi, action: 'updated' });
          } else {
            // Insert new data
            await db.promise().execute(
              "INSERT INTO ump_data (provinsi, ump) VALUES (?, ?)",
              [item.provinsi, item.ump]
            );
            results.push({ provinsi: item.provinsi, action: 'inserted' });
          }
        } catch (itemError) {
          console.error(`Error processing ${item.provinsi}:`, itemError);
          results.push({ provinsi: item.provinsi, action: 'error', error: itemError.message });
        }
      }
      
      return res.json({ 
        success: true, 
        message: "Data UMP berhasil diproses",
        results: results
      });
    }
    
    // Handle single data
    if (!provinsi || !ump) {
      return res.status(400).json({ 
        success: false, 
        message: "Provinsi dan UMP harus diisi" 
      });
    }

    // Cek apakah provinsi sudah ada
    const [existing] = await db.promise().execute(
      "SELECT id FROM ump_data WHERE provinsi = ?",
      [provinsi]
    );

    if (existing.length > 0) {
      return res.status(400).json({ 
        success: false, 
        message: "Provinsi sudah ada dalam database" 
      });
    }

    // Insert data baru
    const [result] = await db.promise().execute(
      "INSERT INTO ump_data (provinsi, ump) VALUES (?, ?)",
      [provinsi, ump]
    );

    res.json({ 
      success: true, 
      message: "Data UMP berhasil ditambahkan",
      data: { id: result.insertId, provinsi, ump }
    });
  } catch (error) {
    console.error("Error adding UMP:", error);
    res.status(500).json({ 
      success: false, 
      message: "Terjadi kesalahan server",
      error: error.message 
    });
  }
});

// API untuk mengupdate UMP
router.put("/ump/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const { provinsi, ump } = req.body;
    
    if (!provinsi || !ump) {
      return res.status(400).json({ 
        success: false, 
        message: "Provinsi dan UMP harus diisi" 
      });
    }

    // Update data
    const [result] = await db.promise().execute(
      "UPDATE ump_data SET provinsi = ?, ump = ?, updated_at = NOW() WHERE id = ?",
      [provinsi, ump, id]
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({ 
        success: false, 
        message: "Data UMP tidak ditemukan" 
      });
    }

    res.json({ 
      success: true, 
      message: "Data UMP berhasil diperbarui" 
    });
  } catch (error) {
    console.error("Error updating UMP:", error);
    res.status(500).json({ 
      success: false, 
      message: "Terjadi kesalahan server" 
    });
  }
});

// API untuk menghapus UMP
router.delete("/ump/:id", async (req, res) => {
  try {
    const { id } = req.params;

    const [result] = await db.promise().execute(
      "DELETE FROM ump_data WHERE id = ?",
      [id]
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({ 
        success: false, 
        message: "Data UMP tidak ditemukan" 
      });
    }

    res.json({ 
      success: true, 
      message: "Data UMP berhasil dihapus" 
    });
  } catch (error) {
    console.error("Error deleting UMP:", error);
    res.status(500).json({ 
      success: false, 
      message: "Terjadi kesalahan server" 
    });
  }
});

// API untuk mendapatkan semua UMP
router.get("/ump", async (req, res) => {
  try {
    await ensureUMPTable(); // Ensure table exists
    
    const [umpRows] = await db.promise().execute(`
      SELECT id, provinsi, ump, created_at, updated_at 
      FROM ump_data 
      ORDER BY provinsi ASC
    `);
    
    res.json({ 
      success: true, 
      data: umpRows 
    });
  } catch (error) {
    console.error("Error fetching UMP data:", error);
    res.status(500).json({ 
      success: false, 
      message: "Terjadi kesalahan server",
      error: error.message 
    });
  }
});

export default router;
  