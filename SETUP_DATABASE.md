# 🗄️ Setup Database UMP

## ❌ Error yang Terjadi
```
Terjadi kesalahan saat memuat data UMP
```

## ✅ Solusi: Buat Tabel Database

### **Step 1: Buka phpMyAdmin**
1. Start XAMPP (Apache + MySQL)
2. Buka browser → `http://localhost/phpmyadmin`
3. Login dengan username/password MySQL

### **Step 2: Pilih Database**
1. Klik database `tracer_study_sederhana`
2. Jika belum ada, buat dulu:
   ```sql
   CREATE DATABASE tracer_study_sederhana;
   ```

### **Step 3: Jalankan SQL Code**
Copy dan paste code berikut di tab **SQL**:

```sql
-- Buat tabel ump_data
CREATE TABLE ump_data (
    id INT AUTO_INCREMENT PRIMARY KEY,
    provinsi VARCHAR(100) NOT NULL UNIQUE,
    ump DECIMAL(15,2) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_provinsi (provinsi),
    INDEX idx_ump (ump)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Insert data UMP untuk beberapa provinsi
INSERT INTO ump_data (provinsi, ump) VALUES
('Aceh', 3685615),
('Sumatera Utara', 2992599),
('Sumatera Barat', 2994193),
('Riau', 3508775),
('DKI Jakarta', 5056000),
('Jawa Barat', 2118591),
('Jawa Tengah', 2400000),
('Jawa Timur', 2400000),
('Bali', 2400000);
```

### **Step 4: Verifikasi**
1. Klik tab **Browse** untuk melihat data
2. Pastikan ada 9 provinsi dengan data UMP

### **Step 5: Test Aplikasi**
1. Refresh halaman pembobotan
2. Error seharusnya hilang
3. Data UMP akan muncul di tabel

## 🔧 Troubleshooting

### **Jika masih error:**
1. **Cek koneksi database** di `config/db.js`
2. **Pastikan MySQL running** di XAMPP
3. **Cek nama database** sesuai dengan konfigurasi
4. **Restart server** Node.js

### **Cek Database Connection:**
```javascript
// Di config/db.js, pastikan:
const db = mysql.createConnection({
  host: "localhost",
  user: "root",           // sesuaikan dengan MySQL user
  password: "",           // sesuaikan dengan MySQL password
  database: "tracer_study_sederhana"
});
```

## 📊 Hasil yang Diharapkan

Setelah setup berhasil:
- ✅ Tabel `ump_data` dibuat
- ✅ Data UMP dimasukkan
- ✅ Aplikasi bisa load data
- ✅ Error popup hilang
- ✅ Tabel UMP muncul dengan data

## 🚀 Quick Fix

Jika ingin cepat, jalankan ini di phpMyAdmin:

```sql
USE tracer_study_sederhana;

CREATE TABLE IF NOT EXISTS ump_data (
    id INT AUTO_INCREMENT PRIMARY KEY,
    provinsi VARCHAR(100) NOT NULL UNIQUE,
    ump DECIMAL(15,2) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

INSERT INTO ump_data (provinsi, ump) VALUES
('DKI Jakarta', 5056000),
('Aceh', 3685615),
('Riau', 3508775),
('Sumatera Utara', 2992599),
('Sumatera Barat', 2994193),
('Jawa Tengah', 2400000),
('Jawa Timur', 2400000),
('Bali', 2400000),
('Jawa Barat', 2118591);
```

Setelah itu refresh halaman aplikasi!



