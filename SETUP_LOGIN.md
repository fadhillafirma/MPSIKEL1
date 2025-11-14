# Setup Halaman Login Admin

## Instalasi Dependencies

Jalankan perintah berikut untuk menginstall dependencies yang diperlukan:

```bash
npm install express-session bcrypt
```

## Setup Database

Jalankan script setup untuk membuat tabel `admin_users` dan membuat user admin default:

```bash
node scripts/setup_admin.js
```

Script ini akan:
1. Membuat tabel `admin_users` jika belum ada
2. Membuat user admin default dengan kredensial berikut:
   - **Username**: `admin`
   - **Password**: `admin123`
   - **Email**: `admin@unand.ac.id`
   - **Role**: `superadmin`

## Menambahkan Foto Kampus

1. Simpan foto kampus Anda dengan nama `campus-bg.jpg`
2. Letakkan file tersebut di folder `images/`
3. Jika menggunakan nama file berbeda, edit file `views/login.ejs` dan ubah path di bagian CSS:
   ```css
   background: ... url('/images/nama-file-anda.jpg') center/cover;
   ```

## Menjalankan Aplikasi

Setelah setup selesai, jalankan aplikasi:

```bash
npm start
```

Aplikasi akan berjalan di `http://localhost:3000`

## Akses Halaman

- **Halaman Login**: `http://localhost:3000/login`
- **Dashboard**: `http://localhost:3000/dashboard` (setelah login)
- **Logout**: `http://localhost:3000/logout`

## Kredensial Default

Setelah menjalankan `setup_admin.js`, gunakan kredensial berikut untuk login:

- **Username**: `admin`
- **Password**: `admin123`
- **Email**: `admin@unand.ac.id`

⚠️ **PENTING**: Segera ubah password default setelah login pertama kali untuk keamanan!

## Fitur Login

- ✅ Session-based authentication
- ✅ Password hashing dengan bcrypt
- ✅ Protected routes (dashboard, upload, pembobotan, riwayat)
- ✅ Auto redirect ke login jika belum authenticated
- ✅ Remember me functionality
- ✅ Responsive design
- ✅ Desain modern dengan foto kampus

## Struktur Database

Tabel `admin_users` memiliki struktur:
- `id`: Primary key
- `username`: Unique username
- `password`: Hashed password (bcrypt)
- `email`: Email admin (unique)
- `role`: ENUM('superadmin', 'admin')
- `is_active`: Status aktif (1 = aktif, 0 = nonaktif)
- `createdAt`: Timestamp pembuatan
- `updatedAt`: Timestamp update

