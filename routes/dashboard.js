import express from "express";
import db from "../config/db.js";
import path from "path";
import { fileURLToPath } from "url";
import { spawn } from "child_process";
import fs from "fs";
import { createRequire } from "module";
import { requireAuth } from "../middleware/auth.js";

const require = createRequire(import.meta.url);
const multer = require("multer");

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const router = express.Router();

// Apply auth middleware to all dashboard routes
router.use(requireAuth);

// Helper function untuk memastikan tabel settings ada
async function ensureSettingsTable() {
  try {
    await db.promise().execute(`
      CREATE TABLE IF NOT EXISTS dashboard_settings (
        id INT AUTO_INCREMENT PRIMARY KEY,
        setting_key VARCHAR(100) NOT NULL UNIQUE,
        setting_value TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
    
    // Inisialisasi total alumni jika belum ada
    const [existing] = await db.promise().execute(
      "SELECT * FROM dashboard_settings WHERE setting_key = 'total_alumni'"
    );
    
    if (existing.length === 0) {
      // Jika belum ada, ambil dari COUNT alumni sebagai default
      const [countResult] = await db.promise().query(`SELECT COUNT(*) AS total FROM alumni`);
      const defaultTotal = countResult[0]?.total || 0;
      await db.promise().execute(
        "INSERT INTO dashboard_settings (setting_key, setting_value) VALUES ('total_alumni', ?)",
        [defaultTotal.toString()]
      );
    }

    const [existingResponden] = await db.promise().execute(
      "SELECT * FROM dashboard_settings WHERE setting_key = 'total_responden'"
    );

    if (existingResponden.length === 0) {
      const [countResponden] = await db.promise().query(`SELECT COUNT(*) AS total FROM responden`);
      const defaultResponden = countResponden[0]?.total || 0;
      await db.promise().execute(
        "INSERT INTO dashboard_settings (setting_key, setting_value) VALUES ('total_responden', ?)",
        [defaultResponden.toString()]
      );
    }
  } catch (error) {
    console.error("Error creating dashboard_settings table:", error);
    throw error;
  }
}

// Setup multer untuk upload file
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadDir = path.join(__dirname, "../uploads");
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + "-" + Math.round(Math.random() * 1e9);
    cb(null, "csv-" + uniqueSuffix + path.extname(file.originalname));
  },
});

const upload = multer({
  storage: storage,
  fileFilter: (req, file, cb) => {
    if (file.mimetype === "text/csv" || file.originalname.endsWith(".csv")) {
      cb(null, true);
    } else {
      cb(new Error("Hanya file CSV yang diizinkan!"), false);
    }
  },
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB max
});

// 🟢 Route: GET /dashboard
router.get("/", async (req, res) => {
  try {
    // Pastikan tabel settings ada
    await ensureSettingsTable();

    // Pastikan tabel responden ada
    await db.promise().execute(`
      CREATE TABLE IF NOT EXISTS responden (
        id INT AUTO_INCREMENT PRIMARY KEY,
        nim VARCHAR(30) UNIQUE,
        nama VARCHAR(150) NOT NULL,
        email VARCHAR(150),
        tahun_lulus YEAR(4),
        prodiId INT,
        jumlah_input INT DEFAULT 1,
        createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
        updatedAt DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        INDEX idx_responden_prodi (prodiId),
        CONSTRAINT fk_responden_prodi FOREIGN KEY (prodiId) REFERENCES prodi(id) ON DELETE SET NULL ON UPDATE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci
    `);
    
    // Grafik 1️⃣: Distribusi Status Alumni (Bekerja, Wirausaha, Pendidikan, Belum Bekerja)
    const [status] = await db.promise().query(`
      SELECT oj.teks_opsi AS status, COUNT(jo.id) AS jumlah
      FROM jawaban_opsi jo
      JOIN opsi_jawaban oj ON jo.opsiJawabanId = oj.id
      GROUP BY oj.teks_opsi
    `);

    // Grafik 2️⃣: Rata-rata Capaian IKU per Fakultas (Rumus IKU1)
    const [capaianFakultas] = await db.promise().query(`
      SELECT 
        f.nama AS fakultas,
        ROUND(
          COALESCE(COUNT(DISTINCT jo.alumniId), 0) * 100.0 / 
          NULLIF(COUNT(DISTINCT a.id), 0), 
          2
        ) AS rata_capaian
      FROM fakultas f
      JOIN prodi p ON p.fakultasId = f.id
      JOIN alumni a ON a.prodiId = p.id
      LEFT JOIN jawaban_opsi jo ON jo.alumniId = a.id
      GROUP BY f.id
      ORDER BY rata_capaian DESC
    `);

    // Grafik 3️⃣: Jumlah Alumni per Tahun Lulus
    const [lulusanPerTahun] = await db.promise().query(`
      SELECT tahun_lulus, COUNT(*) AS jumlah
      FROM alumni
      GROUP BY tahun_lulus
      ORDER BY tahun_lulus ASC
    `);

    // Pastikan kolom jumlah_responden ada di tabel prodi
    try {
      const [columnsResponden] = await db.promise().execute(`
        SELECT COUNT(*) AS count
        FROM INFORMATION_SCHEMA.COLUMNS 
        WHERE TABLE_SCHEMA = DATABASE() 
        AND TABLE_NAME = 'prodi' 
        AND COLUMN_NAME = 'jumlah_responden'
      `);
      if (columnsResponden[0].count === 0) {
        await db.promise().execute(`
          ALTER TABLE prodi 
          ADD COLUMN jumlah_responden INT DEFAULT 0
        `);
      }
    } catch (e) {
      console.warn("Warning saat memastikan kolom jumlah_responden:", e.message);
    }

    // Ambil data prodi dengan total alumni dan responden
    const [prodiData] = await db.promise().query(`
      SELECT 
        p.id AS prodi_id,
        p.nama AS prodi_nama,
        f.nama AS fakultas_nama,
        COALESCE(p.jumlah_input, (SELECT COUNT(*) FROM alumni WHERE prodiId = p.id), 0) AS total_alumni,
        COALESCE(p.jumlah_responden, (SELECT COUNT(*) FROM responden WHERE prodiId = p.id), 0) AS total_responden
      FROM prodi p
      JOIN fakultas f ON p.fakultasId = f.id
      ORDER BY f.nama, p.nama
    `);

    const [settingsResult] = await db.promise().execute(
      "SELECT setting_value FROM dashboard_settings WHERE setting_key = 'total_alumni'"
    );
    const totalAlumniManual = settingsResult.length > 0 ? parseInt(settingsResult[0].setting_value) || 0 : 0;
    
    const totalAlumniProdi = prodiData.reduce((sum, prodi) => sum + (parseInt(prodi.total_alumni) || 0), 0);
    const totalAlumni = totalAlumniProdi > 0 ? totalAlumniProdi : totalAlumniManual;

    const [alumniCountResult] = await db.promise().query(`SELECT COUNT(*) AS total FROM alumni`);
    const totalAlumniFromTable = alumniCountResult[0]?.total || 0;

    const [totalRespondenResult] = await db.promise().query(`SELECT COUNT(*) AS total FROM responden`);
    const totalResponden = totalRespondenResult[0]?.total || 0;
    
    // Hitung rata-rata capaian IKU1: (Jumlah Responden / Total Alumni Manual) × 100%
    const rataCapaianResult = await db.promise().query(`
      SELECT 
        ROUND(
          COALESCE(?, 0) * 100.0 / 
          NULLIF(?, 0), 
          2
        ) AS rata
    `, [totalResponden, totalAlumni]);
    const rataCapaian = rataCapaianResult[0][0]?.rata || 0;

    // Ambil pesan dari query string jika ada
    const msg = req.query.msg || undefined;

    res.render("dashboard", {
      data: {
        status,
        capaianFakultas,
        lulusanPerTahun,
        totalAlumni,
        totalAlumniFromTable,
        totalResponden,
        rataCapaian,
        prodiData
      },
      msg: msg
    });
  } catch (err) {
    console.error("❌ Error mengambil data dashboard:", err);
    const msg = req.query.msg || undefined;
    res.render("dashboard", { data: {}, msg: msg });
  }
});

// 🟢 Route: POST /upload - Handle CSV upload dan proses dengan Python
// Route ini akan diakses sebagai /upload (bukan /dashboard/upload)
// Karena form action="/upload", kita perlu export router ini atau buat route terpisah
// Untuk sementara, kita buat route di root level
export const uploadRouter = express.Router();

// Apply auth middleware to upload routes
uploadRouter.use(requireAuth);

// 🟢 Route: GET /upload - Halaman upload CSV
uploadRouter.get("/upload", (req, res) => {
  console.log("✅ Route GET /upload diakses");
  const msg = req.query.msg || undefined;
  try {
    res.render("upload", { msg: msg });
  } catch (error) {
    console.error("❌ Error rendering upload view:", error);
    res.status(500).send("Error loading upload page: " + error.message);
  }
});

uploadRouter.post("/upload", upload.single("csvfile"), async (req, res) => {
  if (!req.file) {
    return res.redirect("/upload?msg=" + encodeURIComponent("Error: File tidak ditemukan"));
  }

  const csvPath = req.file.path;
  const importType = req.body.importType || "auto";
  let targetType = importType;

  if (!["alumni", "responden", "auto"].includes(targetType)) {
    targetType = "auto";
  }

  if (targetType === "auto") {
    targetType = "alumni"; // default
    try {
      const raw = fs.readFileSync(csvPath, "utf8");
      const lines = raw
        .split(/\r?\n/)
        .slice(0, 5)
        .map((line) => line.trim().toLowerCase());

      const joined = lines.join(" ");
      const hasAlumniSignature =
        joined.includes("no,nim") ||
        joined.includes("nama mahasiswa") ||
        joined.includes("program studi");
      const hasRespondenSignature =
        joined.includes("rekap - tracer study") ||
        joined.includes("tanggal input") ||
        joined.includes("jelaskan status anda");

      if (hasRespondenSignature && !hasAlumniSignature) {
        targetType = "responden";
      } else if (hasAlumniSignature) {
        targetType = "alumni";
      }
    } catch (err) {
      console.warn("⚠️ Tidak dapat mendeteksi tipe CSV secara otomatis:", err.message);
    }
  }

  const pythonScript =
    targetType === "responden"
      ? path.join(__dirname, "../scripts/update_total_responden_from_csv.py")
      : path.join(__dirname, "../scripts/process_csv.py");

  console.log("📁 File CSV diterima:", csvPath);
  console.log("🐍 Menjalankan Python script:", pythonScript);
  console.log("📊 Mode import:", targetType);

  // Jalankan Python script untuk memproses CSV
  // Coba python3 dulu, jika tidak ada gunakan python
  const pythonCommand = process.platform === "win32" ? "python" : "python3";
  
  // Di Windows dengan path yang mengandung spasi, gunakan command string lengkap
  // dengan shell: true, atau gunakan path yang sudah di-quote
  let pythonProcess;
  
  if (process.platform === "win32") {
    // Di Windows, gunakan command string lengkap untuk handle path dengan spasi
    const command = `"${pythonCommand}" "${pythonScript}" "${csvPath}"`;
    pythonProcess = spawn(command, {
      shell: true,
      cwd: path.dirname(pythonScript),
    });
  } else {
    // Di Linux/Mac, gunakan array arguments
    pythonProcess = spawn(pythonCommand, [pythonScript, csvPath], {
      cwd: path.dirname(pythonScript),
      shell: false,
    });
  }

  let pythonOutput = "";
  let pythonError = "";

  pythonProcess.stdout.on("data", (data) => {
    pythonOutput += data.toString();
    console.log("🐍 Python:", data.toString());
  });

  pythonProcess.stderr.on("data", (data) => {
    pythonError += data.toString();
    console.error("❌ Python Error:", data.toString());
  });

  pythonProcess.on("close", async (code) => {
    // Hapus file CSV setelah diproses
    try {
      if (fs.existsSync(csvPath)) {
        fs.unlinkSync(csvPath);
      }
    } catch (err) {
      console.error("Error menghapus file:", err);
    }

    console.log("Python process exited with code:", code);
    console.log("Python stdout:", pythonOutput);
    console.log("Python stderr:", pythonError);

    if (code === 0) {
      // Parse output dari Python
      try {
        // Cari JSON di output (bisa ada di tengah output karena ada print lain)
        const jsonMatch = pythonOutput.match(/\{[\s\S]*"success"[\s\S]*\}/);
        let result;
        if (jsonMatch) {
          result = JSON.parse(jsonMatch[0]);
        } else {
          // Jika tidak ada JSON, coba parse seluruh output
          result = JSON.parse(pythonOutput.trim());
        }
        
          if (result.success) {
          let msg;
          if (targetType === "responden") {
            msg = `Berhasil! Total responden diupdate untuk ${result.updated || 0} prodi. Total responden: ${result.total_responden || 0}. Alumni baru ditambahkan: ${result.added_alumni || 0}.`;
          } else {
            msg = `Berhasil! ${result.inserted || 0} data diimpor, ${result.updated || 0} data diupdate, ${result.eliminated || 0} data dieliminasi.`;
          }
          res.redirect(`/upload?msg=${encodeURIComponent(msg)}`);
          } else {
            res.redirect(`/upload?msg=${encodeURIComponent("Error: " + (result.error || "Gagal memproses"))}`);
        }
      } catch (err) {
        console.error("Error parsing Python output:", err);
        console.error("Raw output:", pythonOutput);
        // Coba parse error dari stderr
        try {
          const errorJson = JSON.parse(pythonError.trim());
          res.redirect(`/upload?msg=${encodeURIComponent("Error: " + (errorJson.error || "Gagal memproses hasil"))}`);
        } catch (e) {
          res.redirect(`/upload?msg=${encodeURIComponent("Error: Gagal memproses hasil. " + (pythonError || pythonOutput.substring(0, 100)))}`);
        }
      }
    } else {
      // Process failed
      let errorMsg = "Gagal memproses file CSV";
      try {
        // Coba parse error dari stderr
        const errorJson = JSON.parse(pythonError.trim());
        errorMsg = errorJson.error || errorMsg;
      } catch (e) {
        // Jika bukan JSON, gunakan error message langsung
        if (pythonError) {
          errorMsg = pythonError.substring(0, 200);
        } else if (pythonOutput) {
          errorMsg = pythonOutput.substring(0, 200);
        }
      }
      res.redirect(`/upload?msg=${encodeURIComponent("Error: " + errorMsg)}`);
    }
  });
});

// 🟢 Route: POST /dashboard/update-total-alumni - Update total alumni manual
router.post("/update-total-alumni", async (req, res) => {
  try {
    await ensureSettingsTable();
    
    const { totalAlumni } = req.body;
    
    if (!totalAlumni || isNaN(totalAlumni) || parseInt(totalAlumni) < 0) {
      return res.status(400).json({ 
        success: false, 
        message: "Total alumni harus berupa angka positif" 
      });
    }
    
    const totalAlumniInt = parseInt(totalAlumni);
    
    // Update atau insert setting
    await db.promise().execute(`
      INSERT INTO dashboard_settings (setting_key, setting_value) 
      VALUES ('total_alumni', ?)
      ON DUPLICATE KEY UPDATE setting_value = ?, updated_at = NOW()
    `, [totalAlumniInt.toString(), totalAlumniInt.toString()]);
    
    res.json({ 
      success: true, 
      message: "Total alumni berhasil diupdate",
      totalAlumni: totalAlumniInt
    });
  } catch (err) {
    console.error("❌ Error update total alumni:", err);
    res.status(500).json({ 
      success: false, 
      message: "Gagal mengupdate total alumni: " + err.message 
    });
  }
});

// 🟢 Route: POST /dashboard/update-total-alumni-prodi - Update total alumni per prodi
router.post("/update-total-alumni-prodi", async (req, res) => {
  try {
    const { prodiId, totalAlumni, totalResponden } = req.body;
    
    if (!prodiId || isNaN(prodiId)) {
      return res.status(400).json({ 
        success: false, 
        message: "ID Prodi tidak valid" 
      });
    }
    
    if (totalAlumni === undefined || totalAlumni === null || isNaN(totalAlumni) || parseInt(totalAlumni) < 0) {
      return res.status(400).json({ 
        success: false, 
        message: "Total alumni harus berupa angka positif" 
      });
    }
    
    const prodiIdInt = parseInt(prodiId);
    const totalAlumniInt = parseInt(totalAlumni);
    const totalRespondenInt = totalResponden !== undefined && totalResponden !== null 
      ? parseInt(totalResponden) 
      : null;
    
    // Pastikan kolom jumlah_input ada di tabel prodi
    try {
      const [columns] = await db.promise().execute(`
        SELECT COUNT(*) AS count
        FROM INFORMATION_SCHEMA.COLUMNS 
        WHERE TABLE_SCHEMA = DATABASE() 
        AND TABLE_NAME = 'prodi' 
        AND COLUMN_NAME = 'jumlah_input'
      `);
      if (columns[0].count === 0) {
        await db.promise().execute(`
          ALTER TABLE prodi 
          ADD COLUMN jumlah_input INT DEFAULT 0
        `);
      }
    } catch (e) {
      console.warn("Warning saat memastikan kolom jumlah_input:", e.message);
    }
    
    // Pastikan kolom jumlah_responden ada di tabel prodi
    try {
      const [columnsResponden] = await db.promise().execute(`
        SELECT COUNT(*) AS count
        FROM INFORMATION_SCHEMA.COLUMNS 
        WHERE TABLE_SCHEMA = DATABASE() 
        AND TABLE_NAME = 'prodi' 
        AND COLUMN_NAME = 'jumlah_responden'
      `);
      if (columnsResponden[0].count === 0) {
        await db.promise().execute(`
          ALTER TABLE prodi 
          ADD COLUMN jumlah_responden INT DEFAULT 0
        `);
      }
    } catch (e) {
      console.warn("Warning saat memastikan kolom jumlah_responden:", e.message);
    }
    
    // Update jumlah_input untuk prodi
    await db.promise().execute(`
      UPDATE prodi 
      SET jumlah_input = ? 
      WHERE id = ?
    `, [totalAlumniInt, prodiIdInt]);
    
    // Update jumlah_responden jika diberikan
    if (totalRespondenInt !== null && totalRespondenInt >= 0) {
      await db.promise().execute(`
        UPDATE prodi 
        SET jumlah_responden = ? 
        WHERE id = ?
      `, [totalRespondenInt, prodiIdInt]);
    }
    
    // Update jumlah_input untuk fakultas (sum dari semua prodi di fakultas)
    await db.promise().execute(`
      UPDATE fakultas f
      SET f.jumlah_input = (
        SELECT COALESCE(SUM(COALESCE(p.jumlah_input, 0)), 0)
        FROM prodi p
        WHERE p.fakultasId = f.id
      )
    `);
    
    // Hitung total alumni baru (sum dari semua prodi)
    const [totalResult] = await db.promise().query(`
      SELECT COALESCE(SUM(COALESCE(jumlah_input, 0)), 0) AS total
      FROM prodi
    `);
    const newTotalAlumni = totalResult[0]?.total || 0;
    
    res.json({ 
      success: true, 
      message: "Total alumni prodi berhasil diupdate",
      totalAlumni: newTotalAlumni
    });
  } catch (err) {
    console.error("❌ Error update total alumni prodi:", err);
    res.status(500).json({ 
      success: false, 
      message: "Gagal mengupdate total alumni prodi: " + err.message 
    });
  }
});

export default router;
