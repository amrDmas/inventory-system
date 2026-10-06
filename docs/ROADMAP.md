# ROADMAP — Sistem Inventaris & Gudang

> Peta pembangunan step-by-step untuk proyek portfolio **inventory-system**.
> Dokumen ini dipakai **setiap hari**: pilih fase, buat branch, ikuti langkah, demo, buka Pull Request.

| | |
|---|---|
| **Proyek** | inventory-system — Sistem Inventaris & Gudang |
| **Pemilik** | Dimas (target posisi: Full Stack Developer) |
| **Repo** | `D:/dimas/myproject/inventory-system` (terpisah dari `learning-journey`) |
| **Stack** | React + TypeScript (Vite) · Node.js + TypeScript · Firestore · Firebase Auth · Firebase Storage · Cloud Functions |
| **Database** | Firestore Native mode |
| **Deployment** | Frontend → Firebase Hosting (atau Vercel) · API → Cloud Run / Render |
| **Testing** | Vitest · Testing Library · Playwright |
| **CI** | GitHub Actions (lint, typecheck, test, build) |
| **Fase** | 0 – 9 (lihat ringkasan di bawah) |

---

## 1. Cara memakai dokumen ini

Dokumen ini bukan bacaan sekali habis. Ini **daftar periksa harian**. Aturannya sederhana:

1. **Satu fase = satu branch.**
   ```bash
   git switch main
   git pull
   git switch -c feat/fase-3-transaksi-stok
   ```
   Nama branch: `feat/fase-<n>-<slug>`, `fix/<slug>`, `chore/<slug>`, `docs/<slug>`.

2. **Satu fase = satu Pull Request.**
   Jangan menggabungkan dua fase dalam satu PR. PR kecil lebih mudah di-review, lebih mudah di-*revert* kalau salah, dan melatih kebiasaan *code review* yang dicari perusahaan.

3. **Satu fase diakhiri demo.**
   Sebelum menutup fase, jalankan skenario **"Cara menguji sendiri"** di fase itu. Kalau tidak bisa didemokan, fase belum selesai — walau kodenya sudah banyak.

4. **Definisi selesai harus dicentang semua.**
   Checklist di setiap fase bersifat *terukur*. "Sudah kelihatan bagus" bukan kriteria. "Endpoint `GET /api/v1/items` mengembalikan 200 dan ada test yang gagal kalau auth dimatikan" adalah kriteria.

5. **Update dokumen ini bila kenyataan berbeda.**
   Kalau ternyata urutan langkah harus berubah, ubah file ini di PR yang sama dan tulis alasannya di deskripsi PR. Roadmap yang bohong lebih buruk daripada roadmap yang direvisi.

6. **Setiap langkah punya format tetap:**
   **Apa** yang dibangun → **Mengapa** (masalah apa yang muncul kalau dilewati) → **File** yang dibuat/diubah.
   Kalau kamu bingung "kenapa saya ngapain ini", jawabannya ada di bagian *Mengapa*.

### Ritme harian yang disarankan

```text
[ ] Baca ulang langkah fase yang sedang dikerjakan
[ ] Tulis/ubah kode + test
[ ] Jalankan: npm run lint && npm run typecheck && npm run test
[ ] Commit kecil dengan pesan jelas (Conventional Commits)
[ ] Update checklist fase di issue/PR
[ ] Akhir fase: demo 5 menit → buka PR → minta review
```

### Konvensi commit

```text
feat(items): tambah endpoint GET /api/v1/items dengan pagination
fix(auth): tolak token tanpa custom claim role
test(requests): tambah unit test transisi status submitted -> approved
docs(roadmap): tandai fase 4 selesai
chore(ci): tambah job typecheck di GitHub Actions
```

---

## 2. Ringkasan tabel

| Fase | Nama | Tujuan | Hasil yang bisa dilihat | Perkiraan durasi |
|---|---|---|---|---|
| **0** | Fondasi | Menyepakati kebutuhan, desain data, dan menyiapkan repo + tooling | Repo jalan, `npm run dev` hidup, dokumen desain & skema Firestore selesai | 3–5 hari |
| **1** | Autentikasi & Role | Login aman dan role `admin`/`staff`/`viewer` bekerja di frontend + backend | Bisa login, token berisi role, menu berubah sesuai role | 4–6 hari |
| **2** | Master Data | CRUD `categories`, `suppliers`, `items` + upload gambar | Halaman daftar & form barang, kategori, supplier berfungsi | 6–8 hari |
| **3** | Transaksi Stok | Mencatat `in`/`out`/`adjustment` secara atomik dan menghasilkan saldo stok | Input transaksi stok, stok berubah, riwayat per barang | 6–8 hari |
| **4** | Workflow Approval | Alur `requests`: draft → submitted → approved/rejected → fulfilled | Staff mengajukan, admin menyetujui & menandai `fulfilled` → stok berkurang otomatis | 6–8 hari |
| **5** | Dashboard & Reporting | Ringkasan stok, barang menipis, laporan + export | Dashboard KPI, tabel laporan, export CSV/Excel | 5–7 hari |
| **6** | Automasi (Cloud Functions) | Trigger & scheduled job: notifikasi stok menipis, audit log | Email/notifikasi otomatis, `auditLogs` terisi sendiri | 5–7 hari |
| **7** | Integrasi API Pihak Ketiga | Ambil/kirim data ke layanan luar (mis. kurs/ongkir) secara async | Endpoint proxy + retry + cache, ada fallback saat layanan down | 4–6 hari |
| **8** | Hardening | Security rules, testing menyeluruh, CI/CD, monitoring | Rules teruji, coverage naik, CI hijau, error terpantau | 6–9 hari |
| **9** | Polish & Deploy | Rapikan UI/UX, dokumentasi, deploy produksi, demo | URL publik hidup, README + dokumentasi API lengkap, demo 5 menit | 4–6 hari |

> Total estimasi: **± 49–70 hari kerja**. Kerjakan berurutan. Jangan lompat ke Fase 5 karena "pengen lihat grafik" — grafik tanpa data transaksi yang benar hanyalah angka bohong.

---

## 3. Detail setiap fase

---

### Fase 0 — Fondasi

**Tujuan fase**
Menyepakati *apa* yang dibangun dan *bagaimana* data disimpan sebelum menulis satu baris fitur. Fase ini menghasilkan tiga dokumen (kebutuhan, model data, keputusan arsitektur) dan satu repo yang bisa dijalankan. Tujuan akhirnya: siapa pun (termasuk AI agent) yang membuka repo ini tahu aturan mainnya tanpa bertanya.

**Konsep yang akan dipelajari**

| Konsep | Kapan dipakai di fase ini |
|---|---|
| Struktur monorepo / multi-package | Saat memutuskan `apps/web` + `apps/api` + `packages/shared` |
| Environment variable & `.env` | Saat menyambung ke Firebase (kunci **tidak** boleh masuk git) |
| TypeScript `strict` mode | Saat `tsconfig.json` disetel `strict: true` dari awal |
| ESLint + Prettier | Saat menyamakan gaya kode sebelum ada 100 file |
| Firestore data modeling (embed vs subcollection) | Saat memutuskan `stockTransactions` sebagai koleksi root, bukan subcollection `items` |
| Denormalisasi & field turunan | Saat memutuskan `items.currentStock` disimpan (bukan dihitung tiap request) |

**Langkah-langkah**

1. **Tulis dokumen kebutuhan (PRD ringkas).**
   *Mengapa:* tanpa daftar kebutuhan yang beku, scope akan melebar tanpa sadar dan proyek tidak pernah selesai. PRD jadi alat menolak fitur di luar scope.
   *File:* `docs/PROJECT.md`

2. **Gambar model data Firestore (koleksi + field + contoh dokumen).**
   *Mengapa:* salah desain data di Firestore mahal diperbaiki — Firestore tidak punya JOIN, jadi bentuk dokumen menentukan bentuk query. Menentukan sekarang menghindari migrasi data menyakitkan di Fase 3.
   *File:* `docs/DATA-MODEL.md`
   Koleksi: `users`, `categories`, `suppliers`, `divisions`, `units`, `items`, `warehouses`, `stockTransactions`, `requests`, `requestItems`, `auditLogs`, `notifications`, `functionRuns`, `cacheEntries`, `idempotencyKeys`, `dailyAggregates`, `settings`, `itemCodes`.

3. **Tulis Architecture Decision Record (ADR) untuk keputusan besar.**
   *Mengapa:* enam bulan lagi kamu lupa kenapa memilih Express bukan Fastify, atau kenapa stok disimpan denormal. ADR menyimpan alasan, bukan cuma hasil.
   *File:* `docs/adr/0001-pilihan-backend-framework.md`, `docs/adr/0002-firestore-denormalisasi-stok.md`

4. **Inisialisasi struktur repo + tooling dasar.**
   *Mengapa:* struktur folder yang rapi sejak awal membuat "cari kode ini di mana" tidak jadi pekerjaan 20 menit tiap kali.
   *File:* `package.json`, `tsconfig.base.json`, `.eslintrc.cjs`, `.prettierrc`, `.gitignore`, `apps/web/`, `apps/api/`, `functions/`, `packages/shared/`
   Isi `.gitignore` minimal: `node_modules`, `dist`, `.env`, `.env.*`, `*.log`, `.firebase/`.

5. **Setup Firebase project + Firestore + Authentication + Storage (mode development).**
   *Mengapa:* semua fase berikutnya butuh koneksi ini; menemukan masalah izin/kredensial di Fase 2 jauh lebih membingungkan karena sudah ada kode bisnis yang menutupinya.
   *File:* `firebase.json`, `.firebaserc`, `firestore.rules` (default-deny sejak awal), `storage.rules` (default-deny sejak awal), `apps/api/src/lib/firebaseAdmin.ts`, `apps/web/src/lib/firebaseClient.ts`, `.env.example`

6. **Buat seed data awal (kategori, supplier, beberapa item).**
   *Mengapa:* mengembangkan UI dengan database kosong memperlambat debugging — kamu tidak tahu apakah query salah atau memang tidak ada data.
   *File:* `scripts/seed.ts`, `docs/DATA-MODEL.md` (contoh dokumen)

7. **Tulis README + `docs/ROADMAP.md` (file ini) + template PR.**
   *Mengapa:* repo portfolio dinilai dari README-nya dulu. Tanpa instruksi cara menjalankan, recruiter tidak akan mencoba.
   *File:* `README.md`, `docs/ROADMAP.md`, `.github/pull_request_template.md`

8. **Pastikan `npm run dev` di `apps/web` dan `apps/api` hidup, dan CI dasar jalan.**
   *Mengapa:* fondasi yang tidak bisa dijalankan oleh orang lain bukan fondasi. CI di awal memaksa kamu menjaga `main` selalu hijau.
   *File:* `.github/workflows/ci.yml`

**Definisi selesai**
- [ ] `docs/PROJECT.md`, `docs/DATA-MODEL.md`, minimal 2 ADR ada dan saling konsisten.
- [ ] `firestore.rules` dan `storage.rules` ada dengan aturan **default-deny** (`allow read, write: if false`) dan sudah di-deploy.
- [ ] `git clone` → `npm install` → `npm run dev` berhasil di mesin bersih (tanpa langkah tersembunyi).
- [ ] `.env.example` lengkap; `.env` asli **tidak** ada di git (`git check-ignore .env` mengembalikan `.env`).
- [ ] `npm run lint` dan `npm run typecheck` lulus.
- [ ] Firebase project punya Firestore, Auth, Storage aktif; API bisa membaca 1 dokumen dari Firestore.
- [ ] Seed data terpasang minimal 3 `categories`, 3 `suppliers`, 10 `items`.
- [ ] GitHub Actions job dasar (install + lint + typecheck) hijau di `main`.

**Cara menguji sendiri**
1. Hapus `node_modules`, jalankan `npm install && npm run dev` — apakah tetap hidup?
2. Jalankan `npm run seed` di database kosong — apakah data muncul di Firebase Console?
3. Buat endpoint sementara `GET /api/v1/health` — apakah mengembalikan `{ "status": "ok", "firestore": "connected" }`?
4. Push branch dan lihat tab Actions — apakah CI hijau tanpa intervensi manual?

**Pull Request**
- Judul: `chore(fase-0): fondasi repo, tooling, dan dokumen desain`
- Deskripsi: ringkasan struktur repo; tautan ke PROJECT/DATA-MODEL/ADR; bukti screenshot `npm run dev` dan CI hijau; catatan keputusan yang masih terbuka.

---

### Fase 1 — Autentikasi & Role

**Tujuan fase**
Membuat pintu masuk aplikasi: user bisa mendaftar/masuk dengan email+password, dan sistem tahu siapa dia serta apa yang boleh dia lakukan. Role `admin`, `staff`, `viewer` harus bisa **dibaca di frontend** (untuk UI) dan **diverifikasi di backend** (untuk keamanan). Fase ini juga meletakkan pola: *frontend tidak boleh dipercaya*.

**Konsep yang akan dipelajari**

| Konsep | Kapan dipakai |
|---|---|
| Firebase Authentication (email/password) | Saat login/registrasi di frontend dan verifikasi ID token di API |
| Custom claims | Saat menempelkan `role` ke token user, supaya API tidak perlu query DB tiap request |
| Middleware Express/Fastify | Saat memproteksi semua route `/api/v1/*` |
| Async/await & error handling terpusat | Saat memanggil Firebase Admin SDK (operasi jaringan, bisa gagal) |
| Context + protected route (React Router) | Saat menyembunyikan halaman sesuai role |
| Token refresh & expiry | Saat user membuka tab lama lalu melakukan aksi |

**Langkah-langkah**

1. **Buat koleksi `users` dengan field `email`, `displayName`, `role`, `isActive`, `createdAt`.**
   *Mengapa:* Auth hanya menyimpan identitas, bukan data bisnis. Tanpa dokumen `users`, kamu tidak punya tempat menyimpan role dan status aktif — dan tidak bisa menonaktifkan user tanpa menghapus akunnya.
   *File:* `packages/shared/src/types/user.ts`, `scripts/seed-users.ts`, `docs/DATA-MODEL.md`

2. **Bangun halaman Register & Login di frontend (`/login`, `/register`).**
   *Mengapa:* tanpa UI login, tidak ada cara manusia masuk ke aplikasi. Register dibuat minimal (admin-only untuk produksi) agar tidak sembarang orang membuat akun.
   *File:* `apps/web/src/features/auth/LoginPage.tsx`, `RegisterPage.tsx`, `apps/web/src/lib/firebaseClient.ts`

3. **Sinkronkan user Firebase Auth → koleksi `users` lewat Cloud Function trigger.**
   *Mengapa:* kalau pembuatan dokumen `users` dilakukan manual, cepat atau lambat ada akun Auth tanpa profil, dan user itu akan mengalami error membingungkan ("login berhasil tapi aplikasi kosong").
   *File:* `functions/src/triggers/onUserCreated.ts`

4. **Tulis script untuk menyetel custom claim `role` (admin/staff/viewer) + endpoint admin menetapkan role.**
   *Mengapa:* role harus melekat pada token agar API bisa memutuskan izin tanpa query Firestore setiap request. Script memisahkan tindakan "memberi hak akses" dari kode aplikasi — ini praktik yang aman dan bisa diaudit. Endpoint `PATCH /api/v1/users/:uid` (admin-only) melayani US-03 agar admin bisa mengubah role langsung dari aplikasi; keduanya memanggil logika yang sama (`setCustomUserClaims` + `revokeRefreshTokens`).
   *File:* `scripts/set-role.ts` (mis. `node scripts/set-role.js <uid> admin`), `apps/api/src/routes/userRoutes.ts`, `apps/api/src/services/user.service.ts`

5. **Tambahkan endpoint admin menonaktifkan user (`PATCH /api/v1/users/:uid` dengan `isActive: false`) yang mencabut token.**
   *Mengapa:* melayani US-05 — mantan karyawan harus bisa diputus aksesnya tanpa menghapus akun (jejak audit tetap utuh). Nonaktifkan dokumen `users` **dan** panggil `revokeRefreshTokens(uid)` agar token lama tidak bisa dipakai lagi.
   *File:* `apps/api/src/routes/userRoutes.ts`, `apps/api/src/services/user.service.ts`, `apps/api/src/middlewares/authenticate.ts`

6. **Buat middleware `requireAuth` dan `requireRole(...roles)` di API.**
   *Mengapa:* ini pertahanan utama. Tanpa ini, siapa pun yang tahu URL bisa memanggil endpoint. Middleware memverifikasi ID token, membaca custom claim `role`, dan menolak dengan `401`/`403`.
   *File:* `apps/api/src/middlewares/authenticate.ts`, `apps/api/src/middlewares/authorize.ts`, `apps/api/src/middlewares/errorHandler.ts`

7. **Tambahkan endpoint `GET /api/v1/auth/me` yang mengembalikan profil + role user aktif.**
   *Mengapa:* frontend butuh satu sumber kebenaran tentang "siapa saya". Ini mencegah frontend menebak role dari localStorage yang bisa dipalsukan.
   *File:* `apps/api/src/routes/authRoutes.ts`, `apps/api/src/services/auth.service.ts`

8. **Pasang `AuthProvider` + `ProtectedRoute` + guard role di React Router.**
   *Mengapa:* menyembunyikan menu bukan alasan keamanan (backend tetap wajib memeriksa), tapi penting untuk UX: user `viewer` tidak perlu melihat tombol yang selalu gagal.
   *File:* `apps/web/src/features/auth/AuthContext.tsx`, `apps/web/src/routes/ProtectedRoute.tsx`, `apps/web/src/routes/index.tsx`

9. **Tangani skenario token kedaluwarsa & user dinonaktifkan.**
   *Mengapa:* aplikasi nyata dipakai berjam-jam. Kalau token mati tanpa penanganan, user melihat layar putih atau error aneh, lalu menelepon "aplikasinya rusak".
   *File:* `apps/web/src/lib/apiClient.ts` (interceptor 401), `apps/api/src/middlewares/authenticate.ts`

10. **Bangun alur "Lupa Password" mandiri di halaman login (`sendPasswordResetEmail`).**
    *Mengapa:* melayani US-06 — user tidak perlu menunggu admin saat lupa password. Aplikasi tidak pernah melihat/menyimpan password; Firebase yang menangani reset. Tampilkan pesan netral agar tidak membocorkan apakah email terdaftar.
    *File:* `apps/web/src/features/auth/ForgotPasswordPage.tsx`, `apps/web/src/lib/firebaseClient.ts`

**Definisi selesai**
- [ ] Login berhasil dengan user yang sudah diseed; gagal dengan password salah (pesan jelas, bukan crash).
- [ ] `GET /api/v1/auth/me` mengembalikan `{ uid, email, displayName, role }` yang benar untuk ketiga role.
- [ ] `PATCH /api/v1/users/:uid` (admin-only) bisa mengubah `role` dan `isActive`; perubahan memicu `revokeRefreshTokens`; staff/viewer mendapat `403`.
- [ ] Alur lupa password mengirim email reset dan menampilkan pesan yang tidak membocorkan status email.
- [ ] Endpoint contoh `GET /api/v1/audit-logs` (admin-only) mengembalikan `401` tanpa token, `403` untuk `viewer` dan `staff`, `200` untuk `admin`.
- [ ] Menu/halaman di frontend berubah sesuai role `admin` | `staff` | `viewer`.
- [ ] Ada test: middleware menolak token kosong dan token tanpa claim `role`.
- [ ] Tidak ada kunci Firebase service account di repo.

**Cara menguji sendiri**
1. Login sebagai `viewer`, coba akses URL halaman admin secara langsung (ketik di address bar). Harus diblokir, bukan sekadar menu disembunyikan.
2. Ambil ID token dari browser, panggil API pakai `curl` **tanpa** header `Authorization` → harus `401`.
3. Ubah token (potong 1 karakter) lalu panggil → harus `401`, bukan `500`.
4. Set role user ke `staff` lewat `PATCH /api/v1/users/:uid` (atau script), login ulang, cek `GET /api/v1/auth/me` sudah berubah.
5. Nonaktifkan user (`isActive: false`), pastikan request berikutnya ditolak.
6. Klik "Lupa password", cek email reset terkirim dan pesan sukses tetap sama untuk email yang tidak terdaftar.

**Pull Request**
- Judul: `feat(fase-1): autentikasi email/password dan role admin/staff/viewer`
- Deskripsi: alur login (diagram ASCII), cara kerja custom claims, daftar endpoint + status code, bukti test middleware, catatan bahwa pemeriksaan izin ada di backend.

---

### Fase 2 — Master Data

**Tujuan fase**
Membangun data induk yang menjadi fondasi semua transaksi: `categories`, `suppliers`, dan `items`. Fase ini melatih pola CRUD lengkap (list → filter → pagination → detail → create → update → soft delete) plus upload gambar ke Firebase Storage. Pola yang dibangun di sini akan diulang di fase lain, jadi kerjakan rapi.

**Konsep yang akan dipelajari**

| Konsep | Kapan dipakai |
|---|---|
| REST resource + status code | Saat mendesain `GET/POST/PATCH/DELETE /api/v1/items` |
| Pagination cursor (Firestore `startAfter`) | Saat daftar barang sudah ratusan — `offset` tidak efisien di Firestore |
| Validasi input (Zod) | Saat mencegah `items` tanpa `sku`/`unit` masuk database |
| Soft delete & referential integrity | Saat menghapus kategori yang masih dipakai item |
| TanStack Query (cache, invalidation) | Saat daftar berubah setelah create/update tanpa reload halaman |
| Firebase Storage upload | Saat menyimpan foto barang |
| Debounce & server-side search | Saat user mengetik pencarian barang |

**Langkah-langkah**

1. **Definisikan skema validasi bersama untuk `categories`, `suppliers`, `items`.**
   *Mengapa:* validasi di dua tempat (frontend + backend) dengan aturan berbeda adalah sumber bug. Satu skema di `packages/shared` dipakai keduanya.
   *File:* `packages/shared/src/schemas/item.schema.ts`, `category.schema.ts`, `supplier.schema.ts`

2. **Bangun endpoint `categories` (list, create, update, soft delete).**
   *Mengapa:* kategori tanpa CRUD berarti user harus minta developer menambah kategori baru. Data induk harus bisa dikelola user sendiri.
   *File:* `apps/api/src/routes/categoryRoutes.ts`, `apps/api/src/services/category.service.ts`

3. **Bangun endpoint `suppliers` lengkap dengan field kontak.**
   *Mengapa:* `items.supplierId` butuh sumber yang valid. Tanpa master supplier, nama supplier akan diketik bebas dan menjadi tidak konsisten ("PT ABC", "PT. ABC", "abc").
   *File:* `apps/api/src/routes/supplierRoutes.ts`, `apps/api/src/services/supplier.service.ts`

4. **Bangun endpoint `items` dengan pagination, filter (kategori, status aktif), dan search.**
   *Mengapa:* daftar barang adalah layar paling sering dibuka. Tanpa pagination, satu query akan menurunkan seluruh data dan lambat; tanpa filter, user scroll ratusan baris.
   *File:* `apps/api/src/routes/itemRoutes.ts`, `apps/api/src/services/item.service.ts`, `apps/api/src/utils/pagination.ts`
   Pagination memakai **cursor** (`?limit=20&cursor=<startAfter>`) — lihat DoD.

4b. **Tegakkan keunikan `sku` secara atomik lewat dokumen indeks `itemCodes/{sku}`.**
   *Mengapa:* Firestore tidak punya unique constraint, sehingga dua request paralel dengan SKU sama bisa membuat dua dokumen. Klaim "SKU unik" (BR-13) hanya bisa dijamin dengan memesan dokumen indeks di dalam `runTransaction` (baca `itemCodes/{sku}` → jika ada, `409`; jika belum, buat item + tulis indeks).
   *File:* `apps/api/src/services/item.service.ts`, `packages/shared/src/types/item.ts`, `docs/DATA-MODEL.md` (`itemCodes`)

4c. **Tambahkan endpoint ekspor daftar item ke CSV (`GET /api/v1/items/export.csv`).**
   *Mengapa:* melayani US-13 — admin butuh data item dalam file untuk dibagikan. Ekspor mengalir (streaming) ke respons unduhan dan **tidak** menulis dokumen baru.
   *File:* `apps/api/src/routes/itemRoutes.ts`, `apps/api/src/utils/exportCsv.ts`

5. **Tambahkan field stok di `items`: `currentStock`, `minStock`, `unit`, `sku`.**
   *Mengapa:* `currentStock` disimpan (denormal) supaya dashboard tidak perlu menjumlahkan ribuan `stockTransactions` tiap kali dibuka. Nilai ini **hanya** boleh diubah lewat transaksi di Fase 3, bukan lewat form edit barang — beri komentar tegas di kode.
   *File:* `packages/shared/src/types/item.ts`, `docs/DATA-MODEL.md`
   Validasi: `minStock >= 0` dan **default `0` bila tidak diisi** (BR-12).

6. **Bangun halaman frontend: daftar barang (tabel + search + filter + pagination).**
   *Mengapa:* tabel yang lambat/berat membuat aplikasi terasa murah. Tabel harus mengirim query ke server, bukan memuat semua lalu memfilter di browser.
   *File:* `apps/web/src/features/items/ItemListPage.tsx`, `apps/web/src/features/items/useItems.ts`

7. **Bangun form create/edit barang + upload gambar ke Storage.**
   *Mengapa:* foto barang mengurangi kesalahan ambil barang di gudang. Upload langsung ke Storage (bukan lewat API) menghindari server menahan file besar.
   *File:* `apps/web/src/features/items/ItemFormPage.tsx`, `apps/web/src/features/items/useUploadItemImage.ts`

8. **Terapkan aturan hapus: blokir hapus kategori/supplier/barang yang masih dipakai.**
   *Mengapa:* menghapus kategori yang masih dipakai item akan menghasilkan item "yatim" yang tidak muncul di filter mana pun dan sulit dilacak.
   *File:* `apps/api/src/services/item.service.ts`, `category.service.ts`, `apps/api/src/middlewares/errorHandler.ts` (error `409 CONFLICT`)

9. **Tulis test unit untuk service `items` dan test komponen untuk tabel/form.**
   *Mengapa:* pola CRUD ini akan disalin ke fitur lain; bug di sini menular. Test juga jadi jaring pengaman saat kamu refactor di Fase 8.
   *File:* `apps/api/src/services/__tests__/item.service.test.ts`, `apps/web/src/features/items/__tests__/ItemListPage.test.tsx`

**Definisi selesai**
- [ ] `GET /api/v1/items?limit=20&cursor=...&search=...&categoryId=...` mengembalikan `{ data, nextCursor }` (pagination **cursor**/`startAfter`, tanpa `page`) dan tidak memuat seluruh koleksi.
- [ ] Create/update barang memvalidasi `sku` unik (lewat `itemCodes`), `unit` wajib, `minStock >= 0` (default `0`).
- [ ] Upload gambar berhasil dan URL tersimpan di dokumen `items`.
- [ ] `GET /api/v1/items/export.csv` menghasilkan CSV yang bisa dibuka Excel (US-13).
- [ ] Hapus kategori yang masih dipakai mengembalikan `409` dengan pesan jelas.
- [ ] Setelah create/update di frontend, daftar ter-refresh tanpa reload manual (invalidation TanStack Query benar).
- [ ] Test unit service `items` lulus; test komponen tabel lulus.

**Cara menguji sendiri**
1. Buat 25 barang, ambil halaman pertama (20 baris) lalu pakai `nextCursor` untuk halaman berikutnya — sisanya 5 baris.
2. Cari barang dengan 2 huruf, pastikan request hanya dikirim setelah kamu berhenti mengetik (debounce).
3. Coba buat dua barang dengan `sku` sama (termasuk dua request paralel) → harus error `409`, bukan dua dokumen.
4. Ekspor daftar item → buka CSV di Excel, cek kolom rapi dan jumlah baris sesuai.
5. Hapus kategori yang dipakai → muncul pesan yang bisa dimengerti user (bukan stack trace).
6. Buka DevTools → Network, cek ukuran respons daftar barang tetap kecil saat data bertambah.

**Pull Request**
- Judul: `feat(fase-2): master data items, categories, suppliers`
- Deskripsi: daftar endpoint + contoh request/response, keputusan pagination cursor vs offset, aturan referential integrity, screenshot tabel & form, cakupan test.

---

### Fase 3 — Transaksi Stok

**Tujuan fase**
Ini **jantung** aplikasi: mencatat setiap pergerakan stok sebagai transaksi `in`, `out`, atau `adjustment`, dan menjamin saldo `items.currentStock` selalu konsisten dengan riwayat transaksi. Fase ini melatih hal tersulit di backend: operasi atomik, idempotensi, dan penanganan race condition.

**Konsep yang akan dipelajari**

| Konsep | Kapan dipakai |
|---|---|
| Firestore transaction / batched write | Saat menulis `stockTransactions` **dan** mengubah `items.currentStock` bersamaan |
| Idempotency key | Saat mencegah double-submit menambah stok dua kali |
| Firestore transaction sebagai pengunci optimistik | Saat dua user mengubah barang yang sama (bukan cek `updatedAt` manual) |
| Validasi bisnis (stok tidak boleh negatif) | Saat `out` melebihi stok tersedia |
| Append-only ledger | Saat memutuskan `stockTransactions` tidak boleh di-edit/dihapus |
| Async programming & error propagation | Saat transaksi gagal di tengah jalan |

**Langkah-langkah**

1. **Definisikan skema `stockTransactions`: satu dokumen = satu item (ledger), dengan `type` (`in`/`out`/`adjustment`), `status` (`completed`/`cancelled`), `itemId` + snapshot `itemSku`/`itemName`/`unitSymbol`, `quantity` + `signedQuantity`, `stockBefore`/`stockAfter`, `supplierId`, `divisionId`, `requestId`, `note`, `referenceType`/`referenceId`, `batchId`, `attachments[]`, `occurredAt`, `createdBy`.**
   *Mengapa:* `stockBefore` + `stockAfter` membuat audit stok bisa ditelusuri per titik waktu; tanpa itu, "stok bulan lalu berapa?" tidak bisa dijawab. Model **satu item per dokumen** (input multi-item `lines[]` di-*expand* menjadi beberapa dokumen yang berbagi `batchId`) memberi index & query per item yang murah, melayani US-22; `status` + `cancelReason`/`cancelledAt` melayani US-20, dan `attachments[]` melayani US-21. Semua waktu memakai `serverTimestamp()` UTC dan ditampilkan `id-ID` (BR-20). Skema kanonik: `docs/DATA-MODEL.md` §3.7.
   *File:* `packages/shared/src/types/stockTransaction.ts`, `packages/shared/src/schemas/stockTransaction.schema.ts`, `docs/DATA-MODEL.md`

2. **Bangun service `recordStockTransaction` memakai Firestore transaction.**
   *Mengapa:* kalau menulis riwayat dan mengubah saldo dalam dua operasi terpisah, kegagalan di antaranya menghasilkan stok yang tidak cocok dengan riwayat — dan itu persis masalah "stok tidak akurat" yang ingin diselesaikan. Firestore transaction **sudah** menjamin isolasi & retry otomatis (penguncian optimistik level dokumen); jangan menambah cek `updatedAt` manual untuk konsistensi stok — cek itu redundan. `updatedAt` hanya relevan bila dipakai UI untuk mendeteksi konflik edit form.
   *File:* `apps/api/src/services/stockTransaction.service.ts`

3. **Terapkan aturan stok tidak boleh negatif untuk `type: 'out'` (per baris `lines[]`).**
   *Mengapa:* stok minus adalah tanda data rusak. Lebih baik transaksi ditolak dengan pesan jelas daripada gudang "punya" barang yang tidak ada.
   *File:* `apps/api/src/services/stockTransaction.service.ts`, `apps/api/src/errors/AppError.ts`

4. **Tambahkan idempotency key pada endpoint create transaksi (koleksi `idempotencyKeys`).**
   *Mengapa:* user menekan tombol dua kali atau koneksi terputus lalu retry — tanpa idempotensi, stok bertambah dobel dan sulit dibuktikan mana yang salah.
   *File:* `apps/api/src/routes/stockRoutes.ts`, `apps/api/src/middlewares/idempotency.ts`

5. **Bangun endpoint `POST /api/v1/stock-transactions` dan `GET /api/v1/stock-transactions?itemId=...` (kebab-case, konsisten dengan ARCHITECTURE & PROJECT).**
   *Mengapa:* input harus lewat satu jalur agar semua aturan (validasi, atomik, audit) selalu terpakai. Riwayat per barang dibutuhkan saat terjadi selisih.
   *File:* `apps/api/src/routes/stockRoutes.ts`

5b. **Bangun endpoint koreksi transaksi: pembatalan `PATCH /api/v1/stock-transactions/:id/cancel` dan pembalikan `POST /api/v1/stock-transactions/:id/reverse` (US-20), serta unggah lampiran `POST /api/v1/stock-transactions/:id/attachments` (US-21).**
   *Mengapa:* US-20 dan US-21 tidak punya tempat penegakan bila tidak ada endpoint. Pembatalan **tidak** menghapus dokumen (ledger append-only, BR-02): ia menandai `status: 'cancelled'` + `cancelReason`/`cancelledBy`/`cancelledAt` pada dokumen asal (dipakai untuk koreksi input yang belum berdampak lanjut); bila transaksi sudah tercermin di laporan/permintaan, pakai **dokumen lawan** lewat `reverse` (`referenceType: 'reversal'`, `reversalOf`). Lampiran disimpan di Storage dan path-nya ditulis ke `attachments[]`. Lihat DATA-MODEL §3.7 & API.md §6.7.
   *File:* `apps/api/src/routes/stockRoutes.ts`, `apps/api/src/services/stockTransaction.service.ts`, `apps/api/src/routes/stockAttachmentRoutes.ts`

6. **Bangun UI input transaksi stok (mendukung `lines[]` multi-item) + halaman riwayat per barang.**
   *Mengapa:* operator gudang butuh form cepat; admin butuh bisa menjawab "kenapa stok berubah?" tanpa membuka database. Form harus bisa menambah beberapa baris item dalam satu dokumen (US-22).
   *File:* `apps/web/src/features/stock/StockTransactionForm.tsx`, `apps/web/src/features/stock/StockHistoryPage.tsx`

7. **Buat script rekonsiliasi: bandingkan `items.currentStock` dengan jumlah `stockTransactions`.**
   *Mengapa:* ini alat pemulihan saat terjadi bug. Script ini juga membuktikan bahwa saldo denormal memang konsisten.
   *File:* `scripts/reconcile-stock.ts`

8. **Tulis test: transaksi atomik, stok negatif ditolak, double-submit tidak menggandakan, multi-item, dan pembatalan.**
   *Mengapa:* ini area paling berisiko di seluruh aplikasi. Test di sini lebih bernilai daripada test di 10 halaman CRUD.
   *File:* `apps/api/src/services/__tests__/stockTransaction.service.test.ts`

**Definisi selesai**
- [ ] `POST /api/v1/stock-transactions` dengan `type: 'in'` menambah `currentStock` **dan** menulis dokumen ledger (`stockBefore`/`stockAfter`) dalam satu operasi atomik.
- [ ] `type: 'out'` yang melebihi stok mengembalikan `422 STOCK_INSUFFICIENT` dan **tidak** mengubah apa pun.
- [ ] Kirim request yang sama dua kali dengan idempotency key sama → hanya satu transaksi tercatat.
- [ ] Transaksi multi-item (`lines[]` di API) menambah/mengurangi beberapa item lewat beberapa dokumen yang berbagi `batchId` (US-22).
- [ ] Riwayat per barang menampilkan `stockBefore`/`stockAfter` yang berurutan dan konsisten.
- [ ] `PATCH /api/v1/stock-transactions/:id/cancel` mengubah `status` menjadi `cancelled` (bukan menghapus) dan mencatat `cancelReason` (US-20).
- [ ] `POST /api/v1/stock-transactions/:id/reverse` membuat dokumen lawan (`referenceType: 'reversal'`) tanpa mengubah dokumen asal (US-20).
- [ ] `POST /api/v1/stock-transactions/:id/attachments` menyimpan lampiran dan menulis `attachments[]` (US-21).
- [ ] `npm run reconcile` melaporkan 0 selisih pada data uji.
- [ ] Ada test yang membuktikan kegagalan di tengah tidak meninggalkan data setengah jadi.

**Cara menguji sendiri**
1. Barang stok 10 → transaksi `out` 4 → stok 6, riwayat menampilkan `stockBefore`/`stockAfter` benar.
2. Coba `out` 100 → ditolak `422 STOCK_INSUFFICIENT`, stok tetap 6.
3. Kirim request create dua kali cepat (klik ganda) → stok hanya berubah sekali.
4. Buat satu transaksi berisi 2 item → kedua stok berubah, dua dokumen `stockTransactions` dengan `batchId` sama.
5. Batalkan transaksi → `status` menjadi `cancelled`, stok kembali konsisten, dokumen **tidak** terhapus.
6. Jalankan `npm run reconcile` → 0 selisih.
7. Suntik error sementara di tengah fungsi transaksi → pastikan tidak ada dokumen riwayat yang tertinggal tanpa perubahan stok.

**Pull Request**
- Judul: `feat(fase-3): transaksi stok atomik dengan ledger dan idempotensi`
- Deskripsi: penjelasan kenapa saldo disimpan denormal + cara menjaganya; diagram alur transaksi; contoh kasus race condition dan cara ditangani; hasil `reconcile`; daftar test.

---

### Fase 4 — Workflow Approval

**Tujuan fase**
Menyelesaikan masalah "permintaan barang antar divisi lambat & tidak terdokumentasi". Staff membuat `requests`, admin menyetujui/menolak, dan saat disetujui sistem mengubah stok secara otomatis. Fase ini melatih pemodelan **state machine** — memastikan status hanya bisa berpindah lewat jalur yang sah.

**Konsep yang akan dipelajari**

| Konsep | Kapan dipakai |
|---|---|
| State machine & transisi status | Saat mengunci alur `draft → submitted → approved/rejected → fulfilled` |
| Otorisasi berbasis peran + kepemilikan | Saat staff hanya boleh melihat/mengubah request miliknya |
| Event-driven processing | Saat `fulfilled` memicu pembuatan transaksi stok |
| Audit trail | Saat mencatat siapa menyetujui, kapan, dengan catatan apa |
| Concurrency pada approval | Saat dua admin menyetujui request yang sama |
| Notifikasi in-app (polling/onSnapshot) | Saat pengaju diberi tahu hasilnya |

**Langkah-langkah**

1. **Definisikan skema `requests` + `requestItems` (subkoleksi atau array item).**
   *Mengapa:* satu permintaan berisi banyak barang. Bentuk penyimpanan menentukan cara query dan cara menampilkan detail; putuskan sekarang dan tulis alasannya.
   *File:* `packages/shared/src/types/request.ts`, `docs/DATA-MODEL.md`, `docs/adr/0003-bentuk-request-items.md`
   Field pemilik memakai `requestedBy` (bukan `ownerId`) — samakan dengan `PROJECT.md` §9.9 dan rules SECURITY.

2. **Implementasikan state machine dengan tabel transisi eksplisit.**
   *Mengapa:* tanpa daftar transisi yang sah, cepat atau lambat ada request berstatus `fulfilled` yang tiba-tiba `submitted` lagi, dan laporan jadi tidak bisa dipercaya.
   *File:* `apps/api/src/services/request.service.ts`, `packages/shared/src/constants/requestStatus.ts`
   Status sah: `draft` | `submitted` | `approved` | `rejected` | `fulfilled` | `cancelled`.

3. **Bangun endpoint `POST /api/v1/requests` (draft & submit) dan `GET /api/v1/requests` dengan filter status.**
   *Mengapa:* draft memungkinkan staff menyusun permintaan bertahap; filter status adalah cara admin melihat antrean yang menunggu tindakan.
   *File:* `apps/api/src/routes/requestRoutes.ts`, `apps/api/src/services/request.service.ts`

4. **Bangun endpoint approval: `POST /api/v1/requests/:id/approve` dan `/reject` (admin only).**
   *Mengapa:* keputusan harus lewat endpoint khusus agar izin, validasi, dan pencatatan audit tidak bisa dilewati dengan PATCH biasa.
   *File:* `apps/api/src/routes/requestRoutes.ts`, `apps/api/src/middlewares/authenticate.ts`, `apps/api/src/middlewares/authorize.ts`

5. **Bangun endpoint `POST /api/v1/requests/:id/fulfill` (admin only) yang membuat `stockTransactions` bertipe `out` dan memotong `currentStock` secara atomik.**
   *Mengapa:* **fulfill** — bukan approve — yang memotong stok (sesuai alur (c) PROJECT dan US-28). Approve hanya mengubah status menjadi `approved`. Kalau approve langsung memotong stok, gudang dan sistem tidak sinkron dengan kenyataan penyerahan barang. Karena `fulfill` mengeluarkan stok (setara bobotnya dengan `adjustment`/`reverse`), aksinya dibatasi ke `admin` — selaras dengan `docs/API.md` §2.7 dan `docs/SECURITY.md` §3.2. Operasi `fulfill` idempoten (BR-21).
   *File:* `apps/api/src/services/request.service.ts`, `stockTransaction.service.ts`, `apps/api/src/routes/requestRoutes.ts`

6. **Tangani kegagalan saat fulfill: stok kurang di tengah proses.**
   *Mengapa:* permintaan bisa disetujui saat stok ada, lalu stok terpakai barang lain. Sistem harus gagal dengan jelas (dan memberi tahu bagian mana yang kurang), bukan setengah jalan. **Perilaku pasti:** transaksi dibatalkan seluruhnya (tidak ada stok terpotong), status request tetap `approved`, dan API mengembalikan `422` (`STOCK_INSUFFICIENT`) berisi daftar item yang kurang — bukan alternatif "atau kembali konsisten". `422` dipakai (bukan `409`) karena payload valid tetapi gagal aturan bisnis (lihat `docs/API.md` §1.3).
   *File:* `apps/api/src/services/request.service.ts`, `apps/api/src/errors/AppError.ts`

7. **Bangun UI: form permintaan, daftar "Permintaan Saya", antrean approval admin, halaman detail dengan timeline status, dan tombol "Tandai fulfilled".**
   *Mengapa:* timeline membuat proses terasa transparan dan terdokumentasi — inilah nilai jual utama fitur ini dibanding chat/WhatsApp. Tombol fulfill terpisah dari approve karena keduanya aksi yang berbeda.
   *File:* `apps/web/src/features/requests/RequestFormPage.tsx`, `RequestListPage.tsx`, `RequestApprovalPage.tsx`, `RequestDetailPage.tsx`

8. **Catat setiap perubahan status ke `auditLogs` + tampilkan notifikasi in-app ke pengaju.**
   *Mengapa:* "siapa menyetujui apa dan kapan" adalah kebutuhan audit. Tanpa ini, sengketa internal tidak bisa diselesaikan dengan data.
   *File:* `apps/api/src/services/auditLog.service.ts`, `apps/web/src/features/requests/useRequestNotifications.ts`

**Definisi selesai**
- [ ] Semua transisi di luar tabel sah ditolak dengan `409`/`422` dan pesan jelas.
- [ ] Staff hanya bisa melihat & mengubah request miliknya (`requestedBy == uid`).
- [ ] Hanya `admin` bisa approve/reject; `staff` mendapat `403`.
- [ ] Approve **hanya** mengubah status menjadi `approved` (tidak memotong stok).
- [ ] Fulfill (`admin`) menghasilkan `stockTransactions` bertipe `out` dan memotong `currentStock` dalam satu operasi atomik; idempoten (BR-21).
- [ ] Bila stok kurang saat fulfill: `422` + daftar item kurang, tidak ada stok terpotong, status tetap `approved`.
- [ ] Setiap perubahan status tercatat di `auditLogs` (siapa, kapan, dari status apa ke apa).
- [ ] Dua admin menyetujui bersamaan → hanya satu yang berhasil.

**Cara menguji sendiri**
1. Staff buat request → status `draft`; submit → `submitted`; coba ubah langsung ke `approved` dari UI/API → ditolak.
2. Login admin → approve → status `approved` dan **stok belum berubah**.
3. Admin menandai `fulfilled` → stok berkurang sesuai, ada transaksi `out`, ada entri `auditLogs`.
4. Staff A coba buka request milik staff B → `403`/`404`.
5. Buat request melebihi stok, lalu fulfill → `422` dengan daftar item kurang, stok **tidak** terpotong, status tetap `approved`.
6. Buka dua tab, fulfill request yang sama hampir bersamaan → satu berhasil, satu mendapat pesan "sudah diproses", stok hanya berkurang sekali.

**Pull Request**
- Judul: `feat(fase-4): workflow approval permintaan barang dengan audit trail`
- Deskripsi: diagram state machine (ASCII), tabel transisi sah, aturan izin per role, bukti atomisitas fulfill → stok, screenshot timeline, daftar test.

---

### Fase 5 — Dashboard & Reporting

**Tujuan fase**
Mengubah data yang sudah akurat menjadi informasi yang bisa diambil keputusan: berapa nilai stok, barang apa yang menipis, pergerakan bulan ini, dan laporan yang bisa diekspor. Fase ini juga melatih **performa query** karena laporan menyentuh data jauh lebih banyak daripada layar transaksi.

**Konsep yang akan dipelajari**

| Konsep | Kapan dipakai |
|---|---|
| Aggregation (count/sum) di Firestore | Saat menghitung total nilai stok tanpa membaca semua dokumen (via field denormalisasi `stockValue`) |
| Denormalisasi counter / dokumen ringkasan | Saat menyimpan `dailyAggregates` harian agar dashboard instan |
| Query dengan index komposit | Saat memfilter `stockTransactions` per tanggal + tipe |
| Streaming & export (CSV/Excel) | Saat laporan ribuan baris tanpa memuat semuanya ke memori |
| Chart & visualisasi | Saat menampilkan tren pergerakan stok |
| Caching di TanStack Query (`staleTime`) | Saat dashboard dibuka berulang kali |

**Langkah-langkah**

1. **Tentukan daftar KPI dashboard dan rumusnya.**
   *Mengapa:* "dashboard" tanpa definisi metrik berakhir jadi kumpulan grafik yang tidak dipakai. Tulis rumusnya supaya angka bisa dipertanggungjawabkan.
   *File:* `docs/PROJECT.md` (bagian metrik), `packages/shared/src/types/dashboard.ts`
   KPI awal: total item, total nilai stok, item di bawah `minStock`, transaksi `in`/`out` bulan ini, permintaan menunggu approval. Semua waktu ditampilkan `id-ID` dari timestamp UTC (BR-20).

2. **Bangun endpoint `GET /api/v1/dashboard/summary` dengan aggregation.**
   *Mengapa:* menghitung di frontend berarti mengirim seluruh data ke browser — lambat dan membocorkan data. Perhitungan harus di server.
   *File:* `apps/api/src/routes/dashboardRoutes.ts`, `apps/api/src/services/dashboard.service.ts`
   **Catatan teknis (penting):** Firestore `sum()` hanya menjumlahkan **satu field numerik**. "Total nilai stok" = Σ(`currentStock × price`) **tidak** bisa dihitung langsung oleh `sum()`. Karena itu `items.stockValue` didenormalisasi (`currentStock * price`, BR-23) dan diperbarui di setiap transaksi stok/harga berubah; dashboard lalu memakai `sum('stockValue')` (atau membaca agregat `dailyAggregates.totalStockValue`). Alternatif: hitung per item di server.

3. **Bangun endpoint `GET /api/v1/reports/stock` dengan filter tanggal & kategori.**
   *Mengapa:* laporan stok adalah alasan utama perusahaan mau memakai sistem. Tanpa filter, laporan besar tidak berguna dan lambat.
   *File:* `apps/api/src/routes/reportRoutes.ts`, `apps/api/src/services/report.service.ts`

4. **Tambahkan index komposit Firestore yang dibutuhkan query laporan.**
   *Mengapa:* Firestore akan menolak query gabungan tanpa index. Menemukannya lewat error di produksi jauh lebih merepotkan daripada mendefinisikannya sekarang.
   *File:* `firestore.indexes.json`, `docs/DATA-MODEL.md`

5. **Bangun halaman dashboard frontend (KPI card, grafik tren, daftar stok menipis).**
   *Mengapa:* manajer butuh melihat kondisi gudang dalam 10 detik pertama membuka aplikasi.
   *File:* `apps/web/src/features/dashboard/DashboardPage.tsx`, `apps/web/src/features/dashboard/components/*`

6. **Bangun halaman laporan + export CSV/Excel.**
   *Mengapa:* perusahaan tetap butuh file untuk rapat dan arsip. Export harus mengalir (stream) agar tidak mematikan server pada data besar.
   *File:* `apps/web/src/features/reports/ReportPage.tsx`, `apps/api/src/utils/exportCsv.ts`

7. **Optimalkan: `staleTime`, pagination laporan, dan batasi rentang tanggal default.**
   *Mengapa:* laporan "seluruh waktu" tanpa batas akan makin lambat setiap bulan. Default rentang yang wajar menjaga performa tetap stabil.
   *File:* `apps/web/src/features/reports/useReport.ts`, `apps/api/src/services/report.service.ts`

8. **Tulis test untuk rumus KPI & service laporan.**
   *Mengapa:* angka dashboard yang salah lebih berbahaya daripada dashboard yang error — orang mengambil keputusan dari angka itu.
   *File:* `apps/api/src/services/__tests__/dashboard.service.test.ts`, `report.service.test.ts`

**Definisi selesai**
- [ ] `GET /api/v1/dashboard/summary` merespons < 1 detik pada data uji ≥ 1.000 transaksi.
- [ ] KPI dihitung di server; frontend tidak memuat seluruh koleksi.
- [ ] Laporan bisa difilter tanggal + kategori, dan hasilnya cocok dengan hitung manual pada sampel kecil.
- [ ] Export CSV menghasilkan file yang bisa dibuka Excel dengan kolom rapi.
- [ ] Index komposit terdefinisi di `firestore.indexes.json` dan ter-deploy.
- [ ] Test rumus KPI lulus, termasuk kasus data kosong.

**Cara menguji sendiri**
1. Seed 1.000 `stockTransactions`, ukur waktu respons dashboard. Catat angkanya di PR.
2. Hitung manual total nilai stok untuk 5 barang, bandingkan dengan dashboard — harus sama.
3. Set satu item di bawah `minStock`, pastikan muncul di daftar "stok menipis".
4. Export laporan, buka di Excel, cek jumlah baris = jumlah yang tampil di aplikasi.
5. Kosongkan filter tanggal → pastikan aplikasi tetap responsif (ada batas/default).

**Pull Request**
- Judul: `feat(fase-5): dashboard KPI dan laporan stok dengan export`
- Deskripsi: definisi tiap KPI + rumusnya, screenshot dashboard & laporan, angka performa sebelum/sesudah optimasi, daftar index baru, bukti hasil export.

---

### Fase 6 — Automasi (Cloud Functions)

**Tujuan fase**
Memindahkan pekerjaan yang tadinya dilakukan manusia (atau dilupakan manusia) ke sistem: peringatan stok menipis, pencatatan audit otomatis, dan ringkasan harian. Fase ini adalah tempat istilah **event-driven** benar-benar terasa: kode berjalan karena *ada kejadian*, bukan karena ada yang menekan tombol.

**Konsep yang akan dipelajari**

| Konsep | Kapan dipakai |
|---|---|
| Firestore trigger (`onDocumentWritten`/`onCreate`) | Saat stok berubah → cek ambang batas |
| Scheduled function (cron) | Saat ringkasan harian & pemeriksaan stok menipis tiap pagi |
| HTTP callable function | Saat frontend memicu aksi yang butuh kredensial server |
| Idempotensi pada event (event bisa dikirim ulang) | Saat trigger berjalan dua kali untuk perubahan yang sama |
| Retry & dead-letter handling | Saat pengiriman email/notifikasi gagal |
| Cold start & timeout function | Saat memilih memori/durasi function |

**Langkah-langkah**

1. **Bangun Firestore trigger `onStockTransactionCreated` untuk memperbarui ringkasan/notifikasi.**
   *Mengapa:* logika turunan yang dijalankan di banyak tempat akan terlupakan di salah satu tempat. Trigger memusatkannya di satu titik.
   *File:* `functions/src/triggers/onStockTransactionCreated.ts`

2. **Bangun pemeriksa stok menipis: bandingkan `currentStock` dengan `minStock`.**
   *Mengapa:* inilah solusi langsung dari masalah "tidak ada peringatan saat stok menipis" — fitur yang paling mudah ditunjukkan ke calon pengguna.
   *File:* `functions/src/triggers/lowStockAlert.ts`, `apps/api/src/services/notification.service.ts`

3. **Bangun scheduled function harian: rekap stok + daftar barang menipis.**
   *Mengapa:* laporan yang datang sendiri lebih dapat diandalkan daripada orang yang harus ingat membuka aplikasi.
   *File:* `functions/src/scheduled/dailyStockSummary.ts`, `docs/OPERATIONS.md` (jadwal cron + zona waktu)

4. **Bangun HTTP callable `sendLowStockEmail` / integrasi notifikasi (email atau webhook).**
   *Mengapa:* callable menyimpan kredensial di server, bukan di browser. Ini juga melatih pemisahan "aksi yang butuh rahasia" dari frontend.
   *File:* `functions/src/callable/sendLowStockEmail.ts`

5. **Pastikan trigger idempoten.**
   *Mengapa:* Firestore dapat memanggil trigger lebih dari sekali untuk satu perubahan. Tanpa idempotensi, satu transaksi bisa memicu 3 email — dan user berhenti mempercayai notifikasi.
   *File:* `functions/src/triggers/lowStockAlert.ts`, `apps/api/src/utils/idempotency.ts`

6. **Catat hasil eksekusi function (sukses/gagal) ke koleksi `functionRuns`.**
   *Mengapa:* function yang gagal diam-diam adalah bug tak terlihat. Mencatat hasilnya adalah langkah pertama monitoring.
   *File:* `functions/src/lib/functionRunLogger.ts`, `apps/api/src/services/auditLog.service.ts`, `docs/OPERATIONS.md`

7. **Tulis test untuk logika function (unit, tanpa emulator dulu), lalu uji di emulator.**
   *Mengapa:* trigger sulit di-debug di produksi. Menguji di emulator lebih murah daripada menebak dari log.
   *File:* `functions/src/__tests__/lowStockAlert.test.ts`, `firebase.json` (emulator config)

8. **Bangun UI notifikasi (bell + daftar peringatan) di frontend.**
   *Mengapa:* notifikasi yang tidak pernah dilihat user sama saja tidak ada. Tampilkan di dalam aplikasi, bukan hanya email.
   *File:* `apps/web/src/features/notifications/NotificationBell.tsx`, `NotificationListPage.tsx`

**Definisi selesai**
- [ ] Transaksi `out` yang membuat stok ≤ `minStock` memicu peringatan (dalam hitungan detik).
- [ ] Trigger yang dijalankan dua kali tidak menghasilkan notifikasi ganda.
- [ ] Scheduled function berjalan sesuai jadwal dan menulis hasilnya (dibuktikan di emulator/log).
- [ ] Kegagalan kirim notifikasi tercatat dan bisa dilihat, bukan hilang.
- [ ] Ada dokumentasi jadwal function + cara menjalankan emulator.
- [ ] Test unit function lulus.

**Cara menguji sendiri**
1. Jalankan emulator, buat transaksi yang menjatuhkan stok di bawah `minStock` → notifikasi muncul.
2. Picu trigger dua kali untuk dokumen yang sama → hanya satu notifikasi.
3. Jalankan scheduled function manual dari emulator → rekap tertulis.
4. Matikan kredensial email → pastikan function gagal dengan tercatat, bukan crash tanpa jejak.
5. Buka aplikasi, cek bell notifikasi menampilkan peringatan yang benar.

**Pull Request**
- Judul: `feat(fase-6): automasi cloud functions — peringatan stok dan rekap harian`
- Deskripsi: diagram alur event (transaksi → trigger → notifikasi), daftar function + trigger/jadwalnya, strategi idempotensi, bukti log emulator, screenshot UI notifikasi.

---

### Fase 7 — Integrasi API Pihak Ketiga

**Tujuan fase**
Menghubungkan sistem ke layanan luar (misalnya API kurs untuk menghitung nilai stok dalam Rupiah, API ongkir untuk estimasi pengiriman barang, atau webhook ke sistem akuntansi). Fase ini melatih hal yang selalu ditanya di interview: **bagaimana aplikasi bersikap saat layanan pihak ketiga lambat, error, atau berubah**.

**Konsep yang akan dipelajari**

| Konsep | Kapan dipakai |
|---|---|
| HTTP client + timeout | Saat memanggil API eksternal dari server |
| Retry dengan exponential backoff | Saat layanan luar gagal sementara |
| Circuit breaker / fallback | Saat layanan luar mati total — aplikasi tetap jalan |
| Caching respons eksternal | Saat data tidak perlu diambil tiap request |
| Validasi respons pihak ketiga | Saat bentuk respons berubah tanpa pemberitahuan |
| Webhook & verifikasi signature | Saat layanan luar mengirim data masuk |
| Menyimpan rahasia (API key) di server | Saat memanggil layanan berbayar |

**Langkah-langkah**

1. **Pilih dan dokumentasikan satu integrasi nyata (mis. kurs USD/IDR atau ongkir).**
   *Mengapa:* integrasi tanpa kasus bisnis hanya jadi hiasan. Pilih yang benar-benar dipakai di layar, lalu tulis alasannya.
   *File:* `docs/adr/0004-integrasi-pihak-ketiga.md`, `docs/PROJECT.md`

2. **Bangun adapter/service terpisah untuk layanan luar.**
   *Mengapa:* menaruh `fetch` ke API luar langsung di dalam service bisnis membuat kode sulit diuji dan sulit diganti penyedianya. Adapter menjaga batas yang jelas.
   *File:* `apps/api/src/integrations/exchangeRate.client.ts`, `apps/api/src/integrations/types.ts`

3. **Tambahkan timeout, retry, dan penanganan error.**
   *Mengapa:* tanpa timeout, satu API lambat bisa menggantung request aplikasi kamu sampai server kehabisan resource.
   *File:* `apps/api/src/utils/httpClient.ts` (mis. pembungkus `fetch` dengan timeout + retry)

4. **Tambahkan caching (in-memory atau Firestore `cacheEntries`).**
   *Mengapa:* memanggil API berbayar tiap request membuang kuota dan uang, serta membuat aplikasi bergantung pada layanan luar.
   *File:* `apps/api/src/integrations/exchangeRate.client.ts`, `apps/api/src/services/cache.service.ts`

5. **Tambahkan fallback saat layanan luar down (pakai nilai cache terakhir + tandai "data mungkin usang").**
   *Mengapa:* aplikasi inventaris harus tetap bisa mencatat stok walau internet ke layanan luar bermasalah. Kegagalan pihak ketiga tidak boleh memblokir operasi gudang.
   *File:* `apps/api/src/integrations/exchangeRate.client.ts`, `apps/web/src/features/dashboard/CurrencyWidget.tsx`

6. **Bungkus lewat endpoint sendiri: `GET /api/v1/integrations/exchange-rate`.**
   *Mengapa:* API key tidak boleh sampai ke browser. Semua panggilan pihak ketiga harus lewat server kamu.
   *File:* `apps/api/src/routes/integrationRoutes.ts`

7. **Tambahkan webhook masuk (opsional) dengan verifikasi signature.**
   *Mengapa:* endpoint publik tanpa verifikasi bisa dipakai orang lain untuk menyuntik data palsu ke sistem kamu.
   *File:* `apps/api/src/routes/webhookRoutes.ts`, `apps/api/src/middlewares/verifySignature.ts`

8. **Tulis test dengan mock server (sukses, timeout, error 500, respons cacat).**
   *Mengapa:* kamu tidak bisa memaksa API luar error saat demo. Mock adalah satu-satunya cara menguji jalur kegagalan.
   *File:* `apps/api/src/integrations/__tests__/exchangeRate.client.test.ts`

**Definisi selesai**
- [ ] Ada minimal satu integrasi nyata yang tampil di UI dan punya nilai bisnis jelas.
- [ ] API key hanya ada di server (`.env`), tidak pernah muncul di bundle frontend.
- [ ] Timeout + retry terpasang; request ke layanan luar tidak bisa menggantung lebih dari batas waktu.
- [ ] Saat layanan luar dimatikan (mock), aplikasi tetap berjalan dengan fallback dan memberi label data usang.
- [ ] Ada cache dengan masa berlaku yang jelas.
- [ ] Test jalur sukses & gagal lulus.

**Cara menguji sendiri**
1. Matikan koneksi/mock API luar → halaman tetap terbuka, menampilkan nilai cache + label "data mungkin usang".
2. Set timeout sangat kecil → pastikan request gagal cepat, bukan menggantung.
3. Cari API key di hasil `npm run build` → harus tidak ada.
4. Kirim webhook dengan signature salah → ditolak `401`.
5. Jalankan test mock → semua skenario (sukses/timeout/500/JSON rusak) tertangani.

**Pull Request**
- Judul: `feat(fase-7): integrasi API pihak ketiga dengan retry, cache, dan fallback`
- Deskripsi: layanan yang dipakai + alasan bisnisnya, diagram alur panggilan + fallback, strategi cache & retry, bukti kunci tidak bocor ke frontend, hasil test mock.

---

### Fase 8 — Hardening

**Tujuan fase**
Mengubah "aplikasi yang jalan" menjadi "aplikasi yang bisa dipercaya". Empat pilar: **keamanan** (Firestore Security Rules + validasi), **kualitas** (test menyeluruh), **otomasi** (CI/CD), dan **observability** (logging, error tracking, monitoring). Ini fase yang paling sering membedakan kandidat junior dari yang siap kerja.

**Konsep yang akan dipelajari**

| Konsep | Kapan dipakai |
|---|---|
| Firestore Security Rules | Saat menutup akses langsung client ke database |
| Prinsip least privilege | Saat menentukan siapa boleh baca/tulis koleksi apa |
| Test pyramid (unit → integration → e2e) | Saat menentukan jenis test untuk tiap lapisan |
| Mocking & test double | Saat menguji service yang memanggil Firebase |
| CI/CD pipeline | Saat setiap push otomatis lint + test + build + deploy |
| Structured logging & correlation ID | Saat melacak satu request menyeberangi banyak fungsi |
| Error tracking (mis. Sentry) | Saat bug di produksi perlu terlihat sebelum user melapor |
| Health check & uptime monitoring | Saat ingin tahu aplikasi mati sebelum pelanggan menelepon |

**Langkah-langkah**

1. **Perkuat & lengkapi `firestore.rules` + `storage.rules` (default-deny sudah dipasang sejak Fase 0).**
   *Mengapa:* konfigurasi Firestore mode uji membuka database ke seluruh internet. Kalau lupa menutupnya, data perusahaan bisa dibaca siapa pun yang tahu project ID. Karena default-deny sudah dibuat di Fase 0, langkah ini **memperkuat** (menambah aturan berbasis role & kepemilikan) dan **menguji**, bukan membuat rules pertama kali.
   *File:* `firestore.rules`, `storage.rules`, `docs/SECURITY.md`

2. **Terapkan aturan berbasis role & kepemilikan di Security Rules.**
   *Mengapa:* API mungkin aman, tapi client bisa bicara langsung ke Firestore. Aturan di database adalah lapisan pertahanan terakhir — dan wajib. Perhatikan: rule `read` yang memakai `resource.data` **tidak** berlaku untuk operasi `list` (resource kosong) — pisahkan rule `get` dan `list`, dan pastikan query terfilter (mis. `where('requestedBy','==',uid)`).
   *File:* `firestore.rules`, `firestore.indexes.json`

3. **Tulis test Security Rules (emulator) untuk skenario boleh & tidak boleh — termasuk skenario `list` terfilter.**
   *Mengapa:* rules yang tidak diuji sama dengan tidak ada rules. Test ini membuktikan `viewer` tidak bisa menulis, `staff` tidak bisa mengubah data orang lain, dan staff bisa `list` "Permintaan Saya" (query terfilter `requestedBy`).
   *File:* `apps/api/src/__tests__/firestore.rules.test.ts`

4. **Naikkan cakupan test: unit service, integration API, dan e2e Playwright untuk alur utama.**
   *Mengapa:* e2e membuktikan seluruh sistem tersambung (login → input transaksi → stok berubah → fulfill), hal yang tidak dibuktikan unit test.
   *File:* `apps/web/e2e/login.spec.ts`, `apps/web/e2e/stock-flow.spec.ts`, `apps/api/src/__tests__/api.integration.test.ts`

5. **Lengkapi GitHub Actions: lint → typecheck → test → build → deploy (staging).**
   *Mengapa:* otomasi mencegah kamu men-deploy kode yang gagal test saat sedang buru-buru. Ini juga bukti ke recruiter bahwa kamu paham alur kerja profesional.
   *File:* `.github/workflows/ci.yml`, `.github/workflows/deploy.yml`

6. **Tambahkan structured logging + correlation ID di API.**
   *Mengapa:* log `console.log("error")` tanpa konteks tidak bisa dipakai menelusuri masalah di produksi.
   *File:* `apps/api/src/middlewares/requestLogger.ts`, `apps/api/src/lib/logger.ts`

7. **Pasang error tracking + health check + uptime monitoring.**
   *Mengapa:* kamu harus tahu aplikasi rusak sebelum user melapor. Ini yang dimaksud JD dengan "penanganan masalah setelah release".
   *File:* `apps/api/src/routes/healthRoutes.ts`, `apps/web/src/lib/errorTracking.ts`, `docs/OPERATIONS.md`

8. **Lakukan audit keamanan & performa ringan, lalu perbaiki temuan.**
   *Mengapa:* hardening tanpa audit hanyalah asumsi. Buat daftar temuan (mis. endpoint tanpa rate limit, query tanpa index) dan tutup satu per satu.
   *File:* `docs/SECURITY.md`, `apps/api/src/middlewares/rateLimit.ts`

9. **Tulis dokumentasi operasional: runbook masalah umum.**
   *Mengapa:* saat aplikasi down pukul 22.00, kamu butuh langkah pemulihan yang sudah ditulis, bukan improvisasi.
   *File:* `docs/OPERATIONS.md`, `docs/RUNBOOK.md`

**Definisi selesai**
- [ ] Firestore Rules default-deny dan teruji; `viewer` tidak bisa menulis, `staff` tidak bisa mengubah data orang lain.
- [ ] Semua push ke `main` menjalankan lint, typecheck, test, build di CI dan wajib hijau.
- [ ] E2E Playwright lulus untuk alur: login → input transaksi stok → stok berubah → permintaan → approve → fulfill.
- [ ] API punya `/health` yang memeriksa koneksi Firestore.
- [ ] Error di produksi tercatat dengan correlation ID dan bisa dilacak.
- [ ] Ada dokumentasi keamanan, operasional, dan runbook.
- [ ] Tidak ada `.env`, service account, atau API key di repo (`git log` bersih dari kebocoran).

**Cara menguji sendiri**
1. Coba tulis langsung ke Firestore dari console browser dengan akun `viewer` → ditolak.
2. Jalankan `npm run test:e2e` di mesin bersih → lulus tanpa langkah manual tersembunyi.
3. Rusak satu test sengaja, push → CI harus merah dan memblokir merge.
4. Matikan Firestore emulator, panggil `/health` → melaporkan `degraded`, bukan `ok`.
5. Picu error di API, cek error tracker menerima laporan lengkap dengan correlation ID.

**Pull Request**
- Judul: `chore(fase-8): hardening — security rules, testing, CI/CD, monitoring`
- Deskripsi: matriks izin per role (tabel), cakupan test sebelum/sesudah, alur CI/CD (diagram), daftar temuan audit + status perbaikan, cara membaca log saat ada insiden.

---

### Fase 9 — Polish & Deploy

**Tujuan fase**
Menyelesaikan proyek dengan kualitas yang layak dipamerkan: UI konsisten, loading & error state rapi, dokumentasi lengkap, dan aplikasi hidup di URL publik yang bisa dicoba recruiter. Fase ini juga tempat menulis ulang cerita proyek di README — karena portofolio dinilai dari apa yang orang lihat dalam 2 menit pertama.

**Konsep yang akan dipelajari**

| Konsep | Kapan dipakai |
|---|---|
| Skeleton/loading & empty state | Saat data belum datang atau kosong |
| Error boundary React | Saat satu komponen error tidak boleh menjatuhkan seluruh halaman |
| Aksesibilitas dasar (label, kontras, keyboard) | Saat memastikan aplikasi bisa dipakai semua orang |
| Design token & komponen konsisten | Saat menyatukan tampilan sebelum demo |
| Deploy staging vs produksi | Saat men-deploy tanpa mengacaukan data uji |
| Dokumentasi API & arsitektur | Saat orang lain (dan kamu 3 bulan nanti) membaca proyek |
| Environment parity | Saat memastikan build produksi tidak berbeda perilaku dari lokal |

**Langkah-langkah**

1. **Samakan komponen UI: tombol, tabel, form, modal, badge status.**
   *Mengapa:* tampilan yang tidak konsisten membuat aplikasi terasa belum selesai, sekalipun fiturnya jalan. Konsistensi juga mempercepat pembuatan layar baru.
   *File:* `apps/web/src/components/ui/*`, `apps/web/src/styles/tokens.css`

2. **Tambahkan loading skeleton, empty state, dan error state di semua halaman data.**
   *Mengapa:* halaman yang "berkedip kosong" atau diam tanpa penjelasan membuat user mengira aplikasi hang.
   *File:* `apps/web/src/components/feedback/*`, halaman-halaman fitur

3. **Pasang Error Boundary dan halaman 404/403 yang ramah.**
   *Mengapa:* satu bug di satu widget tidak boleh membuat seluruh aplikasi putih. Ini juga kesan profesional.
   *File:* `apps/web/src/components/ErrorBoundary.tsx`, `apps/web/src/routes/NotFoundPage.tsx`, `ForbiddenPage.tsx`

4. **Rapikan responsivitas & aksesibilitas dasar.**
   *Mengapa:* operator gudang sering memakai tablet; label & kontras yang benar juga menurunkan kesalahan input.
   *File:* seluruh halaman fitur, `apps/web/src/styles/*`

5. **Tulis dokumentasi akhir: README, arsitektur, API, cara deploy.**
   *Mengapa:* recruiter teknis membaca README dan `docs/` sebelum memutuskan mengundang interview. Dokumentasi yang rapi = bukti kamu bisa menulis untuk tim.
   *File:* `README.md`, `docs/ARCHITECTURE.md`, `docs/API.md`, `docs/DEPLOYMENT.md`, `docs/TESTING.md`

6. **Deploy frontend ke Firebase Hosting (atau Vercel) dan API ke Cloud Run/Render.**
   *Mengapa:* link yang bisa diklik jauh lebih meyakinkan daripada klaim "bisa dijalankan di lokal". Pastikan kredensial produksi dipisah dari staging.
   *File:* `firebase.json`, `apps/api/Dockerfile`, `.github/workflows/deploy.yml`, `docs/DEPLOYMENT.md`

7. **Isi data demo yang masuk akal + akun demo untuk ketiga role.**
   *Mengapa:* recruiter tidak akan mendaftar akun sendiri. Sediakan login `admin`, `staff`, `viewer` yang tinggal dipakai, dengan data yang terlihat realistis.
   *File:* `scripts/seed-demo.ts`, `README.md` (bagian "Coba aplikasi")

8. **Latih skenario demo 5 menit dan rekam video pendek (opsional).**
   *Mengapa:* demo yang dilatih mencegah momen canggung saat interview, dan video/GIF di README membuat orang langsung paham nilai aplikasinya.
   *File:* `docs/DEMO.md`, tautan video di `README.md`

9. **Tag rilis `v1.0.0` dan tandai roadmap selesai.**
   *Mengapa:* tag rilis memberi titik acuan yang stabil dan menunjukkan kamu mengelola proyek, bukan sekadar menulis kode.
   *File:* `CHANGELOG.md`, `docs/ROADMAP.md` (centang semua fase)

**Definisi selesai**
- [ ] Aplikasi dapat diakses publik (frontend + API) dengan HTTPS.
- [ ] Login `admin`, `staff`, `viewer` demo tersedia dan terdokumentasi di README.
- [ ] Tidak ada halaman yang menampilkan layar putih saat data kosong/error.
- [ ] `README.md` memuat: deskripsi, screenshot/GIF, fitur, stack, arsitektur, cara menjalankan lokal, cara deploy, akun demo.
- [ ] `docs/API.md` memuat semua endpoint `/api/v1/...` dengan contoh request/response.
- [ ] Build produksi lulus dan berperilaku sama seperti lokal (dicek minimal pada 3 alur utama).
- [ ] Demo 5 menit sudah dilatih minimal dua kali tanpa error.
- [ ] Tag `v1.0.0` dibuat di `main`.

**Cara menguji sendiri**
1. Buka URL publik di browser mode incognito → login dengan akun demo → jalankan alur utama.
2. Buka di ponsel → pastikan tabel/form tetap bisa dipakai.
3. Matikan API di staging → pastikan frontend menampilkan pesan error yang jelas, bukan layar putih.
4. Minta teman yang belum pernah melihat aplikasi menjalankan skenario demo dari README saja — kalau dia bingung, README perlu diperbaiki.
5. Jalankan demo 5 menit dengan stopwatch; kalau lebih dari 5 menit, potong bagian yang kurang penting.

**Pull Request**
- Judul: `chore(fase-9): polish UI, dokumentasi, dan deploy produksi v1.0.0`
- Deskripsi: tautan URL produksi & staging, daftar akun demo, checklist dokumentasi, sebelum/sesudah tampilan UI (screenshot), catatan hasil latihan demo.

---

## 4. Urutan ketergantungan

Fase-fase ini **tidak boleh ditukar sembarangan**. Berikut alasannya, dan apa yang rusak kalau dibalik.

```text
Fase 0 Fondasi
   └── Fase 1 Auth & Role
          └── Fase 2 Master Data
                 └── Fase 3 Transaksi Stok
                        └── Fase 4 Workflow Approval
                               └── Fase 5 Dashboard & Reporting
                                      └── Fase 6 Automasi (Cloud Functions)
                                             └── Fase 7 Integrasi Pihak Ketiga
                                                    └── Fase 8 Hardening
                                                           └── Fase 9 Polish & Deploy
```

| Kalau dibalik... | Yang rusak |
|---|---|
| **Master Data sebelum Auth** | Setiap endpoint terbuka. Kamu akan menulis CRUD dulu, lalu menempel auth ke semuanya belakangan — pekerjaan dua kali dan rawan ada endpoint yang terlewat. |
| **Transaksi Stok sebelum Master Data** | Tidak ada `items` untuk ditransaksikan. `itemId` mengarah ke dokumen yang belum ada aturannya; validasi tidak bisa dibuat. |
| **Approval sebelum Transaksi Stok** | Approval yang "disetujui" tidak bisa memotong stok — akar masalah "stok tidak akurat" justru makin parah karena ada permintaan yang dianggap terpenuhi padahal gudang belum bergerak. |
| **Dashboard sebelum Transaksi Stok** | Dashboard hanya menampilkan angka kosong atau angka palsu. Kamu akan menghabiskan waktu mengatur grafik yang tidak punya data. |
| **Automasi sebelum ada data yang stabil** | Trigger akan memicu notifikasi dari data uji yang berantakan, dan kamu sulit membedakan bug trigger vs bug data. |
| **Integrasi pihak ketiga terlalu awal** | Kegagalan layanan luar akan tercampur dengan bug internal saat debugging. Selesaikan dulu sistem yang mandiri, baru sambungkan ke luar. |
| **Hardening paling akhir (dan dilewati)** | Ini satu-satunya fase yang **wajib** ada. Kalau ditaruh paling akhir lalu kehabisan waktu, kamu akan men-deploy aplikasi tanpa security rules — risiko terbesar di seluruh proyek. Karena itu: pasang **Firestore & Storage default-deny sejak Fase 0**, lalu perkuat + uji di Fase 8. |
| **Polish & Deploy tanpa Hardening** | Aplikasi terlihat bagus tapi bisa dibaca siapa pun dan tidak ada test. Kesan pertama bagus, kesan kedua hancur saat ditanya soal keamanan. |

**Aturan praktis:** setiap fase hanya boleh bergantung pada fase **sebelumnya**, tidak pernah pada fase sesudahnya. Kalau kamu menemukan kebutuhan dari fase depan, catat di issue dan tunda — jangan tarik fase itu ke depan.

---

## 5. Definition of Done global

Seluruh project dianggap selesai hanya jika **semua** poin berikut terpenuhi. Ini juga daftar yang akan kamu tunjukkan saat ditanya "apa saja yang sudah kamu kerjakan?".

**Kode & kualitas**
- [ ] `npm run lint` lulus tanpa error (warning sudah ditinjau).
- [ ] `npm run typecheck` lulus dengan `strict: true`; tidak ada `any` yang tidak beralasan.
- [ ] Tidak ada `console.log` debug yang tertinggal di kode produksi.
- [ ] Tidak ada kode mati / file tidak terpakai / komentar yang menyesatkan.

**Testing**
- [ ] Unit test (Vitest) untuk seluruh service bisnis inti: stok, permintaan, item, laporan.
- [ ] Component test (Testing Library) untuk halaman utama.
- [ ] E2E (Playwright) untuk minimal 3 alur: login & role, input transaksi stok, permintaan → approval.
- [ ] Test Firestore Security Rules lulus di emulator.
- [ ] CI menjalankan semua test di setiap push dan wajib hijau untuk merge.

**Keamanan**
- [ ] Firestore Security Rules default-deny, teruji, dan ter-deploy.
- [ ] Semua endpoint `/api/v1/*` terproteksi `requireAuth`, dengan `requireRole` di aksi sensitif.
- [ ] Role diverifikasi di backend lewat custom claims; frontend tidak pernah dipercaya sebagai sumber izin.
- [ ] Tidak ada rahasia (service account, API key) di repo atau di bundle frontend.
- [ ] Endpoint publik punya rate limit dan validasi input (Zod).

**Reliability**
- [ ] Transaksi stok atomik dan idempoten; stok tidak pernah negatif.
- [ ] Ada script rekonsiliasi stok yang melaporkan 0 selisih.
- [ ] Trigger/function idempoten dan kegagalannya tercatat.
- [ ] Ada fallback saat layanan pihak ketiga gagal.
- [ ] `/health` memeriksa dependensi (Firestore) dan melaporkan status sebenarnya.

**Observability**
- [ ] Structured logging dengan correlation ID.
- [ ] Error tracking aktif untuk frontend dan backend.
- [ ] Uptime monitoring pada endpoint `/health`.
- [ ] `docs/OPERATIONS.md` + `docs/RUNBOOK.md` menjelaskan cara menangani masalah umum.

**Dokumentasi**
- [ ] `README.md` memuat deskripsi, screenshot/GIF, stack, cara menjalankan, akun demo, tautan deploy.
- [ ] `docs/PROJECT.md`, `docs/DATA-MODEL.md`, `docs/ARCHITECTURE.md`, `docs/API.md`, `docs/SECURITY.md`, `docs/TESTING.md`, `docs/DEPLOYMENT.md` lengkap.
- [ ] Minimal 4 ADR menjelaskan keputusan besar dan alasannya.
- [ ] `docs/ROADMAP.md` (file ini) diperbarui sesuai kenyataan.

**Deployment & demo**
- [ ] Frontend dan API ter-deploy dan dapat diakses publik via HTTPS.
- [ ] Ada akun demo untuk `admin`, `staff`, `viewer`.
- [ ] Data demo realistis dan konsisten.
- [ ] Skenario demo 5 menit dilatih dan berhasil tanpa error.
- [ ] Tag rilis `v1.0.0` ada; `CHANGELOG.md` terisi.

**Proses kerja**
- [ ] Riwayat git menunjukkan commit kecil dengan pesan jelas (Conventional Commits).
- [ ] Setiap fase punya Pull Request yang bisa ditelusuri, lengkap dengan deskripsi dan bukti.
- [ ] Minimal satu PR pernah di-review (oleh teman, mentor, atau AI agent) dan komentarnya ditindaklanjuti.

---

## 6. Cara mendemokan project (5 menit)

Tujuan demo: dalam 5 menit, recruiter harus melihat **masalah bisnis → solusi → bukti teknis**. Jangan menampilkan menu satu per satu. Bercerita.

**Persiapan sebelum demo**
- Buka aplikasi di tab yang sudah login `admin`, siapkan satu tab incognito untuk `staff`.
- Pastikan data demo bersih dan ada satu barang yang stoknya **sedikit di atas** `minStock` (supaya bisa dijatuhkan saat demo).
- Siapkan tab terminal dengan log API berjalan (untuk menunjukkan request nyata).
- Nyalakan timer 5 menit. Latih dua kali sebelumnya.

**Skenario (menit ke menit)**

| Waktu | Yang kamu lakukan | Yang kamu ucapkan / tunjukkan |
|---|---|---|
| 0:00–0:30 | Tunjukkan halaman login dan dashboard | "Ini sistem inventaris untuk perusahaan menengah. Tiga role: admin, staff, viewer. Masalah yang diselesaikan: stok tidak akurat, permintaan barang tidak terdokumentasi, dan tidak ada peringatan stok menipis." |
| 0:30–1:15 | Login sebagai `staff` di tab incognito, buat permintaan 2 barang | "Operator gudang mengajukan permintaan. Sebagai staff, saya hanya bisa melihat permintaan saya sendiri — coba saya akses URL halaman admin... ditolak, karena izin diperiksa di backend, bukan cuma disembunyikan di UI." |
| 1:15–2:00 | Login `admin`, buka antrean approval, setujui permintaan; lalu tetap sebagai `admin` tandai `fulfilled` | "Admin melihat antrean dan menyetujui. Saat saya menandai **fulfilled**, sistem otomatis membuat transaksi stok keluar dan memotong saldo — dalam satu operasi atomik. Kalau stok kurang, fulfill ditolak dengan pesan bagian mana yang kurang, bukan setengah jalan." |
| 2:00–2:45 | Buka detail barang, tunjukkan riwayat transaksi dengan `stockAfter` | "Setiap pergerakan tercatat sebagai ledger yang tidak bisa diedit. Setiap baris menyimpan saldo setelah transaksi, jadi kami bisa menjawab 'stok tanggal 3 berapa' tanpa menebak." |
| 2:45–3:30 | Input transaksi `out` sampai stok di bawah `minStock` | "Sekarang saya keluarkan stok di bawah ambang minimum... dan dalam beberapa detik notifikasi peringatan muncul — ini Cloud Function yang jalan otomatis karena ada perubahan data, bukan tombol yang saya tekan." |
| 3:30–4:10 | Buka dashboard dan laporan, export CSV | "Dashboard dihitung di server dengan aggregation, respons di bawah satu detik untuk ribuan transaksi. Laporan bisa difilter dan diekspor ke Excel untuk rapat." |
| 4:10–4:45 | Tunjukkan CI hijau, Firestore Rules, dan tab Network | "Setiap push menjalankan lint, typecheck, test, dan build otomatis. Security rules default-deny dan ada test-nya. Lihat di Network — API key pihak ketiga tidak pernah sampai ke browser karena semua lewat server." |
| 4:45–5:00 | Tunjukkan README dengan tautan deploy & akun demo | "Semua bisa dicoba di URL ini dengan akun demo. Dokumentasi arsitektur, API, dan operasional ada di folder docs. Terima kasih." |

**Tips agar demo meyakinkan**
- **Sebutkan angka.** "Respons dashboard 800 ms untuk 1.000 transaksi" jauh lebih kuat daripada "dashboard-nya cepat".
- **Tunjukkan kegagalan yang ditangani.** Menolak aksi ilegal dengan pesan jelas lebih meyakinkan daripada demo yang selalu berhasil.
- **Jangan menebak.** Kalau ditanya hal yang tidak kamu tahu, jawab "belum saya ukur, tapi cara mengukurnya begini..." — itu jawaban engineer.
- **Siapkan jawaban untuk pertanyaan lanjutan:** kenapa Firestore bukan SQL? kenapa saldo disimpan denormal? bagaimana kalau dua orang approve bersamaan? apa yang terjadi kalau Cloud Function gagal? bagaimana kamu tahu aplikasi down?

---

## Lampiran A — Peta file repo (target akhir)

```text
inventory-system/
├── apps/
│   ├── web/                     # React + TypeScript (Vite)
│   │   ├── src/
│   │   │   ├── components/      # UI & feedback (skeleton, error boundary)
│   │   │   ├── features/        # auth, items, stock, requests, dashboard, reports, notifications
│   │   │   ├── lib/             # firebaseClient, apiClient, errorTracking
│   │   │   ├── routes/          # router, ProtectedRoute
│   │   │   └── styles/          # design token
│   │   └── e2e/                 # Playwright
│   └── api/                     # Node.js + TypeScript
│       └── src/
│           ├── routes/          # /api/v1/*
│           ├── services/        # logika bisnis
│           ├── middlewares/     # authenticate, authorize, validate, errorHandler, idempotency, rateLimit, requestLogger
│           ├── integrations/    # klien pihak ketiga
│           └── utils/           # pagination, errors, httpClient, idempotency
├── functions/                   # Cloud Functions (trigger, scheduled, callable) — root, dideploy Firebase
│   └── src/
│       ├── triggers/            # onUserCreated, onStockTransactionCreated, lowStockAlert
│       ├── scheduled/           # dailyStockSummary
│       └── callable/            # sendLowStockEmail
├── packages/
│   └── shared/                  # tipe & skema yang dipakai web + api
├── scripts/                     # seed, set-role, reconcile-stock, seed-demo
├── docs/                        # PROJECT, DATA-MODEL, ARCHITECTURE, API, SECURITY,
│                                # TESTING, DEPLOYMENT, OPERATIONS, RUNBOOK, ROADMAP, adr/
├── .github/
│   ├── workflows/               # ci.yml, deploy.yml
│   └── pull_request_template.md
├── firebase.json
├── firestore.rules
├── storage.rules
├── firestore.indexes.json
└── README.md
```

> **Konvensi backend:** nama folder `middlewares/`, nama file middleware `authenticate.ts`/`authorize.ts`, dan kelas error `errors/AppError.ts` (selaras dengan `ARCHITECTURE.md` §4.2). Route memakai sufiks `Routes.ts` (mis. `itemRoutes.ts`).

## Lampiran B — Konvensi yang wajib konsisten

| Hal | Aturan | Contoh |
|---|---|---|
| Firestore collections | camelCase jamak | `users`, `categories`, `suppliers`, `divisions`, `units`, `items`, `warehouses`, `stockTransactions`, `requests`, `requestItems`, `auditLogs`, `notifications`, `functionRuns`, `cacheEntries`, `idempotencyKeys`, `dailyAggregates`, `settings` |
| REST endpoints | `/api/v1/...`, resource jamak, **kebab-case** | `GET /api/v1/items`, `POST /api/v1/requests`, `GET /api/v1/stock-transactions` |
| Role | `admin` \| `staff` \| `viewer` | — |
| Tipe transaksi stok | `in` \| `out` \| `adjustment` | — |
| Status transaksi stok | `completed` \| `cancelled` | — |
| Status permintaan | `draft` \| `submitted` \| `approved` \| `rejected` \| `fulfilled` \| `cancelled` | — |
| Nama branch | `feat/fase-<n>-<slug>` | `feat/fase-3-transaksi-stok` |
| Commit | Conventional Commits | `feat(items): ...`, `fix(auth): ...` |
| Judul PR | `<tipe>(fase-<n>): <ringkasan>` | `feat(fase-4): workflow approval permintaan barang` |

---

*Dokumen ini hidup. Setiap kali kenyataan berbeda dari rencana, ubah dokumen ini di PR yang sama dan tulis alasannya. Roadmap yang jujur lebih berguna daripada roadmap yang rapi tapi bohong.*
