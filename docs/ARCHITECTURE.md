# Arsitektur Teknis — Sistem Inventaris & Gudang

> **Proyek:** `inventory-system` — Sistem Inventaris & Gudang
> **Pemilik:** Dimas (Full Stack Developer)
> **Status dokumen:** Fase 0 — Fondasi (living document, akan diperbarui tiap fase)
> **Bahasa:** Indonesia

Dokumen ini menjelaskan **arsitektur teknis** sistem: bagaimana bagian-bagian sistem
tersusun, saling terhubung, dan **kenapa** keputusan itu diambil. Dokumen ini dibaca oleh
manusia (pemula–menengah) dan oleh AI agent yang menulis kode. Karena itu setiap keputusan
disertai alasan, bukan hanya daftar teknologi.

Dokumen ini **melengkapi**, bukan menggantikan:

- `docs/PROJECT.md` — kebutuhan bisnis, aturan bisnis (`BR-nn`), user story, dan ruang lingkup
  (**sumber kebenaran tunggal** untuk istilah, role, dan aturan).
- `docs/DATA-MODEL.md` — skema koleksi Firestore, field, indeks, dan relasi.
- `docs/API.md` — daftar endpoint REST, request/response, dan kode error.
- `docs/SECURITY.md` — model ancaman, matriks izin, serta Firestore/Storage rules.
- `docs/ROADMAP.md` — urutan fase pembangunan.

Konvensi penamaan (collection, endpoint, role, status) didefinisikan sekali di
**Lampiran A** dan dipakai konsisten di seluruh dokumen.

---

## 1. Gambaran Sistem

Sistem terdiri dari **dua aplikasi** dalam satu monorepo: satu SPA React di browser dan satu
REST API Node.js sebagai satu-satunya pintu masuk ke data. Firebase dipakai sebagai layanan
terkelola (Auth, Firestore, Storage, Cloud Functions).

```
                              ┌────────────────────────────────────────────────────┐
                              │                    BROWSER                          │
                              │  React SPA + TypeScript (Vite)                      │
                              │  React Router · TanStack Query · Firebase JS SDK     │
                              │  (Firebase SDK di browser HANYA untuk Auth/token)    │
                              └───────┬───────────────────────────────┬────────────┘
                                      │                               │
                     (1) login email/password            (3) HTTPS REST /api/v1/...
                     (2) minta ID token                   Authorization: Bearer <ID token>
                                      │                               │
                                      v                               v
                     ┌────────────────────────────┐   ┌──────────────────────────────────┐
                     │      FIREBASE AUTH          │   │   NODE.JS + TYPESCRIPT REST API   │
                     │  email/password             │   │   (Express / Fastify)             │
                     │  custom claims: role        │<──┤   route → controller → service    │
                     │  (admin | staff | viewer)   │(4)│              → repository         │
                     └────────────────────────────┘verify│   Firebase Admin SDK (server)   │
                                                    token└───────┬───────────────┬───────┘
                                                                 │               │
                                            (5) baca/tulis data │               │ (6) upload/unduh
                                                                 v               v
                                                     ┌──────────────────┐  ┌──────────────┐
                                                     │    FIRESTORE      │  │   STORAGE    │
                                                     │  (Native mode)    │  │  (lampiran,  │
                                                     │  users, items,    │  │   foto, PDF) │
                                                     │  stockTransactions│  └──────────────┘
                                                     │  requests, ...    │
                                                     └────────┬─────────┘
                                                              │ (7) trigger perubahan dokumen
                                                              v
                                              ┌──────────────────────────────────────┐
                                              │          CLOUD FUNCTIONS               │
                                              │  • HTTP callable (task ringan)         │
                                              │  • Firestore trigger (event-driven)    │
                                              │  • Scheduled (cron: cek stok menipis)  │
                                              └───────────────┬───────────────────────┘
                                                              │ (8) HTTP keluar (server-side)
                                                              v
                                              ┌──────────────────────────────────────┐
                                              │        LAYANAN PIHAK KETIGA            │
                                              │  • Email / WhatsApp gateway (notif)    │
                                              │  • API ekspedisi/kurir (resi)          │
                                              │  • Ekspor laporan (mis. Google Sheets) │
                                              └──────────────────────────────────────┘
```

### Cara membaca diagram

1. **Login** — user memasukkan email/password. Firebase Auth memverifikasi dan mengembalikan
   ID token (JWT) berisi `uid` dan custom claim `role`.
2. **Token** — SPA menyimpan sesi lewat Firebase SDK dan melampirkan ID token ke setiap request API.
3. **Request data** — semua operasi data bisnis lewat REST API `/api/v1/...`, **bukan** langsung
   ke Firestore (lihat Bagian 3 untuk alasannya).
4. **Verifikasi** — API memverifikasi ID token dengan Firebase Admin SDK, membaca `role` dari
   claim, dan memeriksa otorisasi sebelum menjalankan logika bisnis.
5. **Data** — API membaca/menulis Firestore lewat Admin SDK (bypass Security Rules, sehingga
   validasi & otorisasi **harus** ada di layer API).
6. **File** — lampiran (foto barang, dokumen permintaan) disimpan di Storage; API mengembalikan
   URL bertanda tangan (signed URL) agar file tidak publik.
7. **Event** — perubahan dokumen Firestore memicu Cloud Function (mis. permintaan berubah jadi
   `approved` → kirim notifikasi).
8. **Integrasi** — Cloud Function/API memanggil layanan pihak ketiga dari sisi server agar API key
   tidak pernah bocor ke browser.

### Prinsip arsitektur yang dipegang

- **Single source of truth** — Firestore adalah sumber kebenaran data. Tidak ada cache yang boleh
  mengalahkan data Firestore.
- **Satu pintu masuk** — hanya REST API yang menyentuh data bisnis. Browser tidak pernah menulis
  langsung ke Firestore.
- **Server adalah tempat rahasia** — kredensial pihak ketiga, service account, dan aturan bisnis
  hidup di server, bukan di bundel JavaScript yang bisa dibaca siapa pun.
- **Event-driven untuk hal yang tidak instan** — notifikasi, agregasi laporan, dan pengecekan stok
  berjalan asinkron lewat Cloud Functions, bukan memblokir request user.

---

## 2. Alasan Tiap Pilihan Teknologi

| Teknologi | Dipakai untuk | Kenapa dipilih | Alternatif yang ditolak & alasannya |
|---|---|---|---|
| **React** | UI SPA (web) | Ekosistem terbesar, komponen deklaratif cocok untuk tabel/form data yang banyak, permintaan pasar kerja paling tinggi untuk posisi yang dituju. | **Vue** — bagus, tapi nilai portofolio untuk JD target lebih rendah. **Svelte** — DX bagus, ekosistem & lowongan lebih sedikit. **Angular** — boilerplate berat untuk proyek satu orang. |
| **TypeScript** | Seluruh frontend & backend | Menangkap bug tipe saat compile, bukan saat produksi. Tipe bersama antara web & API (via `packages/shared`) mencegah "kontrak" frontend–backend melenceng. | **JavaScript murni** — lebih cepat mulai, tapi pada codebase besar (target JD: "membaca existing codebase besar") tipe adalah dokumentasi yang tidak bisa basi. |
| **Vite** | Build tool & dev server frontend | Dev server instan (ESM native, HMR cepat), konfigurasi ringan, build produksi memakai Rollup. | **Create React App** — sudah tidak dirawat, build lambat. **Webpack manual** — terlalu banyak konfigurasi untuk hasil yang sama. **Next.js** — SSR tidak dibutuhkan aplikasi internal yang butuh login; menambah kompleksitas tanpa manfaat. |
| **React Router** | Routing & proteksi halaman di SPA | Standar de-facto React, mendukung route bersarang (layout dashboard + halaman anak) dan loader/guard berbasis role. | **TanStack Router** — type-safety lebih baik, tapi ekosistem & contoh lebih sedikit. **Routing manual** — tidak scalable. |
| **TanStack Query** | Data server di frontend: cache, refetch, mutation, state loading/error | Menghapus 90% kode state manual. Cache, invalidasi setelah mutasi, retry, dan optimistic update sudah bawaan. Ini yang membuat UI terasa cepat dan konsisten. | **Redux Toolkit Query** — powerful tapi boilerplate lebih berat untuk skala ini. **SWR** — lebih ringan tapi fitur mutation/invalidasi kurang lengkap. **`useEffect` + `useState` manual** — sumber bug race condition & stale data. |
| **Node.js** | Runtime backend | Bahasa yang sama (TS) di frontend & backend, jadi satu toolchain & satu set tipe. Ekosistem Firebase Admin SDK paling matang di Node. Asynchronous I/O cocok untuk beban I/O-bound (panggilan DB & API eksternal). | **PHP/Laravel** — produktif, tapi tidak sejalan dengan JD (React + Node). **Go/Java** — performa lebih tinggi, tapi tidak dibutuhkan dan menambah bahasa yang harus dikuasai. |
| **Express / Fastify** | Framework HTTP REST API | Ringan, middleware jelas, mudah dites. Fastify menawarkan validasi skema & performa lebih tinggi; Express menawarkan ekosistem & contoh lebih banyak. **Keputusan final ditunda ke Fase 0 akhir** (lihat Bagian 9) — keduanya cocok, pola lapisan di Bagian 6 tidak berubah. | **NestJS** — struktur bagus tapi "magic" decorator berat untuk pemula dan sulit dijelaskan di wawancara. **Serverless function per endpoint tanpa framework** — sulit dikelola saat endpoint bertambah. |
| **Firestore** | Database utama (Native mode) | Skalabilitas otomatis, terintegrasi mulus dengan Auth/Storage/Functions, gratis untuk skala proyek ini. Skema dokumen fleksibel untuk data master yang berubah. Firestore *memang* punya realtime listener, tetapi fitur itu **sengaja tidak dipakai** karena data bisnis hanya boleh lewat REST API (lihat Bagian 3) — kompensasinya polling/refetch TanStack Query. | **PostgreSQL** — query relasional & transaksi lebih kuat, tapi menambah beban ops (hosting, migrasi, koneksi pool) dan tidak selaras dengan stack Firebase di JD. **MongoDB** — mirip Firestore tapi tanpa integrasi Auth/Functions. **MySQL** — sama, plus skema kaku. |
| **Firebase Authentication** | Login email/password + role lewat custom claims | Sudah termasuk hashing password, reset password, verifikasi email, dan penerbitan JWT. Custom claims menyimpan `role` tanpa query DB tambahan di setiap request. | **Auth buatan sendiri** — risiko keamanan tinggi (hashing, session, reset) dan tidak sepadan. **Auth0/Clerk** — bagus, tapi biaya & integrasi Firebase jadi berlapis. |
| **Cloud Functions** | Otomasi: HTTP callable, Firestore trigger, scheduled | Menjalankan logika "di belakang layar" tanpa server yang harus diurus. Cocok untuk notifikasi, agregasi laporan, dan cron stok menipis. | **Cron di VM sendiri** — perlu maintain server. **Semua logika di REST API** — request user jadi lambat dan rawan timeout untuk pekerjaan panjang. |
| **Firebase Storage** | Simpan lampiran (foto barang, dokumen permintaan) | Terintegrasi dengan Auth (aturan akses per user/role), CDN bawaan, mendukung signed URL untuk akses terkontrol. | **Simpan file sebagai base64 di Firestore** — dokumen Firestore dibatasi ~1 MiB, mahal, dan lambat. **S3 langsung dari browser** — menambah penyedia & manajemen kredensial. |
| **Firebase Hosting** *(kandidat)* | Hosting SPA | Deploy satu perintah (`firebase deploy`), CDN global, HTTPS otomatis, rewrite SPA sederhana. | **Vercel** — DX sangat baik untuk frontend; kandidat alternatif (lihat Bagian 8). **Netlify** — serupa. |

---

## 3. Kenapa Node REST API Terpisah, Bukan Langsung dari Frontend ke Firestore

Ini keputusan arsitektur **paling penting** di dokumen ini, karena menentukan di mana logika
bisnis hidup dan seberapa aman sistem. Firebase memungkinkan frontend berbicara **langsung** ke
Firestore lewat Firebase JS SDK, dengan Firestore Security Rules sebagai penjaga. Kami memilih
**tidak** melakukan itu untuk data bisnis. Berikut trade-off-nya secara jujur.

### Alasan memilih REST API terpisah

1. **Keamanan logika bisnis, bukan sekadar aturan baca/tulis.**
   Security Rules bagus untuk menjawab "bolehkah user ini menulis dokumen ini?". Rules **buruk**
   untuk logika berlapis seperti: "stok tidak boleh minus", "harga beli tidak boleh diubah setelah
   transaksi disetujui", atau "permintaan hanya boleh di-approve oleh admin dari divisi terkait".
   Logika semacam itu butuh membaca beberapa dokumen, menghitung, lalu memutuskan — hal yang wajar
   di kode server, tapi menyiksa (dan mudah salah) di DSL Rules.

2. **Validasi terpusat dan tidak bisa dilewati.**
   Validasi di klien bisa dimatikan (DevTools, curl). Validasi di Security Rules hanya berlaku
   untuk akses dari SDK klien. Dengan REST API, **satu** tempat validasi (skema request) berlaku
   untuk semua klien — web hari ini, aplikasi mobile atau integrasi apa pun nanti.

3. **Konsistensi & operasi atomik lintas koleksi.**
   Contoh nyata: menyimpan transaksi stok `out` harus **sekaligus** mengurangi `items.currentStock`
   (dan menghitung ulang `isLowStock`/`stockGap`) dalam satu transaksi Firestore di server
   (batch/transaction) yang dijamin konsisten. Dari klien, logika multi-dokumen seperti ini harus
   direplikasi di Rules atau diserahkan ke Cloud Function, jadi alurnya terpecah.
   (Entri `auditLogs` **tidak** ditulis di transaksi ini, melainkan oleh trigger `onWrite`
   terpisah — lihat BR-04; pemisahan ini mencegah entri audit ganda.)

4. **Kemampuan laporan agregat.**
   Laporan "stok per kategori", "nilai persediaan", "tren barang keluar bulanan" butuh query
   gabungan dan agregasi. Firestore tidak punya `JOIN` dan agregasi dari klien terbatas. Di server
   kita bisa menggabungkan beberapa query, memakai aggregation query, atau menyimpan hasil
   pre-agregasi. Di klien, pilihan itu tertutup.

5. **Biaya & jumlah pembacaan.**
   Query langsung dari klien membebankan pembacaan pada setiap sesi user dan mudah memicu
   pembacaan berulang yang tidak terkontrol. API server bisa meng-cache, memaginasi, dan
   membatasi field yang dikirim (field projection), sehingga jumlah pembacaan lebih hemat.

6. **Kemudahan testing.**
   Layer service dan repository di API bisa diuji dengan unit test tanpa browser, tanpa emulator
   Firestore di klien, dan tanpa memalsukan SDK Firebase JS. Ini penting untuk target JD:
   *testing* dan *refactoring aman*.

7. **Integrasi pihak ketiga & rahasia.**
   API key email/WhatsApp gateway, token ekspedisi, dan service account **tidak boleh** ada di
   bundel frontend. REST API adalah tempat alami untuk memanggil layanan eksternal.

8. **Satu kontrak untuk banyak klien & versi.**
   Endpoint `/api/v1/...` memberi titik versioning. Mengubah bentuk data untuk web tidak otomatis
   merusak klien lain, dan deprecation bisa dikelola.

9. **Audit & observability.**
   Semua perubahan melewati satu jalur, sehingga mudah mencatat `auditLogs`, mengukur latensi per
   endpoint, dan menelusuri masalah setelah rilis — langsung menjawab kebutuhan JD soal
   *monitoring* dan *penanganan masalah setelah release*.

### Trade-off yang harus diterima

- **Lebih banyak kode & latensi satu hop.** Setiap operasi menambah perjalanan jaringan
  browser → API → Firestore. Untuk aplikasi internal dengan puluhan–ratusan user, ini tidak
  terasa.
- **Kehilangan realtime instan dari SDK klien.** Kami mengompensasi dengan **polling/refetch
  TanStack Query** dan Cloud Function untuk hal yang benar-benar perlu segera. Jika nanti butuh
  realtime penuh, API bisa membuka endpoint SSE/WebSocket — tetap satu pintu.
- **Perlu mengelola hosting API.** Ini biaya ops yang dibayar dengan kejelasan arsitektur.

### Kapan "langsung ke Firestore" justru lebih baik

Pendekatan klien langsung ke Firestore **unggul** pada kondisi berikut — dan kami sengaja tetap
memakainya untuk sebagian hal:

- **Prototipe cepat / spike.** Saat membuktikan ide, melewati API mempercepat iterasi.
- **Data yang benar-benar privat per user.** Mis. preferensi UI user, notifikasi milik user
  sendiri — aturan `request.auth.uid == resource.data.uid` sangat sederhana dan aman.
- **Fitur realtime kolaboratif** seperti papan status yang harus berubah seketika untuk semua
  orang di ruangan yang sama.
- **Aplikasi tanpa logika bisnis** — CRUD murni tanpa validasi silang, tanpa agregasi.
- **Tim yang ingin nol backend ops** dan bersedia memindahkan logika ke Cloud Functions.

**Keputusan untuk proyek ini:** data bisnis inti (`items`, `stockTransactions`, `requests`,
`categories`, `suppliers`, `users`) **wajib** lewat REST API. Data UI yang murni milik user
(mis. preferensi tampilan) boleh langsung ke Firestore bila nanti diperlukan. Batas ini dicatat
agar tidak ada yang "mengakali" arsitektur tanpa sengaja.

---

## 4. Struktur Folder

Monorepo dengan **dua aplikasi** (`apps/web`, `apps/api`) dan **satu paket bersama**
(`packages/shared`). Alasannya: web dan API harus memakai **definisi tipe, status, dan role yang
sama persis**. Jika tipe disalin dua kali, cepat atau lambat keduanya berbeda dan muncul bug
kontrak. Monorepo juga memudahkan satu perintah untuk lint/typecheck/test semua bagian.

```
inventory-system/
├─ apps/
│  ├─ web/                 # React SPA (TypeScript + Vite)
│  └─ api/                 # Node.js REST API (TypeScript)
├─ packages/
│  └─ shared/              # Tipe, skema, konstanta yang dipakai web & api
├─ functions/              # Cloud Functions (HTTP callable, trigger, scheduled)
├─ docs/                   # Dokumen teknis (PROJECT, arsitektur, data model, API, security, roadmap)
├─ scripts/                # Skrip automasi: seed data, migrasi, admin tools
├─ .github/workflows/      # CI/CD (lint, typecheck, test, build, deploy)
├─ firebase.json           # Konfigurasi Hosting, Functions, Firestore, Storage
├─ firestore.rules         # Security Rules (defense-in-depth)
├─ firestore.indexes.json  # Definisi indeks komposit Firestore
├─ storage.rules           # Aturan akses Firebase Storage
├─ package.json            # Root workspace (npm workspaces): skrip lint/test/build gabungan
├─ tsconfig.base.json      # Konfigurasi TypeScript bersama, diperluas tiap app
└─ README.md
```

### 4.1 `apps/web` — React SPA

```
apps/web/
├─ public/                     # Aset statis yang disajikan apa adanya (favicon, robots.txt)
├─ src/
│  ├─ main.tsx                 # Entry point: mount React, pasang provider
│  ├─ App.tsx                  # Root component + definisi routing
│  ├─ routes/                  # Halaman per-route (satu folder per fitur besar)
│  │  ├─ login/                # Halaman login
│  │  ├─ dashboard/            # Ringkasan stok, permintaan pending, grafik
│  │  ├─ items/                # Daftar & form barang (master data)
│  │  ├─ categories/           # Master kategori
│  │  ├─ suppliers/            # Master supplier
│  │  ├─ stock/                # Transaksi stok: in / out / adjustment
│  │  ├─ requests/             # Permintaan barang + alur approval
│  │  ├─ reports/              # Laporan & ekspor
│  │  └─ users/                # Kelola user (khusus admin)
│  ├─ components/              # Komponen UI yang dapat dipakai ulang
│  │  ├─ ui/                   # Primitif: Button, Input, Modal, Table, Badge
│  │  ├─ layout/               # Shell aplikasi: sidebar, header, guard role
│  │  └─ shared/               # Komponen domain generik: Pagination, EmptyState
│  ├─ features/                # Logika per-domain (hook + query key + tipe turunan)
│  │  ├─ items/
│  │  │  ├─ useItems.ts        # useQuery: daftar & detail barang
│  │  │  ├─ useCreateItem.ts   # useMutation: buat barang + invalidasi cache
│  │  │  └─ keys.ts            # Query key terpusat agar invalidasi konsisten
│  │  ├─ stock/                # Hook transaksi stok
│  │  ├─ requests/             # Hook permintaan & approval
│  │  └─ auth/                 # useAuth, useRole, guard
│  ├─ lib/
│  │  ├─ apiClient.ts          # Wrapper fetch: base URL, token, error handling
│  │  ├─ firebase.ts           # Inisialisasi Firebase JS SDK (Auth saja)
│  │  ├─ queryClient.ts        # Konfigurasi TanStack Query (retry, staleTime)
│  │  └─ format.ts             # Format tanggal, angka, mata uang (locale id-ID)
│  ├─ hooks/                   # Hook generik non-domain: useDebounce, useMediaQuery
│  ├─ styles/                  # Tema, variabel CSS, reset
│  └─ types/                   # Tipe khusus UI (re-export dari packages/shared)
├─ index.html                  # Template HTML Vite
├─ vite.config.ts              # Konfigurasi Vite (alias, proxy dev ke API)
├─ tsconfig.json               # extends ../../tsconfig.base.json
└─ package.json
```

**Catatan:** folder `routes/` = "halaman", `features/` = "otak data halaman". Memisahkan
keduanya membuat komponen tampilan tidak berisi detail fetch/cache.

### 4.2 `apps/api` — Node REST API

```
apps/api/
├─ src/
│  ├─ server.ts                # Entry point: buat instance app, listen port
│  ├─ app.ts                   # Rakit middleware & daftarkan semua route
│  ├─ config/
│  │  ├─ env.ts                # Baca & validasi environment variables (fail-fast)
│  │  └─ firebase.ts           # Inisialisasi Firebase Admin SDK (singleton)
│  ├─ routes/                  # HANYA definisi path → controller (tanpa logika)
│  │  ├─ index.ts              # Gabungkan semua router di bawah /api/v1
│  │  ├─ itemRoutes.ts
│  │  ├─ stockRoutes.ts
│  │  ├─ requestRoutes.ts
│  │  ├─ categoryRoutes.ts
│  │  ├─ supplierRoutes.ts
│  │  ├─ userRoutes.ts
│  │  └─ reportRoutes.ts
│  ├─ controllers/             # Terjemahkan HTTP ⇄ service (req/res, status code)
│  │  ├─ itemController.ts
│  │  └─ ...
│  ├─ services/                # Logika bisnis + aturan domain (jantung sistem)
│  │  ├─ itemService.ts
│  │  ├─ stockService.ts       # Validasi stok, transaksi atomik
│  │  ├─ requestService.ts     # Alur status permintaan & approval
│  │  └─ reportService.ts      # Agregasi laporan
│  ├─ repositories/            # Satu-satunya tempat yang bicara ke Firestore
│  │  ├─ itemRepository.ts
│  │  ├─ stockRepository.ts
│  │  └─ ...
│  ├─ middlewares/
│  │  ├─ authenticate.ts       # Verifikasi ID token → isi req.user
│  │  ├─ authorize.ts          # Cek role (admin/staff/viewer) per route
│  │  ├─ validate.ts           # Validasi body/query dengan skema
│  │  ├─ errorHandler.ts       # Ubah error → response JSON standar
│  │  └─ requestLogger.ts      # Log terstruktur tiap request
│  ├─ errors/
│  │  └─ AppError.ts           # Kelas error domain (NotFound, Forbidden, Conflict)
│  ├─ utils/                   # Helper murni: pagination, tanggal, id, uang
│  ├─ integrations/            # Klien layanan pihak ketiga (dipakai service/functions)
│  │  ├─ emailClient.ts
│  │  └─ shippingClient.ts
│  └─ types/                   # Tipe internal API (RequestWithUser, dsb.)
├─ test/                       # Test integrasi endpoint (supertest) & fixture
├─ tsconfig.json
└─ package.json
```

### 4.3 `packages/shared` — Kontrak bersama

```
packages/shared/
├─ src/
│  ├─ types/                   # Tipe entitas: Item, StockTransaction, Request, User
│  ├─ schemas/                 # Skema validasi (mis. Zod) untuk request/response
│  ├─ constants/               # ROLES, TRANSACTION_TYPES, REQUEST_STATUSES, COLLECTIONS
│  ├─ dtos/                    # Bentuk payload API (CreateItemDto, dst.)
│  └─ index.ts                 # Re-export publik paket
└─ package.json
```

Dipakai bersama supaya:

- Web memakai tipe `Item` yang **sama** dengan yang dipakai API — mustahil "beda kontrak".
- Konstanta status (`'in' | 'out' | 'adjustment'`) tidak pernah ditulis ulang sebagai string
  bebas di kode — typo menjadi error compile, bukan bug produksi.

### 4.4 `functions/` — Cloud Functions

```
functions/
├─ src/
│  ├─ index.ts                 # Ekspor semua function
│  ├─ callable/                # HTTP callable (dipanggil SPA dengan konteks auth)
│  ├─ triggers/                # Firestore trigger (onDocumentWritten = onWrite)
│  │  ├─ auditLogWriter.ts     # SATU-SATUNYA penulis auditLogs (idempoten via event.id, BR-04)
│  │  ├─ onStockTransactionWritten.ts
│  │  └─ onRequestStatusChanged.ts
│  └─ scheduled/               # Fungsi terjadwal (cron)
│     └─ lowStockAlert.ts
└─ package.json
```

**Catatan idempotensi (penting).** Cloud Function trigger dapat dipicu **lebih dari sekali** untuk
peristiwa yang sama (retry bawaan Cloud Functions). Karena itu:

- Trigger penulis `auditLogs` **wajib idempoten** — pakai `event.id` sebagai ID dokumen log
  (lihat BR-04 di PROJECT.md dan skema `auditLogs` di DATA-MODEL.md §3.10) sehingga retry tidak
  menghasilkan entri ganda.
- **Hanya satu mekanisme** yang menulis `auditLogs`: trigger `onWrite`, **bukan** service/transaksi
  API. Ini mencegah satu aksi menghasilkan dua entri audit (dobel). Lihat BR-04.
- Untuk aksi yang tidak bisa ditangkap trigger dokumen (mis. login, ekspor laporan, percobaan akses
  403), audit ditulis oleh Cloud Function/Auth trigger terkait — tetap idempoten.

---

## 5. Alur Request: User Klik "Simpan Barang"

Contoh ini menelusuri satu aksi dari klik tombol sampai data tersimpan di Firestore, menyebut
**setiap lapisan** yang dilewati dan **apa yang terjadi** di dalamnya. Kasusnya: staff menambah
barang baru di halaman Master Barang.

```
[1] Komponen   ItemForm.tsx
      │  onSubmit(formValues)
      v
[2] Hook       useCreateItem()  (TanStack Query useMutation)
      │  mutationFn: (dto) => itemApi.create(dto)
      v
[3] API Client lib/apiClient.ts
      │  ambil ID token dari Firebase Auth → fetch POST /api/v1/items
      v
[4] Endpoint   POST /api/v1/items        (middleware chain)
      │  requestLogger → authenticate → authorize('admin','staff') → validate(schema)
      v
[5] Route      itemRoutes.ts  →  itemController.create
      v
[6] Controller itemController.ts
      │  baca req.body + req.user → panggil service → kirim HTTP 201 + body
      v
[7] Service    itemService.createItem(dto, actor)
      │  cek SKU unik, cek kategori ada, hitung field turunan, buat audit log
      v
[8] Repository itemRepository.create(data)
      │  Firestore Admin SDK: collection('items').add(...) / transaction
      v
[9] Firestore  dokumen tersimpan di collection items
```

### Rincian per lapisan

1. **Komponen (`ItemForm.tsx`)** — Menampilkan form, validasi cepat di klien (mis. field wajib),
   lalu memanggil hook. Komponen **tidak tahu** URL API dan **tidak** memanggil `fetch` langsung.
   Ini membuatnya mudah diuji dan diganti tampilannya.

2. **Hook (`useCreateItem`)** — `useMutation` dari TanStack Query. Tanggung jawabnya:
   - memanggil API client,
   - saat sukses: **invalidasi query key** `['items']` sehingga daftar barang otomatis di-refetch,
   - mengekspos `isPending` / `isError` untuk tombol loading dan pesan error,
   - (opsional) menutup modal & menampilkan toast.

3. **API client (`lib/apiClient.ts`)** — Wrapper tunggal untuk semua panggilan HTTP:
   - menyisipkan `baseUrl` dari env,
   - mengambil ID token terbaru (`await auth.currentUser.getIdToken()`),
   - mengirim header `Authorization: Bearer <token>` dan `Content-Type: application/json`,
   - menormalkan error (mis. 401 → lempar `UnauthorizedError` yang bisa ditangani UI),
   - menjadi satu tempat untuk nanti menambah retry/timeout/tracing.

4. **Endpoint & middleware** — Sebelum menyentuh controller, request melewati rantai:
   - `requestLogger` mencatat method, path, durasi, status,
   - `authenticate` memverifikasi ID token lewat Firebase Admin SDK → mengisi `req.user`
     (`uid`, `role`),
   - `authorize('admin','staff')` menolak `viewer` dengan HTTP 403,
   - `validate(itemSchema)` memastikan bentuk body benar; jika tidak → HTTP 400 dengan detail field.

5. **Route** — Hanya peta `method + path → controller`. Tidak ada logika bisnis di sini, agar
   daftar endpoint mudah dibaca seperti daftar isi.

6. **Controller** — Menerjemahkan dunia HTTP ke dunia domain:
   - membaca `req.body`, `req.query`, `req.params`, dan `req.user`,
   - memanggil **satu** method service,
   - memilih status code (201 Created) dan bentuk response,
   - meneruskan error ke `errorHandler` (tidak menangani detail teknis sendiri).

7. **Service** — Jantung aturan bisnis, tidak tahu HTTP:
   - memastikan **SKU unik** (query repository),
   - memastikan `categoryId` benar-benar ada,
   - menetapkan `currentStock` awal, `createdAt`, `createdBy` dari `actor`,
   - **tidak** menulis `auditLogs` sendiri: entri audit dibuat oleh Firestore trigger
     `onWrite` (satu-satunya penulis `auditLogs`, idempoten via `event.id`; skema normatif ada di
     PROJECT.md §9.10 dan DATA-MODEL.md §3.10, aturannya di BR-04),
   - melempar `ConflictError` bila SKU duplikat — controller yang mengubahnya jadi HTTP 409.

8. **Repository** — Satu-satunya lapisan yang mengimpor Firestore Admin SDK:
   - menyusun referensi koleksi (`items`), menulis dokumen,
   - membungkus operasi multi-dokumen dalam transaksi/batch bila perlu,
   - mengembalikan **objek domain**, bukan snapshot mentah, agar service tidak tergantung API SDK.

9. **Firestore** — Dokumen tersimpan. Cloud Function trigger (bila ada) dapat bereaksi, dan
   dashboard user lain akan melihat data baru pada refetch berikutnya.

### Jika gagal di tengah jalan

- Validasi klien gagal → tidak ada request dikirim.
- Validasi server gagal → HTTP 400, UI menampilkan error per field.
- Token tidak valid/kadaluarsa → HTTP 401, API client mencoba refresh token; jika tetap gagal,
  user diarahkan ke halaman login.
- Role tidak berhak → HTTP 403, UI menampilkan pesan "tidak punya akses".
- SKU duplikat → HTTP 409, form menyorot field SKU.
- Kegagalan Firestore → HTTP 500/503, error dicatat di log server, UI menampilkan pesan generik
  (tanpa membocorkan detail internal) + tombol coba lagi.

---

## 6. Lapisan Backend

Backend memakai pola **route → controller → service → repository**. Empat lapisan ini bukan
birokrasi — masing-masing punya satu alasan untuk ada, dan memisahkannya membuat kode bisa
diubah tanpa merusak bagian lain.

### 6.1 Tanggung jawab tiap lapisan

| Lapisan | Tahu tentang | TIDAK tahu tentang | Contoh tanggung jawab |
|---|---|---|---|
| **Route** | Method HTTP, path, middleware mana yang dipasang | Cara data disimpan | `router.post('/items', authenticate, authorize('admin','staff'), validate(itemSchema), itemController.create)` |
| **Controller** | `req`/`res`, status code, bentuk response | Query Firestore, aturan bisnis | Ubah body → panggil `itemService.createItem(dto, req.user)`, balas 201 |
| **Service** | Aturan bisnis domain, memanggil repository & integrasi | HTTP, Firestore SDK langsung | "Stok tidak boleh minus", "hanya admin boleh approve", hitung nilai persediaan |
| **Repository** | Firestore Admin SDK, nama koleksi, bentuk dokumen | Aturan bisnis, HTTP | `items.doc(id).set(...)`, query dengan filter & paginasi, transaksi |

### 6.2 Kenapa dipisah, bukan satu file besar

1. **Perubahan terisolasi.** Ganti Firestore ke database lain? Hanya `repositories/` yang berubah.
   Ganti framework HTTP (Express ⇄ Fastify)? Hanya `routes/` + `controllers/` yang berubah.
   Aturan bisnis di `services/` tetap utuh. Ini inti dari "refactoring aman & maintainable".

2. **Bisa diuji tanpa server.** Service diuji dengan repository palsu (mock) — cepat, tanpa
   jaringan, tanpa emulator. Repository diuji terhadap Firestore Emulator. Controller diuji
   dengan HTTP request palsu. Setiap lapisan punya jenis test yang tepat, sesuai kebutuhan JD
   soal *testing*.

3. **Tidak ada logika bisnis yang "nyasar" di controller.** Ini kesalahan paling umum di
   codebase besar: controller membengkak sampai 800 baris. Dengan aturan "controller hanya
   menerjemahkan", batas itu dijaga.

4. **Satu aturan bisnis, satu tempat.** Contoh: "transaksi stok `out` tidak boleh melebihi stok".
   Aturan ini hidup **hanya** di `stockService`. Jika ia tersebar di beberapa controller atau di
   Firestore Rules saja, cepat atau lambat salah satu salinan tertinggal saat aturan berubah.

5. **Onboarding & code review lebih cepat.** Pembaca baru (manusia atau AI agent) tahu harus
   mencari apa di mana. Reviewer bisa menilai "apakah aturan bisnis ini benar?" tanpa terganggu
   detail HTTP.

### 6.3 Contoh nyata: transaksi stok `out`

```
POST /api/v1/stock-transactions   { type: 'out', divisionId, lines: [{ itemId, quantity }], note }
        │
route        stockRoutes.ts        → pasang authenticate + authorize('admin','staff') + validate
        │
controller   stockController.create → panggil stockService.recordTransaction(dto, actor)
        │
service      stockService.recordTransaction
        │    1. untuk tiap baris lines[]: ambil item via itemRepository.findById(itemId) → 404 bila tidak ada
        │    2. bila type === 'out' dan item.currentStock < quantity → 422 (stok tidak cukup)
        │    3. buka Firestore transaction:
        │         • expand lines[] → satu dokumen stockTransactions per item
        │           (status: 'completed', berbagi batchId)
        │         • update items.currentStock (kurangi) + hitung ulang isLowStock/stockGap
        │         (tidak menulis auditLogs — ditangani trigger onWrite)
        │    4. kembalikan transaksi yang sudah dibuat
        │
repository   stockRepository.createWithStockUpdate(...)  → menjalankan transaksi atomik
        │
Firestore    stockTransactions bertambah, items.currentStock turun;
             trigger onWrite menulis auditLogs (lihat BR-04)
```

Perhatikan: controller tidak menghitung stok, service tidak menyentuh HTTP, repository tidak
tahu apa itu "stok tidak boleh minus". Setiap lapisan melakukan satu hal.

### 6.4 Aturan lintas lapisan (agar konsisten)

- **Jangan lewati lapisan.** Controller tidak boleh memanggil repository langsung; route tidak
  boleh berisi logika. Kalau ada kebutuhan "cepat", tanyakan dulu apakah aturan bisnisnya benar.
- **Repository selalu mengembalikan objek domain**, bukan `DocumentSnapshot` mentah, supaya
  service tidak terikat API Firestore.
- **Error memakai kelas domain** (`AppError` dan turunannya). `errorHandler` global yang
  memetakan ke status HTTP. Ini membuat pesan error konsisten di seluruh API.
- **Tidak ada kredensial atau keputusan otorisasi di frontend.** Frontend boleh *menyembunyikan*
  tombol berdasarkan role demi UX, tapi keputusan sebenarnya selalu di server.

---

## 7. Konfigurasi & Environment

Nama variabel di bawah ini saja — **nilai rahasia tidak ditulis di dokumen ini maupun di git**.

### 7.1 Frontend (`apps/web`) — variabel publik

Hanya variabel ber-prefix `VITE_` yang terekspos ke browser. **Jangan pernah** menaruh rahasia di sini.

| Variabel | Kegunaan |
|---|---|
| `VITE_API_BASE_URL` | Base URL REST API (mis. `http://localhost:8080/api/v1` saat dev) |
| `VITE_FIREBASE_API_KEY` | Konfigurasi Firebase JS SDK (API key ini memang publik, dilindungi Rules) |
| `VITE_FIREBASE_AUTH_DOMAIN` | Domain Firebase Auth |
| `VITE_FIREBASE_PROJECT_ID` | ID proyek Firebase |
| `VITE_FIREBASE_APP_ID` | ID aplikasi Firebase |
| `VITE_APP_ENV` | Penanda lingkungan: `development` \| `staging` \| `production` |

> **Kenapa tidak ada `VITE_FIREBASE_STORAGE_BUCKET` / `VITE_FIREBASE_MESSAGING_SENDER_ID`?**
> Firebase JS SDK di browser dipakai **hanya untuk Auth/token** (lihat §1 & §3), bukan untuk
> Storage atau FCM. Upload lampiran lewat REST API (Admin SDK), jadi SDK klien tidak butuh
> `storageBucket` maupun `messagingSenderId`. Bila kelak Storage/FCM dipakai langsung dari klien,
> tambahkan `VITE_FIREBASE_STORAGE_BUCKET` (dan `VITE_FIREBASE_MESSAGING_SENDER_ID`) di sini
> **dan** sesuaikan contoh config di SECURITY.md §7.1.

### 7.2 Backend (`apps/api`) — variabel rahasia

| Variabel | Kegunaan |
|---|---|
| `NODE_ENV` | `development` \| `test` \| `production` |
| `PORT` | Port HTTP server |
| `FIREBASE_PROJECT_ID` | ID proyek Firebase yang diakses Admin SDK |
| `FIREBASE_CLIENT_EMAIL` | Service account Admin SDK (dari kredensial) |
| `FIREBASE_PRIVATE_KEY` | Private key service account (rahasia) |
| `GOOGLE_APPLICATION_CREDENTIALS` | Alternatif: path ke file service account (khusus dev) |
| `CORS_ALLOWED_ORIGINS` | Daftar origin yang diizinkan (dipisah koma) |
| `LOG_LEVEL` | Tingkat log: `debug` \| `info` \| `warn` \| `error` |
| `EMAIL_API_KEY` | Kunci gateway email (integrasi pihak ketiga) |
| `WHATSAPP_API_KEY` | Kunci gateway WhatsApp (bila dipakai) |
| `SHIPPING_API_KEY` | Kunci API ekspedisi/kurir (bila dipakai) |
| `STORAGE_BUCKET` | Nama bucket Firebase Storage untuk lampiran |

### 7.3 Cloud Functions (`functions/`)

| Variabel | Kegunaan |
|---|---|
| `NOTIFICATION_CHANNEL` | Saluran notifikasi aktif: `email` \| `whatsapp` |
| `LOW_STOCK_THRESHOLD_DEFAULT` | Ambang default stok menipis (bila item tidak punya ambang sendiri) |
| `REPORT_BUCKET` | Bucket tujuan untuk menyimpan hasil laporan terjadwal |
| `EMAIL_API_KEY` / `WHATSAPP_API_KEY` | Kunci integrasi (sama seperti API) |

### 7.4 Di mana disimpan: dev vs production

| Lingkungan | Cara menyimpan | Alasan |
|---|---|---|
| **Dev (lokal)** | File `.env` di root tiap app, **tidak di-commit**. Disediakan `.env.example` sebagai daftar nama variabel. | Nyaman untuk iterasi; `.gitignore` mencegah rahasia bocor ke repo. |
| **Dev (uji coba Firebase)** | Firebase Emulator Suite; kredensial emulator di-set oleh CLI, tidak butuh service account asli. | Menguji Auth/Firestore/Functions tanpa menyentuh data produksi. |
| **CI (GitHub Actions)** | GitHub **Secrets** & **Variables**, disuntik saat job berjalan. | Rahasia tidak pernah ada di kode; setiap PR bisa menjalankan lint/typecheck/test. |
| **Production (API)** | Environment variables di platform hosting (Cloud Run → Secret Manager; Render → dashboard Environment/Secret Files). | Rahasia dikelola platform, bisa dirotasi, tidak ikut ke image/container. |
| **Production (Frontend)** | Variabel `VITE_*` disuntik saat build (Hosting/Vercel env). | Nilainya memang publik; yang dilindungi adalah Rules Firebase, bukan nilai ini. |
| **Production (Functions)** | Konfigurasi Functions (env/secret terkelola). | Sama seperti API; akses ke secret dikontrol. |

**Prinsip:** `config/env.ts` **memvalidasi** variabel wajib saat startup dan gagal cepat
(fail-fast) bila ada yang hilang. Lebih baik aplikasi menolak jalan daripada berjalan setengah
rusak dan gagal misterius saat user memakai fitur tertentu.

---

## 8. Deployment

Setiap bagian di-deploy ke tempat yang paling cocok dengan sifatnya. Ringkasnya:

| Bagian | Target deploy | Alasan singkat |
|---|---|---|
| **Frontend (React SPA)** | **Firebase Hosting** (alternatif: Vercel) | Satu toolchain dengan Firebase, deploy satu perintah, CDN + HTTPS otomatis, rewrite SPA sederhana. Vercel dipilih bila butuh preview deployment per PR dan DX frontend yang lebih kaya. |
| **REST API (Node)** | **Cloud Run** (alternatif: Render) | Cloud Run: container, auto-scale ke nol saat sepi (hemat), terintegrasi IAM & Secret Manager. Render: lebih sederhana untuk pemula, cocok bila belum nyaman dengan container. |
| **Database** | **Firestore (Native mode)** | Layanan terkelola; tidak ada server DB untuk dirawat, backup & scaling ditangani Google. |
| **Auth** | **Firebase Authentication** | Terkelola penuh; custom claims di-set lewat Admin SDK saat role user berubah. |
| **File/lampiran** | **Firebase Storage** | Terintegrasi Auth; akses via signed URL; CDN bawaan. |
| **Automasi** | **Cloud Functions** | Trigger Firestore, callable, dan scheduled berjalan tanpa server; cocok untuk notifikasi & agregasi. |
| **Security Rules** | `firestore.rules`, `storage.rules` (deploy bersama Firebase) | Pertahanan berlapis: meski API mem-bypass Rules, Rules tetap menutup akses langsung dari klien. |
| **CI/CD** | **GitHub Actions** | Menjalankan lint → typecheck → test → build di setiap PR, lalu deploy otomatis saat merge ke `main`. |
| **Monitoring & log** | Cloud Logging/Cloud Monitoring (API), Firebase Console (Functions/Hosting) | Log terstruktur & metrik latensi per endpoint; dasar untuk menangani masalah setelah rilis. |

### Alur rilis yang dituju

```
Pull Request  →  GitHub Actions: lint + typecheck + test + build
                       │ (hijau)
                       v
                 Code review (minimal self-review + checklist)
                       │
                       v
              Merge ke main  →  Deploy otomatis:
                                   • Hosting: build SPA & deploy
                                   • Cloud Run: build image & deploy revisi baru
                                   • Functions: deploy function yang berubah
                                   • Rules/Indexes: deploy firestore.rules & indexes
                       │
                       v
              Verifikasi pasca-deploy: cek health endpoint, buka dashboard, uji login
```

Strategi rilis: **staging dulu, lalu production**, dengan revisi Cloud Run yang bisa di-rollback
cepat. Setiap deploy menandai versi di log agar masalah bisa dilacak ke rilis tertentu.

---

## 9. Keputusan yang Sengaja Ditunda

Hal-hal berikut **belum** diputuskan sekarang karena keputusannya lebih baik diambil setelah ada
informasi nyata (hasil eksperimen, kebutuhan fitur, atau data pemakaian). Menundanya adalah
keputusan sadar, bukan kelalaian.

| # | Keputusan | Kenapa ditunda | Kapan diputuskan |
|---|---|---|---|
| 1 | **Express atau Fastify** | Keduanya memenuhi kebutuhan; pilihan tergantung kenyamanan dan kebutuhan validasi skema bawaan. Pola lapisan tidak berubah apa pun pilihannya. | Akhir Fase 0, saat membuat kerangka API. |
| 2 | **Hosting frontend final: Firebase Hosting atau Vercel** | Butuh membandingkan DX preview deploy vs kesatuan toolchain Firebase. | Fase 0/9 sebelum deploy pertama. |
| 3 | **Platform API: Cloud Run atau Render** | Tergantung kenyamanan dengan container & kebutuhan auto-scale; keduanya didukung CI. | Fase 8 (Hardening) saat menyiapkan deploy. |
| 4 | **Pustaka validasi skema (mis. Zod vs Joi vs skema bawaan framework)** | Perlu memastikan kompatibilitas dengan skema di `packages/shared` agar tidak ada dua sumber kebenaran validasi. | Fase 1 saat menulis endpoint pertama. |
| 5 | **Strategi cache & paginasi Firestore** | Bergantung pada volume data nyata dan pola query yang terbentuk setelah Fase 3–5. | Fase 5 (Reporting) saat query mulai berat. |
| 6 | **Pendekatan laporan agregat (agregation query vs pre-agregasi terjadwal)** | Perlu tahu seberapa besar data dan seberapa sering laporan dibuka. | Fase 5–6. |
| 7 | **Realtime: polling TanStack Query vs SSE/WebSocket dari API** | Realtime penuh belum dibutuhkan; mulai dengan refetch, ukur kebutuhan sebenarnya. | Fase 5, setelah dashboard dipakai. |
| 8 | **Penyimpanan hasil ekspor laporan (Storage vs dikirim via email/link)** | Tergantung kebutuhan pengguna laporan. | Fase 5–7. |
| 9 | **Gateway notifikasi final (email vs WhatsApp, penyedia mana)** | Perlu bandingkan biaya, keandalan, dan kemudahan integrasi di Indonesia. | Fase 7 (Integrasi pihak ketiga). |
| 10 | **Pustaka UI (komponen siap pakai vs komponen sendiri)** | Menyentuh tampilan, bukan arsitektur; diputuskan saat desain UI dimulai. | Fase 0 akhir / awal Fase 1. |
| 11 | **Skema custom claims lanjutan (mis. `divisionId`, `warehouseId`)** | Tergantung apakah kebutuhan multi-gudang/multi-divisi benar-benar muncul. | Fase 1, bila kebutuhan terkonfirmasi. |
| 12 | **Kebijakan retensi & arsip `auditLogs`** | Butuh tahu volume log dan kebutuhan audit perusahaan. | Fase 6/8. |

> **Catatan tentang contoh di dokumen lain:** karena keputusan #1 (Express vs Fastify) dan #4
> (pustaka validasi skema) masih terbuka, contoh kode di `SECURITY.md` (mis. `express-rate-limit`
> atau skema "Zod") bersifat **ilustratif** — framework/pustaka final mengikuti keputusan di tabel
> ini. Jangan perlakukan contoh itu sebagai keputusan yang sudah dikunci.

---

## Lampiran A — Konvensi Penamaan (mengikat semua dokumen & kode)

**Firestore collections** (camelCase, jamak):
`users`, `categories`, `suppliers`, `divisions`, `units`, `items`, `warehouses`,
`stockTransactions`, `requests`, `requestItems`, `auditLogs`, `notifications`, `functionRuns`,
`cacheEntries`, `idempotencyKeys`, `dailyAggregates`, `settings`, `itemCodes`.
(Subkoleksi `requests/{requestId}/requestItems` bila baris permintaan dipisah; lihat DATA-MODEL.md.)

**REST endpoints** (`/api/v1/...`, resource jamak, segmen **kebab-case**, aksi eksplisit):
contoh `GET /api/v1/items`, `POST /api/v1/items`, `GET /api/v1/stock-transactions`,
`POST /api/v1/requests/:id/approve` (bukan `PATCH .../status`).

**Role:** `admin` | `staff` | `viewer`.

**Tipe transaksi stok:** `'in'` | `'out'` | `'adjustment'`.
**Status transaksi stok:** `'completed'` | `'cancelled'` (lihat BR-02).

**Status permintaan:** `'draft'` | `'submitted'` | `'approved'` | `'rejected'` | `'fulfilled'` | `'cancelled'`.

**Field standar:** status aktif/nonaktif master data memakai `isActive: boolean` (BR-14);
`idempotencyKeys/{key}` dipakai untuk mencegah double-submit (lihat SECURITY.md §9.4).

**Prinsip tambahan:** semua nama entitas, status, dan role didefinisikan sebagai konstanta di
`packages/shared/src/constants` dan **diimpor**, bukan ditulis sebagai string bebas.

---

## Lampiran B — Ringkasan Keputusan Arsitektur (ADR singkat)

| # | Keputusan | Alasan utama |
|---|---|---|
| A1 | Data bisnis hanya lewat REST API, bukan Firestore langsung dari browser | Logika bisnis, validasi, konsistensi, agregasi, dan keamanan rahasia ada di server |
| A2 | Monorepo dengan `packages/shared` | Mencegah kontrak tipe frontend–backend melenceng |
| A3 | Backend berlapis route → controller → service → repository | Perubahan terisolasi, mudah dites, mudah di-review |
| A4 | Cloud Functions untuk pekerjaan asinkron | Request user tetap cepat; notifikasi & agregasi berjalan di belakang |
| A5 | Firestore Native mode sebagai database | Skalabilitas & integrasi Firebase, cocok dengan stack JD |
| A6 | Role lewat custom claims Firebase Auth | Otorisasi tanpa query DB di setiap request |
| A7 | File di Storage dengan signed URL | File tidak publik, tetap terkontrol |
| A8 | CI menegakkan lint + typecheck + test + build | Kualitas dijaga otomatis, bukan bergantung ingatan |
