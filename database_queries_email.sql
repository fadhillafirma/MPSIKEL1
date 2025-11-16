-- ============================================
-- QUERY SQL UNTUK HALAMAN EMAIL PROFILE
-- ============================================

-- 1. CEK APAKAH KOLOM EMAIL SUDAH ADA
-- Jalankan query ini untuk mengecek apakah kolom email sudah ada di tabel admin_users
SELECT COLUMN_NAME, DATA_TYPE, CHARACTER_MAXIMUM_LENGTH, IS_NULLABLE, COLUMN_KEY
FROM INFORMATION_SCHEMA.COLUMNS
WHERE TABLE_SCHEMA = DATABASE()
  AND TABLE_NAME = 'admin_users'
  AND COLUMN_NAME = 'email';

-- ============================================

-- 2. MENAMBAHKAN KOLOM EMAIL JIKA BELUM ADA
-- Jalankan query ini jika kolom email belum ada (NULL diizinkan, bisa diisi nanti)
ALTER TABLE admin_users
ADD COLUMN IF NOT EXISTS email VARCHAR(150) UNIQUE NULL
AFTER password;

-- Jika database Anda tidak support IF NOT EXISTS, gunakan ini:
-- Pertama cek apakah kolom sudah ada dengan query #1 di atas
-- Jika belum ada, jalankan:
ALTER TABLE admin_users
ADD COLUMN email VARCHAR(150) UNIQUE NULL
AFTER password;

-- ============================================

-- 3. MEMODIFIKASI KOLOM EMAIL YANG SUDAH ADA
-- Jika kolom email sudah ada tapi ingin mengubah strukturnya (misal: menambah UNIQUE constraint)
-- Hapus constraint UNIQUE yang lama (jika ada) terlebih dahulu:
ALTER TABLE admin_users
DROP INDEX email;

-- Kemudian tambahkan kembali dengan UNIQUE:
ALTER TABLE admin_users
MODIFY COLUMN email VARCHAR(150) UNIQUE NULL;

-- ============================================

-- 4. UPDATE EMAIL UNTUK USER YANG SUDAH ADA
-- Update email untuk user tertentu (ganti username dan email sesuai kebutuhan):
UPDATE admin_users
SET email = 'admin@unand.ac.id'
WHERE username = 'admin'
  AND (email IS NULL OR email = '');

-- Update email untuk semua user yang belum punya email:
UPDATE admin_users
SET email = CONCAT(username, '@unand.ac.id')
WHERE email IS NULL OR email = '';

-- ============================================

-- 5. MELIHAT SEMUA USER DENGAN EMAIL
-- Query untuk melihat semua user beserta emailnya:
SELECT 
    id,
    username,
    email,
    role,
    is_active,
    createdAt,
    updatedAt
FROM admin_users
ORDER BY id;

-- ============================================

-- 6. MELIHAT USER YANG BELUM PUNYA EMAIL
-- Query untuk mencari user yang belum punya email:
SELECT 
    id,
    username,
    email,
    role
FROM admin_users
WHERE email IS NULL OR email = ''
ORDER BY id;

-- ============================================

-- 7. CEK APAKAH EMAIL SUDAH DIGUNAKAN
-- Query untuk mengecek apakah email sudah digunakan oleh user lain:
SELECT 
    id,
    username,
    email
FROM admin_users
WHERE email = 'email_yang_ingin_dicek@example.com'
  AND id != 1;  -- Ganti 1 dengan ID user yang sedang login

-- ============================================

-- 8. MEMBUAT INDEX UNTUK EMAIL (OPTIONAL, SUDAH OTOMATIS DENGAN UNIQUE)
-- Index sudah otomatis dibuat jika menggunakan UNIQUE constraint
-- Tapi jika ingin membuat index tambahan:
CREATE INDEX idx_email ON admin_users(email);

-- ============================================

-- 9. QUERY LENGKAP UNTUK SETUP KOLOM EMAIL DARI AWAL
-- Jalankan query ini jika tabel belum ada atau ingin membuat ulang:

CREATE TABLE IF NOT EXISTS admin_users (
    id INT AUTO_INCREMENT PRIMARY KEY,
    username VARCHAR(100) NOT NULL UNIQUE,
    password VARCHAR(255) NOT NULL,
    email VARCHAR(150) UNIQUE NULL,
    role ENUM('superadmin', 'admin') DEFAULT 'admin',
    is_active TINYINT(1) DEFAULT 1,
    createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
    updatedAt DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB 
  DEFAULT CHARSET=utf8mb4 
  COLLATE=utf8mb4_general_ci;

-- ============================================

-- 10. VALIDASI EMAIL FORMAT (UNTUK REFERENSI)
-- Catatan: Validasi format email dilakukan di aplikasi, bukan di database
-- Database hanya memastikan email UNIQUE dan bisa NULL
-- Format valid: harus mengandung @ dan karakter sebelum/sesudah @

-- ============================================

-- PETUNJUK PENGGUNAAN:
-- 1. Jika tabel admin_users belum ada: Jalankan query #9
-- 2. Jika tabel sudah ada tapi kolom email belum ada: Jalankan query #2
-- 3. Untuk update email user: Jalankan query #4
-- 4. Untuk melihat data: Jalankan query #5 atau #6
-- 5. Untuk troubleshooting: Jalankan query #1 terlebih dahulu

