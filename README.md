# RuzBox — Your Files, Your Cloud

RuzBox adalah aplikasi pengelola file independen yang dibuat dengan Next.js, TypeScript, Supabase Auth/PostgreSQL, dan TeraBox Open Platform resmi. RuzBox bukan produk resmi TeraBox maupun Supabase.

## Fitur yang tersedia

- Pendaftaran dan login dengan email/kata sandi, konfirmasi email, pemulihan kata sandi, serta logout melalui Supabase Auth.
- Satu akun TeraBox bersama yang hanya dapat dihubungkan dan diputus oleh administrator RuzBox. ID akun TeraBox tidak ditampilkan kepada pengguna.
- Penjelajahan folder setelah login dan pencarian folder secara rekursif. File tidak ditampilkan di antarmuka RuzBox.
- Fitur sembunyikan dan pulihkan folder khusus administrator. Folder yang disembunyikan tidak dihapus dari TeraBox.
- Row-level security (RLS) Supabase untuk data akun pengguna, kredensial TeraBox bersama yang dienkripsi, dan riwayat aktivitas.
- Tampilan daftar dan kisi yang responsif, tema terang/gelap, folder favorit, dan folder yang baru diubah.

Pembuatan folder belum tersedia. Dokumentasi TeraBox Open Platform berbahasa Indonesia yang digunakan saat implementasi tidak menjelaskan endpoint untuk membuat folder. RuzBox tidak akan menebak endpoint. Operasi file tetap berada di dalam folder aplikasi RuzBox yang ditetapkan oleh TeraBox.

Endpoint upload Vercel dibatasi hingga 4 MiB karena batas ukuran request pada serverless. Folder `transfer-service/` berisi layanan terpisah untuk upload dan download berkas berukuran lebih besar. Layanan ini memerlukan host Node.js dengan dukungan streaming request dan ruang disk sementara yang memadai. Layanan menggunakan bagian berukuran 8 MiB serta tiket AES-GCM yang berlaku singkat. Tiket upload hanya dapat digunakan sekali; tiket download dapat digunakan kembali untuk permintaan rentang byte hingga kedaluwarsa. Token hanya disimpan di memori selama request diproses.

## Persyaratan

- Node.js 20.9 atau yang lebih baru
- Proyek Supabase
- Aplikasi TeraBox Open Platform yang disetujui TeraBox, beserta `client_id`, `client_secret`, `private_secret`, dan folder aplikasi yang ditetapkan
- Kunci enkripsi token berukuran 32 byte

Kredensial aplikasi TeraBox harus diperoleh dari TeraBox. RuzBox tidak dapat mengotorisasi akun TeraBox sebelum TeraBox menerbitkan kredensial aplikasi dan menetapkan ruang penyimpanan aplikasi.

## Menjalankan secara lokal

1. Salin `.env.example` menjadi `.env.local`.
2. Buat proyek Supabase, lalu isi `NEXT_PUBLIC_SUPABASE_URL` dan `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` dari panel **Connect** atau **API Keys** proyek. Proyek lama mungkin menggunakan `NEXT_PUBLIC_SUPABASE_ANON_KEY`. Aplikasi menerima kedua nama variabel tersebut; sebaiknya gunakan publishable key.
3. Jalankan migrasi berikut melalui SQL Editor Supabase atau Supabase CLI:
   - `supabase/migrations/001_initial_schema.sql`
   - `supabase/migrations/002_hidden_folders.sql`
   - `supabase/migrations/003_shared_terabox.sql`

   Migrasi 003 tidak mengimpor koneksi TeraBox lama yang tersimpan per pengguna. Administrator RuzBox perlu mengotorisasi akun bersama satu kali.
4. Daftarkan akun yang akan dijadikan administrator di RuzBox. Di SQL Editor Supabase, ganti alamat email contoh berikut dengan email akun tersebut, lalu jalankan:

   ```sql
   update auth.users
   set raw_app_meta_data = coalesce(raw_app_meta_data, '{}'::jsonb) || '{"ruzbox_role":"admin"}'::jsonb
   where lower(email) = lower('admin@example.com');
   ```

   Keluar lalu masuk kembali agar peran administrator diperbarui di sesi. Status administrator dibaca dari `app_metadata` Supabase yang tepercaya; pengguna tidak dapat menetapkan peran itu untuk dirinya sendiri. Administrator menghubungkan satu akun TeraBox bersama, lalu pengguna RuzBox yang sudah login dapat menjelajahi folder yang ditetapkan. Folder yang disembunyikan administrator tidak terlihat oleh pengguna mana pun.
5. Buat kunci enkripsi token:

   ```sh
   node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
   ```

6. Isi kredensial klien TeraBox dan nilai `TERABOX_ROOT_PATH` persis seperti folder yang ditetapkan untuk aplikasi. Isi `NEXT_PUBLIC_TERABOX_CLIENT_ID` dengan ID aplikasi yang sama. ID klien boleh diakses browser, sedangkan client secret dan private secret hanya boleh berada di server.
7. Isi kunci rahasia Supabase pada `SUPABASE_SECRET_KEY` di `.env.local` dan di environment server Vercel. `SUPABASE_SERVICE_ROLE_KEY` lama juga masih didukung. Route server menggunakan kunci ini untuk mengakses koneksi bersama yang terenkripsi dan daftar folder tersembunyi. Jangan beri awalan `NEXT_PUBLIC_` dan jangan commit kunci ini ke repository.
8. Untuk upload/download file berukuran besar, deploy `transfer-service/` ke host Node.js 20.9+ secara terpisah. Salin `transfer-service/.env.example`, isi `TRANSFER_SERVICE_SECRET` dengan nilai acak minimal 32 karakter yang sama di aplikasi web dan layanan transfer, lalu atur `ALLOWED_ORIGIN` pada layanan transfer ke origin RuzBox yang tepat (untuk pengujian lokal: `http://localhost:3000`). Isi `NEXT_PUBLIC_TRANSFER_SERVICE_URL` pada aplikasi web dengan origin HTTPS layanan transfer. Jalankan layanan ini sebagai satu instance agar pemeriksaan tiket upload satu kali yang disimpan di memori berlaku untuk semua request. Untuk menjalankannya secara lokal, atur variabel environment lalu jalankan `npm start` dari folder `transfer-service/`.
9. Pasang dependensi dan jalankan server development:

   ```sh
   npm install
   npm run dev
   ```

   Di PowerShell Windows, gunakan `npm.cmd install` dan `npm.cmd run dev` jika perintah `npm` tidak dikenali.

Buka `http://localhost:3000`, daftar, lalu konfirmasi email jika konfirmasi email Supabase diaktifkan. Masuk dengan akun administrator RuzBox untuk menghubungkan atau memutus satu akun TeraBox bersama melalui **Settings**. Pengguna lain yang sudah login dapat melihat folder dari akun bersama. ID akun tidak dikirim ke browser.

## Variabel environment

| Variabel | Lokasi | Kegunaan |
| --- | --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | Browser/server | URL proyek Supabase |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Browser/server | Kunci publik yang disarankan; RLS wajib diaktifkan |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Browser/server | Kunci publik lama untuk proyek yang lebih lama; RLS wajib diaktifkan |
| `SUPABASE_SECRET_KEY` | Server saja | Kunci dengan hak akses tinggi yang disarankan untuk koneksi TeraBox bersama terenkripsi dan daftar folder tersembunyi; jangan tampilkan di browser |
| `SUPABASE_SERVICE_ROLE_KEY` | Server saja | Kunci lama yang menjadi pilihan cadangan untuk akses server yang sama |
| `TERABOX_CLIENT_ID` | Server saja | ID aplikasi TeraBox yang telah disetujui |
| `NEXT_PUBLIC_TERABOX_CLIENT_ID` | Browser | ID aplikasi yang digunakan untuk membuka halaman otorisasi TeraBox |
| `TERABOX_CLIENT_SECRET` | Server saja | Rahasia aplikasi TeraBox |
| `TERABOX_PRIVATE_SECRET` | Server saja | Rahasia penandatanganan TeraBox |
| `TERABOX_ROOT_PATH` | Server saja | Folder aplikasi persis seperti yang ditetapkan TeraBox |
| `TOKEN_ENCRYPTION_KEY` | Server saja | Kunci AES-256-GCM 32 byte dalam format Base64 |
| `NEXT_PUBLIC_TRANSFER_SERVICE_URL` | Browser/server | Origin HTTPS publik untuk layanan transfer opsional |
| `TRANSFER_SERVICE_SECRET` | Server dan layanan transfer | Rahasia bersama minimal 32 karakter untuk tiket upload terenkripsi berumur pendek |

Jangan commit `.env.local`, kunci service-role, atau kredensial TeraBox. Access token dan refresh token TeraBox bersama dienkripsi dengan AES-256-GCM sebelum disimpan di tabel Postgres yang hanya dapat diakses service role. Token hanya didekripsi di route server atau layanan transfer. Tiket transfer berukuran besar dienkripsi dengan AES-GCM, berlaku selama tiga menit, dan memuat nonce khusus untuk setiap transfer.

## Arsitektur

- `src/app/api/integrations/terabox/*`: otorisasi, pemeriksaan status, dan pemutusan koneksi TeraBox.
- `src/app/api/files/*`: daftar folder khusus pengguna yang sudah login dan operasi pada drive bersama.
- `src/app/api/admin/hidden-folders/route.ts`: pengelolaan sembunyikan/pulihkan folder khusus administrator. Folder tersembunyi tidak muncul untuk pengguna mana pun.
- `transfer-service/server.mjs`: layanan streaming upload opsional untuk file besar; deploy secara terpisah dari Vercel.
- `src/lib/terabox/client.ts`: koneksi OAuth TeraBox bersama yang dikelola administrator, rotasi token, validasi domain, request API, dan sinkronisasi metadata.
- `src/lib/crypto.ts`: enkripsi terautentikasi untuk kumpulan token.
- `src/lib/supabase/*`: klien Supabase untuk SSR dan browser.
- `supabase/migrations/001_initial_schema.sql`, `002_hidden_folders.sql`, dan `003_shared_terabox.sql`: skema, indeks, RLS, dan penyimpanan koneksi bersama yang hanya dapat diakses service role.

TeraBox mengembalikan domain API khusus akun melalui `/oauth/tokeninfo`. RuzBox memvalidasi dan memperbarui domain tersebut setiap 50 menit, sesuai rekomendasi dokumentasi untuk menyimpannya paling lama satu jam. Pembaruan token mengikuti alur refresh token sekali pakai yang berotasi dan menyimpan kumpulan token terbaru setelah refresh.

## Deploy ke Vercel

1. Push folder `ruzbox` ke repository Git privat atau impor folder tersebut sebagai root proyek Vercel.
2. Tambahkan variabel environment di **Project Settings** Vercel untuk setiap environment yang digunakan.
3. Tambahkan URL redirect yang diizinkan pada Supabase Auth: `https://<domain-anda>/auth/callback` serta URL callback lokal untuk development.
4. Terapkan ketiga file migrasi SQL pada proyek Supabase. Promosikan akun administrator melalui `app_metadata` seperti pada bagian Menjalankan secara lokal.
5. Deploy aplikasi. Setelah aplikasi TeraBox disetujui, periksa pendaftaran, login, otorisasi TeraBox, daftar folder, dan upload file kecil. Deploy layanan transfer opsional secara terpisah untuk file di atas 4 MiB.

## Pemeriksaan proyek

```sh
npm run typecheck
npm run build
```

Operasi TeraBox langsung hanya dapat diperiksa setelah kredensial aplikasi yang disetujui tersedia dan akun TeraBox diotorisasi.

## Catatan integrasi TeraBox yang telah diverifikasi

Implementasi mengacu pada [dokumentasi integrasi TeraBox Open Platform (Bahasa Indonesia)](https://www.terabox.com/integrations/docs/indonesian). Dokumentasi tersebut mensyaratkan aplikasi didaftarkan secara terpisah, menjelaskan otorisasi web melalui `/wap/outside/login`, pertukaran token di sisi server melalui `/oauth/gettoken`, pencarian domain API melalui `/oauth/tokeninfo`, serta refresh token melalui `/oauth/refreshtoken`. Dokumentasi juga menjelaskan operasi daftar, pencarian, upload multipart, download, rename, pindah, salin, dan hapus file. Operasi API file menggunakan ruang khusus aplikasi yang ditetapkan oleh TeraBox.

Dokumentasi yang tersedia belum menjelaskan endpoint untuk membuat folder. Dukungan fitur tersebut masih memerlukan konfirmasi resmi API lebih lanjut.
