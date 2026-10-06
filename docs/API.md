# API Design — Sistem Inventaris & Gudang

> Dokumen ini adalah **kontrak** antara frontend, backend, dan AI agent yang menulis kode.
> Setiap endpoint, nama field, status code, dan aturan bisnis di sini bersifat mengikat.
> Kalau ada perubahan, ubah dokumen ini **dulu**, baru ubah kode (lihat [§9](#9-versioning--perubahan-yang-merusak)).

| Metadata | Nilai |
| --- | --- |
| Proyek | `inventory-system` — Sistem Inventaris & Gudang |
| Pemilik | Dimas |
| Versi dokumen | 1.0 |
| Versi API | `v1` |
| Base URL (dev) | `http://localhost:8080/api/v1` |
| Base URL (staging) | `https://api-staging.inventory-system.run.app/api/v1` |
| Base URL (prod) | `https://api.inventory-system.run.app/api/v1` |
| Format | JSON (`application/json; charset=utf-8`) |
| Autentikasi | Firebase Authentication — ID token (`Authorization: Bearer <token>`) |
| Database | Cloud Firestore (Native mode) |
| Runtime API | Node.js + TypeScript (Express/Fastify) di Cloud Run, memakai Firebase Admin SDK |

### Peta dokumen

```
docs/
├── ARCHITECTURE.md   ← gambaran sistem, komponen, alur data
├── DATA-MODEL.md     ← skema Firestore, index, relasi
├── API.md            ← (DOKUMEN INI) kontrak REST API
├── SECURITY.md       ← Firestore rules, custom claims, threat model
└── ROADMAP.md        ← fase 0–9
```

---

## Daftar Isi

1. [Prinsip REST yang Dipakai](#1-prinsip-rest-yang-dipakai)
2. [Konvensi Umum](#2-konvensi-umum)
3. [Daftar Endpoint Lengkap](#3-daftar-endpoint-lengkap)
4. [Contoh Lengkap 5 Endpoint Penting](#4-contoh-lengkap-5-endpoint-penting)
5. [Validasi Input](#5-validasi-input)
6. [Aturan Bisnis di API](#6-aturan-bisnis-di-api)
7. [Endpoint Laporan (Reporting)](#7-endpoint-laporan-reporting)
8. [Rate Limiting & Keamanan](#8-rate-limiting--keamanan)
9. [Versioning & Perubahan yang Merusak](#9-versioning--perubahan-yang-merusak)
10. [Lampiran](#10-lampiran)

---

## 1. Prinsip REST yang Dipakai

Kita tidak memakai REST secara "purist" (murni). Kita memakai REST yang **berguna untuk produk**, dengan beberapa pengecualian yang dijelaskan alasannya di bawah. Prinsip yang dipegang:

### 1.1 Resource-based, bukan action-based

URL menunjuk ke **benda** (kata benda, jamak), bukan **aksi** (kata kerja). Method HTTP yang menyatakan aksinya.

```
✅ BENAR                              ❌ SALAH
GET    /api/v1/items                  GET  /api/v1/getItems
POST   /api/v1/items                  POST /api/v1/createItem
PATCH  /api/v1/items/{itemId}         POST /api/v1/updateItem
DELETE /api/v1/items/{itemId}         POST /api/v1/deleteItem
```

**Kenapa?** Resource-based membuat URL stabil dan mudah ditebak, sehingga endpoint bisa di-cache, di-proxy, di-log, dan didokumentasikan secara seragam. Ini juga memudahkan AI agent men-generate kode: pola `GET list → GET detail → POST create → PATCH update → DELETE` konsisten di semua resource.

**Pengecualian yang disengaja:** operasi yang **bukan CRUD** tetap memakai sub-resource + `POST`, karena memaksa-kan ke PATCH akan menyesatkan. Contoh:

```
POST /api/v1/requests/{requestId}/submit     ← transisi state, bukan update field
POST /api/v1/requests/{requestId}/approve    ← keputusan approval
POST /api/v1/stock-transactions/{id}/reverse ← pembalikan transaksi
```

Ini disebut *controller resource*: aksinya adalah resource tersendiri (sebuah "kejadian"). Setiap kali dipanggil, ia menciptakan event baru di `auditLogs`. Alternatif (mis. `PATCH /requests/{id}` dengan `{status:"approved"}`) ditolak karena **tidak bisa dibedakan** antara "user mengedit draft" dan "admin menyetujui", padahal keduanya butuh otorisasi dan efek samping yang berbeda.

### 1.2 HTTP Method yang Benar

| Method | Semantik | Idempoten? | Body? | Dipakai untuk |
| --- | --- | --- | --- | --- |
| `GET` | Ambil data, **tidak boleh** mengubah state | ✅ Ya | Tidak | List, detail, laporan, dashboard |
| `POST` | Buat resource baru / jalankan aksi | ❌ Tidak | Ya | Create, submit, approve, login |
| `PATCH` | Update **sebagian** field | ⚠️ Ya* | Ya | Edit nama item, ubah qty, ubah role |
| `PUT` | Ganti **seluruh** representasi | ✅ Ya | Ya | Hampir tidak dipakai (lihat catatan) |
| `DELETE` | Hapus resource | ✅ Ya | Tidak | Hapus item, supplier, user |

\* `PATCH` idempoten secara definisi: mengirim payload yang sama dua kali menghasilkan state akhir yang sama. Kita **wajibkan** perilaku ini di semua endpoint `PATCH`.

**Catatan soal `PUT`:** kita hampir selalu memakai `PATCH`, bukan `PUT`. Alasannya: model Firestore kita punya field yang dikelola server (`createdAt`, `updatedAt`, `createdBy`, `currentStock`, `stockByWarehouse`, `isLowStock`) yang **tidak boleh** dikirim klien. Kalau `PUT` (replace total), klien harus mengirim dokumen lengkap dan berisiko menimpa field server. `PATCH` (merge) lebih aman dan lebih hemat bandwidth di jaringan seluler.

**Kenapa bukan POST untuk semuanya?** Karena proxy, browser cache, dan tooling (Postman, curl, monitoring) memahami semantik method. `GET` yang idempoten bisa di-retry otomatis oleh load balancer; `POST` tidak boleh. Salah method = retry yang tidak aman = data stok dobel.

### 1.3 Status Code yang Tepat

Kita tidak mengembalikan `200 OK` untuk semua hal. Setiap status code punya arti yang bisa ditindaklanjuti frontend.

| Code | Nama | Kapan dipakai | Contoh di proyek ini |
| --- | --- | --- | --- |
| `200` | OK | Request sukses, ada body | `GET /items`, `PATCH /items/{id}` |
| `201` | Created | Resource baru dibuat, kirim `Location` header | `POST /items`, `POST /stock-transactions` |
| `202` | Accepted | Diterima, diproses asinkron | `POST /reports/export` (job di Cloud Function) |
| `204` | No Content | Sukses, tidak ada body | `DELETE /items/{id}`, `POST /notifications/read-all` |
| `400` | Bad Request | Payload malformed / validasi gagal | Field `quantity` negatif |
| `401` | Unauthorized | Token tidak ada / kadaluarsa / invalid | ID token expired |
| `403` | Forbidden | Token valid tapi role tidak cukup | `staff` coba `POST /requests/{id}/approve` |
| `404` | Not Found | Resource tidak ada / sudah dihapus | `GET /items/xyz` tidak ditemukan |
| `409` | Conflict | Bentrok state / duplikat | SKU sudah dipakai; approve request yang sudah `fulfilled` |
| `422` | Unprocessable Entity | Validasi lolos sintaks tapi gagal aturan bisnis | Stok tidak cukup untuk transaksi `out` |
| `429` | Too Many Requests | Rate limit terlampaui | 300 request/menit/user terlampaui |
| `500` | Internal Server Error | Bug / error tak terduga | Koneksi Firestore gagal |
| `503` | Service Unavailable | Dependensi mati / maintenance | Firestore timeout |

**Kenapa `400` dan `422` dipisah?** Karena frontend menanganinya berbeda. `400` = "payload kamu cacat, mungkin bug di frontend" → tampilkan error generik + log. `422` = "permintaanmu masuk akal tapi tidak bisa dijalankan sekarang" → tampilkan pesan spesifik ke user ("Stok tidak cukup, sisa 3"). Perbedaan ini penting untuk UX.

**Kenapa `202` untuk export?** Membuat laporan 50.000 baris bisa memakan 10–30 detik. Menahan koneksi HTTP selama itu akan timeout di Cloud Run / proxy. Jadi export dibuat sebagai **job asinkron**: API mengembalikan `jobId`, Cloud Function mengerjakan, hasil diunggah ke Storage, dan klien diberi tahu lewat notifikasi/`GET /reports/exports/{jobId}`.

### 1.4 Idempotency

Idempotency = "melakukan request yang sama dua kali memberi hasil akhir yang sama, tidak menggandakan efek".

- `GET`, `PATCH`, `DELETE` **sudah** idempoten secara desain.
- `POST` **tidak** idempoten. Ini masalah nyata: user di gudang menekan "Simpan" di jaringan lemot, request timeout, user menekan lagi → **stok tercatat dua kali**. Ini salah satu masalah yang proyek ini ingin selesaikan ("stok tidak akurat").

**Solusi:** endpoint `POST` yang **menulis data penting** (transaksi stok, pembuatan request, pembuatan user) menerima header opsional:

```http
Idempotency-Key: 9f8a7b6c-1d2e-4f3a-8b9c-0d1e2f3a4b5c
```

Aturan mainnya:

1. Klien (frontend) men-generate UUID v4 **saat form dibuka**, bukan saat submit. Kalau submit gagal dan user menekan ulang, UUID-nya sama.
2. Server menyimpan key ini di collection `idempotencyKeys` dengan TTL 24 jam, berisi hash body + response yang dikembalikan pertama kali.
3. Kalau key sudah ada dan hash body **sama** → kembalikan response yang tersimpan (tidak memproses ulang).
4. Kalau key sudah ada tapi hash body **berbeda** → `409 Conflict` dengan kode `IDEMPOTENCY_KEY_REUSED`.
5. Kalau key belum ada → proses normal, simpan hasilnya.

**Kenapa TTL 24 jam?** Cukup lama untuk menutupi retry manual user (detik–menit) dan retry otomatis klien (menit), tapi tidak membengkakkan storage. Kita tidak butuh idempotency abadi.

> **Catatan TTL (best-effort):** Firestore TTL Policy **tidak** menghapus dokumen tepat pada `expiresAt`; penghapusan berjalan sebagai job background dan bisa tertunda hingga ~24 jam (bahkan lebih bila beban tinggi). Jadi key bisa masih ada jauh lebih lama dari 24 jam. Karena itu perlakuan idempotency ini bersifat **best-effort**, bukan jaminan abadi: selama key masih ada kita tetap memvalidasi hash body (aturan 3–4), sehingga key kedaluwarsa yang kebetulan masih tersimpan tidak menyebabkan salah replay.

Endpoint yang **wajib** mendukung `Idempotency-Key`:
`POST /stock-transactions`, `POST /requests`, `POST /users`, `POST /requests/{id}/submit`, `POST /requests/{id}/fulfill`.

> **Kenapa `submit` juga wajib?** `submit` adalah transisi state (`draft` → `submitted`) yang rawan double-submit: dua klik berturut-turut bisa memicu dua notifikasi ke admin atau `409 INVALID_STATE_TRANSITION` yang membingungkan. Idempotency membuat percobaan kedua mengembalikan response pertama.

### 1.5 Versioning — `/api/v1`

Semua endpoint berada di bawah prefix `/api/v1`.

**Kenapa di URL, bukan di header (`Accept: application/vnd.inventory.v1+json`)?** Karena versioning di URL:
- Terlihat jelas di log, dashboard monitoring, dan `curl` — mempermudah debugging.
- Bisa di-route berbeda di Cloud Run / load balancer tanpa parsing header.
- Ramah untuk frontend dan AI agent: `baseUrl` cukup diganti satu tempat.
- Bisa di-dokumentasikan dan di-test dengan mudah (Playwright cukup ganti konstanta).

Konsekuensinya: URL bukan "permanent identifier" murni, tapi trade-off ini layak untuk tim kecil. Detail strategi perubahan ada di [§9](#9-versioning--perubahan-yang-merusak).

### 1.6 Statelessness

Setiap request membawa **semua** konteks yang dibutuhkan (ID token). Server tidak menyimpan session di memory. **Kenapa?** Cloud Run bisa men-scale ke banyak instance dan mematikan instance kapan saja; session in-memory akan hilang. Token Firebase sudah membawa identitas (`uid`) dan role (`custom claims`), jadi server bisa memverifikasi tanpa state.

---

## 2. Konvensi Umum

### 2.1 Format Response — Amplop (Envelope)

**Sukses, satu objek:**

```json
{
  "data": {
    "id": "itm_01HZX3K8QN",
    "sku": "BRG-0001",
    "name": "Kertas A4 70gsm"
  },
  "meta": {
    "requestId": "req_01HZX3K8QN7P",
    "timestamp": "2026-02-14T09:12:33.412Z"
  }
}
```

**Sukses, list (dengan pagination):**

```json
{
  "data": [
    { "id": "itm_01HZX3K8QN", "sku": "BRG-0001", "name": "Kertas A4 70gsm" },
    { "id": "itm_01HZX3K8QP", "sku": "BRG-0002", "name": "Pulpen Hitam" }
  ],
  "meta": {
    "pageSize": 20,
    "hasMore": true,
    "nextCursor": "eyJpZCI6Iml0bV8wMUhaWDNLOFFQIn0",
    "requestId": "req_01HZX3K8QN7P",
    "timestamp": "2026-02-14T09:12:33.412Z"
  }
}
```

**Kenapa pakai amplop `data` + `meta`, bukan array telanjang?**
1. Menambah metadata (pagination, request ID, warning) tanpa breaking change. Kalau response adalah array telanjang, menambahkan metadata berarti mengubah bentuk root → breaking.
2. `requestId` memungkinkan user menyebutkan ID saat melapor bug, dan kita bisa mencari log yang sama.
3. Konsisten: klien selalu membaca `res.data`, tidak perlu menebak bentuk.

### 2.2 Format Error Standar

Semua error memakai bentuk yang sama — **satu** bentuk, tanpa kecuali.

```json
{
  "error": {
    "code": "STOCK_INSUFFICIENT",
    "message": "Stok tidak mencukupi untuk melakukan pengeluaran barang.",
    "details": [
      {
        "field": "quantity",
        "issue": "Diminta 50, tersedia 12",
        "value": 50
      }
    ],
    "requestId": "req_01HZX3K8QN7P",
    "timestamp": "2026-02-14T09:12:33.412Z",
    "docs": "https://docs.inventory-system.web.app/errors/STOCK_INSUFFICIENT"
  }
}
```

| Field | Tipe | Wajib | Keterangan |
| --- | --- | --- | --- |
| `code` | string | ✅ | Kode mesin, `SCREAMING_SNAKE_CASE`, stabil, untuk branching di frontend. **Jangan** diubah tanpa versioning. |
| `message` | string | ✅ | Pesan manusia dalam Bahasa Indonesia, boleh berubah kapan saja. **Jangan** di-parse frontend. |
| `details` | array | ❌ | Rincian per-field untuk error validasi/bisnis. |
| `details[].field` | string | ❌ | Path field, mis. `items[2].quantity` (dot/bracket notation). |
| `details[].issue` | string | ❌ | Penjelasan spesifik field tersebut. |
| `details[].value` | any | ❌ | Nilai yang ditolak (membantu debugging; **jangan** sertakan data sensitif seperti password). |
| `requestId` | string | ✅ | ID unik request, juga dikirim di header `X-Request-Id`. |
| `timestamp` | string | ✅ | ISO 8601 UTC. |
| `docs` | string | ❌ | Tautan ke dokumentasi error (opsional, menyusul). |

**Aturan penting:** `code` untuk **logika**, `message` untuk **tampilan**. Frontend boleh melakukan `if (err.code === "STOCK_INSUFFICIENT")`. Frontend **tidak boleh** melakukan `if (err.message.includes("Stok"))`.

**Katalog kode error** ada di [§10.2](#102-katalog-kode-error).

### 2.3 Pagination — Cursor-based (bukan Offset)

**Keputusan: cursor-based pagination.**

Request:

```http
GET /api/v1/items?pageSize=20&cursor=eyJpZCI6Iml0bV8wMUhaWDNLOFFQIn0
```

Response `meta`:

```json
{
  "pageSize": 20,
  "hasMore": true,
  "nextCursor": "eyJpZCI6Iml0bV8wMUhaWDNLOFFQIn0",
  "prevCursor": "eyJpZCI6Iml0bV8wMUhaWDNLOFFQIn0",
  "totalEstimate": 134
}
```

Aturan:
- `pageSize`: default `20`, min `1`, maks `100`. Kalau > 100 → `400 VALIDATION_ERROR` (mencegah query mahal).
- `cursor`: opaque string (Base64 dari JSON `{ "id": "...", "sortValue": "..." }`). Klien **tidak boleh** menafsirkan isinya.
- `hasMore`: boolean. Kalau `false`, `nextCursor` = `null`.
- `totalEstimate`: **opsional** dan boleh perkiraan. Tidak dijamin akurat.

**Kenapa cursor-based, bukan `?page=2&limit=20` (offset)?**

1. **Konsistensi saat data berubah.** Dengan offset, kalau ada item baru disisipkan di awal saat user sedang membuka halaman 1 → halaman 2 akan **melewatkan** satu item, atau **mengulang** satu item. Di aplikasi gudang yang datanya terus berubah, ini menyebabkan user melihat data yang salah dan mengambil keputusan salah. Cursor menunjuk ke posisi dokumen tertentu, jadi tidak terpengaruh penyisipan.
2. **Performa Firestore.** Firestore **tidak** punya `OFFSET` murni yang murah. Query dengan `startAfter(documentSnapshot)` adalah lanjutan langsung dari index — biaya baca hanya sebesar dokumen yang dikembalikan. Mensimulasikan offset berarti membaca dan membuang N dokumen di depan (`.offset(n)`), yang tetap **dihitung sebagai pembacaan** dan makin lambat makin dalam halamannya. Halaman 100 dengan pageSize 20 = 2.000 pembacaan sia-sia.
3. **Cocok dengan `limit()` + `startAfter()`** — API native Firestore, tanpa trik.
4. **Deep pagination tetap O(1)-ish** — tidak melambat drastis di halaman akhir.

**Trade-off yang kita terima:** user **tidak bisa** lompat langsung ke halaman 7. Untuk UX, kita pakai tombol "Muat lebih banyak" / infinite scroll, bukan deretan nomor halaman. Ini justru umum di aplikasi modern dan lebih ramah seluler (staff gudang sering pakai HP). Kalau nanti benar-benar butuh nomor halaman (mis. untuk laporan cetak), itu ditangani lewat **endpoint export** (`POST /reports/export`), bukan pagination list.

**Implementasi cursor di Firestore (konsep):**

```ts
// GET /api/v1/items?pageSize=20&cursor=...
let q = db.collection("items")
  .where("isActive", "==", true)
  .orderBy("name", "asc")
  .orderBy("__name__", "asc")     // tie-breaker: WAJIB ada di orderBy
  .limit(pageSize + 1);           // ambil +1 untuk deteksi hasMore

if (cursor) {
  const { id, sortValue } = decodeCursor(cursor);
  // startAfter dengan (sortValue, id) HANYA sah jika __name__ ikut di orderBy.
  q = q.startAfter(sortValue, id); // (sortValue, documentId) = tie-breaker unik
}

const snap = await q.get();
const hasMore = snap.docs.length > pageSize;
const docs = snap.docs.slice(0, pageSize);
```

> **Tie-breaker wajib:** karena `name` bisa duplikat, cursor menyertakan `documentId` sebagai pembanding kedua. Tanpa ini, urutan tidak stabil dan cursor bisa "nyangkut" atau melompati data.
>
> **Penting soal Firestore:** `startAfter(a, b)` mensyaratkan query sudah mengurutkan **dua** field yang sesuai (`name` **dan** `__name__`). Mengirim dua nilai pada query yang hanya `orderBy("name")` akan error. Karena itu `orderBy('__name__','asc')` harus ada, dan `__name__` harus disertakan di composite index yang dipakai (mis. `isActive ASC, name ASC, __name__ ASC`). Alternatif yang lebih sederhana: simpan `lastDocSnapshot` halaman sebelumnya lalu panggil `startAfter(lastDocSnapshot)` — Firestore otomatis memakai posisi dokumen tanpa perlu menyebut `__name__` eksplisit.

### 2.4 Sorting

```
GET /api/v1/items?sort=-updatedAt
GET /api/v1/stock-transactions?sort=occurredAt    # ascending
```

- Format: `sort=<field>` untuk ascending, `sort=-<field>` untuk descending.
- Multi-field: `sort=-categoryId,name` (dipisah koma; dievaluasi berurutan).
- **Allowlist per endpoint.** Hanya field yang ada index-nya yang boleh. Field di luar allowlist → `400 VALIDATION_ERROR` kode `SORT_FIELD_NOT_ALLOWED`. **Kenapa allowlist?** Supaya klien tidak bisa memaksa Firestore membuat query yang butuh index tidak ada (error 500) atau memicu full scan yang mahal.
- Default sort selalu **deterministik** (selalu ditambah `__name__` / documentId sebagai tie-breaker) agar pagination stabil.

### 2.5 Filtering

Filter memakai **bracket notation** agar bisa dikombinasikan tanpa ambiguitas:

```
GET /api/v1/items?filter[categoryId]=cat_123&filter[isActive]=true
GET /api/v1/stock-transactions?filter[type]=out&filter[warehouseId]=wh_1&filter[occurredAt][gte]=2026-01-01&filter[occurredAt][lte]=2026-01-31
```

Operator yang didukung (allowlist, sama seperti sort):

| Operator | Arti | Contoh |
| --- | --- | --- |
| *(tanpa operator)* | sama dengan (`==`) | `filter[status]=submitted` |
| `[eq]` | sama dengan (eksplisit) | `filter[status][eq]=approved` |
| `[ne]` | tidak sama dengan | `filter[type][ne]=adjustment` |
| `[gt]`, `[gte]` | lebih besar / ≥ | `filter[quantity][gt]=0` |
| `[lt]`, `[lte]` | lebih kecil / ≤ | `filter[createdAt][lte]=2026-02-14` |
| `[in]` | salah satu dari (maks 30 nilai) | `filter[status][in]=submitted,approved` |
| `[contains]` | pencarian teks (lihat catatan) | `filter[name][contains]=kertas` |

**Catatan penting soal `[contains]`:** Firestore **tidak** mendukung pencarian substring native. Untuk pencarian nama/SKU kita pakai salah satu dari:
- **Prefix search** dengan `>=` dan `<=` pada field `normalizedName` yang sudah di-*lowercase* (lihat DATA-MODEL §3.5 & Q10; cocok untuk SKU/nama yang biasanya dicari dari awal).
- **Full-text** lewat layanan pihak ketiga (Algolia/Typesense) di Fase 7 — lihat [§7](#7-endpoint-laporan-reporting) dan roadmap.

Jadi `[contains]` di dokumen ini **bukan** janji Firestore native; ia adalah **kontrak API** yang implementasinya bisa berubah (Firestore prefix → Algolia) tanpa mengubah URL. Ini contoh bagus "API sebagai abstraksi".

Filter yang tidak di-allowlist → `400 VALIDATION_ERROR`.

### 2.6 Autentikasi

Semua endpoint **kecuali** yang ditandai `public` memerlukan header:

```http
Authorization: Bearer eyJhbGciOiJSUzI1NiIsImtpZCI6...
```

Token adalah **Firebase ID token** yang diperoleh frontend dari Firebase Authentication SDK (`user.getIdToken()`).

Alur verifikasi di server (konsep):

```
1. Ambil header Authorization → pastikan format "Bearer <token>"
2. admin.auth().verifyIdToken(token)        ← Firebase Admin SDK
   - memverifikasi tanda tangan (public key Google)
   - memverifikasi exp, aud, iss
3. Dari decoded token, ambil: uid, email, dan custom claim `role`
4. Ambil data user terkini dari Firestore (users/{uid}) → cek `isActive` (boolean)
5. Pasang ke request context: { uid, email, role, warehouseIds }
```

**Kenapa cek `users/{uid}.isActive` lagi padahal token sudah valid?**
Karena custom claim `role` **tertanam** di token saat token diterbitkan. Kalau admin menonaktifkan user (`isActive: false`), token lama user itu **masih valid sampai expired** (≤ 1 jam). Untuk operasi sensitif kita cek status terkini di Firestore. Token di-refresh otomatis oleh SDK setiap ~1 jam.

**Kenapa tidak pakai session cookie sendiri?** Firebase ID token sudah memberi kita autentikasi terkelola (password hashing, MFA nanti, reset password, verifikasi email) tanpa kita menyimpan password. Kita tidak ingin menulis sistem auth sendiri — risiko keamanannya tinggi dan tidak ada nilai tambah untuk portfolio.

**Token kadaluarsa / invalid → `401`** dengan kode `AUTH_TOKEN_EXPIRED` atau `AUTH_TOKEN_INVALID`. Frontend harus menangkap ini, memanggil `getIdToken(true)` untuk refresh, lalu retry **sekali**. Kalau masih 401 → paksa logout.

### 2.7 Role & Otorisasi

Tiga role (dari konteks proyek):

| Role | Deskripsi | Boleh apa |
| --- | --- | --- |
| `admin` | Akses penuh | Semua endpoint, kelola user, master data, approval |
| `staff` | Operator gudang | Input transaksi stok, buat & submit permintaan barang |
| `viewer` | Pengamat | Hanya baca dashboard & laporan |

**Matriks izin ringkas** (detail per endpoint ada di [§3](#3-daftar-endpoint-lengkap)). Matriks ini **kanonik** dan harus sama dengan `SECURITY.md §3.2` serta `PROJECT.md §3.4`:

| Aksi | admin | staff | viewer |
| --- | :---: | :---: | :---: |
| Baca dashboard & laporan | ✅ | ✅ | ✅ |
| Baca `categories`, `items`, `units`, `warehouses`, `divisions` | ✅ | ✅ | ✅ |
| Baca `suppliers` | ✅ | ✅ | ❌ |
| Buat/ubah/hapus master data | ✅ | ❌ | ❌ |
| Buat transaksi stok `in`/`out` | ✅ | ✅ | ❌ |
| Buat transaksi stok `adjustment` | ✅ | ❌ | ❌ |
| Baca `stockTransactions` | ✅ | ✅ | ✅ |
| Reverse / batalkan transaksi stok | ✅ | ❌ | ❌ |
| Baca `requests` (semua) | ✅ | ❌ | ❌ |
| Baca `requests` (milik sendiri) | ✅ | 🔒 | ❌ |
| Buat & submit permintaan (`draft` → `submitted`) | ✅ | ✅ | ❌ |
| Approve / reject permintaan | ✅ | ❌ | ❌ |
| Fulfill permintaan (stok keluar) | ✅ | ❌ | ❌ |
| Cancel permintaan | ✅ | 🔒 (milik sendiri, sebelum `fulfilled`) | ❌ |
| Kelola user & role | ✅ | ❌ | ❌ |
| Lihat audit log | ✅ | ❌ | ❌ |

Legend: ✅ boleh · ❌ tidak boleh · 🔒 hanya data miliknya sendiri.

**Catatan penting soal `adjustment`, `fulfill`, dan `reverse`:** ketiganya **admin-only** — ini keputusan yang ditegakkan di server (lihat [§6.2](#62-hanya-admin-boleh-approve) dan `SECURITY.md §3.2`). `staff` boleh mencatat `in`/`out` dan membuat/mengajukan permintaan, tetapi **tidak** boleh melakukan penyesuaian stok, memenuhi permintaan (yang mengeluarkan stok), atau membalik transaksi. `viewer` hanya baca — dan **tidak** boleh melihat `suppliers` maupun `requests` (data supplier bersifat sensitif; `requests` berisi data divisi internal).

**Role disimpan di mana?** Di **custom claims** Firebase Auth (`{ role: "admin" }`) **dan** dicerminkan di `users/{uid}.role` untuk query/listing. Sumber kebenaran otorisasi saat request adalah **custom claim** (cepat, sudah di token); Firestore dipakai untuk UI dan laporan.

**Kenapa custom claims, bukan cek collection `users` setiap request?**
1. Custom claim sudah ada di token → **nol** pembacaan Firestore tambahan untuk cek role.
2. Bisa ditegakkan juga di **Firestore Security Rules** (`request.auth.token.role == 'admin'`), jadi konsisten antara API dan akses langsung.
3. **Kenapa tetap dicerminkan di Firestore?** Karena custom claim tidak bisa di-query ("tampilkan semua admin") dan tidak cocok untuk ditampilkan di tabel user.

Role gagal → `403 FORBIDDEN` dengan kode `ROLE_INSUFFICIENT` dan `details` menyebut role yang dibutuhkan.

### 2.8 Header Standar

| Header | Arah | Wajib | Keterangan |
| --- | --- | --- | --- |
| `Authorization` | Request | ✅* | `Bearer <Firebase ID token>` |
| `Content-Type` | Request | ✅ (kalau ada body) | `application/json` |
| `Accept` | Request | ❌ | Default `application/json` |
| `Idempotency-Key` | Request | ❌** | UUID v4 untuk POST yang menulis data penting |
| `X-Request-Id` | Response | ✅ | ID unik request (sama dengan `meta.requestId`) |
| `X-RateLimit-Limit` | Response | ✅ | Batas request pada window saat ini |
| `X-RateLimit-Remaining` | Response | ✅ | Sisa kuota |
| `X-RateLimit-Reset` | Response | ✅ | Unix epoch kapan kuota di-reset |
| `Retry-After` | Response | ⚠️ | Hanya saat `429`/`503`; detik sampai boleh retry |
| `Location` | Response | ⚠️ | Hanya saat `201`; URL resource yang baru dibuat |
| `ETag` | Response | ❌ | Opsional untuk cache detail yang jarang berubah |

\* Kecuali endpoint `public`.
\*\* Wajib pada endpoint yang tercantum di [§1.4](#14-idempotency).

### 2.9 Tanggal & Waktu

- Semua timestamp dikirim sebagai **ISO 8601 UTC** dengan milidetik dan `Z`: `2026-02-14T09:12:33.412Z`.
- **Kenapa UTC dan bukan `Asia/Jakarta`?** Karena server, Firestore, dan klien harus sepakat pada satu titik waktu. Konversi ke WIB dilakukan di **frontend** untuk tampilan (`Intl.DateTimeFormat('id-ID', { timeZone: 'Asia/Jakarta' })`). Menyimpan waktu lokal di API = bug menunggu terjadi saat DST/zona berubah (walau Indonesia tanpa DST, tetap praktik yang benar).
- Tanggal saja (tanpa jam), mis. `expectedDate`, memakai `YYYY-MM-DD`.

### 2.10 Soft Delete

Tidak ada penghapusan fisik. Semua resource master (`users`, `items`, `suppliers`, `categories`, `units`, `warehouses`, `divisions`) memakai flag **`isActive`** boolean — arsip = `isActive: false`, bukan menghapus dokumen dan **bukan** field `deletedAt`.

- `DELETE /<resource>/{id}` (endpoint #17, #24, dst.) berarti **nonaktifkan** (`isActive: false`), bukan hapus dokumen.
- Semua endpoint list **default** menyembunyikan yang `isActive == false`; admin bisa memakai `?filter[isActive]=false` atau `?includeInactive=true`.
- `DELETE` pada resource yang sudah nonaktif → `204` (idempoten).
- **Kenapa `isActive`, bukan `deletedAt`?** Karena model data kanonik (`docs/DATA-MODEL.md`) memakai satu mekanisme yang seragam: transaksi stok lama **merujuk** ke item/supplier yang mungkin sudah tidak dipakai, dan `users` dipakai sebagai referensi pelaku di `auditLogs`. Menyimpan flag `isActive` (bukan `deletedAt`) membuat satu field menjawab "apakah masih boleh dipakai?" tanpa perlu membedakan "dihapus" vs "dinonaktifkan", dan menyelaraskan `users` dengan resource lain. Integritas referensial tetap terjaga karena dokumen tidak pernah dihapus.

> **Pengecualian — resource transaksional (`stockTransactions`, `auditLogs`) tidak bisa dinonaktifkan maupun dihapus sama sekali.** `stockTransactions` dikoreksi dengan membalik (`reverse`) — bukan edit/hapus — dan `auditLogs` bersifat append-only tanpa endpoint ubah/hapus (lihat DATA-MODEL §3.7, §3.10).

---

## 3. Daftar Endpoint Lengkap

Legenda kolom **Role**: `A` = admin, `S` = staff, `V` = viewer. `—` = publik. `S*` = staff dengan pembatasan (mis. hanya data miliknya sendiri), lihat catatan di bawah tabel.

**Total: 107 baris endpoint.**

> **Catatan penamaan path:** seluruh segmen path REST memakai **kebab-case** (mis. `/stock-transactions`, `/audit-logs`), sedangkan koleksi Firestore memakai **camelCase jamak** (mis. `stockTransactions`, `auditLogs`). Perbedaan ini disengaja dan pemetaannya dilakukan eksplisit di backend (lihat §10.4).

### 3.1 Auth & Session

| # | Method | Path | Deskripsi | Role | Request (ringkas) | Response (ringkas) |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | `POST` | `/auth/session` | Buka sesi: verifikasi ID token hasil login SDK, kembalikan profil + role | — | `{ deviceInfo? }` | `{ user, role, expiresIn }` |
| 2 | `GET` | `/auth/me` | Profil saya + role (dari token) | A S V | — | `{ user, role }` |
| 3 | `DELETE` | `/auth/session` | Logout, cabut refresh token | A S V | `{ refreshToken? }` | `204` |
| 4 | `POST` | `/auth/session/refresh` | Tukar refresh token jadi ID token baru | A S V | `{ refreshToken }` | `{ idToken, expiresIn }` |
| 5 | `POST` | `/auth/password/forgot` | Kirim email reset password | — | `{ email }` | `202` |
| 6 | `POST` | `/auth/password/reset` | Selesaikan reset password dengan token | — | `{ oobCode, newPassword }` | `204` |
| 7 | `POST` | `/auth/password/change` | Ubah password saat sudah login | A S V | `{ currentPassword, newPassword }` | `204` |
| 8 | `POST` | `/auth/email/verify` | Verifikasi email dengan oobCode | — | `{ oobCode }` | `{ email, verified }` |
| 9 | `POST` | `/auth/email/resend` | Kirim ulang email verifikasi | A S V | — | `202` |

> **Catatan arsitektur:** login sebenarnya dilakukan **frontend langsung ke Firebase Authentication SDK** (`signInWithEmailAndPassword`), bukan lewat API kita. Endpoint `POST /auth/session` di sini adalah **pembungkus tipis** yang: (1) memverifikasi ID token hasil login, (2) mengambil `role` dari custom claims, (3) memastikan user ada & aktif di Firestore, (4) mengembalikan profil lengkap + role. **Kenapa tetap ada?** Supaya frontend punya satu titik "sesi saya sekarang seperti apa" yang konsisten, dan supaya API kita tidak perlu tahu detail Firebase di sisi klien. Endpoint ini **tidak** menyimpan password.

### 3.2 Users

| # | Method | Path | Deskripsi | Role | Request (ringkas) | Response (ringkas) |
| --- | --- | --- | --- | --- | --- | --- |
| 10 | `GET` | `/users` | List user (filter role/status, pagination) | A | `?filter[role]=staff&filter[isActive]=true&sort=displayName` | `{ data: User[], meta }` |
| 11 | `POST` | `/users` | Buat user baru (admin membuat akun Auth via Admin SDK `createUser`; trigger membuat dokumen profil) | A | `{ email, displayName, role, warehouseIds? }` | `201 { data: User }` |
| 12 | `GET` | `/users/{userId}` | Detail user | A | — | `{ data: User }` |
| 13 | `PATCH` | `/users/{userId}` | Ubah nama / divisi / warehouse | A | `{ displayName?, department?, warehouseIds? }` | `{ data: User }` |
| 14 | `PATCH` | `/users/{userId}/role` | Ubah role (set custom claim) | A | `{ role: "admin"\|"staff"\|"viewer" }` | `{ data: User }` |
| 15 | `PATCH` | `/users/{userId}/status` | Aktifkan / nonaktifkan user | A | `{ isActive: true\|false }` | `{ data: User }` |
| 16 | `POST` | `/users/{userId}/password-reset` | Paksa reset password (kirim email) | A | — | `202` |
| 17 | `DELETE` | `/users/{userId}` | Nonaktifkan user (`isActive: false`), bukan hapus/soft-delete | A | — | `204` |

> **Alur pembuatan user (kanonik):** admin memanggil `POST /users` → backend memakai Admin SDK `createUser({ email, displayName })` → Cloud Function trigger `onCreate` (Firebase Auth) membuat dokumen `users/{uid}` dengan `role`, `isActive: true`, dll. Ini **satu** alur yang sama dengan ROADMAP Fase 1 dan SECURITY.md §4.2 (rules mengizinkan admin membuat dokumen `users`). Klien **tidak pernah** mengirim password; Firebase yang menangani kredensial awal/invite.

### 3.3 Categories

| # | Method | Path | Deskripsi | Role | Request (ringkas) | Response (ringkas) |
| --- | --- | --- | --- | --- | --- | --- |
| 18 | `GET` | `/categories` | List kategori | A S V | `?sort=name` | `{ data: Category[], meta }` |
| 19 | `POST` | `/categories` | Buat kategori | A | `{ name, code, description? }` | `201 { data: Category }` |
| 20 | `GET` | `/categories/{categoryId}` | Detail kategori | A S V | — | `{ data: Category }` |
| 21 | `PATCH` | `/categories/{categoryId}` | Ubah kategori | A | `{ name?, description?, isActive? }` | `{ data: Category }` |
| 22 | `DELETE` | `/categories/{categoryId}` | Nonaktifkan kategori (`isActive: false`) | A | — | `204` |

### 3.4 Suppliers

| # | Method | Path | Deskripsi | Role | Request (ringkas) | Response (ringkas) |
| --- | --- | --- | --- | --- | --- | --- |
| 23 | `GET` | `/suppliers` | List supplier | A S | `?filter[isActive]=true` | `{ data: Supplier[], meta }` |
| 24 | `POST` | `/suppliers` | Buat supplier | A | `{ name, contactPerson, phone, email?, address? }` | `201 { data: Supplier }` |
| 25 | `GET` | `/suppliers/{supplierId}` | Detail supplier | A S | — | `{ data: Supplier }` |
| 26 | `PATCH` | `/suppliers/{supplierId}` | Ubah supplier | A | `{ name?, phone?, email?, isActive? }` | `{ data: Supplier }` |
| 27 | `DELETE` | `/suppliers/{supplierId}` | Nonaktifkan supplier (`isActive: false`) | A | — | `204` |
| 28 | `GET` | `/suppliers/{supplierId}/items` | Item yang biasa dipasok supplier ini | A S | `?pageSize=20` | `{ data: Item[], meta }` |

> **Catatan `viewer` & suppliers:** `viewer` **tidak** boleh melihat data supplier (data kontak/harga sensitif). Ini sesuai SECURITY.md §3.2 dan §4.2 rules (`allow read: if isAdmin() || isStaff()`).

### 3.4b Divisions (Divisi)

> Master data divisi (BR-24, US-50) — dipakai sebagai `department`/`divisionId` pada permintaan dan transaksi barang keluar. Koleksi `divisions` didefinisikan di DATA-MODEL §3.3b.

| # | Method | Path | Deskripsi | Role | Request (ringkas) | Response (ringkas) |
| --- | --- | --- | --- | --- | --- | --- |
| 28a | `GET` | `/divisions` | List divisi | A S V | `?filter[isActive]=true&sort=name` | `{ data: Division[], meta }` |
| 28b | `POST` | `/divisions` | Buat divisi | A | `{ name, code, description? }` | `201 { data: Division }` |
| 28c | `GET` | `/divisions/{divisionId}` | Detail divisi | A S V | — | `{ data: Division }` |
| 28d | `PATCH` | `/divisions/{divisionId}` | Ubah divisi | A | `{ name?, code?, description?, isActive? }` | `{ data: Division }` |
| 28e | `DELETE` | `/divisions/{divisionId}` | Nonaktifkan divisi (`isActive: false`) | A | — | `204` |

### 3.5 Units (Satuan)

| # | Method | Path | Deskripsi | Role | Request (ringkas) | Response (ringkas) |
| --- | --- | --- | --- | --- | --- | --- |
| 29 | `GET` | `/units` | List satuan (pcs, box, kg, liter) | A S V | — | `{ data: Unit[], meta }` |
| 30 | `POST` | `/units` | Buat satuan | A | `{ name, symbol }` | `201 { data: Unit }` |
| 31 | `GET` | `/units/{unitId}` | Detail satuan | A S V | — | `{ data: Unit }` |
| 32 | `PATCH` | `/units/{unitId}` | Ubah satuan | A | `{ name?, symbol? }` | `{ data: Unit }` |
| 33 | `DELETE` | `/units/{unitId}` | Nonaktifkan satuan (`isActive: false`) | A | — | `204` |

### 3.6 Warehouses

| # | Method | Path | Deskripsi | Role | Request (ringkas) | Response (ringkas) |
| --- | --- | --- | --- | --- | --- | --- |
| 34 | `GET` | `/warehouses` | List gudang | A S V | `?filter[isActive]=true` | `{ data: Warehouse[], meta }` |
| 35 | `POST` | `/warehouses` | Buat gudang | A | `{ name, code, address, picUserId? }` | `201 { data: Warehouse }` |
| 36 | `GET` | `/warehouses/{warehouseId}` | Detail gudang | A S V | — | `{ data: Warehouse }` |
| 37 | `PATCH` | `/warehouses/{warehouseId}` | Ubah gudang | A | `{ name?, address?, picUserId?, isActive? }` | `{ data: Warehouse }` |
| 38 | `DELETE` | `/warehouses/{warehouseId}` | Nonaktifkan gudang (`isActive: false`) | A | — | `204` |
| 39 | `GET` | `/warehouses/{warehouseId}/stock` | Ringkasan stok per gudang | A S V | `?filter[categoryId]=...` | `{ data: StockRow[], meta }` |

### 3.7 Items

| # | Method | Path | Deskripsi | Role | Request (ringkas) | Response (ringkas) |
| --- | --- | --- | --- | --- | --- | --- |
| 40 | `GET` | `/items` | List item (filter kategori, `isActive`, low-stock; pagination) | A S V | `?filter[categoryId]=...&filter[isLowStock]=true&sort=name` | `{ data: Item[], meta }` |
| 41 | `POST` | `/items` | Buat item / SKU baru | A | `{ sku, name, categoryId, unitId, minStock, costPrice?, sellPrice?, supplierId?, ... }` | `201 { data: Item }` |
| 42 | `GET` | `/items/{itemId}` | Detail item + stok agregat | A S V | — | `{ data: Item }` |
| 43 | `PATCH` | `/items/{itemId}` | Ubah item (nama, kategori, minStock, harga) | A | `{ name?, categoryId?, minStock?, costPrice?, sellPrice?, supplierId?, ... }` | `{ data: Item }` |
| 44 | `DELETE` | `/items/{itemId}` | Nonaktifkan item (`isActive: false`; tidak menghapus dokumen) | A | — | `204` |
| 45 | `GET` | `/items/{itemId}/stock` | Stok per gudang untuk item ini (dari map `stockByWarehouse`) | A S V | — | `{ data: WarehouseStock[] }` |
| 46 | `GET` | `/items/{itemId}/transactions` | Riwayat transaksi item ini | A S V | `?pageSize=20&sort=-occurredAt` | `{ data: StockTransaction[], meta }` |
| 47 | `GET` | `/items/low-stock` | Item yang stoknya ≤ `minStock` (`isLowStock == true`) | A S V | `?filter[warehouseId]=...` | `{ data: LowStockItem[], meta }` |
| 48 | `POST` | `/items/{itemId}/image` | Unggah / ganti gambar item | A | `{ uploadId }` (dari `/uploads`) | `{ data: Item }` |
| 49 | `DELETE` | `/items/{itemId}/image` | Hapus gambar item | A | — | `{ data: Item }` |
| 49a | `GET` | `/items/export` | Export daftar item ke CSV/XLSX (streaming, read-only) | A | `?filter[categoryId]=...&format=csv` | `200` (file stream) |

> **Urutan registrasi rute (statis vs dinamis):** rute statis **wajib** didaftarkan **sebelum** rute berparameter, jika tidak `low-stock`/`export` akan diperlakukan sebagai `{itemId}`. Jadi daftarkan `GET /items/low-stock` dan `GET /items/export` **sebelum** `GET /items/{itemId}`. Hal yang sama berlaku untuk `/stock-transactions/summary` dan `/stock-transactions/export` sebelum `/stock-transactions/{transactionId}` (lihat §3.8). Alternatif yang lebih aman: pindahkan low-stock menjadi query `GET /items?filter[isLowStock]=true` sehingga tidak ada dua rute yang berebut prefix.

### 3.8 Stock Transactions

| # | Method | Path | Deskripsi | Role | Request (ringkas) | Response (ringkas) |
| --- | --- | --- | --- | --- | --- | --- |
| 50 | `GET` | `/stock-transactions` | List transaksi stok (filter tipe, tanggal, gudang, item) | A S V | `?filter[type]=out&filter[occurredAt][gte]=...` | `{ data: StockTransaction[], meta }` |
| 51 | `POST` | `/stock-transactions` | Catat transaksi stok (`in`/`out`/`adjustment`; multi-item via `lines[]`) | A S† | `{ type, warehouseId, lines:[{itemId,quantity}], supplierId?, divisionId?, requestId?, note, reason?, occurredAt?, attachments? }` | `201 { data: StockTransaction }` |
| 52 | `GET` | `/stock-transactions/{transactionId}` | Detail transaksi | A S V | — | `{ data: StockTransaction }` |
| 53 | `POST` | `/stock-transactions/{transactionId}/reverse` | Balik transaksi (buat jurnal lawan) | A | `{ reason }` | `201 { data: StockTransaction }` |
| 53a | `PATCH` | `/stock-transactions/{transactionId}/cancel` | Batalkan transaksi (`status` → `cancelled`; angka tidak diubah) | A | `{ reason }` | `{ data: StockTransaction }` |
| 54 | `GET` | `/stock-transactions/summary` | Ringkasan total in/out/adjustment per periode | A S V | `?from=...&to=...&groupBy=day` | `{ data: SummaryRow[] }` |
| 55 | `POST` | `/stock-transactions/export` | Export transaksi ke CSV/XLSX (async) | A S V | `{ format, filters }` | `202 { jobId }` |
| 55a | `POST` | `/stock-transactions/{transactionId}/attachments` | Lampirkan foto/nota bukti pada transaksi | A S | `{ uploadId, label? }` | `201 { data: Attachment }` |
| 55b | `GET` | `/stock-transactions/{transactionId}/attachments` | Daftar lampiran transaksi | A S V | — | `{ data: Attachment[] }` |

† `staff` boleh membuat `in`/`out`; `type: "adjustment"` **hanya** `admin` (lihat [§2.7](#27-role--otorisasi) dan [§6](#6-aturan-bisnis-di-api)). Validasi tipe harus memeriksa role di server, bukan hanya lewat kolom role.

> **Catatan penting:** `POST /stock-transactions` adalah **satu-satunya** cara sah untuk mengubah angka stok. Tidak ada endpoint `PATCH /items/{id}` yang menerima `currentStock`/`stockByWarehouse` — lihat [§6.1](#61-stok-tidak-boleh-negatif).
>
> **Multi-item:** satu transaksi mencatat beberapa item melalui `lines[]` (mis. `[{ itemId, quantity }]`), bukan satu `itemId` tunggal. Setiap baris divalidasi dan di-*apply* ke `items` dalam transaksi Firestore yang sama.
>
> **Rute statis vs dinamis:** `GET /stock-transactions/summary` dan `POST /stock-transactions/export` **wajib** didaftarkan sebelum `GET /stock-transactions/{transactionId}`, agar `summary`/`export` tidak dianggap `{transactionId}`.
>
> **Export via `POST`, bukan `GET`:** export memicu job asinkron (mengembalikan `202` + `jobId`) dan memuat filter kompleks di body, sehingga `POST` lebih tepat daripada `GET` berbody (lihat [§1.2](#12-http-method-yang-benar) dan [§7.4](#74-strategi-c--export-asinkron)). Alternatif: arahkan export transaksi ke `POST /reports/export` dengan `{ report: "stock-transactions", ... }`.

### 3.9 Requests (Permintaan Barang)

| # | Method | Path | Deskripsi | Role | Request (ringkas) | Response (ringkas) |
| --- | --- | --- | --- | --- | --- | --- |
| 56 | `GET` | `/requests` | List permintaan (filter status, pemohon, tanggal). `staff` hanya melihat miliknya | A S* | `?filter[status]=submitted` | `{ data: Request[], meta }` |
| 57 | `POST` | `/requests` | Buat permintaan (status awal `draft`) | A S | `{ title, warehouseId, department, priority, neededAt?, notes?, items:[{itemId, quantityRequested, note?}] }` | `201 { data: Request }` |
| 58 | `GET` | `/requests/{requestId}` | Detail permintaan + item (sub-resource) + riwayat approval | A S* | — | `{ data: Request }` |
| 59 | `PATCH` | `/requests/{requestId}` | Ubah permintaan yang masih `draft` | A S | `{ title?, neededAt?, notes?, items? }` | `{ data: Request }` |
| 60 | `POST` | `/requests/{requestId}/submit` | Ajukan permintaan (`draft` → `submitted`) | A S | — | `{ data: Request }` |
| 61 | `POST` | `/requests/{requestId}/approve` | Setujui permintaan (`submitted` → `approved`) | A | `{ note? }` | `{ data: Request }` |
| 62 | `POST` | `/requests/{requestId}/reject` | Tolak permintaan (`submitted` → `rejected`) | A | `{ reason }` | `{ data: Request }` |
| 63 | `POST` | `/requests/{requestId}/fulfill` | Penuhi permintaan → catat stok keluar (`approved` → `fulfilled`) | A | `{ warehouseId?, items? }` | `200 { data: Request }` |
| 64 | `POST` | `/requests/{requestId}/cancel` | Batalkan (`draft`/`submitted`/`approved` → `cancelled`) | A S* | `{ reason? }` | `{ data: Request }` |
| 65 | `GET` | `/requests/{requestId}/comments` | Komentar/catatan pada permintaan | A S* | `?pageSize=20` | `{ data: Comment[], meta }` |
| 66 | `POST` | `/requests/{requestId}/comments` | Tambah komentar | A S | `{ body }` | `201 { data: Comment }` |
| 67 | `GET` | `/requests/{requestId}/history` | Jejak transisi status (dari auditLogs) | A S* | — | `{ data: StatusEvent[] }` |
| 68 | `POST` | `/requests/{requestId}/attachments` | Lampirkan dokumen (nota, foto) | A S | `{ uploadId, label? }` | `201 { data: Attachment }` |

\* `S*` = `staff` dengan pembatasan akses:
- `staff` hanya boleh melihat/mengubah permintaan **miliknya sendiri** (`requestedBy == uid`), ditegakkan di service layer, bukan hanya di UI.
- `staff` hanya boleh membatalkan permintaan **miliknya sendiri** dan berstatus `draft`/`submitted`/`approved` (belum `fulfilled`). `admin` boleh membatalkan milik siapa pun (lihat [§6.3](#63-transisi-status-yang-sah)).
- `viewer` **tidak** boleh melihat `requests` sama sekali (berisi data divisi internal) — sesuai SECURITY.md §3.2.

> **Bentuk data permintaan (kanonik):** baris item permintaan disimpan di **subkoleksi** `requests/{requestId}/requestItems` (lihat DATA-MODEL §3.9), bukan array inline di dokumen header. Di payload/response API, `items` diperlakukan sebagai **sub-resource** (endpoint terpisah atau objek bersarang), dengan field `quantityRequested`, `quantityApproved`, dan `quantityFulfilled` — bukan `quantity` tunggal. Field header memakai `neededAt` (timestamp) dan `notes` (bukan `neededDate`/`note`).

### 3.10 Reports

| # | Method | Path | Deskripsi | Role | Request (ringkas) | Response (ringkas) |
| --- | --- | --- | --- | --- | --- | --- |
| 69 | `GET` | `/reports/stock-summary` | Ringkasan stok per item/kategori/gudang | A S V | `?groupBy=category&asOf=2026-02-14` | `{ data: StockSummaryRow[] }` |
| 70 | `GET` | `/reports/stock-movement` | Mutasi stok (in/out) per periode | A S V | `?from=...&to=...&groupBy=day` | `{ data: MovementRow[] }` |
| 71 | `GET` | `/reports/low-stock` | Laporan item di bawah stok minimum | A S V | `?warehouseId=...` | `{ data: LowStockRow[] }` |
| 72 | `GET` | `/reports/requests` | Statistik permintaan (volume, approval time, ditolak) | A S V | `?from=...&to=...` | `{ data: RequestReportRow[] }` |
| 73 | `GET` | `/reports/valuation` | Nilai persediaan (qty × harga) | A S V | `?asOf=2026-02-14&method=fifo\|avg` | `{ data: ValuationRow[], meta }` |
| 74 | `GET` | `/reports/audit` | Laporan aktivitas user (dari auditLogs) | A | `?from=...&to=...&actorId=...` | `{ data: AuditRow[], meta }` |
| 75 | `POST` | `/reports/export` | Export laporan apa pun ke CSV/XLSX (async) | A S V | `{ report, format, filters }` | `202 { jobId, statusUrl }` |
| 76 | `GET` | `/reports/exports/{jobId}` | Status & URL unduh hasil export | A S V | — | `{ data: ExportJob }` |

### 3.11 Dashboard

| # | Method | Path | Deskripsi | Role | Request (ringkas) | Response (ringkas) |
| --- | --- | --- | --- | --- | --- | --- |
| 77 | `GET` | `/dashboard/summary` | KPI utama (total item, nilai stok, low stock, pending) | A S V | — | `{ data: DashboardSummary }` |
| 78 | `GET` | `/dashboard/low-stock` | Widget item menipis (top N) | A S V | `?limit=10` | `{ data: LowStockItem[] }` |
| 79 | `GET` | `/dashboard/recent-transactions` | Widget transaksi terbaru | A S V | `?limit=10` | `{ data: StockTransaction[] }` |
| 80 | `GET` | `/dashboard/pending-requests` | Widget permintaan menunggu approval | A S V | `?limit=10` | `{ data: Request[] }` |
| 81 | `GET` | `/dashboard/trends` | Tren in/out 30 hari terakhir untuk grafik | A S V | `?days=30` | `{ data: TrendPoint[] }` |

### 3.12 Uploads (Firebase Storage)

| # | Method | Path | Deskripsi | Role | Request (ringkas) | Response (ringkas) |
| --- | --- | --- | --- | --- | --- | --- |
| 82 | `POST` | `/uploads/signed-url` | Minta signed URL untuk unggah langsung ke Storage | A S | `{ filename, contentType, sizeBytes, purpose }` | `201 { uploadId, uploadUrl, fields }` |
| 83 | `POST` | `/uploads/{uploadId}/complete` | Konfirmasi unggahan selesai (validasi & finalisasi) | A S | `{ checksum? }` | `{ data: Upload }` |
| 84 | `GET` | `/uploads/{uploadId}` | Metadata file + URL unduh (signed, sementara) | A S V | — | `{ data: Upload }` |
| 85 | `DELETE` | `/uploads/{uploadId}` | Hapus file dari Storage | A S* | — | `204` |

\* `staff` hanya boleh menghapus file yang ia unggah.

> **Batas ukuran & tipe per `purpose` (selaras SECURITY.md §6.2):** `purpose=item-image` → maks **5 MB**, tipe `image/jpeg|image/png|image/webp`. `purpose=request-attachment` / `purpose=transaction-attachment` → maks **10 MB**, tipe `application/pdf|image/jpeg|image/png`. Untuk lampiran sensitif, backend **memverifikasi magic bytes** (bukan hanya header `Content-Type`) saat `/complete` (lihat SECURITY.md §6.4).

### 3.13 Notifications

| # | Method | Path | Deskripsi | Role | Request (ringkas) | Response (ringkas) |
| --- | --- | --- | --- | --- | --- | --- |
| 86 | `GET` | `/notifications` | List notifikasi user saat ini | A S V | `?filter[isRead]=false` | `{ data: Notification[], meta }` |
| 87 | `PATCH` | `/notifications/{notificationId}/read` | Tandai satu notifikasi sudah dibaca | A S V | — | `{ data: Notification }` |
| 88 | `POST` | `/notifications/read-all` | Tandai semua sudah dibaca | A S V | — | `204` |
| 89 | `GET` | `/notifications/preferences` | Ambil preferensi notifikasi | A S V | — | `{ data: NotificationPrefs }` |
| 90 | `PATCH` | `/notifications/preferences` | Ubah preferensi notifikasi | A S V | `{ channels: { inApp?, email?, push? } }` | `{ data: NotificationPrefs }` |
| 91 | `POST` | `/notifications/register-token` | Daftarkan FCM device token (push) | A S V | `{ token, platform }` | `201` |

> **Bentuk data notifikasi (kanonik, sesuai DATA-MODEL §3.11):** status baca memakai field `isRead` (boolean), bukan `read`. Preferensi notifikasi disimpan sebagai **map `channels`** (mis. `{ inApp, email, push }`), bukan flag `lowStock`/`requestUpdates`/`email` terpisah. FCM device token disimpan di dokumen user: `users/{uid}.fcmTokens` (array, lihat DATA-MODEL §3.1), sehingga endpoint #91 menulis ke sana.

### 3.14 Audit Logs & System

| # | Method | Path | Deskripsi | Role | Request (ringkas) | Response (ringkas) |
| --- | --- | --- | --- | --- | --- | --- |
| 92 | `GET` | `/audit-logs` | List audit log (filter aktor, aksi, entitas, tanggal) | A | `?filter[entityType]=items&filter[actorId]=...` | `{ data: AuditLog[], meta }` |
| 93 | `GET` | `/audit-logs/{logId}` | Detail satu entri audit | A | — | `{ data: AuditLog }` |
| 94 | `GET` | `/health` | Health check (untuk monitoring & uptime) | — | — | `{ status, version, uptime }` |
| 95 | `GET` | `/meta/enums` | Daftar enum (status, role, type) untuk frontend | A S V | — | `{ data: Enums }` |

### 3.15 Integrations & Settings

| # | Method | Path | Deskripsi | Role | Request (ringkas) | Response (ringkas) |
| --- | --- | --- | --- | --- | --- | --- |
| 96 | `GET` | `/integrations/exchange-rate` | Kurs USD/IDR dari layanan pihak ketiga (dengan cache & fallback) | A S V | `?base=USD&quote=IDR` | `{ data: ExchangeRate }` |
| 97 | `GET` | `/settings` | Ambil konfigurasi aplikasi (global, lowStock, numbering) | A | `?scope=global\|lowStock\|numbering` | `{ data: Settings }` |
| 98 | `PATCH` | `/settings/{scope}` | Ubah konfigurasi (`scope` ∈ `global`\|`lowStock`\|`numbering`) | A | `{ ...field }` | `{ data: Settings }` |

> **Catatan settings:** koleksi `settings` (DATA-MODEL §3.12) dibaca/diubah lewat endpoint ini (bukan hanya lewat script), agar tidak ada dua sumber kebenaran. Perubahan `settings/global.allowNegativeStock` memengaruhi aturan stok di [§6.1](#61-stok-tidak-boleh-negatif). `scope=numbering` sebaiknya hanya diubah lewat tool admin karena menyentuh counter penomoran — perubahan manual berisiko membuat nomor duplikat.

> **Catatan jumlah:** tabel di atas memuat **107 baris endpoint** (beberapa nomor memuat sub-aksi). Jauh di atas minimum 45, karena setiap user story (kelola master data, transaksi stok, approval, laporan, notifikasi) harus punya jalur lengkap dari list → detail → aksi → export.

### 3.16 Ringkasan Cakupan User Story → Endpoint

| User Story | Endpoint utama |
| --- | --- |
| Login & lihat profil sendiri | #1, #2 |
| Admin kelola user & role | #10–#17 |
| Admin kelola master data (item, kategori, supplier, satuan, gudang, divisi) | #18–#49, #28a–#28e |
| Staff catat barang masuk/keluar (`in`/`out`) | #50–#52 |
| Admin koreksi kesalahan input (`reverse`) | #53 |
| Staff buat & ajukan permintaan barang | #56–#60 |
| Admin approve/reject permintaan | #61–#62 |
| Admin memenuhi permintaan → stok berkurang | #63 |
| Lihat dashboard & KPI | #77–#81 |
| Buat laporan stok & export Excel | #69–#76 |
| Peringatan stok menipis | #47, #71, #78 |
| Jejak audit "siapa mengubah apa" | #92–#93 |
| Lampirkan foto/nota | #82–#85, #55a, #68 |
| Integrasi API pihak ketiga | #96 |
| Kelola settings | #97–#98 |

---

## 4. Contoh Lengkap 5 Endpoint Penting

Semua contoh memakai base `https://api.inventory-system.run.app/api/v1`.

---

### 4.1 `POST /auth/session` — Login / Buka Sesi

**Skenario:** Sari (staff gudang) baru login lewat Firebase SDK di frontend, lalu menukar ID token menjadi profil sesi lengkap.

**Request**

```http
POST /api/v1/auth/session HTTP/1.1
Host: api.inventory-system.run.app
Content-Type: application/json
Authorization: Bearer eyJhbGciOiJSUzI1NiIsImtpZCI6ImFiYzEyMyJ9.eyJ1aWQiOiJ1c2VyX3NhcmlfMDEi...
```

```json
{
  "deviceInfo": {
    "platform": "web",
    "userAgent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)"
  }
}
```

> Body opsional; identitas diambil dari token. `deviceInfo` dipakai untuk audit log login.

**Response `200 OK`**

```json
{
  "data": {
    "user": {
      "uid": "usr_01HZX2A1B2",
      "email": "sari@perusahaan.co.id",
      "displayName": "Sari Wulandari",
      "role": "staff",
      "isActive": true,
      "department": "Gudang",
      "warehouseIds": ["wh_01HZX0JKT1"],
      "emailVerified": true,
      "photoUrl": null,
      "lastLoginAt": "2026-02-14T09:12:30.000Z",
      "createdAt": "2025-11-02T03:20:11.000Z"
    },
    "role": "staff",
    "expiresIn": 3600
  },
  "meta": {
    "requestId": "req_01HZX3K8QN7P",
    "timestamp": "2026-02-14T09:12:33.412Z"
  }
}
```

**Response error `401 Unauthorized`** (token kadaluarsa)

```json
{
  "error": {
    "code": "AUTH_TOKEN_EXPIRED",
    "message": "Sesi Anda sudah berakhir. Silakan login kembali.",
    "requestId": "req_01HZX3K8QN7P",
    "timestamp": "2026-02-14T09:12:33.412Z"
  }
}
```

**Response error `403 Forbidden`** (akun disuspend)

```json
{
  "error": {
    "code": "ACCOUNT_SUSPENDED",
    "message": "Akun Anda dinonaktifkan. Hubungi administrator.",
    "details": [{ "field": "isActive", "issue": "Akun berstatus nonaktif", "value": false }],
    "requestId": "req_01HZX3K8QN7P",
    "timestamp": "2026-02-14T09:12:33.412Z"
  }
}
```

---

### 4.2 `GET /items` — List Item dengan Filter + Pagination

**Skenario:** Admin membuka halaman master item, memfilter kategori "Alat Tulis", mencari "kertas", urut nama A–Z.

**Request**

```http
GET /api/v1/items?filter[categoryId]=cat_01HZA1&filter[isActive]=true&filter[name][contains]=kertas&sort=name&pageSize=20
Authorization: Bearer <token>
```

**Response `200 OK`**

```json
{
  "data": [
    {
      "id": "itm_01HZX3K8QN",
      "sku": "ATK-0001",
      "name": "Kertas A4 70gsm",
      "normalizedName": "kertas a4 70gsm",
      "categoryId": "cat_01HZA1",
      "categoryName": "Alat Tulis",
      "unitId": "unt_01HZPCS",
      "unitSymbol": "rim",
      "supplierId": "sup_sinarjaya",
      "supplierName": "PT Sinar Jaya",
      "minStock": 20,
      "costPrice": 55000,
      "sellPrice": 60000,
      "isActive": true,
      "imageUrl": "https://storage.googleapis.com/inventory-system.appspot.com/items/itm_01HZX3K8QN/thumb.jpg",
      "currentStock": 143,
      "stockByWarehouse": { "wh_01HZX0JKT1": 120, "wh_01HZX0JKT2": 23 },
      "isLowStock": false,
      "lastTransactionAt": "2026-02-13T04:11:00.000Z",
      "createdAt": "2025-11-05T02:00:00.000Z",
      "updatedAt": "2026-02-13T04:11:00.000Z"
    },
    {
      "id": "itm_01HZX3K8QP",
      "sku": "ATK-0002",
      "name": "Kertas F4 70gsm",
      "normalizedName": "kertas f4 70gsm",
      "categoryId": "cat_01HZA1",
      "categoryName": "Alat Tulis",
      "unitId": "unt_01HZPCS",
      "unitSymbol": "rim",
      "supplierId": null,
      "supplierName": null,
      "minStock": 15,
      "costPrice": 52000,
      "sellPrice": null,
      "isActive": true,
      "imageUrl": null,
      "currentStock": 9,
      "stockByWarehouse": { "wh_01HZX0JKT1": 9 },
      "isLowStock": true,
      "lastTransactionAt": "2026-02-10T08:30:00.000Z",
      "createdAt": "2025-11-05T02:05:00.000Z",
      "updatedAt": "2026-02-10T08:30:00.000Z"
    }
  ],
  "meta": {
    "pageSize": 20,
    "hasMore": true,
    "nextCursor": "eyJzdiI6IkFsYXQgVHVsaXMiLCJpZCI6Iml0bV8wMUhaWDNLOFFQIn0",
    "totalEstimate": 37,
    "requestId": "req_01HZX3M2AA11",
    "timestamp": "2026-02-14T09:15:02.001Z"
  }
}
```

**Response error `400 Bad Request`** (filter/sort tidak di-allowlist)

```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Parameter query tidak valid.",
    "details": [
      { "field": "sort", "issue": "Field 'hargaBeli' tidak boleh dipakai untuk sorting", "value": "hargaBeli" },
      { "field": "filter.warehouseId", "issue": "Filter ini belum didukung pada endpoint ini" }
    ],
    "requestId": "req_01HZX3M2AA11",
    "timestamp": "2026-02-14T09:15:02.001Z"
  }
}
```

> **Perhatikan `currentStock`, `stockByWarehouse`, dan `isLowStock`:** ketiganya adalah **turunan** (denormalisasi) yang dihitung server, bukan field yang boleh dikirim klien. `currentStock` = total semua gudang; `stockByWarehouse` adalah **map** `warehouseId → qty` (bukan array); `isLowStock = currentStock <= minStock`. Klien hanya membacanya, tidak menulisnya (lihat DATA-MODEL §5.3).

---

### 4.3 `POST /stock-transactions` — Catat Transaksi Stok

**Skenario:** Sari mencatat pengeluaran 5 rim Kertas A4 dari Gudang Utama untuk divisi HRD. Frontend sudah membuat `Idempotency-Key` saat form dibuka.

**Request**

```http
POST /api/v1/stock-transactions HTTP/1.1
Host: api.inventory-system.run.app
Content-Type: application/json
Authorization: Bearer <token>
Idempotency-Key: 9f8a7b6c-1d2e-4f3a-8b9c-0d1e2f3a4b5c
```

```json
{
  "type": "out",
  "warehouseId": "wh_01HZX0JKT1",
  "divisionId": "div_hrd",
  "lines": [
    { "itemId": "itm_01HZX3K8QN", "quantity": 5 }
  ],
  "note": "Untuk keperluan HRD — rekrutmen Februari",
  "referenceType": "request",
  "referenceId": "req_01HZXB7Z99",
  "occurredAt": "2026-02-14T09:20:00.000Z"
}
```

**Response `201 Created`**

```http
HTTP/1.1 201 Created
Location: /api/v1/stock-transactions/stx_01HZX9Q7AA
```

```json
{
  "data": {
    "id": "trx_9f8a7b6c",
    "transactionNo": "TRX-2026-000123",
    "type": "out",
    "status": "completed",
    "itemId": "itm_01HZX3K8QN",
    "itemSku": "ATK-0001",
    "itemName": "Kertas A4 70gsm",
    "unitSymbol": "rim",
    "warehouseId": "wh_01HZX0JKT1",
    "warehouseName": "Gudang Utama",
    "quantity": 5,
    "signedQuantity": -5,
    "stockBefore": 143,
    "stockAfter": 138,
    "unitCost": 55000,
    "totalCost": 275000,
    "referenceType": "request",
    "referenceId": "req_01HZXB7Z99",
    "requestId": "req_01HZXB7Z99",
    "divisionId": "div_hrd",
    "note": "Untuk keperluan HRD — rekrutmen Februari",
    "occurredAt": "2026-02-14T09:20:00.000Z",
    "createdBy": "usr_01HZX2A1B2",
    "createdByName": "Sari Wulandari",
    "createdByRole": "staff",
    "createdAt": "2026-02-14T09:20:04.512Z"
  },
  "meta": {
    "requestId": "req_01HZX9Q7AA00",
    "timestamp": "2026-02-14T09:20:04.512Z",
    "idempotentReplay": false
  }
}
```

> **Catatan bentuk transaksi:** `stockTransactions` bersifat **append-only** (angka tidak pernah di-edit/dihapus). Field `status` bernilai `completed` \| `cancelled` (default `completed`) — **bukan** `posted`; jenis pergerakan disimpan di field `type` (`in`|`out`|`adjustment`). Ada **dua jalur koreksi**: (1) `PATCH /stock-transactions/{id}/cancel` menandai `status: "cancelled"` + `cancelReason` (angka tetap; transaksi tidak lagi dihitung di saldo berjalan), dan (2) `POST /stock-transactions/{id}/reverse` membuat dokumen lawan. Field `transactionDate`→`occurredAt`, `referenceNo`→`transactionNo`+`referenceType`/`referenceId`, dan angka stok memakai `signedQuantity` (lihat DATA-MODEL §3.7).

**Response error `422 Unprocessable Entity`** (stok tidak cukup)

```json
{
  "error": {
    "code": "STOCK_INSUFFICIENT",
    "message": "Stok tidak mencukupi untuk melakukan pengeluaran barang.",
    "details": [
      {
        "field": "quantity",
        "issue": "Diminta 500 rim, tersedia 143 rim di Gudang Utama",
        "value": 500
      }
    ],
    "requestId": "req_01HZX9Q7AA00",
    "timestamp": "2026-02-14T09:20:04.512Z"
  }
}
```

**Response error `409 Conflict`** (Idempotency-Key dipakai ulang dengan body berbeda)

```json
{
  "error": {
    "code": "IDEMPOTENCY_KEY_REUSED",
    "message": "Kunci idempotensi ini sudah dipakai dengan data yang berbeda.",
    "details": [
      { "field": "Idempotency-Key", "issue": "Body request berbeda dari percobaan sebelumnya", "value": "9f8a7b6c-..." }
    ],
    "requestId": "req_01HZX9Q7AA00",
    "timestamp": "2026-02-14T09:20:04.512Z"
  }
}
```

**Response error `403 Forbidden`** (viewer mencoba mencatat transaksi)

```json
{
  "error": {
    "code": "ROLE_INSUFFICIENT",
    "message": "Anda tidak memiliki izin untuk mencatat transaksi stok.",
    "details": [{ "field": "role", "issue": "Dibutuhkan salah satu dari: admin, staff", "value": "viewer" }],
    "requestId": "req_01HZX9Q7AA00",
    "timestamp": "2026-02-14T09:20:04.512Z"
  }
}
```

---

### 4.4 `POST /requests/{requestId}/submit` — Ajukan Permintaan Barang

**Skenario:** Budi (staff divisi IT) sudah membuat draft permintaan 2 item, lalu mengajukannya untuk disetujui admin.

**Langkah 1 — Buat draft** `POST /requests`

```json
{
  "title": "Permintaan kertas & tinta tim IT",
  "warehouseId": "wh_01HZX0JKT1",
  "department": "IT",
  "priority": "normal",
  "neededAt": "2026-02-20T00:00:00.000Z",
  "notes": "Stok habis untuk operasional tim IT",
  "items": [
    { "itemId": "itm_01HZX3K8QN", "quantityRequested": 10 },
    { "itemId": "itm_01HZX5M1PQ", "quantityRequested": 3 }
  ]
}
```

> `department` diisi dari profil user (`users/{uid}.department`) bila tidak dikirim eksplisit. `items` adalah sub-resource `requestItems` (lihat [§3.9](#39-requests-permintaan-barang)).

Response `201 Created` → `{ "data": { "id": "req_01HZXB7Z99", "status": "draft", ... } }`

**Langkah 2 — Ajukan** `POST /requests/req_01HZXB7Z99/submit`

```http
POST /api/v1/requests/req_01HZXB7Z99/submit HTTP/1.1
Authorization: Bearer <token>
Idempotency-Key: c1a2b3d4-5e6f-4a7b-8c9d-0e1f2a3b4c5d
```

> `submit` adalah **transisi state murni** — tidak menerima body. Catatan pemohon (`notes`) dikirim saat `POST /requests` (Langkah 1), bukan saat submit.

**Response `200 OK`**

```json
{
  "data": {
    "id": "req_01HZXB7Z99",
    "requestNo": "REQ-2026-0043",
    "title": "Permintaan kertas & tinta tim IT",
    "status": "submitted",
    "requestedBy": "usr_01HZX4BUDI",
    "requestedByName": "Budi Santoso",
    "department": "IT",
    "priority": "normal",
    "warehouseId": "wh_01HZX0JKT1",
    "warehouseName": "Gudang Utama",
    "neededAt": "2026-02-20T00:00:00.000Z",
    "notes": "Stok habis untuk operasional tim IT",
    "itemCount": 2,
    "totalQuantity": 13,
    "items": [
      { "itemId": "itm_01HZX3K8QN", "itemSku": "ATK-0001", "itemName": "Kertas A4 70gsm", "unitSymbol": "rim", "quantityRequested": 10, "quantityApproved": null, "quantityFulfilled": 0, "lineStatus": "pending" },
      { "itemId": "itm_01HZX5M1PQ", "itemSku": "ITK-0012", "itemName": "Tinta Printer 664", "unitSymbol": "pcs", "quantityRequested": 3, "quantityApproved": null, "quantityFulfilled": 0, "lineStatus": "pending" }
    ],
    "submittedAt": "2026-02-14T09:40:00.000Z",
    "approvedAt": null,
    "approvedBy": null,
    "rejectedAt": null,
    "rejectionReason": null,
    "fulfilledAt": null,
    "cancelledAt": null,
    "createdAt": "2026-02-14T09:35:00.000Z",
    "updatedAt": "2026-02-14T09:40:00.000Z"
  },
  "meta": {
    "requestId": "req_01HZXB7Z99AA",
    "timestamp": "2026-02-14T09:40:00.120Z"
  }
}
```

**Response error `409 Conflict`** (permintaan sudah pernah diajukan)

```json
{
  "error": {
    "code": "INVALID_STATE_TRANSITION",
    "message": "Permintaan ini tidak dapat diajukan karena statusnya sudah 'submitted'.",
    "details": [
      { "field": "status", "issue": "Transisi yang diizinkan dari 'submitted': approved, rejected, cancelled", "value": "submitted" }
    ],
    "requestId": "req_01HZXB7Z99AA",
    "timestamp": "2026-02-14T09:40:00.120Z"
  }
}
```

**Response error `422`** (stok tidak cukup untuk dipenuhi nanti)

```json
{
  "error": {
    "code": "STOCK_INSUFFICIENT_WARNING",
    "message": "Sebagian item tidak memiliki stok cukup. Permintaan tetap dapat diajukan, tetapi akan ditandai.",
    "details": [
      { "field": "items[1].quantityRequested", "issue": "Diminta 50, tersedia 21", "value": 50 }
    ],
    "requestId": "req_01HZXB7Z99AA",
    "timestamp": "2026-02-14T09:40:00.120Z"
  }
}
```

> **Catatan desain:** kekurangan stok saat **submit** adalah **peringatan**, bukan penghalang — stok bisa bertambah sebelum permintaan dipenuhi. Kekurangan stok saat **fulfill** (lihat [§6.1](#61-stok-tidak-boleh-negatif)) adalah **penghalang keras** `422`. Ini keputusan bisnis yang sadar: divisi boleh meminta barang yang sedang kosong.

---

### 4.5 `POST /requests/{requestId}/approve` — Approve Permintaan

**Skenario:** Rina (admin) menyetujui permintaan REQ-2026-0043.

**Request**

```http
POST /api/v1/requests/req_01HZXB7Z99/approve HTTP/1.1
Content-Type: application/json
Authorization: Bearer <token-admin>
```

```json
{
  "note": "Disetujui. Silakan koordinasi dengan gudang untuk pengambilan."
}
```

**Response `200 OK`**

```json
{
  "data": {
    "id": "req_01HZXB7Z99",
    "requestNo": "REQ-2026-0043",
    "status": "approved",
    "submittedAt": "2026-02-14T09:40:00.000Z",
    "approvedAt": "2026-02-14T10:05:22.700Z",
    "approvedBy": "usr_01HZX9ADM1",
    "approvedByName": "Rina Kartika",
    "approvalNote": "Disetujui. Silakan koordinasi dengan gudang untuk pengambilan.",
    "rejectedAt": null,
    "rejectionReason": null,
    "updatedAt": "2026-02-14T10:05:22.700Z"
  },
  "meta": {
    "requestId": "req_01HZXC1D22",
    "timestamp": "2026-02-14T10:05:22.700Z",
    "notificationsSent": ["usr_01HZX4BUDI"]
  }
}
```

**Response error `403 Forbidden`** (staff mencoba approve)

```json
{
  "error": {
    "code": "ROLE_INSUFFICIENT",
    "message": "Hanya admin yang dapat menyetujui permintaan.",
    "details": [{ "field": "role", "issue": "Dibutuhkan role: admin", "value": "staff" }],
    "requestId": "req_01HZXC1D22",
    "timestamp": "2026-02-14T10:05:22.700Z"
  }
}
```

**Response error `409 Conflict`** (mencoba approve permintaan sendiri / sudah diproses)

```json
{
  "error": {
    "code": "SELF_APPROVAL_NOT_ALLOWED",
    "message": "Anda tidak dapat menyetujui permintaan yang Anda buat sendiri.",
    "details": [
      { "field": "requestedBy", "issue": "Pemohon dan penyetuju tidak boleh orang yang sama", "value": "usr_01HZX9ADM1" }
    ],
    "requestId": "req_01HZXC1D22",
    "timestamp": "2026-02-14T10:05:22.700Z"
  }
}
```

```json
{
  "error": {
    "code": "INVALID_STATE_TRANSITION",
    "message": "Permintaan sudah diproses sebelumnya.",
    "details": [
      { "field": "status", "issue": "Permintaan berstatus 'fulfilled', tidak bisa di-approve lagi", "value": "fulfilled" }
    ],
    "requestId": "req_01HZXC1D22",
    "timestamp": "2026-02-14T10:05:22.700Z"
  }
}
```

---

## 5. Validasi Input

Validasi dilakukan **dua lapis**:
1. **Frontend** — untuk UX cepat (menonaktifkan tombol, pesan inline).
2. **Server** — untuk **keamanan dan integritas**. Ini yang mengikat.

**Prinsip:** server tidak pernah mempercayai klien. Skema validasi ditulis sekali di `packages/shared/schemas` (mis. Zod) dan diimpor oleh **keduanya** (frontend & backend), sehingga aturan tidak bisa "berbeda" tanpa sengaja. Backend tetap menjalankan skema ini pada setiap request; frontend memakainya untuk validasi awal.

Semua kegagalan validasi → `400 VALIDATION_ERROR` dengan `details[]` berisi **semua** field yang gagal (bukan hanya yang pertama), supaya frontend bisa menandai seluruh form sekaligus.

### 5.1 Aturan Validasi Field Penting

| Field | Tipe | Aturan | Pesan gagal | Status |
| --- | --- | --- | --- | --- |
| `email` | string | format email valid, ≤ 254 char, lowercase, unik | "Format email tidak valid" | `400` / `409` jika duplikat |
| `password` | string | min 8 char, ada huruf besar, huruf kecil, angka | "Password minimal 8 karakter..." | `400` |
| `displayName` / `name` (item/supplier/divisi) | string | 1–120 char, tidak boleh hanya spasi | "Nama wajib diisi" | `400` |
| `sku` | string | regex `^[A-Z0-9-]{3,32}$`, unik (case-insensitive) | "SKU hanya boleh huruf besar, angka, dan tanda hubung" | `400` / `409` |
| `quantity` / `quantityRequested` (transaksi/permintaan) | number | > 0, ≤ 1.000.000. **Integer** bila `unit.allowDecimal=false`; boleh desimal terkontrol (maks 3 desimal) bila `unit.allowDecimal=true` | "Jumlah harus bilangan bulat positif" / "Jumlah tidak boleh lebih dari 3 desimal" | `400` |
| `type` (transaksi) | enum | salah satu `in` \| `out` \| `adjustment` | "Tipe transaksi tidak dikenal" | `400` |
| `status` (permintaan) | enum | `draft` \| `submitted` \| `approved` \| `rejected` \| `fulfilled` \| `cancelled` | "Status tidak dikenal" | `400` |
| `role` | enum | `admin` \| `staff` \| `viewer` | "Role tidak dikenal" | `400` |
| `minStock` | number | ≥ 0, ≤ 1.000.000 | "Stok minimum tidak boleh negatif" | `400` |
| `costPrice` / `sellPrice` | integer | ≥ 0, **integer Rupiah** (tanpa desimal) | "Harga tidak boleh negatif" | `400` |
| `itemId`, `warehouseId`, dll | string (ID) | format `^[a-z]{2,4}_[A-Za-z0-9_]{2,}$` (mis. `itm_00123`, `wh_jakarta`, `unit_pcs`), **harus ada & tidak terhapus** | "Item tidak ditemukan" | `404` |
| `warehouseId` | string | harus termasuk warehouse yang boleh diakses user (kalau user dibatasi gudang) | "Anda tidak punya akses ke gudang ini" | `403` |
| `neededAt` | string | ISO 8601, ≥ hari ini | "Tanggal dibutuhkan tidak boleh di masa lalu" | `400` |
| `occurredAt` | string | ISO 8601, tidak boleh > 7 hari di masa depan | "Tanggal transaksi tidak valid" | `400` |
| `note` / `notes` | string | ≤ 1000 char | "Catatan maksimal 1000 karakter" | `400` |
| `reason` (reject/reverse) | string | 3–500 char, **wajib** | "Alasan wajib diisi" | `400` |
| `pageSize` | integer | 1–100 | "pageSize maksimal 100" | `400` |
| `cursor` | string | Base64 valid & bisa di-decode | "Cursor tidak valid" | `400` |
| `sort` | string | field dalam allowlist endpoint | "Field sort tidak diizinkan" | `400` |
| `items[]` / `lines[]` | array | 1–50 elemen, `itemId` unik dalam satu request | "Item duplikat dalam satu permintaan" | `400` |
| `Idempotency-Key` | string | UUID v4 valid | "Idempotency-Key harus UUID v4" | `400` |
| file upload | — | tipe per `purpose`: gambar {image/jpeg, image/png, image/webp} ≤ 5 MB; lampiran {application/pdf, image/jpeg, image/png} ≤ 10 MB | "Tipe/ukuran file tidak didukung" | `400` |

> **Catatan validasi kuantitas desimal:** aturan integer-only berlaku **hanya** untuk satuan dengan `units.allowDecimal = false` (mis. pcs/box). Satuan seperti kg/liter (`allowDecimal = true`) boleh menerima desimal terkontrol. Validasi ini membutuhkan pembacaan `units` (bukan hanya payload), sehingga dievaluasi di server.

### 5.2 Contoh Error Validasi Multi-Field

```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Data yang dikirim tidak valid.",
    "details": [
      { "field": "sku", "issue": "SKU hanya boleh huruf besar, angka, dan tanda hubung", "value": "atk 0001!" },
      { "field": "minStock", "issue": "Stok minimum tidak boleh negatif", "value": -5 },
      { "field": "items[1].quantityRequested", "issue": "Jumlah minimal 1", "value": 0 },
      { "field": "neededAt", "issue": "Tanggal dibutuhkan tidak boleh di masa lalu", "value": "2026-01-01T00:00:00.000Z" }
    ],
    "requestId": "req_01HZXD3E44",
    "timestamp": "2026-02-14T10:20:00.000Z"
  }
}
```

### 5.3 Validasi vs Aturan Bisnis

Perbedaan yang penting untuk dipahami:

| | Validasi (`400`) | Aturan bisnis (`409`/`422`) |
| --- | --- | --- |
| Sifat | **Statis** — bisa dinilai dari payload saja | **Bergantung state** — butuh baca database |
| Contoh | "quantity harus > 0" | "stok tersedia hanya 12, tidak cukup untuk 50" |
| Bisa dicek di frontend? | Ya, biasanya | Tidak sepenuhnya (state bisa berubah) |
| Wajib dicek di server? | Ya | **Sangat ya** |
| Kode error | `VALIDATION_ERROR` | `STOCK_INSUFFICIENT`, `DUPLICATE_SKU`, `INVALID_STATE_TRANSITION` |

---

## 6. Aturan Bisnis di API

### 6.1 Stok Tidak Boleh Negatif

**Aturan:** jumlah stok (`currentStock`) untuk setiap (item, gudang) **tidak pernah** boleh < 0 — kecuali `settings/global.allowNegativeStock === true` (lihat §6.7).

**Di mana ditegakkan:** `POST /stock-transactions` (khususnya `type: "out"` dan `adjustment` yang mengurangi), `POST /requests/{id}/fulfill`, dan `POST /stock-transactions/{id}/reverse`.

**Bagaimana (konsep):** stok per gudang disimpan **di dalam dokumen `items/{itemId}`** sebagai map `stockByWarehouse` (bukan collection terpisah). Operasi dijalankan di dalam **Firestore transaction**:

```
runTransaction(async (tx) => {
  const itemRef  = db.doc(`items/${itemId}`);
  const itemSnap = await tx.get(itemRef);
  const current  = itemSnap.get(`stockByWarehouse.${warehouseId}`) ?? 0;

  if (type === "out" && current < quantity) {
    throw new BusinessError("STOCK_INSUFFICIENT", 422, { ... });
  }

  const next = type === "out" ? current - quantity : current + quantity;
  if (next < 0) throw new BusinessError("STOCK_INSUFFICIENT", 422);

  tx.update(itemRef, {
    [`stockByWarehouse.${warehouseId}`]: next,
    currentStock: totalAfter,
    isLowStock: totalAfter <= minStock,
    updatedAt: FieldValue.serverTimestamp(),
  });
  tx.create(txCollection.doc(), { ...transactionDoc, stockBefore: current, stockAfter: next });
});
```

> **Catatan `isLowStock`:** field denormalisasi `isLowStock` diperbarui **pada dokumen `items` yang sama** di dalam transaksi ini (bandingkan `currentStock` dengan `minStock`), sehingga filter "stok menipis" tidak perlu menghitung ulang map. `currentStock` adalah total lintas gudang; `stockByWarehouse` adalah rincian per gudang. Definisi kanonik di `docs/DATA-MODEL.md`.

**Kenapa di server, bukan di frontend?**

1. **Frontend tidak bisa dipercaya.** User bisa membuka DevTools, memodifikasi JavaScript, atau memanggil API langsung dengan `curl`/Postman. Validasi frontend hanya "saran UX", bukan pengaman. Kalau stok negatif hanya dicegah di frontend, satu orang iseng (atau satu bug) bisa merusak data.
2. **Race condition.** Dua staff bisa mengeluarkan barang yang sama **hampir bersamaan**. Frontend A membaca stok 10, frontend B membaca stok 10; keduanya mengira cukup untuk 8. Kalau pengecekan hanya di frontend, keduanya lolos → stok jadi -6. Firestore **transaction** melakukan pengecekan dan penulisan secara atomik di server, sehingga satu berhasil dan satu gagal (`422`). Ini tidak mungkin dilakukan frontend.
3. **Konsistensi multi-klien.** Nanti ada Cloud Function, integrasi API pihak ketiga (Fase 7), dan mungkin mobile. Semuanya harus tunduk pada aturan yang **sama**. Menaruh aturan di server menjamin satu sumber kebenaran.
4. **Firestore Security Rules** juga **menolak** penulisan langsung ke dokumen `items` dari klien (termasuk field `currentStock`/`stockByWarehouse`). Klien hanya boleh lewat API.

> **Keputusan arsitektur terkait:** frontend **tidak** diberi izin menulis ke Firestore secara langsung (semua tulis lewat REST API). Security Rules menetapkan `allow write: if false` untuk collection transaksional. Ini menutup celah "stok negatif" dan "approve sendiri" sekaligus. Detail di `docs/SECURITY.md`.

### 6.2 Hanya Admin Boleh Approve

**Aturan:** `POST /requests/{id}/approve`, `/reject`, dan `/fulfill` hanya untuk `admin`.

**Di mana:** middleware otorisasi `requireRole(["admin"])` pada route, **ditambah** pengecekan tambahan `SELF_APPROVAL_NOT_ALLOWED`.

**Kenapa di server?**
- Ini **pemisahan tugas** (segregation of duties): orang yang meminta barang tidak boleh menjadi orang yang menyetujui. Kalau ini hanya dijaga frontend dengan menyembunyikan tombol, siapa pun bisa memanggil endpoint langsung. Menyembunyikan tombol adalah UX, bukan keamanan.
- Otorisasi memakai **custom claim** dari token yang sudah diverifikasi tanda tangannya — klien tidak bisa memalsukan `role: "admin"` karena token ditandatangani Google.

**Kenapa ada aturan "tidak boleh approve permintaan sendiri"?** Karena admin pun bisa membuat permintaan. Tanpa aturan ini, admin bisa menyetujui permintaannya sendiri tanpa pengawasan — kontrol internal perusahaan jadi lemah dan audit tidak berarti. Ini keputusan bisnis yang penting dan **hanya bisa** ditegakkan di server (frontend tidak tahu siapa pemohon vs penyetuju tanpa membandingkan data).

### 6.3 Transisi Status yang Sah

State machine permintaan (ditegakkan di server, di endpoint aksi):

```text
        ┌─────────┐  submit   ┌────────────┐  approve  ┌──────────┐  fulfill  ┌────────────┐
        │  draft  │ ────────► │ submitted  │ ────────► │ approved │ ────────► │ fulfilled  │
        └────┬────┘           └─────┬──────┘           └────┬─────┘           └────────────┘
             │ cancel               │ cancel                │ cancel
             │                      │ reject                │
             ▼                      ▼                       ▼
        ┌───────────┐         ┌──────────┐            ┌───────────┐
        │ cancelled │         │ rejected │            │ cancelled │
        └───────────┘         └──────────┘            └───────────┘
```

Aturan tambahan:
- `rejected` dan `fulfilled` adalah **terminal** — tidak bisa berpindah lagi.
- `cancelled` juga terminal.
- Transisi tidak sah → `409 INVALID_STATE_TRANSITION`.
- Setiap transisi menulis timestamp+pelaku pada dokumen `requests` (`submittedAt`, `approvedAt`/`approvedBy`/`approvedByName`, `rejectedAt`/`rejectedBy`/`rejectionReason`, dst.), satu entri `auditLogs`, dan `notifications` ke pemohon/penyetuju. Tidak ada array `statusHistory` — riwayat lengkap direkonstruksi dari `auditLogs` (lihat DATA-MODEL §3.8).

**Kenapa di server?** Karena state machine butuh **state saat ini** (dari database) dan harus **atomik**. Frontend tidak boleh "menentukan sendiri" bahwa `fulfilled → approved` valid. Ini juga melindungi dari double-submit: dua admin menekan approve bersamaan → hanya satu yang berhasil, yang kedua dapat `409`.

### 6.4 SKU Unik

**Aturan:** `sku` unik per perusahaan (case-insensitive).

**Di mana:** `POST /items`, `PATCH /items/{id}`.

**Bagaimana:** selain pengecekan query, kita simpan dokumen `skuRegistry/{UPPER_SKU}` di dalam transaction. Ini mencegah dua item dibuat dengan SKU sama secara bersamaan (race condition). Melakukan `where("sku","==",...)` saja tidak cukup karena Firestore tidak punya `UNIQUE` constraint.

**Kenapa di server?** Race condition yang sama seperti stok: dua admin menambah item "ATK-0001" bersamaan.

### 6.5 Perhitungan Turunan (Stok, Harga, Nilai)

Field turunan — `currentStock`, `stockByWarehouse`, `isLowStock`, `stockValue` — **dihitung server** dan tidak boleh dikirim klien.

**Kenapa?** Kalau klien boleh mengirim `currentStock`, seluruh sistem stok jadi tidak bermakna. Klien hanya boleh mengirim **fakta** (`itemId`, `warehouseId`, `type`, `quantity`); server menghitung **konsekuensinya**. Prinsip ini disebut "server sebagai sumber kebenaran" (single source of truth).

**Praktik:** field turunan di-*strip* dari payload `POST`/`PATCH` secara eksplisit (schema hanya menerima field yang diizinkan; field tak dikenal → `400 UNKNOWN_FIELD`).

### 6.6 Batas Akses per Gudang (opsional, disiapkan)

Kalau user dibatasi ke gudang tertentu (`warehouseIds` non-kosong), maka:
- List stok/transaksi otomatis difilter ke gudang itu.
- Membuat transaksi di gudang di luar akses → `403 WAREHOUSE_ACCESS_DENIED`.

**Kenapa disiapkan sejak awal?** Karena menambahkan filter otorisasi di belakang hari itu mahal dan rawan bug (mudah lupa di satu endpoint). Lebih murah merancangnya sekarang. Kalau ternyata tidak dipakai, biayanya nol.

### 6.7 Reversal, Bukan Edit

Transaksi stok yang sudah tercatat **tidak bisa di-edit atau dihapus** (angka bersifat append-only). Ada **dua jalur koreksi** yang sah (lihat DATA-MODEL §3.7):

1. **Batalkan** (`PATCH /stock-transactions/{id}/cancel`) — menandai `status: "cancelled"` + `cancelReason`. Angka tidak diubah; transaksi ber-`status: "cancelled"` tidak lagi dihitung dalam saldo berjalan. Cocok untuk koreksi input yang belum berdampak lanjut.
2. **Reversal** (`POST /stock-transactions/{id}/reverse`) — membuat **dokumen lawan** baru. Cocok bila transaksi sudah tercermin di laporan/permintaan.

**Kenapa?** Ini prinsip akuntansi: jejak harus utuh. Kalau kita mengizinkan edit angka, laporan periode lalu bisa berubah diam-diam, dan audit tidak bisa menjawab "kenapa angka stok berubah kemarin?". Pembatalan dan reversal sama-sama **menambah jejak**, bukan menimpa: pembatalan menandai status (dokumen asal tetap ada), reversal menciptakan baris kedua yang saling merujuk, sehingga sejarah bisa direkonstruksi.

**Efeknya:** `reverse` membuat transaksi **baru** (dokumen asal tidak diubah angkanya) dengan `referenceType: "reversal"`, `referenceId: <id transaksi asal>`, `reversalOf: <id transaksi asal>`, dan `type` berlawanan (`out` ↔ `in`) dengan `signedQuantity` dinegasi. Transaksi yang sudah dibalik tidak bisa dibalik dua kali → `409 ALREADY_REVERSED`. Untuk `cancel`, dokumen asal di-`update` **hanya** pada field status (`status`/`cancelledBy`/`cancelledAt`/`cancelReason`), tidak pada angka.

---

## 7. Endpoint Laporan (Reporting)

Laporan adalah bagian paling menantang secara performa, karena melibatkan **agregasi** — hal yang **tidak** dilakukan Firestore dengan murah.

### 7.1 Tiga Strategi, Dipilih per Kasus

```text
┌──────────────────────────────────────────────────────────────────────────────┐
│ Strategi A — Query langsung (real-time, data kecil)                          │
│   GET /reports/low-stock, /dashboard/summary                                 │
│   Sumber: koleksi utama + field denormalisasi                                │
│   Cocok untuk: data yang berubah cepat & harus akurat detik ini              │
├──────────────────────────────────────────────────────────────────────────────┤
│ Strategi B — Dokumen agregat pra-hitung (denormalisasi terjadwal)            │
│   GET /reports/stock-summary, /dashboard/trends, /reports/valuation          │
│   Sumber: koleksi dailyAggregates/* yang di-refresh Cloud Function terjadwal │
│   Cocok untuk: angka historis yang boleh tertinggal beberapa menit           │
├──────────────────────────────────────────────────────────────────────────────┤
│ Strategi C — Job asinkron (berat / baris banyak)                             │
│   POST /reports/export → 202 { jobId }                                        │
│   Sumber: Cloud Function, hasil ke Firebase Storage                          │
│   Cocok untuk: export ribuan baris, laporan bulanan                          │
└──────────────────────────────────────────────────────────────────────────────┘
```

### 7.2 Strategi A — Query Langsung

Contoh: `GET /reports/low-stock`.

Implementasi: membandingkan dua field (`currentStock <= minStock`) **tidak bisa** dilakukan dalam satu query Firestore. Karena itu kita **men-denormalisasi**: saat stok berubah, server menghitung `isLowStock = currentStock <= minStock` dan menyimpannya di dokumen `items`. Laporan lalu cukup:

```
items.where("isLowStock", "==", true).where("isActive", "==", true).limit(...)
```

> **Catatan per gudang:** `isLowStock` adalah flag tingkat **item** (berbasis `currentStock` total). Untuk peringatan per gudang, filter peta `stockByWarehouse` di sisi aplikasi setelah query, atau gunakan `filter[warehouseId]` pada `GET /reports/low-stock`.

**Kenapa denormalisasi?** Firestore tidak punya perbandingan antar-field dalam query. Menyimpan flag hasil perhitungan mengubah operasi "scan semua item lalu bandingkan" menjadi "query index langsung" — dari O(n) pembacaan menjadi O(hasil). Untuk 5.000 item, ini selisih ribuan pembacaan per muat halaman.

**Trade-off:** flag bisa sedikit tertinggal (eventual consistency) — kalau stok berubah, flag di-update dalam hitungan detik oleh trigger. Kita terima ini; peringatan stok tidak perlu presisi milidetik.

### 7.3 Strategi B — Dokumen Agregat Terjadwal

Contoh: `GET /reports/stock-movement?groupBy=day&from=...&to=...`.

Menghitung mutasi harian dengan membaca **semua** transaksi lalu menjumlahkan di server akan sangat mahal: sebulan bisa puluhan ribu transaksi, dan setiap `GET` mengulang pembacaan yang sama.

**Solusi:** Cloud Function terjadwal (mis. setiap 15 menit, dan sekali pada 00:05 WIB untuk hari sebelumnya) menghitung ulang ringkasan dan menulis dokumen:

```
dailyAggregates/{YYYY-MM-DD}
{
  date: "2026-02-13",
  totalIn:  { quantity: 320, transactions: 14 },
  totalOut: { quantity: 187, transactions: 22 },
  byWarehouse: { wh_01HZX0JKT1: { in: 200, out: 150 }, ... },
  byCategory:  { cat_01HZA1: { in: 100, out: 80 }, ... },
  updatedAt: <serverTimestamp>
}
```

Endpoint laporan tinggal membaca beberapa dokumen (satu per hari dalam rentang) — bukan puluhan ribu.

**Kenapa terjadwal, bukan dihitung saat request?** Karena biaya pembacaan Firestore dibayar per dokumen. Menghitung ulang setiap kali user membuka laporan berarti membayar berulang untuk hasil yang sama. Pra-komputasi membayar sekali (di background) dan dipakai berkali-kali. Ini juga mempercepat response dari detik menjadi milidetik.

**Trade-off:** data bisa tertinggal hingga 15 menit. Kita **menampilkan** `meta.dataAsOf` di response supaya user tahu kesegaran data, dan menyediakan tombol "Refresh" yang memicu recompute on-demand untuk rentang kecil (mis. hari ini).

### 7.4 Strategi C — Export Asinkron

Contoh: `POST /reports/export` dengan 50.000 baris.

Alur:

```text
Klien                API (Cloud Run)         Firestore       Cloud Function        Storage
  │                        │                     │                 │                  │
  │ POST /reports/export   │                     │                 │                  │
  │───────────────────────►│                     │                 │                  │
  │                        │ buat job (status:   │                 │                  │
  │                        │ "queued")           │                 │                  │
  │                        │────────────────────►│                 │                  │
  │                        │                     │  trigger        │                  │
  │                        │                     │────────────────►│                  │
  │  202 { jobId }         │                     │                 │ baca data        │
  │◄───────────────────────│                     │◄────────────────│                  │
  │                        │                     │                 │ generate XLSX    │
  │                        │                     │                 │─────────────────►│
  │                        │                     │  status:        │                  │
  │                        │                     │  "completed"    │                  │
  │                        │                     │◄────────────────│                  │
  │                        │                     │                 │                  │
  │ GET /reports/exports/  │                     │                 │                  │
  │   {jobId} (polling)    │                     │                 │                  │
  │───────────────────────►│                     │                 │                  │
  │  { status:"completed", │                     │                 │                  │
  │    downloadUrl }       │                     │                 │                  │
  │◄───────────────────────│                     │                 │                  │
  │ unduh dari signed URL  │                     │                 │                  │
  │─────────────────────────────────────────────────────────────────────────────────►│
```

Response awal `202 Accepted`:

```json
{
  "data": {
    "jobId": "exp_01HZXF5G77",
    "status": "queued",
    "statusUrl": "/api/v1/reports/exports/exp_01HZXF5G77",
    "expiresAt": "2026-02-15T10:00:00.000Z"
  },
  "meta": { "requestId": "req_01HZXF5G7700", "timestamp": "2026-02-14T10:00:00.000Z" }
}
```

Polling hasil:

```json
{
  "data": {
    "jobId": "exp_01HZXF5G77",
    "status": "completed",
    "format": "xlsx",
    "rowCount": 48213,
    "fileSizeBytes": 3145728,
    "downloadUrl": "https://storage.googleapis.com/inventory-system.appspot.com/exports/exp_01HZXF5G77.xlsx?X-Goog-Signature=...",
    "expiresAt": "2026-02-15T10:00:00.000Z",
    "createdAt": "2026-02-14T10:00:00.000Z",
    "completedAt": "2026-02-14T10:02:41.000Z"
  }
}
```

**Kenapa signed URL dengan kedaluwarsa?** File export berisi data bisnis sensitif. URL publik permanen = kebocoran. Signed URL hanya berlaku (mis. 24 jam) dan hanya bisa diakses yang memegang URL.

### 7.5 Pertimbangan Performa — Ringkasan

| Masalah | Mitigasi | Kenapa |
| --- | --- | --- |
| Firestore tidak bisa agregasi murah | Pra-hitung ke `dailyAggregates` | Bayar sekali, pakai berkali-kali |
| Perbandingan antar-field (`currentStock <= minStock`) | Denormalisasi flag `isLowStock` | Firestore tidak mendukung perbandingan antar-field |
| Query tanpa index → error/lambat | Composite index didefinisikan di `firestore.indexes.json`, diuji di CI | Query gagal di prod adalah bug yang tidak boleh terjadi |
| Response besar | Pagination + `pageSize` maks 100 + export async | Melindungi memori server dan kuota baca |
| Banyak pembacaan berulang | Caching di memori (LRU, TTL 60 detik) untuk data master yang jarang berubah | Mengurangi biaya baca dan latensi |
| Laporan lintas bulan | Rentang tanggal **wajib** dibatasi maks 12 bulan | Mencegah permintaan tak terbatas |
| Laporan "hari ini" selalu berubah | `dataAsOf` + endpoint refresh on-demand | Transparansi kesegaran data |

**Prinsip umum:** laporan **baca-heavy**. Kita optimalkan untuk pembacaan dengan mengorbankan sedikit kesegaran (eventual consistency) dan menambah kompleksitas di sisi tulis (Cloud Function). Ini trade-off yang tepat karena laporan dibuka jauh lebih sering daripada transaksi ditulis.

---

## 8. Rate Limiting & Keamanan

### 8.1 Rate Limiting

**Tujuan:** melindungi dari penyalahgunaan (brute force login, scraping, bug klien yang loop), menjaga biaya Firestore, dan menjaga keadilan antar user.

**Rencana batas (per user, kecuali disebut lain):**

| Kategori | Batas | Window | Keterangan |
| --- | --- | --- | --- |
| Endpoint umum (`GET`) | 300 req | 1 menit | Cukup untuk UI normal |
| Endpoint tulis (`POST`/`PATCH`/`DELETE`) | 60 req | 1 menit | Mencegah loop bug klien |
| Login / reset password | 5 req | 15 menit | Per IP + per email; anti brute force |
| Export laporan | 5 req | 1 jam | Operasi mahal |
| Upload signed URL | 30 req | 1 jam | Mencegah penyalahgunaan Storage |
| Per IP (tanpa auth, mis. `/health`, forgot password) | 100 req | 1 menit | Anti abuse |

**Implementasi (konsep):**
- **Per user:** penghitung di memori (Map + TTL) **atau** Redis (kalau ada beberapa instance Cloud Run). Karena Cloud Run bisa multi-instance, untuk konsistensi penuh gunakan Redis/Memorystore; untuk MVP, in-memory per instance dapat diterima dan dicatat sebagai keterbatasan.
- **Per IP:** dilakukan di depan (Cloud Armor / reverse proxy) karena API tidak selalu tahu IP asli di belakang proxy.
- Saat terlampaui → `429 Too Many Requests` dengan header `Retry-After`.

Contoh response `429`:

```json
{
  "error": {
    "code": "RATE_LIMIT_EXCEEDED",
    "message": "Terlalu banyak permintaan. Coba lagi dalam 42 detik.",
    "details": [{ "field": "retryAfter", "issue": "42 detik", "value": 42 }],
    "requestId": "req_01HZXG7H88",
    "timestamp": "2026-02-14T10:30:00.000Z"
  }
}
```

**Kenapa `429` dan bukan `403`?** Karena `403` berarti "tidak boleh selamanya", `429` berarti "tidak boleh sekarang, coba lagi nanti". Frontend bisa menampilkan hitungan mundur.

**Kenapa login dibatasi lebih ketat?** Karena login adalah target utama brute force. 5 percobaan/15 menit membuat serangan kamus jadi tidak praktis, tanpa mengganggu user normal.

### 8.2 Validasi Token

Setiap request (kecuali `public`) melalui middleware autentikasi:

1. **Format header** — harus `Bearer <token>`; kalau tidak → `401 AUTH_TOKEN_MISSING`.
2. **Verifikasi tanda tangan** — `admin.auth().verifyIdToken(token, true)` (cek revocation). Ini memastikan token benar-benar diterbitkan Google untuk project kita. Klien **tidak bisa** membuat token palsu.
3. **Klaim standar** — `exp` (kadaluarsa), `aud` (audience = project ID kita), `iss` (issuer). `verifyIdToken` menangani ini; kalau gagal → `401 AUTH_TOKEN_INVALID` / `AUTH_TOKEN_EXPIRED`.
4. **Role** — ambil dari custom claim `role`. Kalau tidak ada → default paling rendah (`viewer`) atau tolak → `403 ROLE_MISSING` (kita pilih: tolak, karena user tanpa role berarti setup yang salah).
5. **Status user** — baca `users/{uid}` dan pastikan `isActive === true`. Kalau nonaktif → `403 ACCOUNT_SUSPENDED`.
6. **Otorisasi** — middleware `requireRole([...])` mencocokkan role dengan kebutuhan endpoint.
7. **Scope gudang** (opsional) — pastikan `warehouseId` yang diminta ada dalam `warehouseIds` user.

**Caching hasil verifikasi:** `verifyIdToken` melakukan verifikasi kriptografis (CPU) dan mengambil public key (di-cache oleh SDK). Untuk menghindari pembacaan Firestore `users/{uid}` setiap request, hasilnya di-cache singkat (30–60 detik) dengan invalidasi saat user diubah.

### 8.3 Pencegahan Akses Tidak Sah

| Ancaman | Pencegahan |
| --- | --- |
| **Pemalsuan token** | Verifikasi tanda tangan Google; klien tak punya private key |
| **Privilege escalation** (staff jadi admin) | Role **hanya** dari custom claim yang di-set server; `PATCH /users/{id}/role` butuh admin dan menulis audit log |
| **IDOR** (akses data orang lain via ganti ID) | Setiap endpoint detail memeriksa kepemilikan/scope; `staff` tidak bisa membaca data yang bukan miliknya (kecuali memang publik internal) |
| **Injeksi NoSQL / field injection** | Skema validasi menolak field tak dikenal; tidak ada string yang langsung jadi query tanpa whitelist |
| **Mass assignment** | Hanya field yang di-allowlist yang di-*apply* ke Firestore |
| **Bypass lewat akses langsung Firestore** | Firestore Security Rules menolak semua tulis dari klien pada collection sensitif (`allow write: if false`); baca dibatasi sesuai role |
| **Kebocoran file** | Storage Rules: file hanya bisa dibaca sesuai role; download lewat signed URL berbatas waktu |
| **Replay attack** | Token Firebase berumur pendek (≤1 jam); `Idempotency-Key` untuk operasi tulis |
| **CSRF** | API stateless memakai header `Authorization` (bukan cookie), jadi tidak rentan CSRF klasik |
| **XSS yang mencuri token** | Token disimpan di memori/`localStorage` dengan kebijakan CSP ketat di Firebase Hosting; sanitasi output |
| **Log berisi data sensitif** | Password & token **tidak pernah** di-log; `requestId` untuk korelasi |
| **Enumeration user** | `POST /auth/password/forgot` selalu `202` apa pun hasilnya (tidak membocorkan apakah email terdaftar) |

### 8.4 CORS & Header Keamanan

- CORS: hanya origin frontend yang diizinkan (`https://inventory-system.web.app`, `http://localhost:5173` saat dev).
- Header: `Strict-Transport-Security`, `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, `Content-Security-Policy` (di sisi hosting).
- HTTPS wajib di semua environment; HTTP hanya untuk `localhost`.

### 8.5 Audit Log — "Siapa Mengubah Apa"

Setiap operasi tulis menulis entri ke `auditLogs`:

```json
{
  "id": "aud_7c6b5a4d",
  "action": "approve",
  "entityType": "requests",
  "entityId": "req_01HZXB7Z99",
  "entityPath": "requests/req_01HZXB7Z99",
  "entityLabel": "Permintaan ATK Divisi Operasional",
  "actorId": "usr_01HZX9ADM1",
  "actorEmail": "rina@ptabc.co.id",
  "actorName": "Rina Kartika",
  "actorRole": "admin",
  "changedFields": ["status"],
  "before": { "status": "submitted" },
  "after": { "status": "approved" },
  "source": "api",
  "ip": "103.x.x.x",
  "userAgent": "Mozilla/5.0 ...",
  "traceId": "trc_01HZXC1D22",
  "createdAt": "2026-02-14T10:05:22.700Z"
}
```

> Skema ini **kanonik** dan harus sama persis dengan `docs/DATA-MODEL.md` §3.10. Perhatikan: tidak ada field `changes` (pakai `changedFields` + `before`/`after`), tidak ada `requestId` (pakai `traceId`), dan ada `entityPath`/`source` yang wajib.

**Kenapa ini fitur, bukan sekadar log?** Karena salah satu masalah bisnis yang ingin diselesaikan adalah "barang hilang/rusak tanpa jejak". Audit log adalah jawaban langsung: setiap perubahan stok dan approval punya jejak pelaku, waktu, dan nilai sebelum/sesudah. Ini juga menutup kebutuhan kepatuhan (audit internal).

**Audit log bersifat append-only** — tidak ada endpoint untuk mengubah/menghapus. Hanya admin yang bisa membacanya.

---

## 9. Versioning & Perubahan yang Merusak

### 9.1 Definisi Perubahan

| Jenis | Contoh | Breaking? |
| --- | --- | --- |
| **Aditif** | Menambah field baru di response, menambah endpoint baru, menambah nilai enum opsional, menambah filter opsional | ❌ Tidak |
| **Breaking** | Menghapus/rename field, mengubah tipe field, mengubah arti nilai enum, menambah field **wajib** di request, mengubah status code, mengubah format error, menghapus endpoint | ✅ Ya |

**Prinsip:** klien harus **tahan terhadap field baru** (jangan error kalau ada field tak dikenal di response). Ini memungkinkan kita menambah field tanpa menaikkan versi.

### 9.2 Strategi

1. **`/api/v1` stabil.** Perubahan aditif masuk ke `v1` tanpa pemberitahuan khusus (tetap didokumentasikan di changelog).
2. **Perubahan breaking → `/api/v2`.** `v1` tetap hidup untuk masa transisi.
3. **Deprecation bertahap:**
   - Umumkan minimal **3 bulan** sebelum `v1` dimatikan.
   - Response `v1` yang sudah deprecated menyertakan header:
     ```http
     Deprecation: true
     Sunset: Sat, 01 Aug 2026 00:00:00 GMT
     Link: <https://docs.inventory-system.web.app/api/v2>; rel="successor-version"
     ```
   - Dokumentasikan di `CHANGELOG.md` dan kirim notifikasi in-app ke developer/klien internal.
4. **Migrasi frontend & backend bersama.** Karena frontend dan backend satu repo (monorepo), `v2` biasanya diluncurkan bersamaan; `v1` dipertahankan hanya untuk integrasi eksternal (API pihak ketiga, mobile lama).
5. **Feature flag untuk perubahan berisiko.** Perubahan yang mengubah perilaku (bukan bentuk) dibungkus flag agar bisa dimatikan tanpa deploy ulang.

### 9.3 Aturan Praktis saat Mengubah API

Checklist untuk setiap PR yang menyentuh API:

- [ ] Apakah perubahan ini **aditif**? Kalau ya, lanjut. Kalau tidak, siapkan `v2`.
- [ ] Apakah field baru di request **opsional**? (Field wajib baru = breaking.)
- [ ] Apakah `code` error diubah? (`code` = kontrak mesin; jangan diubah di `v1`.)
- [ ] Apakah dokumentasi ini (`API.md`) diperbarui **di PR yang sama**?
- [ ] Apakah ada test kontrak (integration test) yang mengunci bentuk response?
- [ ] Apakah `CHANGELOG.md` diperbarui?
- [ ] Apakah versi OpenAPI (kalau ada) ikut diperbarui?

**Kenapa dokumentasi di PR yang sama?** Karena dokumentasi yang tertinggal lebih buruk daripada tidak ada dokumentasi — ia menyesatkan. Menjadikannya bagian dari definition of done mencegah "dokumentasi nanti" yang tidak pernah terjadi. Ini juga melatih kebiasaan code review yang baik (kebutuhan JD: Git & GitHub termasuk code review).

### 9.4 Idempotensi Versi di Monorepo

```
packages/
├── shared/          ← skema Zod, tipe TS, konstanta enum (dipakai frontend & backend)
├── api/             ← implementasi REST v1
└── web/             ← frontend React
```

**Kenapa `shared`?** Supaya tipe request/response **satu definisi**. Kalau backend mengubah bentuk response, TypeScript di frontend akan gagal compile — bug tertangkap saat build, bukan di produksi. Ini contoh nyata "refactoring aman & maintainable".

---

## 10. Lampiran

### 10.1 Referensi Status Code per Endpoint (ringkas)

| Aksi | Sukses | Error yang mungkin |
| --- | --- | --- |
| List (`GET` koleksi) | `200` | `400`, `401`, `403`, `429`, `500` |
| Detail (`GET` item) | `200` | `401`, `403`, `404`, `429`, `500` |
| Create (`POST`) | `201` | `400`, `401`, `403`, `409`, `422`, `429`, `500` |
| Update (`PATCH`) | `200` | `400`, `401`, `403`, `404`, `409`, `422`, `429`, `500` |
| Delete (`DELETE`) | `204` | `401`, `403`, `404`, `409`, `429`, `500` |
| Aksi/transisi (`POST .../approve`) | `200` | `400`, `401`, `403`, `404`, `409`, `422`, `429`, `500` |
| Export async (`POST`) | `202` | `400`, `401`, `403`, `429`, `500` |
| Health (`GET`) | `200` | `503` |

### 10.2 Katalog Kode Error

| Kode | HTTP | Arti |
| --- | --- | --- |
| `VALIDATION_ERROR` | `400` | Payload tidak valid |
| `UNKNOWN_FIELD` | `400` | Ada field yang tidak dikenal / tidak diizinkan |
| `INVALID_CURSOR` | `400` | Cursor tidak bisa didecode |
| `SORT_FIELD_NOT_ALLOWED` | `400` | Field sort di luar allowlist |
| `AUTH_TOKEN_MISSING` | `401` | Header Authorization tidak ada |
| `AUTH_TOKEN_INVALID` | `401` | Token tidak valid / tanda tangan gagal |
| `AUTH_TOKEN_EXPIRED` | `401` | Token kadaluarsa |
| `ROLE_INSUFFICIENT` | `403` | Role tidak mencukupi |
| `ROLE_MISSING` | `403` | User belum punya role |
| `ACCOUNT_SUSPENDED` | `403` | Akun dinonaktifkan |
| `WAREHOUSE_ACCESS_DENIED` | `403` | Tidak punya akses ke gudang |
| `RESOURCE_NOT_FOUND` | `404` | Resource tidak ditemukan |
| `DUPLICATE_SKU` | `409` | SKU sudah dipakai |
| `DUPLICATE_EMAIL` | `409` | Email sudah terdaftar |
| `INVALID_STATE_TRANSITION` | `409` | Transisi status tidak sah |
| `SELF_APPROVAL_NOT_ALLOWED` | `409` | Tidak boleh approve permintaan sendiri |
| `ALREADY_REVERSED` | `409` | Transaksi sudah dibalik |
| `IDEMPOTENCY_KEY_REUSED` | `409` | Idempotency key dipakai dengan body berbeda |
| `STOCK_INSUFFICIENT` | `422` | Stok tidak cukup |
| `STOCK_INSUFFICIENT_WARNING` | `422` | Stok kurang (peringatan saat submit) |
| `PRECONDITION_FAILED` | `422` | Kondisi bisnis lain tidak terpenuhi |
| `RATE_LIMIT_EXCEEDED` | `429` | Terlalu banyak permintaan |
| `INTERNAL_ERROR` | `500` | Error tak terduga |
| `DEPENDENCY_UNAVAILABLE` | `503` | Firestore/layanan lain tidak tersedia |

### 10.3 Contoh Payload Objek (Referensi)

**Item**

```json
{
  "id": "itm_01HZX3K8QN",
  "sku": "ATK-0001",
  "barcode": "8991234567890",
  "name": "Kertas A4 70gsm",
  "normalizedName": "kertas a4 70gsm",
  "description": "Kertas HVS A4 70gsm, 500 lembar per rim",
  "categoryId": "cat_01HZA1",
  "categoryName": "Alat Tulis Kantor",
  "unitId": "unt_01HZPCS",
  "unitSymbol": "rim",
  "supplierId": "sup_01HZS1",
  "supplierName": "PT Sinar Jaya",
  "minStock": 20,
  "maxStock": 200,
  "costPrice": 55000,
  "sellPrice": null,
  "currentStock": 143,
  "stockByWarehouse": { "wh_01HZX0JKT1": 100, "wh_01HZX0BDG2": 43 },
  "isLowStock": false,
  "imageUrl": null,
  "isActive": true,
  "createdAt": "2025-11-05T02:00:00.000Z",
  "updatedAt": "2026-02-13T04:11:00.000Z",
  "createdBy": "usr_01HZX9ADM1",
  "updatedBy": "usr_01HZX2A1B2"
}
```

> `currentStock` adalah total lintas gudang (cache), `stockByWarehouse` rincian per gudang, dan `isLowStock = currentStock <= minStock`. Ketiganya **hanya** diubah server lewat transaksi stok. Tidak ada field `deletedAt` — item diarsipkan dengan `isActive: false`.

**StockTransaction**

```json
{
  "id": "trx_9f8a7b6c",
  "transactionNo": "TRX-2026-000123",
  "type": "out",
  "status": "completed",
  "itemId": "itm_01HZX3K8QN",
  "itemSku": "ATK-0001",
  "itemName": "Kertas A4 70gsm",
  "unitSymbol": "rim",
  "warehouseId": "wh_01HZX0JKT1",
  "warehouseName": "Gudang Jakarta",
  "quantity": 5,
  "signedQuantity": -5,
  "stockBefore": 143,
  "stockAfter": 138,
  "unitCost": 55000,
  "totalCost": 275000,
  "referenceType": "request",
  "referenceId": "req_01HZXB7Z99",
  "requestId": "req_01HZXB7Z99",
  "divisionId": "div_produksi",
  "note": "Pemenuhan permintaan divisi Produksi",
  "quantityBefore": null,
  "quantityAfter": null,
  "delta": null,
  "attachments": [],
  "occurredAt": "2026-02-14T09:20:00.000Z",
  "createdBy": "usr_01HZX2A1B2",
  "createdByName": "Budi Santoso",
  "createdByRole": "staff",
  "batchId": null,
  "reversalOf": null,
  "cancelledBy": null,
  "cancelledAt": null,
  "cancelReason": null,
  "createdAt": "2026-02-14T09:20:04.512Z"
}
```

> Ledger ini **append-only**: angka tidak pernah di-edit/dihapus, dan tidak ada `reverses`/`reversedBy` di dokumen asal. Field `status` bernilai `completed` \| `cancelled` (default `completed`) — **bukan** `posted`. Pembalikan dicatat sebagai dokumen **baru** (`referenceType: "reversal"`, `reversalOf` menunjuk transaksi asal), sedangkan pembatalan hanya menandai `status: "cancelled"` + `cancelReason` pada dokumen asal (lihat DATA-MODEL §3.7 dan API.md §6.7).

**Request (Permintaan)**

```json
{
  "id": "req_01HZXB7Z99",
  "requestNo": "REQ-2026-0043",
  "title": "Kebutuhan ATK Divisi Operasional",
  "status": "approved",
  "requestedBy": "usr_01HZX4BUDI",
  "requestedByName": "Budi Santoso",
  "requestedByRole": "staff",
  "department": "Operasional",
  "warehouseId": "wh_01HZX0JKT1",
  "warehouseName": "Gudang Utama",
  "priority": "normal",
  "neededAt": "2026-02-20T00:00:00.000Z",
  "itemCount": 2,
  "totalQuantity": 13,
  "totalEstimatedValue": 420000,
  "notes": "Stok habis untuk operasional tim IT",
  "items": [
    { "itemId": "itm_01HZX3K8QN", "itemSku": "ATK-0001", "itemName": "Kertas A4 70gsm", "unitSymbol": "rim", "quantityRequested": 10, "quantityApproved": 10, "quantityFulfilled": 0, "lineStatus": "approved" },
    { "itemId": "itm_01HZX5M1PQ", "itemSku": "ITK-0012", "itemName": "Tinta Printer 664", "unitSymbol": "pcs", "quantityRequested": 3, "quantityApproved": 3, "quantityFulfilled": 0, "lineStatus": "approved" }
  ],
  "submittedAt": "2026-02-14T09:40:00.000Z",
  "approvedAt": "2026-02-14T10:05:22.700Z",
  "approvedBy": "usr_01HZX9ADM1",
  "approvedByName": "Rina Kartika",
  "approvalNote": "Disetujui, koordinasi dengan gudang",
  "rejectedAt": null,
  "rejectionReason": null,
  "fulfilledAt": null,
  "cancelledAt": null,
  "createdAt": "2026-02-14T09:35:00.000Z",
  "updatedAt": "2026-02-14T10:05:22.700Z"
}
```

> Baris `items[]` pada response adalah **hasil join** dari subkoleksi `requests/{id}/requestItems` (lihat `docs/DATA-MODEL.md` §3.9). Field kanonik per baris: `itemId`, `itemSku`, `itemName`, `unitSymbol` (snapshot), `quantityRequested`, `quantityApproved`, `quantityFulfilled`, dan `lineStatus`.

**AuditLog**

```json
{
  "id": "aud_7c6b5a4d",
  "action": "approve",
  "entityType": "requests",
  "entityId": "req_01HZXB7Z99",
  "entityPath": "requests/req_01HZXB7Z99",
  "entityLabel": "Kebutuhan ATK Divisi Operasional",
  "actorId": "usr_01HZX9ADM1",
  "actorEmail": "rina@ptabc.co.id",
  "actorName": "Rina Kartika",
  "actorRole": "admin",
  "changedFields": ["status"],
  "before": { "status": "submitted" },
  "after": { "status": "approved" },
  "source": "api",
  "ip": "103.x.x.x",
  "userAgent": "Mozilla/5.0 ...",
  "traceId": "trc_01HZXC1D22",
  "createdAt": "2026-02-14T10:05:22.700Z"
}
```

### 10.4 Pemetaan Konvensi Penamaan

| Konvensi | Nilai | Dipakai di |
| --- | --- | --- |
| Collection Firestore | camelCase jamak: `users`, `categories`, `suppliers`, `divisions`, `units`, `items`, `warehouses`, `stockTransactions`, `requests`, `requestItems`, `auditLogs`, `notifications`, `settings`, `itemCodes`, `idempotencyKeys`, `dailyAggregates` | Data model |
| REST path | `/api/v1/...`, resource jamak, **kebab-case** untuk kata majemuk (`/stock-transactions`, `/audit-logs`, `/low-stock`) | Semua endpoint |
| Role | `admin` \| `staff` \| `viewer` | Auth, otorisasi |
| Tipe transaksi | `in` \| `out` \| `adjustment` | Stock transactions |
| Status permintaan | `draft` \| `submitted` \| `approved` \| `rejected` \| `fulfilled` \| `cancelled` | Requests |
| Kode error | `SCREAMING_SNAKE_CASE` | Semua error |
| Field JSON | camelCase | Semua payload |
| Timestamp | ISO 8601 UTC | Semua waktu |

> **Kenapa koleksi camelCase tapi path kebab-case?** Nama koleksi Firestore mengikuti konvensi JavaScript (camelCase jamak) agar selaras dengan SDK dan tipe `packages/shared`. URL REST mengikuti konvensi HTTP (kebab-case, huruf kecil) karena lebih ramah dan sesuai contoh di `docs/PROJECT.md`, `docs/DATA-MODEL.md`, dan `docs/ARCHITECTURE.md`. Pemetaan dilakukan di layer route, bukan di layer data.

### 10.5 Yang **Belum** Ada di v1 (Backlog)

Sengaja ditunda agar fokus; dicatat supaya tidak "hilang":

- Webhook keluar untuk integrasi ERP/akuntansi (Fase 7).
- GraphQL endpoint (tidak perlu; REST cukup untuk kebutuhan saat ini).
- Bulk import master data dari Excel (Fase 7, berguna untuk migrasi awal).
- Multi-bahasa pada pesan error (`Accept-Language`).
- OpenAPI/Swagger spec yang di-generate dari skema Zod (rencana: setelah API stabil).
- Push notification FCM end-to-end (endpoint `register-token` sudah disiapkan di #91).

### 10.6 Changelog

| Versi | Tanggal | Perubahan |
| --- | --- | --- |
| `1.0` | 2026-02-14 | Draft awal: 107 baris endpoint, 5 contoh lengkap, aturan bisnis, rate limiting, strategi laporan |

---

> **Untuk AI agent yang membaca dokumen ini:** gunakan tabel di [§3](#3-daftar-endpoint-lengkap) sebagai daftar tugas implementasi. Untuk setiap endpoint, ikuti: (1) validasi skema dari `packages/shared`, (2) middleware auth + role, (3) aturan bisnis di [§6](#6-aturan-bisnis-di-api), (4) bentuk response amplop di [§2.1](#21-format-response--amplop-envelope), (5) bentuk error di [§2.2](#22-format-error-standar), (6) tulis audit log untuk operasi tulis. Jangan menciptakan endpoint, field, atau kode error di luar dokumen ini tanpa memperbarui dokumen ini terlebih dahulu.
