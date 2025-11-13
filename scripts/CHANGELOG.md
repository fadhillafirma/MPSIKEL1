# Changelog - CSV Processing Script

## Update Terbaru

### ✅ Fitur Baru
1. **Auto-detect CSV Structure**: Script sekarang otomatis mendeteksi struktur CSV (skip baris header)
2. **Multiple Encoding Support**: Mendukung berbagai encoding (UTF-8, Latin-1, ISO-8859-1, CP1252)
3. **Dummy Data untuk Null Values**: Otomatis mengisi data yang null dengan dummy data:
   - Email: `dummy_XXXX@unand.ac.id`
   - Tahun Lulus: `2023` (default)
   - Fakultas: `Fakultas Teknologi Informasi` (default)
   - Prodi: `Sistem Informasi` (default)
4. **Update Data Existing**: Jika NIM sudah ada, data akan diupdate bukan di-skip
5. **Fleksibel Column Mapping**: Deteksi kolom lebih fleksibel dengan pattern matching

### 🔧 Perbaikan
- Handle CSV dengan header di baris 1, 2, atau 3
- Clean NIM dari tanda kutip dan karakter khusus
- Validasi email lebih robust
- Auto-create Fakultas dan Prodi jika belum ada
- Better error handling dengan traceback

### 📊 Format CSV yang Didukung
Script sekarang khusus disesuaikan untuk CSV format:
- **NIM**: Kolom "NIM"
- **Nama Lengkap**: Kolom "Nama Lengkap"
- **Fakultas**: Kolom "Fakultas"
- **Prodi**: Kolom "Prodi"
- **Tahun Lulus**: Kolom "Tahun Lulus"
- **Email**: Kolom "Email"

### 🎯 Cara Kerja
1. Baca CSV dengan auto-detect encoding dan skip baris
2. Clean data (hapus duplikat, validasi NIM, dll)
3. Isi null values dengan dummy data
4. Insert/Update ke database MySQL
5. Return statistik (inserted, updated, eliminated, skipped)

