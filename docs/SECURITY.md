# SECURITY.md — Model Keamanan Sistem Inventaris & Gudang

> **Dokumen ini untuk siapa?**
> Murid (pemula–menengah) yang membangun sistem ini, **dan** AI agent yang akan menulis kode.
> Karena itu setiap keputusan dijelaskan **kenapa**, bukan hanya **apa**.
>
> **Prinsip dasar:** Keamanan bukan fitur yang ditambahkan di akhir, tapi keputusan desain yang
> diambil dari awal. Dokumen ini adalah acuan tunggal untuk semua hal terkait keamanan.

---

## Daftar Isi

1. [Model Ancaman Sederhana](#1-model-ancaman-sederhana)
2. [Autentikasi](#2-autentikasi)
3. [Otorisasi](#3-otorisasi)
4. [Firestore Security Rules](#4-firestore-security-rules)
5. [Validasi & Sanitasi Input](#5-validasi--sanitasi-input)
6. [Keamanan Cloud Storage](#6-keamanan-cloud-storage)
7. [Rahasia & Konfigurasi](#7-rahasia--konfigurasi)
8. [Audit Log sebagai Kontrol Keamanan](#8-audit-log-sebagai-kontrol-keamanan)
9. [Pencegahan Penyalahgunaan](#9-pencegahan-penyalahgunaan)
10. [Checklist Keamanan Sebelum Rilis](#10-checklist-keamanan-sebelum-rilis)

---

## 1. Model Ancaman Sederhana

Sebelum menulis satu baris kode keamanan, kita harus tahu **siapa yang mengancam** dan **apa yang
mereka incar**. Model ancaman yang realistis mencegah kita dari dua kesalahan umum: terlalu paranoid
(mengorbankan kecepatan) atau terlalu lengkap (membiarkan lubang besar).

### 1.1 Aktor Ancaman

| Aktor | Kemampuan | Motivasi | Contoh serangan |
|---|---|---|---|
| **User sah yang menyalahgunakan** (insider) | Punya akun & token valid; tahu alur aplikasi | Curang, mengambil barang, memanipulasi stok untuk menutupi kehilangan | Staff mengubah `currentStock` langsung tanpa transaksi; admin menghapus audit log |
| **Orang luar (unauthenticated)** | Akses internet, bisa mengirim request apa pun | Mengakses data, merusak, scraping | Menembak endpoint tanpa token; membaca koleksi Firestore langsung; enumerasi ID dokumen |
| **Bot / otomatisasi** | Request masif, otomatis, murah | Brute-force login, spam permintaan barang, menguras kuota | Percobaan password berulang; spam `POST /api/v1/requests` |
| **Penyerang dengan token bocor** | Punya token sah hasil curian (XSS, device hilang) | Akses sebagai user lain | Memakai refresh token dari device yang hilang |

> **Insight penting untuk proyek ini:** ancaman **nomor 1 (insider)** adalah yang paling mungkin
> terjadi di perusahaan nyata. Sistem inventaris selalu soal *uang dan barang*. Staff yang frustrasi
> atau tidak jujur bisa jadi ancaman lebih besar daripada hacker. Karena itu **audit log dan
> pemisahan hak akses lebih penting daripada enkripsi canggih**.

### 1.2 Aset yang Dilindungi

| Aset | Lokasi | Dampak jika bocor/diubah | Klasifikasi |
|---|---|---|---|
| **Data stok** (`items`, `stockTransactions`) | Firestore | Laporan keuangan salah, keputusan bisnis keliru, pencurian barang tersamarkan | **Sensitif** |
| **Data supplier** (`suppliers`) | Firestore | Data kontak & harga bocor ke kompetitor | **Sensitif** |
| **Data user** (`users`) | Firestore + Firebase Auth | Phishing, penyalahgunaan identitas, akses tidak sah | **Sensitif (PII)** |
| **Audit log** (`auditLogs`) | Firestore | Jejak kejahatan hilang → tidak bisa investigasi | **Kritis** |
| **Kredensial** (service account, API key pihak ketiga) | Server env / Secret Manager | Penguasaan penuh atas backend & billing | **Kritis** |
| **Foto barang & lampiran** | Firebase Storage | Kebocoran dokumen internal | **Sensitif** |
| **Ketersediaan sistem** | Cloud Run / Firestore | Operasional gudang berhenti | **Penting** |

### 1.3 Batas Kepercayaan (Trust Boundary)

```
┌─────────────────────────────────────────────────────────────────┐
│  ZONA TIDAK DIPERCAYA  (browser user, jaringan publik)           │
│                                                                   │
│   React SPA  ──►  UI hanya "petunjuk", BUKAN penjaga keamanan     │
└───────────────────────────────┬───────────────────────────────────┘
                                │  HTTPS  (selalu)
                                │  Authorization: Bearer <ID token>
┌───────────────────────────────▼───────────────────────────────────┐
│  ZONA DIPERCAYA  (backend kita)                                   │
│                                                                   │
│   Node.js + TypeScript (Express/Fastify)                          │
│   • Verifikasi token (Firebase Admin SDK)                         │
│   • Cek custom claims → role                                      │
│   • Validasi & sanitasi input                                     │
│   • Logika bisnis (mis. cek stok cukup)                           │
│   • Tulis auditLogs                                               │
│                     │                                             │
│   Cloud Functions   │   (Firestore trigger, scheduled, callable)  │
│                     ▼                                             │
│         Firebase Admin SDK (bypass security rules)                │
└───────────────────────────────┬───────────────────────────────────┘
                                │  Admin SDK (service account)
┌───────────────────────────────▼───────────────────────────────────┐
│  ZONA DATA  (Firestore, Storage, Auth)                            │
│   • Security Rules = benteng terakhir untuk akses dari client     │
│   • Admin SDK melewati rules → backend WAJIB validasi sendiri     │
└───────────────────────────────────────────────────────────────────┘
```

**Konsekuensi desain:**
- Frontend **selalu** dianggap bisa dimodifikasi (DevTools, `curl`, script). Semua cek penting
  terjadi di server.
- Backend memakai Admin SDK yang **melewati Security Rules**. Artinya, saat backend menulis data,
  tidak ada jaring pengaman otomatis → **validasi di backend adalah tanggung jawab penuh kita**.

---

## 2. Autentikasi

**Keputusan:** Firebase Authentication dengan provider **email/password**.
**Kenapa:** Job description menyebut Firebase Authentication. Email/password cukup untuk perusahaan
menengah (user dikelola admin, bukan self-signup massal). Ini juga memberi kita `uid` yang stabil
untuk dikaitkan dengan custom claims dan `users` collection.

### 2.1 Alur Login

```
User                React SPA                  Firebase Auth          Backend API
 │                      │                           │                     │
 │  email + password    │                           │                     │
 ├─────────────────────►│                           │                     │
 │                      │ signInWithEmailAndPassword│                     │
 │                      ├──────────────────────────►│                     │
 │                      │                           │  verifikasi         │
 │                      │   ID token (JWT) +        │                     │
 │                      │   refresh token           │                     │
 │                      │◄──────────────────────────┤                     │
 │                      │                           │                     │
 │                      │  GET /api/v1/auth/me      │                     │
 │                      │  Authorization: Bearer    │                     │
 │                      ├─────────────────────────────────────────────────►│
 │                      │                           │   verifyIdToken()   │
 │                      │                           │◄────────────────────┤
 │                      │   { uid, role, profile }  │   (custom claims)   │
 │                      │◄─────────────────────────────────────────────────┤
 │   tampilkan app      │                           │                     │
 │◄─────────────────────┤                           │                     │
```

**Poin penting:** setelah login, SPA **tidak** hanya menyimpan token. Ia memanggil
`GET /api/v1/auth/me` untuk mengambil profil + role dari server. Alasannya: role otoritatif
berasal dari custom claims (di-set server), bukan dari data yang bisa dimanipulasi di client.

### 2.2 Penyimpanan Token

**Keputusan:** biarkan **Firebase JS SDK** mengelola token. Jangan simpan token di `localStorage`
secara manual.

**Kenapa:** Firebase SDK memakai IndexedDB dan menangani refresh otomatis. Menyimpan token di
`localStorage` sendiri berarti token mudah dicuri lewat XSS dan kita harus mengurus refresh manual
(rentan bug).

**Catatan risiko XSS:** token tetap bisa diakses oleh JavaScript di halaman (baik SDK Firebase
maupun `localStorage`). Mitigasi utamanya:
- **Content Security Policy (CSP)** yang ketat (lihat §9).
- React sudah meng-escape output secara default → hindari `dangerouslySetInnerHTML`.
- Jangan pernah memuat script dari CDN tak terpercaya.

### 2.3 Siklus Hidup Token & Refresh

| Token | Umur | Fungsi | Dikelola oleh |
|---|---|---|---|
| **ID token** (JWT) | ±1 jam | Dibawa di header `Authorization` ke API | SDK (refresh otomatis) |
| **Refresh token** | Panjang (rotasi otomatis) | Menukar ID token baru | SDK |

**Alur refresh:**
```
1. ID token hampir kedaluwarsa.
2. SDK otomatis memanggil endpoint refresh Firebase memakai refresh token.
3. ID token baru diperoleh → request berikutnya memakai token baru.
4. Developer TIDAK perlu menulis kode refresh manual.
```

**Sisi backend — penting:** Admin SDK memverifikasi ID token **dan** memeriksa apakah token
di-revoke. Untuk operasi sensitif, gunakan `verifyIdToken(idToken, true)` agar token yang sudah
di-revoke (mis. setelah ganti password) langsung ditolak.

**Penting saat role berubah:** custom claims **tidak** langsung berubah di ID token yang sedang
aktif. Setelah admin mengubah role user, ID token lama masih membawa role lama sampai di-refresh
(maks ±1 jam). Solusi:
1. Backend memanggil `revokeRefreshTokens(uid)` setelah mengubah claims.
2. Frontend memaksa refresh: `user.getIdToken(true)`.
3. Selama masa transisi, backend tetap memverifikasi role dari token — konsisten dan aman.

### 2.4 Logout

```
await signOut(auth);           // hapus token lokal di SDK
queryClient.clear();           // buang cache TanStack Query (jangan bocorkan data user sebelumnya)
navigate('/login');            // redirect
```

**Kenapa `queryClient.clear()`?** Cache TanStack Query berisi data yang di-fetch dengan token user
sebelumnya. Jika tidak dibersihkan, user berikutnya di browser yang sama bisa melihat sisa data.

**Logout di semua device** (mis. device hilang): backend memanggil `revokeRefreshTokens(uid)`.

### 2.5 Lupa Password

```
1. User klik "Lupa password" di halaman login.
2. Frontend: sendPasswordResetEmail(auth, email)
3. Firebase mengirim email berisi link reset.
4. User set password baru via halaman Firebase.
5. Opsional: setelah reset, backend revoke refresh token lama.
```

**Kenapa aman:** aplikasi tidak pernah melihat atau menyimpan password. Firebase yang menangani
hashing (scrypt) dan pengiriman email. Kita hanya memicu alurnya.

**Catatan anti-enumerasi:** `sendPasswordResetEmail` sebaiknya selalu menampilkan pesan sukses
("Jika email terdaftar, kami sudah mengirim link reset") — jangan membocorkan apakah email
terdaftar atau tidak.

### 2.6 Penanganan Sesi di Frontend

- **Auth state listener** sebagai sumber kebenaran tunggal:
  ```ts
  onAuthStateChanged(auth, async (user) => {
    if (!user) { setSession(null); return; }
    const token = await user.getIdToken();       // ambil token segar
    const me = await api.get('/api/v1/auth/me'); // profil + role dari server
    setSession({ user, token, role: me.role });
  });
  ```
- **Route guard** di React Router: halaman butuh login → redirect ke `/login` bila belum ada sesi.
  Ini **UX**, bukan keamanan — server tetap menolak request tanpa token.
- **Axios interceptor** menyisipkan `Authorization: Bearer <token>` otomatis, dan bila menerima
  `401`, memaksa refresh sekali lalu mencoba ulang.
- **Idle timeout** (opsional, disarankan untuk gudang): setelah N menit tanpa aktivitas, paksa
  logout. Berguna karena komputer gudang sering ditinggal tanpa dikunci.

---

## 3. Otorisasi

**Keputusan:** role disimpan sebagai **custom claims** di Firebase Auth (`{ role: 'admin' }`),
bukan hanya di dokumen `users`.

**Kenapa:**
1. Custom claims ikut di dalam ID token yang **ditandatangani Firebase** → tidak bisa dipalsukan
   oleh client.
2. Backend bisa membacanya dari token yang sudah diverifikasi **tanpa** query Firestore tambahan
   (lebih cepat, lebih hemat biaya baca).
3. Security Rules bisa mengaksesnya via `request.auth.token.role` → aturan database pun bisa
   berbasis role tanpa membaca dokumen.

### 3.1 Peran

| Role | Deskripsi singkat |
|---|---|
| `admin` | Akses penuh; kelola user & master data; approval; adjustment/fulfill/reverse |
| `staff` | Input transaksi stok `in`/`out`; buat & ajukan permintaan barang |
| `viewer` | Hanya melihat dashboard, laporan, dan master data non-sensitif |

### 3.2 Matriks Izin Lengkap (Aksi × Role)

Legend: ✅ boleh · ❌ tidak boleh · 🔒 hanya data miliknya sendiri

#### Master Data

| Aksi | admin | staff | viewer |
|---|:---:|:---:|:---:|
| Lihat `categories` | ✅ | ✅ | ✅ |
| Buat/ubah/hapus `categories` | ✅ | ❌ | ❌ |
| Lihat `suppliers` | ✅ | ✅ | ❌ |
| Buat/ubah/hapus `suppliers` | ✅ | ❌ | ❌ |
| Lihat `items` | ✅ | ✅ | ✅ |
| Buat/ubah `items` | ✅ | ❌ | ❌ |
| Nonaktifkan `items` (`isActive: false`) | ✅ | ❌ | ❌ |

#### Transaksi Stok

| Aksi | admin | staff | viewer |
|---|:---:|:---:|:---:|
| Lihat `stockTransactions` | ✅ | ✅ | ✅ |
| Buat transaksi (`in`/`out`) | ✅ | ✅ | ❌ |
| Buat transaksi `adjustment` | ✅ | ❌ | ❌ |
| Batalkan transaksi (`status: completed` → `cancelled`, BR-02) | ✅ | ✅ | ❌ |
| Balik transaksi (`reverse`, bukan hapus) | ✅ | ❌ | ❌ |
| Hapus transaksi | ❌ | ❌ | ❌ |

> **Koreksi transaksi = reversal / pembatalan, bukan hapus (BR-02).** `stockTransactions` bersifat
> **append-only**: dokumen **tidak pernah di-`delete`** siapa pun. Ada dua mekanisme koreksi yang
> sah dan berbeda:
> 1. **Batalkan** (`PATCH /api/v1/stock-transactions/{id}/cancel`, US-20): mengubah **`status`**
>    dokumen asal dari `completed` menjadi `cancelled` beserta `cancelledBy`/`cancelledAt`/
>    `cancelReason` — satu-satunya update yang diizinkan, dan hanya pada field status (angka stok
>    ikut dikembalikan lewat mekanisme terkontrol). Transaksi `cancelled` tidak dihitung di stok
>    berjalan.
> 2. **Balik** (`POST /api/v1/stock-transactions/{id}/reverse`): membuat **transaksi lawan baru**
>    yang mereferensikan transaksi asal (`referenceType: "manual"`, `referenceId: <id asal>`) tanpa
>    mengubah dokumen asal. Transaksi yang sudah dibalik tidak bisa dibalik dua kali
>    (`409 ALREADY_REVERSED`).
>
> Lihat `API.md` §6.7 dan `DATA-MODEL.md` §3.7.

> **`adjustment` dan `reverse` adalah admin-only.** Penyesuaian stok (stock opname) dan pembalikan
> transaksi mengubah angka stok secara langsung, sehingga menuntut hak tertinggi. `staff` hanya
> mencatat pergerakan rutin `in`/`out`. Ini konsisten dengan matriks kanonik di `docs/API.md` §2.7.

#### Permintaan Barang (Requests)

| Aksi | admin | staff | viewer |
|---|:---:|:---:|:---:|
| Lihat semua `requests` | ✅ | ❌ | ❌ |
| Lihat `requests` miliknya | ✅ | 🔒 | ❌ |
| Buat `requests` (`draft`) | ✅ | ✅ | ❌ |
| Submit `draft` → `submitted` | ✅ | 🔒 | ❌ |
| Approve / Reject | ✅ | ❌ | ❌ |
| Fulfill (stok keluar) | ✅ | ❌ | ❌ |
| Cancel (BR-09: selama status belum `fulfilled`) | ✅ | 🔒 (miliknya sendiri) | ❌ |

> **`fulfill` adalah admin-only.** Memenuhi permintaan berarti mengeluarkan stok (menulis
> `stockTransactions`), yang setara bobotnya dengan `adjustment`/`reverse` dan karenanya
> dibatasi ke `admin`. Backend tetap memvalidasi BR-07 (hanya dari `approved`) dan BR-21 (tepat
> satu transaksi keluar, tidak boleh dobel). Pembatalan mengikuti **BR-09**: pemilik atau admin
> boleh membatalkan selama status **belum `fulfilled`** — jadi termasuk saat sudah `approved` —
> bukan hanya sebelum `approved`.

#### User & Sistem

| Aksi | admin | staff | viewer |
|---|:---:|:---:|:---:|
| Lihat daftar `users` | ✅ | ❌ | ❌ |
| Buat/ubah/nonaktifkan user | ✅ | ❌ | ❌ |
| Ubah role user | ✅ | ❌ | ❌ |
| Lihat `auditLogs` | ✅ | ❌ | ❌ |
| Hapus `auditLogs` | ❌ | ❌ | ❌ |
| Lihat dashboard | ✅ | ✅ | ✅ |
| Ekspor laporan | ✅ | ✅ | ✅ |

> **Catatan:** `auditLogs` sengaja **tidak bisa dihapus siapa pun** lewat aplikasi (termasuk admin).
> Pembersihan log (retensi) hanya lewat Cloud Function terjadwal dengan service account khusus.

### 3.3 Kenapa Otorisasi Dicek di Server, Bukan Hanya di UI

Ini konsep paling penting di dokumen ini. Mari buktikan dengan skenario konkret:

**Skenario:** staff membuka halaman "Hapus Barang". Kita sembunyikan tombolnya di UI karena staff
tidak boleh menghapus. Apakah aman? **TIDAK.**

```
Staff membuka DevTools → Console:

fetch('/api/v1/items/ITEM-123', {
  method: 'DELETE',
  headers: { Authorization: 'Bearer ' + tokenSahMilikStaff }
});
```

Jika backend hanya percaya bahwa "tombolnya tidak ada di UI", request ini akan **berhasil** dan
barang terhapus. UI adalah kode yang berjalan di komputer user — user bisa mengubahnya sesuka hati.

**Aturan emas:**

> **UI menyembunyikan. Server memutuskan.**

Karena itu, **setiap endpoint** harus:
1. Memverifikasi ID token → dapat `uid` + claims.
2. Mengecek role terhadap aksi yang diminta.
3. Menolak dengan `403 Forbidden` bila tidak berhak.

UI tetap menyembunyikan tombol — bukan untuk keamanan, tapi untuk **UX** (jangan tunjukkan aksi
yang pasti gagal).

**Lapisan kedua:** Firestore Security Rules. Client bisa mencoba mengakses Firestore **langsung**
(tanpa lewat backend) memakai SDK, selama token-nya valid. Karena arsitektur ini memakai prinsip
**"satu pintu masuk"** (ARCHITECTURE.md §1 & §3 — browser tidak pernah menulis langsung ke
Firestore), rules di §4.2 bersifat **read-only untuk semua koleksi bisnis** (`items`,
`stockTransactions`, `requests`, `categories`, `suppliers`): `allow write: if false`. Dengan
begitu, jalur tulis langsung dari client tertutup rapat, dan satu-satunya cara mengubah data
adalah lewat REST API yang memvalidasi role + aturan bisnis.

**Kesimpulan — pertahanan berlapis (defense in depth):**

```
Layer 1: UI menyembunyikan aksi        → UX, bukan keamanan
Layer 2: Backend cek role per endpoint  → keamanan utama
Layer 3: Firestore Security Rules       → read-only untuk data bisnis; menutup tulis langsung dari client
Layer 4: Validasi bisnis di backend     → integritas data (mis. stok negatif, BR-10)
```

---

## 4. Firestore Security Rules

Rules adalah bahasa deklaratif yang dijalankan Firestore saat client mengakses database **langsung**
(via SDK web/mobile). Backend kita memakai Admin SDK yang **melewati** rules, jadi rules melindungi
jalur client-langsung, sedangkan backend tetap wajib memvalidasi sendiri.

### 4.1 Prinsip

1. **Default deny** — semua ditolak kecuali dinyatakan boleh.
2. **Helper functions** — hindari duplikasi logika role.
3. **Validasi bentuk data** pada create/update (`hasOnly`, `is`, `size`).
4. **Field imutabel** — mis. `createdAt`, `createdBy` tidak boleh diubah.

### 4.2 Rules Lengkap (dengan penjelasan per bagian)

```javascript
rules_version = '2';

// Namespace database Firestore Native.
service cloud.firestore {
  match /databases/{database}/documents {

    // ============================================================
    // HELPER FUNCTIONS
    // ============================================================
    // Fungsi helper mengurangi duplikasi & risiko salah ketik.
    // Semua helper membaca dari token yang SUDAH diverifikasi Firebase,
    // jadi tidak bisa dipalsukan oleh client.

    function isSignedIn() {
      return request.auth != null;
    }

    // Role diambil dari custom claims (di-set backend), BUKAN dari dokumen users.
    // Kenapa? Karena claims ada di dalam token bertanda tangan Firebase.
    function role() {
      return isSignedIn() ? request.auth.token.role : null;
    }

    function isAdmin()  { return role() == 'admin'; }
    function isStaff()  { return role() == 'staff'; }
    function isViewer() { return role() == 'viewer'; }

    // Siapa pun yang sudah login boleh membaca master data (staff & viewer butuh
    // untuk menampilkan daftar item di form/laporan).
    function isAnyRole() {
      return isAdmin() || isStaff() || isViewer();
    }

    // Pemilik dokumen: dipakai untuk requests (staff hanya lihat miliknya).
    // Field pemilik pada `requests` = `requestedBy` (lihat DATA-MODEL.md §3.8).
    function isOwner(resourceData) {
      return isSignedIn() && resourceData.requestedBy == request.auth.uid;
    }

    // ============================================================
    // USERS
    // ============================================================
    match /users/{userId} {
      // Baca: admin boleh semua; user boleh membaca profilnya sendiri.
      allow read: if isAdmin() || (isSignedIn() && request.auth.uid == userId);

      // Create: TIDAK ADA yang boleh membuat dokumen user lewat client — termasuk
      // admin. Dokumen `users` dibuat **hanya** oleh backend/Admin SDK (Cloud
      // Function onUserCreated / endpoint admin), yang melewati Security Rules.
      // Karena itu rule ini `false`; kalau dibiarkan `isAdmin()`, admin dari SDK
      // client bisa membuat dokumen user tanpa lewat backend (melewati validasi &
      // pencatatan audit). Nama field nonaktif = `isActive` (konsisten dgn
      // DATA-MODEL.md §3.1 & BR-14), BUKAN `active`.
      allow create: if false;

      // Update: hanya admin. Field dibatasi (hasOnly) agar tidak ada field liar.
      // createdAt, createdBy, email, dan uid tidak boleh diubah (field identitas).
      // CATATAN: `role` adalah CERMIN dari custom claims (sumber otoritatif) —
      // lihat §3 dan §4.3; perubahan role sebenarnya terjadi lewat backend yang
      // menulis claims DAN dokumen ini dalam alur yang sama.
      allow update: if isAdmin()
        && request.resource.data.keys().hasOnly(
             ['uid', 'displayName', 'email', 'role', 'isActive',
              'department', 'warehouseIds', 'phone', 'photoUrl', 'lastLoginAt',
              'createdAt', 'updatedAt', 'createdBy']
           )
        && request.resource.data.role in ['admin', 'staff', 'viewer']
        && request.resource.data.isActive is bool
        && request.resource.data.uid == resource.data.uid
        && request.resource.data.createdAt == resource.data.createdAt
        && request.resource.data.createdBy == resource.data.createdBy
        && request.resource.data.email == resource.data.email;

      // Delete: TIDAK ADA yang boleh menghapus dokumen user lewat client.
      // User dinonaktifkan (isActive=false), bukan dihapus, agar audit trail utuh.
      allow delete: if false;
    }

    // ============================================================
    // CATEGORIES & SUPPLIERS  (master data)
    // ============================================================
    // PRINSIP "SATU PINTU MASUK" (ARCHITECTURE.md §1 & §3):
    // seluruh penulisan data bisnis lewat REST API / Admin SDK.
    // Client TIDAK menulis langsung ke Firestore — rules di sini hanya
    // mengizinkan BACA, dan menutup semua tulis dari SDK client.
    match /categories/{categoryId} {
      allow read:   if isAnyRole();
      allow write:  if false;           // create/update/delete via backend saja
    }

    match /suppliers/{supplierId} {
      // viewer TIDAK boleh melihat data supplier (lihat matriks izin §3.2).
      allow read:   if isAdmin() || isStaff();
      allow write:  if false;           // via backend saja
    }

    // ============================================================
    // ITEMS  (master data barang)
    // ============================================================
    match /items/{itemId} {
      allow read: if isAnyRole();

      // Client tidak pernah menulis item langsung. Alasan:
      //  • BR-10 — `currentStock` hanya boleh berubah lewat transaksi stok,
      //    bukan edit langsung pada item.
      //  • Rules TIDAK bisa menjaga `currentStock` tetap sinkron dengan
      //    `stockTransactions` secara atomik; menulis item dari client akan
      //    membuat stok desync dari ledger — persis masalah yang ingin
      //    diselesaikan sistem ini.
      // Jadi create/update/delete item HANYA lewat REST API (Admin SDK).
      allow write: if false;
    }

    // ============================================================
    // STOCK TRANSACTIONS  (append-only)
    // ============================================================
    match /stockTransactions/{txId} {
      allow read: if isAnyRole();

      // Ledger bersifat append-only DAN hanya ditulis backend.
      // Client tidak boleh create: menulis transaksi tanpa memperbarui
      // `items.currentStock` secara atomik akan membuat stok tidak akurat.
      // Koreksi kesalahan = transaksi lawan lewat endpoint reverse (BR-02),
      // bukan mengedit riwayat.
      allow write: if false;
    }

    // ============================================================
    // REQUESTS  (permintaan barang)
    // ============================================================
    match /requests/{requestId} {
      // Admin lihat semua; staff lihat miliknya; viewer tidak boleh.
      //
      // PENTING — `get` vs `list` dipisah (issue konsistensi):
      //  • `get` (dokumen tunggal) boleh memakai `resource.data` → cek kepemilikan.
      //  • `list` (query koleksi) **tidak** menyediakan `resource.data`; memakai
      //    `resource.data.requestedBy` di rule `list` membuat SELURUH query ditolak
      //    (termasuk milik admin). Karena itu `list` memakai `request.query`, bukan
      //    `resource`. Client staff WAJIB membatasi query
      //    `where('requestedBy', '==', request.auth.uid)` di kode.
      //  • Catatan: aplikasi **tidak** mengakses Firestore langsung dari browser
      //    (BR-25) — semua baca/tulis lewat REST API. Rules ini adalah lapisan
      //    defense-in-depth, bukan jalur utama; penegakan kepemilikan yang
      //    sesungguhnya ada di service layer backend.
      //  (Nama field pemilik = `requestedBy`, lihat DATA-MODEL.md §3.8.)
      allow get: if isAdmin()
        || (isSignedIn() && resource.data.requestedBy == request.auth.uid);
      allow list: if isAdmin()
        || (isSignedIn() && request.query.limit <= 100);

      // Semua penulisan (create/update/delete) lewat REST API. Transisi status
      // BR-06, validasi BR-07/BR-08/BR-09, dan larangan `delete` (BR-02) ditegakkan
      // di `requestService`, bukan di client.
      allow write: if false;
    }

    // ============================================================
    // AUDIT LOGS  (append-only, sangat ketat)
    // ============================================================
    match /auditLogs/{logId} {
      // Hanya admin boleh membaca.
      allow read: if isAdmin();

      // Penulisan: HANYA lewat backend (Admin SDK melewati rules ini).
      // Client tidak boleh menulis log sama sekali.
      allow create: if false;

      // Log TIDAK BOLEH diubah atau dihapus oleh siapa pun lewat client.
      // Ini yang membuat audit log bernilai sebagai bukti.
      allow update, delete: if false;
    }

    // ============================================================
    // DEFAULT DENY  (jaring pengaman terakhir)
    // ============================================================
    // Setiap path yang tidak cocok dengan match di atas akan jatuh ke sini.
    // Tanpa ini, collection baru yang lupa dibuatkan rule bisa terbuka.
    match /{document=**} {
      allow read, write: if false;
    }
  }
}
```

### 4.3 Penjelasan Baris Kunci

| Baris | Kenapa begitu |
|---|---|
| `role()` membaca `request.auth.token.role` | Claims ada di token bertanda tangan → tidak bisa dipalsukan client |
| `request.resource.data.keys().hasOnly([...])` | Mencegah user menulis field tak terduga (mis. `isAdmin: true`) |
| `allow write: if false` pada `items`, `stockTransactions`, `requests`, `categories`, `suppliers` | Menegakkan "satu pintu masuk" (ARCHITECTURE.md §1/§3): semua tulis data bisnis lewat REST API. Client tidak bisa membuat transaksi tanpa memperbarui `items.currentStock` secara atomik (menjaga BR-10) |
| `allow get: if isAdmin() \|\| resource.data.requestedBy == request.auth.uid` pada `requests` | Staff hanya membaca miliknya; `get` boleh memakai `resource.data` |
| `allow list: ...` terpisah pada `requests` | Rule `list` **tidak** boleh memakai `resource.data` (kosong saat query) — kalau dipakai, seluruh query ditolak. `list` memakai `request.query`; staff wajib query `where('requestedBy','==',uid)` |
| `request.resource.data.isActive is bool` | Menegakkan nama field nonaktif yang konsisten (`isActive`, BR-14) |
| `request.resource.data.uid == resource.data.uid` | Field identitas tidak boleh diubah saat update |
| `allow write: if false` + `allow read` pada `auditLogs` | Log hanya ditulis backend; tidak bisa diubah/dihapus siapa pun lewat client |
| `match /{document=**}` deny | Default deny: collection baru tidak otomatis terbuka |

### 4.4 Cara Menguji Rules

Rules harus diuji otomatis (bagian dari CI di Fase 8), memakai **Firebase Emulator Suite** +
`@firebase/rules-unit-testing`.

```ts
// Contoh uji: staff TIDAK boleh menghapus item
it('staff tidak boleh menghapus item', async () => {
  const db = testEnv.authenticatedContext('staff-1', { role: 'staff' }).firestore();
  await assertFails(db.collection('items').doc('ITEM-1').delete());
});

// Contoh uji: admin BOLEH mengubah item
it('admin boleh update item', async () => {
  const db = testEnv.authenticatedContext('admin-1', { role: 'admin' }).firestore();
  await assertSucceeds(db.collection('items').doc('ITEM-1').update({ name: 'Baru' }));
});
```

> **Aturan praktis:** setiap kali menambah collection atau mengubah matriks izin, **tulis uji
> rules-nya**. Rules yang tidak diuji cepat atau lambat akan bocor.

---

## 5. Validasi & Sanitasi Input

### 5.1 Kenapa Validasi di Client Saja Tidak Cukup

Validasi di client (mis. React Hook Form + Zod) itu **untuk UX** — memberi umpan balik cepat kepada
user. Tapi ia **bukan** keamanan, karena:

1. Client bisa dimatikan (DevTools, `curl`, Postman).
2. Penyerang bisa mengirim payload apa pun langsung ke API.
3. Bahkan user sah bisa tidak sengaja melewatkan validasi (bug UI, autofill aneh).

**Aturan:** **validasi dua kali.** Sekali di client (UX), sekali lagi di server (keamanan +
integritas). Server adalah satu-satunya yang otoritatif.

### 5.2 Apa yang Divalidasi

| Aspek | Contoh | Aturan |
|---|---|---|
| **Tipe** | `quantity` harus integer | Tolak `"10"`, `10.5`, `null` |
| **Panjang** | `name` item | 1–200 karakter |
| **Rentang** | `quantity` (transaksi) / `currentStock` (stok item) | `quantity > 0` untuk transaksi; `currentStock >= 0` untuk stok |
| **Enum** | `type`, `status`, `role` | Harus salah satu nilai yang didefinisikan |
| **Format** | `email`, `code` | Regex / validator |
| **Keberadaan** | `itemId`, `supplierId` | Wajib ada; referensi harus eksis |
| **Ukuran koleksi** | `request.items` | Maks 100 baris |

### 5.3 Contoh Skema Validasi (Zod)

> **Status keputusan:** pilihan pustaka validasi (Zod vs Joi vs skema bawaan framework) **masih
> ditunda ke Fase 1** — lihat ARCHITECTURE.md §9 butir 4. Contoh di bawah bersifat **ilustratif**
> ("misalnya Zod") dan bukan keputusan final. Yang mengikat adalah *aturan* yang divalidasi,
> bukan pustakanya.

```ts
import { z } from 'zod';   // ← contoh ilustratif; pustaka final diputuskan di Fase 1

export const stockTransactionSchema = z.object({
  type:   z.enum(['in', 'out', 'adjustment']),   // jenis pergerakan
  status: z.enum(['completed', 'cancelled']).default('completed'),   // status dokumen (BR-02)
  // US-22: input multi-item — API MENERIMA seluruh item sebagai baris `lines[]`,
  // lalu backend meng-EXPAND menjadi SATU dokumen ledger per item (satu item per
  // dokumen) yang ditulis dalam satu Firestore transaction dan berbagi `batchId`.
  // Model kanonik: DATA-MODEL.md §3.7; lihat juga PROJECT.md §9.7/§9.8, BR-21.
  lines:  z.array(z.object({
    itemId:   z.string().min(1).max(100),
    quantity: z.number().int().positive().max(1_000_000),   // BR-18: bilangan bulat > 0
  })).min(1).max(100),
  supplierId: z.string().min(1).nullable().optional(),   // wajib untuk `in`
  divisionId: z.string().min(1).nullable().optional(),   // wajib untuk `out`
  requestId:  z.string().min(1).nullable().optional(),   // bila berasal dari approval (BR-21)
  // BR-19: khusus `adjustment`, nilai sebelum/sesudah dicatat; `delta` boleh negatif.
  quantityBefore: z.number().int().min(0).nullable().optional(),
  quantityAfter:  z.number().int().min(0).nullable().optional(),
  delta:          z.number().int().nullable().optional(),   // quantityAfter - quantityBefore
  // BR-03: `note` WAJIB (bukan opsional) — setiap transaksi harus punya catatan/alasan.
  note:           z.string().min(1).max(1000),   // selaras API.md §5.1
  attachments: z.array(z.object({ name: z.string(), url: z.string().url(), path: z.string() })).max(20).optional(),   // US-21: bukti foto/nota
});
// Backend memakai skema yang SAMA dengan frontend (satu sumber kebenaran),
// tapi eksekusinya di server tetap wajib.

export const requestSchema = z.object({
  title:       z.string().min(1).max(200),
  warehouseId: z.string().min(1),
  department:  z.string().min(1).max(100),
  priority:    z.enum(['low', 'normal', 'high', 'urgent']).default('normal'),
  neededAt:    z.string().datetime().optional(),
  notes:       z.string().max(1000).optional(),
  items: z.array(z.object({
    itemId:            z.string().min(1),
    quantityRequested: z.number().int().positive(),
    note:              z.string().max(1000).optional(),
  })).min(1).max(100),
});
```

> Field baris permintaan adalah **`quantityRequested`** (bukan `quantity`), sesuai subkoleksi
> kanonik `requests/{id}/requestItems` di DATA-MODEL.md §3.9 dan payload `POST /requests` di
> API.md §3.9/§4.4. Catatan header bernama **`notes`** (bukan `note`).

> **Catatan `type` vs `status`:** pada `stockTransactions`, **`type`** (`in` | `out` | `adjustment`)
> menyatakan **jenis pergerakan**, sedangkan **`status`** (`completed` | `cancelled`) menyatakan
> **status dokumen** — keduanya field yang berbeda dan sah (PROJECT.md §8.2, §9.7). Jangan
> tertukar: `status` **bukan** enum jenis transaksi. Pembatalan (BR-02) menandai dokumen
> `cancelled` (beserta `cancelledBy`/`cancelledAt`/`cancelReason`), **bukan** menghapusnya.
>
> **Multi-item (US-22):** API menerima input multi-item sebagai baris `lines[]` (PROJECT.md
> §9.7/§9.8, BR-21), lalu backend **meng-expand menjadi satu dokumen `stockTransactions` per
> item** — model ledger tetap **satu item per dokumen** (memudahkan index & query per item).
> Semua dokumen dari satu submit ditulis dalam **satu Firestore transaction/batch** yang sama
> (atomik) dan **berbagi `batchId`** sebagai pengelompokan resmi. Skema kanonik: DATA-MODEL.md §3.7.

### 5.4 Pencegahan Injeksi & Penyalahgunaan

**NoSQL injection di Firestore:** Firestore tidak memakai string query, jadi tidak ada SQL
injection klasik. Tapi ada risiko lain:

- **Field injection:** user mengirim field tambahan (`isAdmin: true`) → ditolak oleh
  `keys().hasOnly([...])` di rules **dan** oleh Zod (`.strict()` / whitelist di backend).
- **Path injection:** user mengirim `itemId` berisi `/` atau `..` → validasi format ID (hanya
  karakter yang diizinkan), jangan langsung dipakai sebagai path dokumen.
- **Mass assignment:** jangan `Object.assign(doc, req.body)`. Ambil **hanya** field yang
  didefinisikan skema secara eksplisit.

```ts
// SALAH — mass assignment, user bisa menyelipkan field apa pun
await db.collection('items').doc(id).update(req.body);

// BENAR — whitelist eksplisit
const data = stockTransactionSchema.strict().parse(req.body);
await db.collection('stockTransactions').add({
  ...data,
  createdBy: req.user.uid,
  createdAt: FieldValue.serverTimestamp(),
});
```

**XSS (Cross-Site Scripting):**
- React meng-escape output secara default → **jangan pakai** `dangerouslySetInnerHTML`.
- Sanitasi input teks (mis. `note`) dengan menghapus/menolak tag HTML, walau hanya ditampilkan.
- Pasang **Content Security Policy** yang ketat (§9).
- Set header keamanan: `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`,
  `Strict-Transport-Security`.

**SSRF / integrasi pihak ketiga (Fase 7):** saat backend memanggil API eksternal, jangan biarkan
user menentukan URL bebas. Gunakan daftar domain yang diizinkan (allowlist).

### 5.5 Prinsip: Validasi Lalu Validasi Lagi (Bisnis)

Validasi skema hanya memeriksa **bentuk**. Ada validasi **bisnis** yang hanya bisa dicek di server:

```
Contoh: transaksi 'out' sebesar 10, tapi stok tersedia hanya 7.
- Skema: VALID (quantity integer positif).
- Bisnis: INVALID → tolak dengan 422 Unprocessable Entity (`STOCK_INSUFFICIENT`).

Kenapa `422`, bukan `409`? `409 Conflict` dipakai untuk **bentrok state** (mis. approve
permintaan yang sudah `fulfilled`, SKU duplikat), sedangkan payload di sini **well-formed** dan
hanya gagal **aturan bisnis**. Pemisahan ini kanonik di `docs/API.md` §1.3/§10.2.

Karena itu, logika bisnis WAJIB memakai transaksi Firestore (runTransaction)
agar cek-dan-tulis bersifat atomik (lihat §9, pencegahan race condition).
```

---

## 6. Keamanan Cloud Storage

Foto barang dan lampiran (mis. bukti permintaan) disimpan di Firebase Storage. Tanpa rules yang
benar, Storage secara default bisa sangat permisif.

### 6.1 Struktur Path

```
/items/{itemId}/photos/{fileName}                       → foto barang
/requests/{requestId}/attachments/{fileName}            → lampiran permintaan
/stockTransactions/{txId}/attachments/{fileName}        → lampiran transaksi stok (foto/nota, US-21)
```

**Kenapa terstruktur per entitas?** Rules bisa memutuskan izin berdasarkan path (mis. siapa yang
boleh menulis ke folder request tertentu) tanpa harus membaca metadata.

### 6.2 Storage Rules (dengan penjelasan)

```javascript
rules_version = '2';

service firebase.storage {
  match /b/{bucket}/o {

    // Helper: role dari custom claims (sama seperti Firestore).
    function role() { return request.auth.token.role; }
    function isAdmin() { return request.auth != null && role() == 'admin'; }
    function isStaff() { return request.auth != null && role() == 'staff'; }
    function isSignedIn() { return request.auth != null; }

    // ------------------------------------------------------------
    // FOTO BARANG: /items/{itemId}/photos/{file}
    // ------------------------------------------------------------
    match /items/{itemId}/photos/{file} {
      // Semua user login boleh melihat foto barang.
      allow read: if isSignedIn();

      // Unggah/ubah: hanya admin, batas 5 MB, hanya gambar.
      // PENTING: `create`/`update` dipisah dari `delete` — pada operasi
      // `delete`, `request.resource` bernilai null sehingga mengakses
      // `request.resource.size` akan error dan membuat rule false. Itu
      // akan membuat admin TIDAK bisa menghapus foto. Karena itu `delete`
      // diberi rule sendiri tanpa menyentuh `request.resource`.
      allow create, update: if isAdmin()
        && request.resource.size < 5 * 1024 * 1024
        && request.resource.contentType.matches('image/(jpeg|png|webp)');
      allow delete: if isAdmin();
    }

    // ------------------------------------------------------------
    // LAMPIRAN PERMINTAAN: /requests/{requestId}/attachments/{file}
    // ------------------------------------------------------------
    match /requests/{requestId}/attachments/{file} {
      // Admin atau staff yang login boleh melihat lampiran.
      allow read: if isAdmin() || isStaff();

      // Staff/admin boleh mengunggah; batas 10 MB; hanya PDF & gambar.
      // CATATAN: Storage Rules (rules_version 2) SEBENARNYA bisa memanggil
      // `firestore.get()`/`firestore.exists()` untuk memvalidasi kepemilikan
      // request, tetapi itu menambah biaya (1 read) + latensi + kompleksitas.
      // Untuk kontrol ketat, upload tetap disarankan lewat backend yang
      // memverifikasi kepemilikan sebelum menulis via Admin SDK.
      allow create, update: if (isAdmin() || isStaff())
        && request.resource.size < 10 * 1024 * 1024
        && request.resource.contentType.matches('application/pdf|image/(jpeg|png|webp)');
      allow delete: if isAdmin() || isStaff();
    }

    // ------------------------------------------------------------
    // LAMPIRAN TRANSAKSI STOK: /stockTransactions/{txId}/attachments/{file}
    // (US-21: foto/nota bukti transaksi stok.)
    // ------------------------------------------------------------
    match /stockTransactions/{txId}/attachments/{file} {
      // Admin & staff boleh melihat lampiran transaksi.
      allow read: if isAdmin() || isStaff();

      // Staff/admin boleh mengunggah; batas 10 MB; hanya PDF & gambar.
      allow create, update: if (isAdmin() || isStaff())
        && request.resource.size < 10 * 1024 * 1024
        && request.resource.contentType.matches('application/pdf|image/(jpeg|png|webp)');
      allow delete: if isAdmin() || isStaff();
    }

    // ------------------------------------------------------------
    // DEFAULT DENY
    // ------------------------------------------------------------
    match /{allPaths=**} {
      allow read, write: if false;
    }
  }
}
```

### 6.3 Penjelasan & Keputusan

| Aturan | Kenapa |
|---|---|
| `request.resource.size < 5MB` | Mencegah upload file raksasa yang menghabiskan kuota & biaya |
| `contentType.matches('image/...')` | Mencegah upload `.exe`, `.html` (yang bisa jadi vektor XSS) |
| `create, update` dipisah dari `delete` | Pada `delete`, `request.resource` = null → mengakses `.size`/`.contentType` bikin rule error & admin tak bisa hapus foto |
| `allow read: if isSignedIn()` untuk foto barang | Foto barang bukan rahasia, tapi tetap hanya untuk user login |
| Lampiran request & transaksi hanya admin/staff | viewer tidak perlu akses dokumen internal |
| Default deny | Folder baru tidak otomatis terbuka |

### 6.4 Validasi Tambahan di Backend

Rules Storage hanya memeriksa **size** dan `contentType` — dan `contentType` bisa dipalsukan
client. Karena itu, untuk lampiran sensitif, unggahan memakai alur **signed URL + finalisasi di
server** (lihat `docs/API.md` §3.12):

1. Klien minta `POST /api/v1/uploads/signed-url` (`purpose`, `contentType`, `sizeBytes`); backend
   memvalidasi izin & metadata, lalu mengembalikan **signed URL** berumur pendek.
2. Klien mengunggah langsung ke Storage (menghemat bandwidth backend untuk file besar).
3. Klien memanggil `POST /api/v1/uploads/{uploadId}/complete`; **di sinilah backend memeriksa
   magic bytes** (bukan hanya header `Content-Type`), memverifikasi user berhak atas
   request/transaksi tersebut (owner atau admin), dan memfinalisasi metadata. File yang gagal
   validasi ditolak & dihapus.
4. **Download URL** memakai *signed URL* berumur pendek untuk file privat, bukan URL publik permanen.
5. Batasi jumlah lampiran per request/transaksi (mis. maks 5) dan ukuran sesuai `purpose`
   (foto 5 MB, lampiran 10 MB — lihat §6.2).

---

## 7. Rahasia & Konfigurasi

Aturan paling penting: **tahu mana yang boleh publik dan mana yang harus rahasia.**

### 7.1 Boleh di Frontend (Publik — memang didesain begitu)

```ts
// firebase-config.ts — AMAN untuk masuk bundle frontend
// Firebase JS SDK di browser dipakai HANYA untuk Auth/token (lihat ARCHITECTURE.md §1 & §3),
// jadi config cukup 4 field di bawah. `storageBucket`/`messagingSenderId` TIDAK diperlukan
// karena Storage & FCM diakses lewat backend (Admin SDK), bukan SDK klien.
export const firebaseConfig = {
  apiKey:     'AIza...',           // Firebase API key = IDENTIFIER, bukan rahasia
  authDomain: 'xxx.firebaseapp.com',
  projectId:  'inventory-system-xxx',
  appId:      '1:1234:web:abcd',
};
```

**Kenapa Firebase config boleh publik?**
- `apiKey` Firebase **bukan** kredensial rahasia. Ia hanya mengidentifikasi *project* mana yang
  dipanggil. Ia memang dirancang untuk dikirim ke browser (setara `projectId`).
- Yang melindungi data bukan kerahasiaan config, melainkan **Firebase Security Rules** +
  **Firebase Auth**. Tanpa token sah, config ini tidak berguna.
- Google sendiri menyatakan config ini aman dipublikasikan. Ia sering muncul di HTML situs publik.

> **Kesalahpahaman umum:** banyak pemula panik karena `apiKey` terlihat di bundle. Jangan.
> Yang harus dijaga adalah **Security Rules yang benar** dan **service account**.

### 7.2 HARUS di Server (Rahasia)

| Rahasia | Di mana disimpan | Kenapa berbahaya jika bocor |
|---|---|---|
| **Service account JSON** (private key) | Secret Manager / env var server | Memberi **akses penuh** ke Firestore, Storage, Auth — melewati semua rules |
| **API key pihak ketiga** (mis. payment, email) | Secret Manager / env var server | Bisa dipakai untuk billing atas nama kita |
| **Webhook secret** | Server | Penyerang bisa memalsukan callback |
| **JWT/session secret** (jika ada) | Server | Bisa memalsukan sesi |

**Kenapa service account jauh lebih berbahaya daripada config publik?**

```
Firebase config publik  → "pintu depan" dengan nomor rumah. Tak berguna tanpa kunci.
Service account JSON    → KUNCI INDUK. Siapa pun yang memegangnya menjadi "admin dewa":
                          bisa baca/tulis/hapus SEMUA data, tanpa lewat rules, tanpa login.
```

### 7.3 Praktik Pengelolaan Rahasia

```bash
# .gitignore — WAJIB ada
.env
.env.*
!.env.example
serviceAccountKey.json
*-service-account.json
```

```bash
# .env.example — template yang di-commit (tanpa nilai rahasia asli)
FIREBASE_PROJECT_ID=
FIREBASE_CLIENT_EMAIL=
FIREBASE_PRIVATE_KEY=
THIRD_PARTY_API_KEY=
```

**Aturan:**
1. **JANGAN pernah** commit `.env` atau service account. Sekali masuk Git, anggap bocor
   (harus di-rotate, bukan sekadar dihapus — Git menyimpan riwayat).
2. Di Cloud Run, gunakan **Secret Manager** atau env var terenkripsi.
3. Untuk lokal, pakai `.env` yang di-ignore.
4. Aktifkan **Secret Scanning** GitHub & **Dependabot** untuk mendeteksi kebocoran.
5. Prinsip **least privilege**: service account backend hanya diberi role yang dibutuhkan,
   bukan "Editor" penuh bila bisa lebih sempit.
6. **Rotasi** kredensial bila dicurigai bocor atau saat anggota tim keluar.

---

## 8. Audit Log sebagai Kontrol Keamanan

Audit log bukan sekadar fitur "nice to have". Di sistem inventaris, audit log adalah **kontrol
keamanan** — alat untuk mendeteksi & menginvestigasi penyalahgunaan (ancaman #1: insider).

### 8.1 Apa yang Dicatat

Setiap **aksi yang mengubah data** (dan aksi sensitif) dicatat ke `auditLogs`:

| Field | Contoh | Fungsi |
|---|---|---|
| `action` | `create`, `update`, `delete`, `approve`, `reject`, `login`, `stock_in`, `stock_out`, `adjustment`, `role_change`, `export` | Jenis aksi (enum kanonik) |
| `entityType` | `items` | Nama koleksi yang terpengaruh |
| `entityId` | `itm_00123` | Doc ID yang terpengaruh |
| `entityPath` | `items/itm_00123` | Path lengkap (termasuk subkoleksi) |
| `entityLabel` | `Kabel NYM 3x2.5mm` | Label manusiawi untuk tampilan |
| `actorId` | `uid-123` | Siapa yang melakukan (dari token) |
| `actorEmail` | `budi@ptabc.co.id` | Email pelaku (snapshot) |
| `actorName` | `Budi Santoso` | Nama pelaku (snapshot) |
| `actorRole` | `admin` | Dengan role apa |
| `changedFields` | `["currentStock"]` | Field yang berubah (untuk `update`) |
| `before` | `{ currentStock: 10 }` | Nilai sebelum (hanya field yang berubah) |
| `after` | `{ currentStock: 7 }` | Nilai sesudah |
| `source` | `api` | `api` \| `function` \| `admin-sdk` \| `migration` |
| `ip` / `userAgent` | dari request | Konteks tambahan |
| `traceId` | `trc_abc123` | Korelasi dengan log aplikasi |
| `createdAt` | server timestamp | Kapan (server time, bukan client) |

> Skema ini **kanonik** dan harus sama dengan `docs/DATA-MODEL.md` §3.10 (dan contoh di `docs/API.md` §8.5/§10.3). Perhatikan: nama field adalah `entityType`/`entityId`/`entityPath` (bukan `targetType`/`targetId`), waktu aksi bernama `createdAt` (bukan `timestamp`), dan `action` memakai enum kanonik — bukan notasi titik seperti `item.create`.

**Aksi yang WAJIB dicatat:**
- Login berhasil/gagal (untuk deteksi brute-force). **Catatan:** login berjalan **langsung dari
  SPA ke Firebase Auth SDK** (§2.1), bukan lewat REST API kita — jadi tidak ada middleware REST
  yang bisa mencatatnya. Audit login dilakukan lewat **Auth trigger / blocking function**
  (`beforeSignIn` / `onCreate`) di Cloud Functions, bukan middleware API.
- Semua create/update pada master data (`items`, `categories`, `suppliers`).
- Semua transaksi stok (`in`/`out`/`adjustment`).
- Perubahan status permintaan (`submit`, `approve`, `reject`, `fulfill`, `cancel`).
- Perubahan user & role.
- Ekspor laporan (data keluar dari sistem).
- Percobaan akses yang ditolak (403) — indikasi probing.

### 8.2 Kenapa Log Tidak Boleh Bisa Diubah User Biasa

```
┌────────────────────────────────────────────────────────────┐
│  Jika log bisa diubah:                                      │
│                                                              │
│  1. Staff mencuri barang.                                    │
│  2. Staff hapus/edit log transaksi tersebut.                 │
│  3. Tidak ada bukti. Investigasi mustahil.                   │
│  4. Log menjadi tidak berguna sebagai kontrol keamanan.      │
└────────────────────────────────────────────────────────────┘
```

Karena itu:
- **Rules:** `auditLogs` = `allow create: if false`, `allow update, delete: if false`.
  Hanya backend (Admin SDK) yang menulis. Bahkan admin tidak bisa menghapus lewat client.
- **Backend endpoint** tidak menyediakan `DELETE /audit-logs` sama sekali.
- **Penulisan** hanya dari backend, sehingga `actorId` diambil dari token terverifikasi — bukan
  dari body request (yang bisa dipalsukan).

```ts
// Contoh penulisan audit log di backend (setelah aksi berhasil)
await db.collection('auditLogs').add({
  action: 'stock_out',
  entityType: 'items',
  entityId: itemId,
  entityPath: `items/${itemId}`,
  actorId: req.user.uid,            // DARI TOKEN, bukan req.body
  actorEmail: req.user.email,       // snapshot dari token
  actorName: req.user.displayName,  // snapshot dari token
  actorRole: req.user.role,         // DARI TOKEN
  changedFields: ['currentStock'],
  before: { currentStock: before }, // field stok item = `currentStock`
  after:  { currentStock: after },
  source: 'api',
  ip: req.ip,
  userAgent: req.headers['user-agent'],
  traceId: req.traceId,
  createdAt: FieldValue.serverTimestamp(),
});
```

**Retensi & integritas:**
- Cloud Function terjadwal (Fase 6) memindahkan log lama ke Storage/arsip setelah N bulan.
- Pertimbangkan **append-only** dengan checksum/hash berantai bila kebutuhan audit tinggi.
- Log ditulis **dalam transaksi yang sama** dengan aksi bisnis bila memungkinkan, agar tidak ada
  aksi tanpa log (atomik).

---

## 9. Pencegahan Penyalahgunaan

### 9.1 Rate Limiting

**Kenapa:** melindungi dari brute-force login, spam request, dan pengurasan kuota (biaya).

**Catatan login:** login berjalan **langsung dari SPA ke Firebase Auth SDK** (`signInWithEmailAndPassword`),
bukan lewat REST API kita (§2.1, ARCHITECTURE.md §1). Jadi tidak ada endpoint `POST /api/v1/auth/*`
untuk login, dan rate limit di API **tidak menegakkan apa pun** untuk brute-force. Kontrol yang
benar: **throttling bawaan Firebase Auth** + **Cloud Function blocking `beforeSignIn`** (atau Auth
triggers) untuk audit & pemblokiran. Rate limit di tabel ini hanya untuk endpoint REST milik kita.

| Kategori | Batas | Window | Alasan |
|---|---|---|---|
| Endpoint umum (`GET`) | 300 / user | 1 menit | Cukup untuk UI normal |
| Endpoint tulis (`POST`/`PATCH`/`DELETE`) | 60 / user | 1 menit | Cegah loop bug klien & spam massal |
| Login / reset password | 5 / IP + email | 15 menit | Anti brute-force (di sisi Firebase Auth) |
| Export laporan | 5 / user | 1 jam | Operasi mahal |
| Upload signed URL | 30 / user | 1 jam | Cegah penyalahgunaan Storage |
| Per IP (tanpa auth, mis. `/health`) | 100 / IP | 1 menit | Anti abuse |

> Angka ini **kanonik** dan harus sama dengan `docs/API.md` §8.1. Karena login berjalan langsung
> ke Firebase Auth SDK (bukan REST kita), baris "login" di sini hanyalah pengingat bahwa kontrol
> sebenarnya ada di Firebase/Cloud Function, bukan middleware API.

Implementasi: middleware `express-rate-limit` (in-memory untuk single instance, atau
Redis/Firestore untuk multi-instance Cloud Run). Kembalikan `429 Too Many Requests` +
header `Retry-After`.

### 9.2 Pembatasan Ukuran Upload

- **Storage rules:** batas 5 MB (foto) / 10 MB (lampiran) — lihat §6.
- **Backend:** batas body request (mis. `express.json({ limit: '1mb' })`) untuk mencegah payload
  raksasa.
- **Batas jumlah:** maksimal N lampiran per request, maksimal N baris per permintaan.

### 9.3 Validasi Stok Negatif & Race Condition

Ini masalah **reliability + integritas** yang khas sistem inventaris. Dua staff bisa mengeluarkan
stok yang sama secara bersamaan:

```
Stok awal: 10
Staff A: baca stok=10 → rencana out 8 → sisa 2
Staff B: baca stok=10 → rencana out 8 → sisa 2   ← keduanya lihat 10!
Hasil tanpa proteksi: stok = 2, padahal seharusnya 10-8-8 = -6 (invalid!)
```

**Solusi: Firestore Transaction** (atomic read-then-write). Contoh di bawah **disederhanakan
untuk satu baris** item; pada model kanonik multi-item (US-22), seluruh baris `lines[]` diproses
dalam **satu** Firestore transaction yang sama (PROJECT.md §9.7/§9.8), lalu ditulis sebagai satu
dokumen `stockTransactions`:

```ts
await db.runTransaction(async (tx) => {
  const itemRef = db.collection('items').doc(itemId);
  const snap = await tx.get(itemRef);
  const current = snap.data()!.currentStock;   // field stok item = `currentStock`

  if (type === 'out' && current < quantity) {
    throw new BusinessError('STOCK_INSUFFICIENT', 422);   // payload valid, aturan bisnis gagal
  }

  // Hitung stok berikutnya per jenis transaksi.
  // PENTING: `adjustment` BUKAN sekadar `current + quantity`. Menurut alur (d)
  // PROJECT.md, adjustment MENETAPKAN stok ke hasil hitung fisik (stock opname)
  // dan mencatat selisihnya — quantity bisa berarti "stok fisik" (absolut) atau
  // "delta" bertanda. Rumus `current + quantity` salah untuk adjustment.
  let next: number;
  if (type === 'in') {
    next = current + quantity;                    // quantity > 0
  } else if (type === 'out') {
    next = current - quantity;                    // quantity > 0
  } else { // type === 'adjustment'
    next = physicalCount;                         // stok ditetapkan = hasil hitung fisik
  }

  if (next < 0) throw new BusinessError('STOCK_INSUFFICIENT', 422);  // BR-01

  const delta = next - current;                   // signedQuantity utk laporan
  tx.update(itemRef, { currentStock: next, updatedAt: FieldValue.serverTimestamp() });
  tx.set(db.collection('stockTransactions').doc(), {
    type,
    itemId,
    quantity: Math.abs(delta),                    // selalu positif
    signedQuantity: delta,                        // +/- untuk agregasi
    stockBefore: current,                         // BR-19: catat sebelum
    stockAfter: next,                             // BR-19: catat sesudah
    /* ... snapshot item/warehouse, note, createdBy, occurredAt ... */
  });
  tx.set(db.collection('auditLogs').doc(), { /* ... before/after ... */ });
});
```

**Kenapa transaksi, bukan sekadar cek biasa:** Firestore transaction menjamin isolasi — jika ada
konflik, transaksi otomatis diulang. Ini mencegah race condition yang membuat stok tidak akurat
(masalah inti yang ingin diselesaikan sistem ini!).

### 9.4 Pencegahan Double-Submit

User menekan tombol "Simpan" dua kali → dua transaksi tercatat.

**Di client:** nonaktifkan tombol saat request berjalan (`isPending` dari TanStack Query).
**Di server (wajib, karena client bisa dimatikan):**
- **Idempotency key:** client mengirim `Idempotency-Key` (UUID) per form submit; backend
  menyimpan key yang sudah diproses (mis. dokumen `idempotencyKeys/{key}`) dan mengembalikan hasil
  yang sama untuk key yang berulang.
- **Unique constraint logis:** mis. cegah dua transaksi identik dalam 5 detik oleh user yang sama.

### 9.5 Header Keamanan & CSP

```
Content-Security-Policy: default-src 'self';
  script-src 'self';
  style-src 'self' 'unsafe-inline';
  connect-src 'self'
    https://*.googleapis.com
    https://*.firebaseio.com wss://*.firebaseio.com
    https://*.cloudfunctions.net;
  img-src 'self' data: https://firebasestorage.googleapis.com;
  frame-src 'self' https://*.firebaseapp.com;
  object-src 'none'; base-uri 'self';
X-Content-Type-Options: nosniff
X-Frame-Options: DENY
Referrer-Policy: strict-origin-when-cross-origin
Strict-Transport-Security: max-age=31536000; includeSubDomains
Permissions-Policy: camera=(), microphone=(), geolocation=()
```

**Kenapa tiap penyesuaian:**
- `connect-src` memuat `https://*.cloudfunctions.net` karena Cloud Functions **callable** dipanggil
  dari SPA (ARCHITECTURE.md §1); tanpa ini request callable diblokir CSP.
- `style-src 'self' 'unsafe-inline'` ditambahkan eksplisit. Tanpa `style-src`, browser jatuh ke
  `default-src 'self'` yang **memblokir inline style** — padahal React `style={{...}}` dan banyak
  pustaka UI memakainya. Bila bisa memakai nonce/hash, itu lebih ketat dan disarankan.
- `script-src` **tanpa** `https://apis.google.com`: domain itu untuk `gapi` lama, bukan kebutuhan
  Firebase SDK modular. Bila ternyata ada fitur (mis. Google Sheets, Fase 7) yang butuh, tambahkan
  kembali **setelah diverifikasi**.

> **Wajib diverifikasi:** CSP di atas adalah titik awal. Uji terhadap bundle nyata di browser,
> buka DevTools console, dan pastikan tidak ada CSP violation sebelum produksi. Sesuaikan domain
> yang benar-benar dipanggil aplikasi.

**Kenapa CSP:** membatasi sumber script yang boleh dijalankan → mengurangi dampak XSS. Header
lain mencegah clickjacking, MIME sniffing, dan downgrade ke HTTP.

### 9.6 CORS

Backend hanya menerima origin frontend yang dikenal:

```ts
app.use(cors({
  origin: ['https://inventory-system.web.app', 'http://localhost:5173'],
  // TIDAK ada `credentials: true`: autentikasi memakai Bearer token di header
  // Authorization, bukan cookie. `credentials: true` tidak diperlukan dan hanya
  // memperluas permukaan serangan (mis. bila origin keliru dikonfigurasi).
  methods: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'Idempotency-Key'],
}));
```

Middleware `cors` menangani preflight `OPTIONS` secara otomatis bila dikonfigurasi benar
(`methods` & `allowedHeaders` cocok dengan yang dikirim klien). Pastikan `Authorization` dan
`Idempotency-Key` (dipakai §9.4) ada di `allowedHeaders`, jika tidak preflight akan gagal.
Jangan pakai `origin: '*'` di produksi.

### 9.7 HTTPS Wajib

Selalu HTTPS (Cloud Run & Firebase Hosting menyediakannya otomatis). Tolak koneksi HTTP. Token
yang dikirim lewat HTTP polos bisa disadap.

---

## 10. Checklist Keamanan Sebelum Rilis

Daftar periksa konkret yang **harus lulus** sebelum deploy production. Centang setiap item.

### Autentikasi
- [ ] Login/logout berfungsi; token dikelola SDK Firebase (bukan `localStorage` manual).
- [ ] `queryClient.clear()` dipanggil saat logout.
- [ ] `onAuthStateChanged` sebagai sumber kebenaran sesi tunggal.
- [ ] Alur lupa password berfungsi & tidak membocorkan apakah email terdaftar.
- [ ] `revokeRefreshTokens` dipanggil saat role berubah atau user dinonaktifkan.

### Otorisasi
- [ ] Setiap endpoint memverifikasi ID token (`verifyIdToken`).
- [ ] Setiap endpoint mengecek role terhadap matriks izin (§3.2).
- [ ] Aksi yang tidak diizinkan mengembalikan `403` (bukan `500` atau diam-diam gagal).
- [ ] Custom claims di-set **hanya** lewat backend, tidak pernah dari client.

### Firestore Rules
- [ ] Default deny (`match /{document=**} { allow read, write: if false; }`) ada.
- [ ] Rules diuji otomatis di CI memakai Emulator Suite.
- [ ] `stockTransactions` & `auditLogs` bersifat append-only (`update, delete: if false`).
- [ ] Validasi bentuk (`hasOnly`, tipe, rentang) ada pada semua create/update.
- [ ] Tidak ada collection yang tertinggal tanpa rule.

### Storage Rules
- [ ] Default deny ada.
- [ ] Batas ukuran & tipe file diterapkan.
- [ ] Lampiran privat hanya bisa diakses pihak berwenang (idealnya lewat backend / signed URL).

### Validasi & Input
- [ ] Validasi skema (Zod) dijalankan di **server**, bukan hanya client.
- [ ] Tidak ada mass assignment (`Object.assign` dari body mentah).
- [ ] Field tambahan dari client ditolak (`.strict()` / whitelist).
- [ ] `dangerouslySetInnerHTML` tidak dipakai (atau input disanitasi ketat).

### Rahasia
- [ ] Tidak ada `.env`, service account, atau API key rahasia di repo (cek riwayat Git!).
- [ ] `.gitignore` mencakup semua file rahasia; `.env.example` tersedia.
- [ ] Secret Scanning & Dependabot aktif di GitHub.
- [ ] Service account memakai least privilege.
- [ ] Tidak ada rahasia yang ter-bundle ke frontend (cek `dist/`).

### Audit & Monitoring
- [ ] Semua aksi yang mengubah data tercatat di `auditLogs` (actorId dari token).
- [ ] Log tidak bisa diubah/dihapus lewat client.
- [ ] Alert untuk login gagal berulang & lonjakan 403.
- [ ] Logging error backend aktif (mis. Cloud Logging) tanpa membocorkan data sensitif.

### Penyalahgunaan & Reliability
- [ ] Rate limiting aktif pada endpoint sensitif.
- [ ] Pembatasan ukuran body request aktif.
- [ ] Transaksi stok memakai Firestore `runTransaction` (cegah stok negatif & race condition).
- [ ] Double-submit dicegah (idempotency key / unique constraint).
- [ ] CORS dibatasi ke origin yang dikenal.
- [ ] Header keamanan & CSP terpasang.

### Deployment
- [ ] HTTPS wajib; HTTP ditolak.
- [ ] Environment produksi memakai secret terkelola (bukan hardcode).
- [ ] Backup/ekspor Firestore terjadwal (recovery).
- [ ] CI menjalankan lint, typecheck, test (termasuk rules test), dan build sebelum deploy.

---

## Penutup

**Tiga prinsip yang harus selalu diingat:**

1. **UI menyembunyikan, server memutuskan.** Client selalu dianggap tidak dipercaya.
2. **Pertahanan berlapis.** Backend + Security Rules + validasi bisnis. Satu lapis gagal, masih
   ada lapis lain.
3. **Audit trail adalah keamanan.** Di sistem inventaris, kemampuan melacak "siapa mengubah apa"
   sama pentingnya dengan mencegah akses tidak sah.

Dokumen ini hidup. Setiap kali menambah fitur, tanyakan: **"apakah ini memperluas permukaan
serangan?"** dan perbarui matriks izin, rules, serta checklist di atas.

---

*Terakhir diperbarui: Fase 0 (Fondasi). Rujuk `docs/ARCHITECTURE.md` untuk desain sistem dan
`docs/ROADMAP.md` untuk urutan fase.*
