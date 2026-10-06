# Data Model — Firestore

> Dokumen ini mendefinisikan **model data Firestore** untuk proyek `inventory-system`
> (Sistem Inventaris & Gudang). Ini adalah dokumen acuan utama untuk backend: API,
> Cloud Functions, security rules, dan skrip migrasi harus mengikuti struktur di sini.
>
> Dokumen ini dibaca oleh **murid (pemula–menengah)** dan oleh **AI agent** yang menulis
> kode. Karena itu setiap keputusan disertai **alasan (kenapa)**, bukan hanya daftar field.

**Status:** draft arsitektur — Fase 0 (Fondasi)
**Konsumen:** Backend API, Cloud Functions, Security Rules, Frontend (via API)
**Penamaan:** mengikuti konvensi proyek (lihat [Konvensi](#11-konvensi-ringkas))

---

## Daftar Isi

1. [Prinsip: Firestore bukan SQL](#1-prinsip-firestore-bukan-sql)
2. [Diagram relasi](#2-diagram-relasi)
3. [Detail setiap koleksi](#3-detail-setiap-koleksi)
4. [Keputusan embed vs reference](#4-keputusan-embed-vs-reference)
5. [Struktur `items` secara mendalam](#5-struktur-items-secara-mendalam)
6. [Model stok & kenapa harus lewat transaksi](#6-model-stok--kenapa-harus-lewat-transaksi)
7. [Denormalisasi yang disengaja](#7-denormalisasi-yang-disengaja)
8. [Audit log](#8-audit-log)
9. [Contoh query nyata](#9-contoh-query-nyata)
10. [Pertumbuhan data & strategi](#10-pertumbuhan-data--strategi)
11. [Konvensi ringkas](#11-konvensi-ringkas)

---

## 1. Prinsip: Firestore bukan SQL

Sebelum mendesain, kita harus menerima perbedaan mendasar Firestore dibanding database
relasional. Kesalahan paling umum pemula adalah "memodelkan Firestore seperti tabel SQL",
lalu berakhir dengan query mahal dan banyak round-trip. Lima prinsip berikut memandu
seluruh keputusan di dokumen ini.

### 1.1 Koleksi & dokumen, bukan tabel & baris

- **Koleksi** (`items`, `requests`) = kumpulan dokumen. Tidak punya skema ketat.
- **Dokumen** = unit data (seperti satu baris), punya ID unik, dan bisa berisi
  field bertipe map/list bersarang.
- **Subkoleksi** = koleksi yang "diparkir" di dalam dokumen
  (`requests/{requestId}/requestItems/{itemId}`). Subkoleksi **tidak** ikut terbaca saat
  kita membaca dokumen induknya.

**Implikasi desain:** kita bebas menaruh struktur bersarang (mis. `stockByWarehouse`
sebagai map di dokumen item), tetapi kita juga tidak mendapat apa pun secara otomatis —
relasi harus kita urus sendiri.

### 1.2 Tidak ada JOIN

Firestore tidak bisa menggabungkan dua koleksi dalam satu query. Kalau kita butuh data
dari dua koleksi, pilihannya hanya:

1. **Denormalisasi** — simpan salinan field yang dibutuhkan langsung di dokumen
   (mis. simpan `itemName` di dalam `stockTransactions`), atau
2. **Beberapa round-trip** — ambil ID dulu, lalu `getAll()`/`where in` untuk mengambil
   dokumen terkait (biaya bertambah dan ada batas 30 nilai untuk `in`).

**Implikasi desain:** kita sengaja menduplikasi data yang sering dibaca bersama
(lihat [§7](#7-denormalisasi-yang-disengaja)). Ini bukan "kotor"; ini pola normal Firestore.

### 1.3 Query terbatas pada satu field range

Satu query Firestore hanya boleh punya **satu klausa rentang/`orderBy` pada field yang
berbeda dari filter kesetaraan**. Artinya:

```text
✅ where('categoryId', '==', c).orderBy('name')
✅ where('occurredAt', '>=', t0).orderBy('occurredAt', 'desc')
❌ where('currentStock', '<', X).where('minStock', '>', Y)   // tidak didukung
```

**Implikasi desain:** perbandingan antar-field (stok < stok minimum) **tidak bisa** dihitung
di query. Kita harus **mematerialkan hasilnya** sebagai field boolean
(`isLowStock`) yang diperbarui setiap kali stok berubah. Ini keputusan penting yang muncul
di [§5](#5-struktur-items-secara-mendalam) dan [§9](#9-contoh-query-nyata).

### 1.4 Biaya per operasi, bukan per ukuran database

Firestore menagih **jumlah operasi baca/tulis**, bukan ukuran data:

- Membaca 1 dokumen = 1 read. Membaca 50 dokumen = 50 reads.
- Query yang mengembalikan 0 dokumen tetap **1 read** (minimum).
- Setiap `write` = 1 write; transaksi yang menulis 3 dokumen = 3 writes.
- **Jangan** melakukan agregasi "hitung semua transaksi bulan ini" dengan membaca seluruh
  dokumen di setiap page load — itu ribuan reads. Pakai **counter yang didenormalisasi**
  atau **aggregation query** (`count()`, `sum()`) secara sadar.

**Implikasi desain:** setiap layar yang sering dibuka (dashboard, daftar item) harus
dilayani oleh **query kecil ber-index**, bukan scan. Karena itu kita memelihara field
ringkasan seperti `currentStock`, `itemCount`, `totalQuantity`.

### 1.5 Batas teknis yang harus diingat

| Batas | Nilai | Dampak ke desain |
|---|---|---|
| Ukuran dokumen | 1 MiB | Jangan menaruh riwayat transaksi di dalam dokumen item |
| Ukuran satu field array | ~1 MiB / praktis ribuan elemen | Jangan taruh ribuan ID di satu array |
| Write per batch | 500 | Impor massal harus dipecah (chunking) |
| Write per transaksi | 500 dokumen | Impor besar **tidak** boleh dalam satu transaksi raksasa |
| Nilai `in`/`array-contains-any` | 30 | Hindari query dengan daftar ID panjang |
| Latensi write | ~10–100 ms | Jangan jadikan Firestore antrean job berat |

### 1.6 Timestamp & uang (khusus konteks Indonesia)

- Semua waktu disimpan sebagai **Firestore `Timestamp`** (`FieldValue.serverTimestamp()`),
  **bukan string**. Alasan: bisa diurutkan, bisa dibandingkan rentang, dan tidak bergantung
  timezone klien. Tampilan zona waktu (`Asia/Jakarta`) diurus di frontend/`settings`.
- Semua nilai uang disimpan sebagai **integer Rupiah** (tanpa desimal), bukan `float`.
  Alasan: menghindari galat pembulatan floating point. Rupiah tidak butuh sen.
- Kuantitas stok disimpan sebagai `number`. Untuk satuan yang bisa pecahan (mis. kg),
  gunakan desimal terkontrol dan dokumentasikan di `units.allowDecimal`. Validasi mengikuti
  BR-18: kuantitas `in`/`out` harus **integer positif** bila `allowDecimal = false`, dan boleh
  desimal bila `allowDecimal = true`; divalidasi silang di service + skema Zod.

---

## 2. Diagram relasi

Diagram berikut menunjukkan hubungan antar koleksi. **Garis penuh** = reference (menyimpan
ID), **garis putus-putus** = denormalisasi (menyimpan salinan field), **kotak bertingkat**
= subkoleksi.

```text
                         ┌───────────────┐
                         │    users      │  (Firebase Auth uid = doc id)
                         │  role: admin  │
                         │  staff|viewer │
                         └──────┬────────┘
                                │ createdBy / approvedBy / actorId
                                │ (reference by uid)
                                ▼
  ┌────────────┐  categoryId   ┌────────────────┐   unitId   ┌──────────┐
  │ categories │◄──────────────│     items      │───────────►│  units   │
  │  itemCount │  (reference)  │  currentStock  │(reference) │          │
  └─────┬──────┘               │  minStock      │            └──────────┘
        │                      │  isLowStock    │
        │ categoryName         │  stockByWarehouse (map)      ┌──────────┐
        │ (denorm)             └───┬────────┬───┘             │suppliers │
        │                          │        │  supplierId     └────┬─────┘
        │                          │        └────(reference)───────┘
        │                          │                              │ supplierName
        │                          │ itemId (reference)           │ (denorm)
        │                          ▼                              ▼
        │              ┌────────────────────────┐      ┌──────────────────┐
        │              │   stockTransactions    │      │   warehouses     │
        │              │  (LEDGER / append-only)│      │  isDefault       │
        │              │  + itemName, itemSku   │      └────────┬─────────┘
        │              │  + warehouseName       │               │
        │              │  + stockBefore/After   │◄──────────────┘
        │              └────────────────────────┘   warehouseId (reference)
        │
        │              ┌────────────────────────┐
        │              │       requests         │  (header)
        │              │  status: draft|...     │
        │              └───────────┬────────────┘
        │                          │ 1 : N (subkoleksi)
        │                          ▼
        │              ┌────────────────────────┐
        │              │  requests/{id}/         │
        │              │     requestItems        │──── itemId (reference) ──► items
        │              └────────────────────────┘
        │
        ▼
  ┌──────────────┐   ┌────────────────┐   ┌──────────────────┐
  │  auditLogs   │   │ notifications  │   │    settings      │
  │ (immutable)  │   │  userId (ref)  │   │  (singleton docs)│
  └──────────────┘   └────────────────┘   └──────────────────┘
```

**Cara membaca cepat:**

- `items` adalah **pusat** master data. Hampir semua transaksi menunjuk ke `items`.
- `stockTransactions` adalah **ledger** (buku besar) yang menjadi *sumber kebenaran* stok.
- `requests` → `requestItems` adalah satu-satunya relasi induk–anak yang memakai subkoleksi.
- `auditLogs`, `notifications`, `settings` berdiri sendiri (top-level) dan tidak di-join.

---

## 3. Detail setiap koleksi

Konvensi penulisan tipe: `string`, `number`, `boolean`, `Timestamp`, `array<T>`,
`map<K,V>`, `reference`, `null`.

> **Catatan umum:** semua koleksi memiliki `createdAt` dan `updatedAt` (kecuali yang
> *append-only* seperti `stockTransactions` dan `auditLogs` yang hanya punya `createdAt`).
> **Pengecualian:** dokumen **singleton `settings/*`** (§3.12) hanya punya `updatedAt`/`updatedBy`
> (bukan `createdAt`/`createdBy`) karena dibuat sekali saat inisialisasi dan tidak mewakili
> pembuat tertentu.
> Field `createdBy`/`updatedBy` menyimpan **uid** (string), sedangkan `createdByName`
> menyimpan **salinan nama** agar daftar bisa dirender tanpa join ke `users`.

---

### 3.1 `users`

**Tujuan:** profil aplikasi + sumber otorisasi. Dokumen dibuat otomatis saat **akun Auth dibuat**
(Cloud Function `onCreate` di Firebase Auth) atau oleh admin. Trigger `onCreate` menyala saat akun
**dibuat**, bukan saat login pertama; karena tidak ada self-signup (PROJECT.md §3.1), akun dibuat
oleh admin, lalu trigger membuatkan dokumen `users`-nya. **Doc ID = uid Firebase Auth**, supaya
lookup profil tidak butuh query tambahan.

**Kenapa role disimpan di sini:** role dipakai oleh API dan security rules. Disimpan di
Firestore agar bisa diubah tanpa deploy, lalu **dicerminkan ke custom claims** oleh Cloud
Function (`admin | staff | viewer`) agar rules bisa membacanya dari token (lebih murah,
tanpa read).

| Field | Tipe | Wajib? | Contoh | Keterangan |
|---|---|---|---|---|
| `uid` | string | ya | `"aB3xK9..."` | Sama dengan doc ID dan `auth.uid`. Kunci untuk semua referensi pelaku. |
| `email` | string | ya | `"budi@ptabc.co.id"` | Dari Auth. Dipakai untuk notifikasi & pencarian admin. |
| `displayName` | string | ya | `"Budi Santoso"` | Nama tampil. Sumber utama untuk denormalisasi `createdByName`. |
| `role` | string | ya | `"staff"` | `admin` \| `staff` \| `viewer`. Dasar otorisasi. |
| `isActive` | boolean | ya | `true` | Nonaktifkan user tanpa hapus (jejak audit tetap valid). Default `true`. |
| `department` | string | tidak | `"Produksi"` | Divisi. Dipakai untuk filter permintaan & laporan per divisi. |
| `warehouseIds` | array<string> | tidak | `["wh_jakarta"]` | Batas gudang yang boleh diakses staff. Kosong = semua (untuk admin). |
| `phone` | string | tidak | `"+62812..."` | Kontak; dipakai notifikasi WhatsApp/SMS di masa depan. |
| `photoUrl` | string | tidak | `"https://..."` | URL foto dari Storage. |
| `fcmTokens` | array<string> | tidak | `["fcm_abc..."]` | Token perangkat FCM untuk push notification. Ditulis oleh `POST /notifications/register-token` (API.md §3.13, #91). Satu user bisa punya beberapa perangkat. |
| `lastLoginAt` | Timestamp | tidak | `2026-10-06T02:15:00Z` | Di-update saat login; berguna untuk audit akses. |
| `createdAt` | Timestamp | ya | — | `serverTimestamp()`. |
| `updatedAt` | Timestamp | ya | — | `serverTimestamp()` setiap perubahan. |
| `createdBy` | string | tidak | `"admin_uid"` | uid pembuat (null jika dibuat otomatis oleh sistem). |

**Contoh dokumen:**

```json
{
  "uid": "aB3xK9mQ7vR2sT4uW6yZ8a",
  "email": "budi@ptabc.co.id",
  "displayName": "Budi Santoso",
  "role": "staff",
  "isActive": true,
  "department": "Produksi",
  "warehouseIds": ["wh_jakarta"],
  "phone": "+628123456789",
  "photoUrl": "https://storage.googleapis.com/inventory-system.appspot.com/avatars/aB3xK9.jpg",
  "fcmTokens": ["fcm_abc123..."],
  "lastLoginAt": "2026-10-06T02:15:00Z",
  "createdAt": "2026-09-01T03:00:00Z",
  "updatedAt": "2026-10-06T02:15:00Z",
  "createdBy": "sys_admin_uid"
}
```

**Index:**
- Single-field: `role`, `isActive`, `department` (otomatis).
- Composite: `isActive ASC, role ASC` → untuk halaman "kelola user" (filter aktif + role).
- Composite: `role ASC, displayName ASC` → daftar user per role terurut nama.

**Catatan keamanan:** hanya `admin` yang boleh menulis dokumen ini. User biasa hanya boleh
membaca dokumen miliknya sendiri. Perubahan `role` **wajib** memicu Cloud Function untuk
memperbarui custom claims, jika tidak, token lama masih membawa role lama (jelaskan di
dokumen security).

---

### 3.2 `categories`

**Tujuan:** klasifikasi item (mis. "Elektronik", "Alat Tulis", "Bahan Baku"). Dipakai untuk
filter, laporan, dan pengelompokan dashboard.

**Kenapa ada `itemCount`:** dashboard ingin menampilkan "berapa item per kategori" tanpa
menghitung ulang setiap saat (mahal). Counter ini dipelihara oleh transaksi saat item
dibuat/dihapus/dipindah kategori.

| Field | Tipe | Wajib? | Contoh | Keterangan |
|---|---|---|---|---|
| `id` | string | ya | `"cat_elektronik"` | Doc ID. Boleh auto-ID; gunakan slug stabil bila ingin mudah dibaca. |
| `code` | string | ya | `"ELK"` | Kode pendek untuk prefix SKU & laporan. Harus unik. |
| `name` | string | ya | `"Elektronik"` | Nama tampil. Sumber denormalisasi `categoryName` di item. |
| `description` | string | tidak | `"Perangkat & komponen listrik"` | Keterangan. |
| `parentId` | string \| null | tidak | `null` | Untuk sub-kategori opsional. `null` = kategori utama. |
| `isActive` | boolean | ya | `true` | Kategori lama dinonaktifkan, bukan dihapus, agar item lama tetap valid. |
| `itemCount` | number | ya | `42` | Jumlah item aktif. Dipelihara transaksi (denormalisasi counter). |
| `createdAt` | Timestamp | ya | — | — |
| `updatedAt` | Timestamp | ya | — | — |
| `createdBy` | string | ya | `"admin_uid"` | uid pembuat. |

**Contoh dokumen:**

```json
{
  "id": "cat_elektronik",
  "code": "ELK",
  "name": "Elektronik",
  "description": "Perangkat & komponen listrik",
  "parentId": null,
  "isActive": true,
  "itemCount": 42,
  "createdAt": "2026-09-02T01:00:00Z",
  "updatedAt": "2026-10-01T05:20:00Z",
  "createdBy": "sys_admin_uid"
}
```

**Index:**
- Composite: `isActive ASC, name ASC` → dropdown kategori aktif, terurut nama.
- Composite: `parentId ASC, name ASC` → render hirarki sub-kategori.

---

### 3.3 `suppliers`

**Tujuan:** data pemasok untuk transaksi stok masuk (`type: 'in'`) dan laporan pembelian.

**Kenapa terpisah dari `items`:** satu supplier memasok banyak item (relasi 1:N), dan data
supplier (kontak, NPWP) berubah independen dari item. Menyimpannya di dalam item akan
menduplikasi dan menyulitkan update.

| Field | Tipe | Wajib? | Contoh | Keterangan |
|---|---|---|---|---|
| `id` | string | ya | `"sup_sinarjaya"` | Doc ID. |
| `code` | string | ya | `"SUP-001"` | Kode unik internal. |
| `name` | string | ya | `"PT Sinar Jaya"` | Nama supplier. Sumber denormalisasi `supplierName`. |
| `contactPerson` | string | tidak | `"Ibu Rina"` | Narahubung. |
| `phone` | string | tidak | `"+62215551234"` | Telepon kantor. |
| `email` | string | tidak | `"sales@sinarjaya.co.id"` | Email pemesanan. |
| `address` | string | tidak | `"Jl. Industri Raya No. 12"` | Alamat. |
| `city` | string | tidak | `"Jakarta"` | Kota, untuk laporan per wilayah. |
| `npwp` | string | tidak | `"01.234.567.8-901.000"` | Identitas pajak (untuk dokumen pembelian). |
| `paymentTermDays` | number | tidak | `30` | Termin pembayaran; dipakai modul pembelian mendatang. |
| `isActive` | boolean | ya | `true` | Supplier nonaktif tetap muncul di riwayat transaksi lama. |
| `notes` | string | tidak | `"Lead time 3 hari"` | Catatan bebas. |
| `createdAt` | Timestamp | ya | — | — |
| `updatedAt` | Timestamp | ya | — | — |
| `createdBy` | string | ya | `"admin_uid"` | — |

**Contoh dokumen:**

```json
{
  "id": "sup_sinarjaya",
  "code": "SUP-001",
  "name": "PT Sinar Jaya",
  "contactPerson": "Ibu Rina",
  "phone": "+62215551234",
  "email": "sales@sinarjaya.co.id",
  "address": "Jl. Industri Raya No. 12",
  "city": "Jakarta",
  "npwp": "01.234.567.8-901.000",
  "paymentTermDays": 30,
  "isActive": true,
  "notes": "Lead time 3 hari",
  "createdAt": "2026-09-02T01:30:00Z",
  "updatedAt": "2026-09-02T01:30:00Z",
  "createdBy": "sys_admin_uid"
}
```

**Index:**
- Composite: `isActive ASC, name ASC` → dropdown supplier aktif.

---

### 3.3b `divisions`

**Tujuan:** master data **divisi** (mis. "Produksi", "Operasional", "Keuangan"). Dirujuk oleh
`requests.department`/`requests.divisionId` dan transaksi stok keluar (`stockTransactions.divisionId`),
sehingga divisi tujuan terdokumentasi sebagai data (bukan teks bebas). Lihat PROJECT.md §9.4,
BR-24, dan US-50.

**Kenapa koleksi terpisah, bukan teks bebas:** bila divisi disimpan sebagai string, akan muncul
variasi ejaan ("Produksi" vs "produksi" vs "Div. Produksi") yang merusak laporan per divisi.
Master data menjaga nilai seragam dan bisa dinonaktifkan tanpa menghapus riwayat.

| Field | Tipe | Wajib? | Contoh | Keterangan |
|---|---|---|---|---|
| `id` | string | ya | `"div_produksi"` | Doc ID. |
| `code` | string | ya | `"PRD"` | Kode singkat divisi. **Unik**. |
| `name` | string | ya | `"Produksi"` | Nama tampil. |
| `description` | string | tidak | `"Divisi manufaktur"` | Keterangan. |
| `isActive` | boolean | ya | `true` | Divisi nonaktif tidak muncul di form baru, tetapi tetap valid di riwayat lama. |
| `createdAt` | Timestamp | ya | — | — |
| `updatedAt` | Timestamp | ya | — | — |
| `createdBy` | string | ya | `"admin_uid"` | uid pembuat. |

**Contoh dokumen:**

```json
{
  "id": "div_produksi",
  "code": "PRD",
  "name": "Produksi",
  "description": "Divisi manufaktur",
  "isActive": true,
  "createdAt": "2026-09-02T01:00:00Z",
  "updatedAt": "2026-10-01T05:20:00Z",
  "createdBy": "sys_admin_uid"
}
```

**Index:**
- Single-field: `code` (unik — dijaga di aplikasi + transaksi), `isActive`.
- Composite: `isActive ASC, name ASC` → dropdown divisi aktif.

---

### 3.4 `units`

**Tujuan:** satuan (satuan ukur) untuk item: `pcs`, `box`, `kg`, `liter`, `meter`, `roll`.
Dibuat sebagai koleksi (bukan enum hardcode) agar admin bisa menambah satuan tanpa deploy.

| Field | Tipe | Wajib? | Contoh | Keterangan |
|---|---|---|---|---|
| `id` | string | ya | `"unit_pcs"` | Doc ID. |
| `name` | string | ya | `"Pieces"` | Nama panjang. |
| `symbol` | string | ya | `"pcs"` | Simbol pendek. Disalin ke item (`unitSymbol`) & transaksi. Harus unik. |
| `allowDecimal` | boolean | ya | `false` | `true` untuk kg/liter; `false` untuk pcs/box. Dasar validasi kuantitas. |
| `description` | string | tidak | `"Satuan per unit"` | Keterangan. |
| `isActive` | boolean | ya | `true` | Satuan nonaktif tidak muncul di form baru. |
| `createdAt` | Timestamp | ya | — | — |
| `updatedAt` | Timestamp | ya | — | — |
| `createdBy` | string | ya | `"admin_uid"` | uid pembuat (mengikuti konvensi §3). |

> **Keterlacakan (US & roadmap):** di MVP, `units` adalah **master data yang di-seed statis**
> (oleh admin lewat script/seed, bukan lewat UI CRUD) karena satuan jarang berubah dan
> `items.unitId` menunjuk ke sini. UI pengelolaan satuan (buat/ubah/nonaktifkan) = nice-to-have
> fase lanjut; jika ditambahkan, ikuti pola CRUD `categories`. Ini menutup celah keterlacakan
> "`unitId` wajib" tanpa alur pengelolaan.

**Contoh dokumen:**

```json
{
  "id": "unit_kg",
  "name": "Kilogram",
  "symbol": "kg",
  "allowDecimal": true,
  "description": "Satuan berat",
  "isActive": true,
  "createdAt": "2026-09-02T02:00:00Z",
  "updatedAt": "2026-09-02T02:00:00Z",
  "createdBy": "sys_admin_uid"
}
```

**Index:**
- Composite: `isActive ASC, symbol ASC` → dropdown satuan aktif.

---

### 3.5 `items`

**Tujuan:** master data barang — koleksi **paling penting** di sistem. Semua transaksi
menunjuk ke sini. Detail lengkap field stok dibahas di [§5](#5-struktur-items-secara-mendalam).

**Kenapa `currentStock` ada di item, padahal ada ledger:** agar daftar item & dashboard bisa
dirender dengan **1 read per item**, bukan menghitung seluruh transaksi. Nilai ini adalah
**cache materialized** yang hanya boleh diubah oleh transaksi (lihat [§6](#6-model-stok--kenapa-harus-lewat-transaksi)).

| Field | Tipe | Wajib? | Contoh | Keterangan |
|---|---|---|---|---|
| `id` | string | ya | `"itm_00123"` | Doc ID (auto-ID disarankan; lihat catatan di bawah). |
| `sku` | string | ya | `"ELK-0001"` | Kode unik barang. **Unik** (dijaga transaksi + cek duplikat). |
| `barcode` | string | tidak | `"8991234567890"` | Untuk scan; opsional, boleh kosong. |
| `name` | string | ya | `"Kabel NYM 3x2.5mm"` | Nama barang. |
| `normalizedName` | string | ya | `"kabel nym 3x2.5mm"` | Huruf kecil, untuk pencarian prefix case-insensitive. |
| `categoryId` | string | ya | `"cat_elektronik"` | Reference ke `categories`. |
| `categoryName` | string | ya | `"Elektronik"` | **Denormalisasi** untuk tampilan daftar. |
| `unitId` | string | ya | `"unit_roll"` | Reference ke `units`. |
| `unitSymbol` | string | ya | `"roll"` | **Denormalisasi** simbol satuan. |
| `supplierId` | string \| null | tidak | `"sup_sinarjaya"` | Supplier default (untuk saran restock). |
| `supplierName` | string \| null | tidak | `"PT Sinar Jaya"` | **Denormalisasi** nama supplier default. |
| `currentStock` | number | ya | `120` | **Total stok.** Hanya boleh diubah oleh transaksi. |
| `stockByWarehouse` | map<string,number> | tidak | `{"wh_jakarta": 120}` | Stok per gudang. Kunci = `warehouseId`. **Opsional:** di MVP (single warehouse) hanya berisi satu kunci gudang default. Kosong = stok dianggap ada di gudang default. |
| `minStock` | number | tidak | `50` | Reorder point global. Jika stok ≤ nilai ini → `isLowStock = true`. **Default `0` bila tidak diisi** (BR-12). |
| `maxStock` | number | tidak | `500` | Batas atas (untuk saran pembelian). |
| `isLowStock` | boolean | ya | `false` | **Field turunan** dari `currentStock <= minStock`. Diperbarui transaksi. Wajib untuk query (lihat §1.3). |
| `stockValue` | number | tidak | `22200000` | **Field turunan** `currentStock * costPrice` (BR-23). Didenormalisasi agar dashboard bisa `sum('stockValue')` (lihat ROADMAP §520). |
| `stockGap` | number | tidak | `70` | **Field turunan** `currentStock - minStock` (negatif = menipis). Opsional; alert cukup memakai `isLowStock`. |
| `costPrice` | number | tidak | `185000` | Harga pokok terakhir (integer Rupiah). |
| `sellPrice` | number | tidak | `210000` | Harga jual (opsional, bila modul penjualan dipakai). |
| `imageUrl` | string | tidak | `"https://..."` | URL publik/ber-token dari Storage. |
| `imagePath` | string | tidak | `"items/itm_00123/photos/main.jpg"` | Path Storage, dipakai untuk hapus/replace. Struktur path: `items/{itemId}/photos/{fileName}` (lihat SECURITY.md §6.1). |
| `description` | string | tidak | `"Kabel instalasi..."` | Deskripsi. |
| `tags` | array<string> | tidak | `["kabel","instalasi"]` | Untuk pencarian tambahan. |
| `isActive` | boolean | ya | `true` | Barang diarsipkan tidak dihapus agar transaksi lama tetap valid. |
| `createdAt` | Timestamp | ya | — | — |
| `updatedAt` | Timestamp | ya | — | — |
| `createdBy` | string | ya | `"admin_uid"` | — |
| `updatedBy` | string | ya | `"staff_uid"` | — |

**Contoh dokumen:**

```json
{
  "id": "itm_00123",
  "sku": "ELK-0001",
  "barcode": "8991234567890",
  "name": "Kabel NYM 3x2.5mm",
  "normalizedName": "kabel nym 3x2.5mm",
  "categoryId": "cat_elektronik",
  "categoryName": "Elektronik",
  "unitId": "unit_roll",
  "unitSymbol": "roll",
  "supplierId": "sup_sinarjaya",
  "supplierName": "PT Sinar Jaya",
  "currentStock": 120,
  "stockByWarehouse": { "wh_jakarta": 120 },
  "minStock": 50,
  "maxStock": 500,
  "isLowStock": false,
  "costPrice": 185000,
  "sellPrice": 210000,
  "imageUrl": "https://storage.googleapis.com/.../items/itm_00123/photos/main.jpg",
  "imagePath": "items/itm_00123/photos/main.jpg",
  "description": "Kabel instalasi listrik",
  "tags": ["kabel", "instalasi"],
  "isActive": true,
  "createdAt": "2026-09-03T01:00:00Z",
  "updatedAt": "2026-10-05T08:30:00Z",
  "createdBy": "sys_admin_uid",
  "updatedBy": "staff_budi_uid"
}
```

**Catatan Doc ID:** disarankan memakai **auto-ID** untuk `id` dan menyimpan `sku` sebagai
field unik. Alasan: SKU bisa berubah (perusahaan ganti format kode); memakai SKU sebagai doc
ID berarti setiap perubahan SKU = hapus + buat dokumen baru, yang merusak referensi
transaksi lama. Auto-ID tidak pernah berubah.

**Index:**
- Single-field: `sku` (unik — dijaga di aplikasi + transaksi), `barcode`, `isActive`.
- Composite: `isActive ASC, name ASC` → daftar item terurut nama.
- Composite: `categoryId ASC, isActive ASC, name ASC` → daftar item per kategori.
- Composite: `isActive ASC, isLowStock ASC, name ASC` → daftar item menipis (dipakai dashboard & cron; cocok dengan query Q1 §9).
- Composite: `isActive ASC, normalizedName ASC` → pencarian prefix.

---

### 3.6 `warehouses`

**Tujuan:** lokasi gudang. Stok per gudang disimpan di `items.stockByWarehouse` (map) dengan
kunci `warehouseId`.

**Kenapa map di item, bukan koleksi `stockLevels` terpisah:** jumlah gudang sedikit
(2–10). Map membuat pembacaan stok per item = 1 read, dan pembaruan satu gudang bisa
dilakukan dengan dot-path (`stockByWarehouse.wh_jakarta`). Jika kelak gudang > ~20 atau
butuh metadata stok per gudang (mis. bin/rak), migrasikan ke subkoleksi
`items/{id}/warehouseStocks` — dicatat sebagai utang teknis di [§10](#10-pertumbuhan-data--strategi).

> **Scope MVP — single warehouse.** PROJECT.md §1.1 & §5.2 menetapkan perusahaan punya **satu
> gudang utama** dan multi-gudang sebagai nice-to-have. Karena itu di MVP: hanya ada **satu**
> dokumen `warehouses` (gudang default, `isDefault: true`), `stockByWarehouse` hanya berisi satu
> kunci, dan UI pemilihan gudang boleh disembunyikan (pakai gudang default). Struktur koleksi
> tetap disiapkan agar multi-gudang bisa diaktifkan tanpa migrasi skema — lihat §10.5.

| Field | Tipe | Wajib? | Contoh | Keterangan |
|---|---|---|---|---|
| `id` | string | ya | `"wh_jakarta"` | Doc ID (slug stabil, karena dipakai sebagai kunci map). |
| `code` | string | ya | `"WH-JKT"` | Kode gudang. |
| `name` | string | ya | `"Gudang Jakarta"` | Nama tampil. Sumber denormalisasi `warehouseName`. |
| `type` | string | ya | `"main"` | `main` \| `branch` \| `transit`. |
| `address` | string | tidak | `"Jl. Raya Bekasi KM 18"` | Alamat. |
| `city` | string | tidak | `"Jakarta"` | Kota. |
| `picUserId` | string \| null | tidak | `"staff_budi_uid"` | Penanggung jawab (reference ke users). |
| `picName` | string | tidak | `"Budi Santoso"` | **Denormalisasi** nama PIC. |
| `isDefault` | boolean | ya | `true` | Gudang default saat input transaksi. Hanya satu boleh `true`. |
| `isActive` | boolean | ya | `true` | Gudang nonaktif tidak muncul di form baru. |
| `createdAt` | Timestamp | ya | — | — |
| `updatedAt` | Timestamp | ya | — | — |
| `createdBy` | string | ya | `"admin_uid"` | — |

**Contoh dokumen:**

```json
{
  "id": "wh_jakarta",
  "code": "WH-JKT",
  "name": "Gudang Jakarta",
  "type": "main",
  "address": "Jl. Raya Bekasi KM 18",
  "city": "Jakarta",
  "picUserId": "staff_budi_uid",
  "picName": "Budi Santoso",
  "isDefault": true,
  "isActive": true,
  "createdAt": "2026-09-01T00:00:00Z",
  "updatedAt": "2026-09-01T00:00:00Z",
  "createdBy": "sys_admin_uid"
}
```

**Index:**
- Composite: `isActive ASC, name ASC` → dropdown gudang.
- Composite: `isActive ASC, isDefault DESC` → menentukan gudang default (dijaga transaksi).

---

### 3.7 `stockTransactions`

**Tujuan:** **ledger (buku besar) stok.** Setiap perubahan stok — masuk, keluar, penyesuaian —
menghasilkan **satu dokumen baru**. Koleksi ini **append-only**: dokumen **tidak pernah dihapus**
dan **angka tidak pernah diubah**. Satu-satunya perubahan yang diizinkan adalah **penandaan
pembatalan** (`status` → `cancelled` + `cancelReason`, BR-02); koreksi angka stok dilakukan
dengan **membuat dokumen lawan (reversal)**, bukan mengedit dokumen lama. Ini sumber kebenaran
stok ([§6](#6-model-stok--kenapa-harus-lewat-transaksi)).

**Kenapa menyimpan `itemName`, `itemSku`, `stockBefore`, `stockAfter`:** ini **snapshot**
nilai pada saat transaksi. Kalau besok nama item diganti, riwayat lama harus tetap
menampilkan nama saat itu. Selain itu `stockAfter` memungkinkan rekonstruksi & audit tanpa
menghitung ulang seluruh ledger.

> **Multi-item (US-22):** satu input multi-item dari API (`lines[]`) **di-expand menjadi satu
> dokumen `stockTransactions` per item**, ditulis dalam **satu Firestore transaction/batch** yang
> sama sehingga atomik, dan **berbagi `batchId`** yang sama sebagai pengelompokan resmi. Model
> ledger tetap **satu item per dokumen** (memudahkan index & query per item); jumlah item per
> batch dibatasi (mis. ≤ 50) di layer API. Lihat SECURITY.md §5.3.

| Field | Tipe | Wajib? | Contoh | Keterangan |
|---|---|---|---|---|
| `id` | string | ya | auto-ID | Doc ID. |
| `transactionNo` | string | ya | `"TRX-2026-000123"` | Nomor dokumen manusiawi. **Unik** (dari counter di `settings/numbering`). Satu `batchId` multi-item memakai nomor yang sama dengan sufiks baris. |
| `type` | string | ya | `"in"` | `in` \| `out` \| `adjustment`. |
| `status` | string | ya | `"completed"` | `completed` \| `cancelled`. Default `completed` (BR-02). |
| `itemId` | string | ya | `"itm_00123"` | Reference ke `items`. |
| `itemSku` | string | ya | `"ELK-0001"` | **Snapshot** SKU saat transaksi. |
| `itemName` | string | ya | `"Kabel NYM 3x2.5mm"` | **Snapshot** nama item. |
| `unitSymbol` | string | ya | `"roll"` | **Snapshot** satuan. |
| `warehouseId` | string | tidak | `"wh_jakarta"` | Reference ke `warehouses`. **Opsional di MVP** (single warehouse): bila kosong, dipakai gudang default (`isDefault: true`). |
| `warehouseName` | string | tidak | `"Gudang Jakarta"` | **Snapshot** nama gudang. |
| `quantity` | number | ya | `20` | Jumlah **selalu positif** (absolut). Arah ditentukan `type`/`signedQuantity`. Untuk `adjustment`, `quantity = \|delta\|` (besar selisih); nilai sebelum/sesudah ada di `quantityBefore`/`quantityAfter`. |
| `signedQuantity` | number | ya | `20` / `-5` / `-3` | Perubahan bertanda untuk agregasi laporan (`+` masuk, `-` keluar, `±` adjustment). |
| `stockBefore` | number | ya | `100` | Stok item di gudang itu **sebelum** transaksi. |
| `stockAfter` | number | ya | `120` | Stok **sesudah**. Untuk `in`: `stockAfter = stockBefore + quantity`. |
| `unitCost` | number | tidak | `185000` | Harga per satuan saat transaksi (integer Rupiah). |
| `totalCost` | number | tidak | `3700000` | `unitCost * quantity`. Disimpan agar laporan tidak menghitung ulang. |
| `referenceType` | string | ya | `"purchase"` | `purchase` \| `request` \| `manual` \| `opname` \| `return` \| `transfer` \| `reversal`. |
| `referenceId` | string \| null | tidak | `"req_2026_0045"` | ID dokumen sumber (mis. request, atau id transaksi asal saat `reversal`). |
| `supplierId` | string \| null | tidak | `"sup_sinarjaya"` | Untuk `type: 'in'`. |
| `supplierName` | string \| null | tidak | `"PT Sinar Jaya"` | **Snapshot** nama supplier. |
| `requestId` | string \| null | tidak | `"req_2026_0045"` | Untuk `type: 'out'` yang memenuhi permintaan. |
| `divisionId` | string \| null | tidak | `"div_produksi"` | Divisi tujuan; **wajib untuk `type: 'out'`** (BR-24). |
| `note` | string | ya | `"Barang rusak saat bongkar"` | **Wajib** (BR-03): catatan/alasan transaksi. Untuk `adjustment`, wajib menjelaskan hasil opname (BR-19). |
| `quantityBefore` | number \| null | tidak | `100` | Khusus `adjustment` (BR-19): stok fisik sebelum. |
| `quantityAfter` | number \| null | tidak | `97` | Khusus `adjustment`: stok fisik sesudah. |
| `delta` | number \| null | tidak | `-3` | Khusus `adjustment`: `quantityAfter − quantityBefore` (boleh negatif, BR-18). |
| `attachments` | array<map> | tidak | `[{"name":"BA.pdf","url":"...","path":"..."}]` | Bukti (foto kerusakan, surat jalan) dari Storage. |
| `occurredAt` | Timestamp | ya | `2026-10-06T03:00:00Z` | **Tanggal bisnis** transaksi (bisa beda dari `createdAt` saat input backdate). |
| `createdBy` | string | ya | `"staff_budi_uid"` | uid pelaku. |
| `createdByName` | string | ya | `"Budi Santoso"` | **Snapshot** nama pelaku. |
| `createdByRole` | string | ya | `"staff"` | Role saat transaksi (jejak otorisasi). |
| `batchId` | string \| null | tidak | `"bch_2026_10_06_a1b2"` | Pengelompokan resmi satu input multi-item (US-22): semua dokumen dari satu submit berbagi `batchId`. Juga menandai transaksi hasil impor massal. |
| `reversalOf` | string \| null | tidak | `"trx_9f8a7b6c"` | Diisi pada **dokumen lawan**: id transaksi asal yang dibalik (BR-02). |
| `cancelledBy` | string \| null | tidak | `"admin_uid"` | uid pembatal (diisi pada dokumen asal saat `status: 'cancelled'`). |
| `cancelledAt` | Timestamp \| null | tidak | `2026-10-07T01:00:00Z` | Waktu pembatalan. |
| `cancelReason` | string \| null | tidak | `"Salah input supplier"` | **Wajib saat `status: 'cancelled'`** (BR-02). |
| `idempotencyKey` | string \| null | tidak | `"uuid-..."` | Mencegah transaksi ganda saat retry jaringan; divalidasi lewat koleksi `idempotencyKeys` (§3.13). |
| `createdAt` | Timestamp | ya | — | Waktu sistem menyimpan. |

**Contoh dokumen (stok keluar karena permintaan):**

```json
{
  "id": "trx_9f8a7b6c",
  "transactionNo": "TRX-2026-000123",
  "type": "out",
  "status": "completed",
  "itemId": "itm_00123",
  "itemSku": "ELK-0001",
  "itemName": "Kabel NYM 3x2.5mm",
  "unitSymbol": "roll",
  "warehouseId": "wh_jakarta",
  "warehouseName": "Gudang Jakarta",
  "quantity": 5,
  "signedQuantity": -5,
  "stockBefore": 120,
  "stockAfter": 115,
  "unitCost": 185000,
  "totalCost": 925000,
  "referenceType": "request",
  "referenceId": "req_2026_0045",
  "supplierId": null,
  "supplierName": null,
  "requestId": "req_2026_0045",
  "divisionId": "div_produksi",
  "note": "Pemenuhan permintaan divisi Produksi",
  "quantityBefore": null,
  "quantityAfter": null,
  "delta": null,
  "attachments": [],
  "occurredAt": "2026-10-06T03:00:00Z",
  "createdBy": "staff_budi_uid",
  "createdByName": "Budi Santoso",
  "createdByRole": "staff",
  "batchId": "bch_2026_10_06_a1b2",
  "reversalOf": null,
  "cancelledBy": null,
  "cancelledAt": null,
  "cancelReason": null,
  "idempotencyKey": "3f1c9e2a-...",
  "createdAt": "2026-10-06T03:00:05Z"
}
```

**Mekanisme reversal (BR-02, US-20):** koreksi transaksi tidak menghapus/mengubah angka.
Ada dua jalur yang sah:
1. **Batalkan transaksi** → set `status: 'cancelled'`, isi `cancelledBy`, `cancelledAt`,
   `cancelReason`. Transaksi ber-`status: 'cancelled'` **tidak dihitung** dalam saldo berjalan
   (semua query saldo memfilter `status == 'completed'`). Ini hanya untuk koreksi input yang
   belum berdampak lanjut.
2. **Buat dokumen lawan (`reversal`)** → dokumen baru dengan `referenceType: 'reversal'`,
   `referenceId` = id transaksi asal, dan `reversalOf` = id transaksi asal; angkanya berlawanan
   (`type` berlawanan atau `signedQuantity` dinegasi). Dipakai bila transaksi sudah tercermin di
   laporan/permintaan. Transaksi asal **tidak diubah**. Endpoint: `POST /api/v1/stock-transactions/{id}/reverse`.

**Index:**
- Single-field: `occurredAt` (desc), `createdAt`, `itemId`, `warehouseId`, `type`, `status`, `batchId`.
- Composite: `itemId ASC, occurredAt DESC` → **kartu stok** per item.
- Composite: `itemId ASC, warehouseId ASC, occurredAt DESC` → kartu stok per item per gudang.
- Composite: `warehouseId ASC, occurredAt DESC` → transaksi per gudang.
- Composite: `type ASC, occurredAt DESC` → rekap masuk/keluar **dan** laporan periode
  (Q7 memakai equality `type` + rentang `occurredAt`; field kesetaraan harus di depan).
- Composite: `status ASC, occurredAt DESC` → menyaring transaksi aktif (`completed`) pada laporan.
- Composite: `referenceType ASC, referenceId ASC` → menelusuri transaksi dari dokumen sumber.

**Aturan:** security rules **melarang** `delete` untuk semua klien, dan **melarang `update`
field angka** (append-only). Satu-satunya `update` yang diizinkan adalah penandaan pembatalan
(`status` → `cancelled` + `cancelledBy`/`cancelledAt`/`cancelReason`), dan itu pun hanya lewat
Admin SDK (API/Cloud Functions). Hanya Admin SDK yang boleh `create`.

---

### 3.8 `requests`

**Tujuan:** **header** permintaan barang antar divisi (workflow approval). Baris item-nya
disimpan di subkoleksi `requestItems` ([§3.9](#39-requestitems-subkoleksi)).

**Kenapa header & detail dipisah:** header berisi status workflow dan metadata (siapa, kapan,
disetujui siapa), sedangkan baris bisa berubah-ubah (kuantitas disetujui vs diminta vs
dipenuhi). Memisahkan keduanya membuat pembaruan status murah (1 write) dan query "daftar
permintaan" tidak perlu menarik semua baris.

**Alur status:** `draft` → `submitted` → (`approved` | `rejected`) → `fulfilled`
atau `cancelled` dari `draft`/`submitted`. Perubahan status **hanya** lewat endpoint/Cloud
Function, dan setiap transisi menulis `auditLogs` + `notifications`.

| Field | Tipe | Wajib? | Contoh | Keterangan |
|---|---|---|---|---|
| `id` | string | ya | `"req_2026_0045"` | Doc ID. |
| `requestNo` | string | ya | `"REQ-2026-000045"` | Nomor manusiawi, unik (counter `settings/numbering`). |
| `title` | string | ya | `"Permintaan kabel produksi"` | Judul singkat. |
| `status` | string | ya | `"submitted"` | `draft` \| `submitted` \| `approved` \| `rejected` \| `fulfilled` \| `cancelled`. |
| `requestedBy` | string | ya | `"staff_budi_uid"` | uid pemohon. |
| `requestedByName` | string | ya | `"Budi Santoso"` | **Snapshot** nama pemohon. |
| `requestedByRole` | string | ya | `"staff"` | Role saat mengajukan. |
| `department` | string | ya | `"Produksi"` | Divisi pemohon (untuk filter & laporan). |
| `warehouseId` | string | tidak | `"wh_jakarta"` | Gudang sumber pengambilan. **Opsional di MVP** (single warehouse): bila kosong, dipakai gudang default. |
| `warehouseName` | string | tidak | `"Gudang Jakarta"` | **Snapshot** nama gudang. |
| `priority` | string | ya | `"normal"` | `low` \| `normal` \| `high` \| `urgent`. |
| `neededAt` | Timestamp | tidak | `2026-10-10T00:00:00Z` | Tanggal dibutuhkan. |
| `itemCount` | number | ya | `3` | Jumlah baris (denormalisasi counter). |
| `totalQuantity` | number | ya | `25` | Total kuantitas (denormalisasi, dipelihara saat baris berubah). |
| `totalEstimatedValue` | number | ya | `4500000` | Estimasi nilai (integer Rupiah). |
| `notes` | string | tidak | `"Untuk proyek A"` | Catatan pemohon. |
| `submittedAt` | Timestamp | tidak | — | Diisi saat transisi `draft → submitted`. |
| `approvedAt` | Timestamp | tidak | — | — |
| `approvedBy` | string | tidak | `"admin_uid"` | uid penyetuju. |
| `approvedByName` | string | tidak | `"Admin Gudang"` | **Snapshot** nama penyetuju. |
| `approvalNote` | string | tidak | `"Disetujui, koordinasi dengan gudang"` | Catatan penyetuju saat `approve` (opsional). |
| `rejectedAt` | Timestamp | tidak | — | — |
| `rejectedBy` | string | tidak | — | uid penolak. |
| `rejectionReason` | string | tidak | `"Stok dialokasikan proyek B"` | Wajib saat `rejected`. |
| `fulfilledAt` | Timestamp | tidak | — | Saat semua/seluruh baris dipenuhi. |
| `fulfilledBy` | string | tidak | — | uid pelaksana. |
| `cancelledAt` | Timestamp | tidak | — | — |
| `cancelledBy` | string | tidak | — | — |
| `cancelReason` | string | tidak | `"Salah input"` | Wajib saat `cancelled`. |
| `createdAt` | Timestamp | ya | — | — |
| `updatedAt` | Timestamp | ya | — | — |

**Contoh dokumen:**

```json
{
  "id": "req_2026_0045",
  "requestNo": "REQ-2026-000045",
  "title": "Permintaan kabel produksi",
  "status": "submitted",
  "requestedBy": "staff_budi_uid",
  "requestedByName": "Budi Santoso",
  "requestedByRole": "staff",
  "department": "Produksi",
  "warehouseId": "wh_jakarta",
  "warehouseName": "Gudang Jakarta",
  "priority": "normal",
  "neededAt": "2026-10-10T00:00:00Z",
  "itemCount": 3,
  "totalQuantity": 25,
  "totalEstimatedValue": 4500000,
  "notes": "Untuk proyek A",
  "submittedAt": "2026-10-06T03:10:00Z",
  "approvedAt": null,
  "approvedBy": null,
  "approvedByName": null,
  "approvalNote": null,
  "rejectedAt": null,
  "rejectedBy": null,
  "rejectionReason": null,
  "fulfilledAt": null,
  "fulfilledBy": null,
  "cancelledAt": null,
  "cancelledBy": null,
  "cancelReason": null,
  "createdAt": "2026-10-06T03:05:00Z",
  "updatedAt": "2026-10-06T03:10:00Z"
}
```

**Index:**
- Single-field: `status`, `requestedBy`, `department`, `createdAt`.
- Composite: `status ASC, createdAt ASC` → antrean "menunggu approval" (terlama dulu / FIFO).
- Composite: `requestedBy ASC, status ASC, createdAt DESC` → "permintaan saya".
- Composite: `department ASC, status ASC, createdAt DESC` → laporan per divisi.
- Composite: `warehouseId ASC, status ASC, createdAt DESC` → permintaan per gudang.

---

### 3.9 `requestItems` (subkoleksi)

**Path:** `requests/{requestId}/requestItems/{requestItemId}`

**Tujuan:** baris detail permintaan (satu baris = satu item). Mengapa subkoleksi, bukan
koleksi top-level: lihat [§4](#4-keputusan-embed-vs-reference).

| Field | Tipe | Wajib? | Contoh | Keterangan |
|---|---|---|---|---|
| `id` | string | ya | auto-ID | Doc ID. |
| `itemId` | string | ya | `"itm_00123"` | Reference ke `items`. |
| `itemSku` | string | ya | `"ELK-0001"` | **Snapshot** SKU. |
| `itemName` | string | ya | `"Kabel NYM 3x2.5mm"` | **Snapshot** nama item. |
| `unitSymbol` | string | ya | `"roll"` | **Snapshot** satuan. |
| `quantityRequested` | number | ya | `10` | Jumlah diminta pemohon. |
| `quantityApproved` | number | tidak | `8` | Jumlah disetujui (≤ diminta). Diisi saat approval. |
| `quantityFulfilled` | number | ya | `0` | Jumlah yang sudah keluar gudang (akumulasi). |
| `estimatedPrice` | number | tidak | `185000` | Estimasi harga satuan (integer Rupiah). |
| `subtotal` | number | tidak | `1480000` | `estimatedPrice * quantityApproved`. |
| `lineStatus` | string | ya | `"pending"` | `pending` \| `approved` \| `rejected` \| `fulfilled`. |
| `note` | string | tidak | `"Merek apa saja"` | Catatan per baris. |
| `createdAt` | Timestamp | ya | — | — |
| `updatedAt` | Timestamp | ya | — | — |

**Contoh dokumen** — path lengkap: `requests/req_2026_0045/requestItems/ri_001`.

```json
{
  "id": "ri_001",
  "itemId": "itm_00123",
  "itemSku": "ELK-0001",
  "itemName": "Kabel NYM 3x2.5mm",
  "unitSymbol": "roll",
  "quantityRequested": 10,
  "quantityApproved": 8,
  "quantityFulfilled": 0,
  "estimatedPrice": 185000,
  "subtotal": 1480000,
  "lineStatus": "approved",
  "note": "Merek apa saja",
  "createdAt": "2026-10-06T03:05:00Z",
  "updatedAt": "2026-10-06T04:00:00Z"
}
```

**Index:**
- Single-field: `itemId`, `lineStatus`.
- Collection-group (opsional, untuk analitik lintas permintaan):
  `collectionGroup('requestItems')` dengan composite `itemId ASC, createdAt DESC`
  → "berapa kali item X diminta dalam 3 bulan". **Hati-hati biaya**: butuh index
  collection-group yang diaktifkan khusus.

---

### 3.10 `auditLogs`

**Tujuan:** jejak audit **immutable** untuk semua aksi penting. Detail di [§8](#8-audit-log).

| Field | Tipe | Wajib? | Contoh | Keterangan |
|---|---|---|---|---|
| `id` | string | ya | auto-ID | Doc ID. |
| `action` | string | ya | `"update"` | `create` \| `update` \| `delete` \| `approve` \| `reject` \| `login` \| `stock_in` \| `stock_out` \| `adjustment` \| `role_change` \| `export`. |
| `entityType` | string | ya | `"items"` | Nama koleksi yang terpengaruh. |
| `entityId` | string | ya | `"itm_00123"` | Doc ID yang terpengaruh. |
| `entityPath` | string | ya | `"items/itm_00123"` | Path lengkap (termasuk subkoleksi). |
| `entityLabel` | string | tidak | `"Kabel NYM 3x2.5mm"` | Label manusiawi untuk ditampilkan tanpa lookup. |
| `actorId` | string | ya | `"staff_budi_uid"` | uid pelaku. |
| `actorEmail` | string | tidak | `"budi@ptabc.co.id"` | Email pelaku (snapshot). |
| `actorName` | string | ya | `"Budi Santoso"` | **Snapshot** nama pelaku. |
| `actorRole` | string | ya | `"staff"` | Role saat aksi. |
| `changedFields` | array<string> | tidak | `["minStock","costPrice"]` | Field yang berubah (untuk `update`). |
| `before` | map \| null | tidak | `{"minStock": 40}` | Nilai **sebelum** (hanya field yang berubah, data sensitif di-mask). |
| `after` | map \| null | tidak | `{"minStock": 50}` | Nilai **sesudah** (hanya field yang berubah). |
| `source` | string | ya | `"api"` | `api` \| `function` \| `admin-sdk` \| `migration`. |
| `ip` | string | tidak | `"103.20.1.5"` | IP klien (dari request). |
| `userAgent` | string | tidak | `"Mozilla/5.0 ..."` | UA klien. |
| `traceId` | string | tidak | `"trc_abc123"` | Korelasi dengan log aplikasi/monitoring. |
| `createdAt` | Timestamp | ya | — | Waktu aksi. Tidak pernah diubah. |
| `expiresAt` | Timestamp | tidak | `2028-10-06T...` | Untuk kebijakan **TTL** Firestore (arsip otomatis), lihat [§10](#10-pertumbuhan-data--strategi). **Catatan:** TTL dijalankan oleh sistem Firestore dan **tidak tunduk pada security rules** — jadi ini satu-satunya jalur penghapusan yang sah dan terkendali, di luar jaminan "tidak pernah dihapus" (§8.3). Cloud Function terjadwal **wajib mengekspor/arsip** dokumen sebelum `expiresAt` tercapai. |

**Contoh dokumen:**

```json
{
  "id": "aud_7c6b5a4d",
  "action": "update",
  "entityType": "items",
  "entityId": "itm_00123",
  "entityPath": "items/itm_00123",
  "entityLabel": "Kabel NYM 3x2.5mm",
  "actorId": "sys_admin_uid",
  "actorEmail": "admin@ptabc.co.id",
  "actorName": "Admin Gudang",
  "actorRole": "admin",
  "changedFields": ["minStock", "costPrice"],
  "before": { "minStock": 40, "costPrice": 180000 },
  "after": { "minStock": 50, "costPrice": 185000 },
  "source": "api",
  "ip": "103.20.1.5",
  "userAgent": "Mozilla/5.0 ...",
  "traceId": "trc_abc123",
  "createdAt": "2026-10-06T04:12:33Z",
  "expiresAt": "2028-10-06T04:12:33Z"
}
```

**Index:**
- Single-field: `createdAt` (desc), `actorId`, `action`.
- Composite: `entityType ASC, entityId ASC, createdAt DESC` → riwayat satu entitas.
- Composite: `actorId ASC, createdAt DESC` → aktivitas satu user.
- Composite: `action ASC, createdAt DESC` → semua aksi bertipe tertentu.

**Aturan:** `update` dan `delete` dilarang total bagi klien (security rules
`allow update, delete: if false`). **Pengecualian tunggal:** Firestore **TTL policy** yang
menghapus dokumen kedaluwarsa (`expiresAt`) berjalan di level sistem dan **tidak melewati**
security rules — ini penghapusan terjadwal yang sah, dan arsip harus dilakukan lebih dulu.
Lihat [§8](#8-audit-log).

---

### 3.11 `notifications`

**Tujuan:** feed notifikasi **per user** (stok menipis, permintaan masuk, approval, dsb).
Ditulis oleh Cloud Functions (mis. `onStockLow`, `onRequestStatusChange`) dan/atau API.

**Kenapa top-level, bukan subkoleksi `users/{uid}/notifications`:** Cloud Functions sering
melakukan **fan-out** ke banyak user sekaligus (mis. notifikasi ke semua admin). Koleksi
top-level dengan field `userId` membuat query per-user tetap sederhana, mudah diberi TTL,
dan mudah di-query lintas user oleh admin untuk debugging. Trade-off: perlu index
`userId + createdAt`.

| Field | Tipe | Wajib? | Contoh | Keterangan |
|---|---|---|---|---|
| `id` | string | ya | auto-ID | Doc ID. |
| `userId` | string | ya | `"staff_budi_uid"` | **Penerima** (reference ke users). |
| `type` | string | ya | `"low_stock"` | `low_stock` \| `request_submitted` \| `request_approved` \| `request_rejected` \| `request_fulfilled` \| `stock_adjustment` \| `system`. |
| `severity` | string | ya | `"warning"` | `info` \| `warning` \| `critical`. Menentukan warna/ikon. |
| `title` | string | ya | `"Stok menipis"` | Judul singkat. |
| `body` | string | ya | `"Kabel NYM tersisa 45 roll"` | Isi pesan (sudah dirender, tidak perlu join). |
| `link` | string | tidak | `"/items/itm_00123"` | Deep link route frontend. |
| `entityType` | string | tidak | `"items"` | Entitas terkait. |
| `entityId` | string | tidak | `"itm_00123"` | ID entitas terkait. |
| `isRead` | boolean | ya | `false` | Status baca. Default `false`. |
| `readAt` | Timestamp | tidak | — | Diisi saat user membaca. |
| `channels` | map<string,boolean> | ya | `{"inApp": true, "email": false}` | Kanal pengiriman yang berhasil/diminta. |
| `createdAt` | Timestamp | ya | — | — |
| `expiresAt` | Timestamp | tidak | — | TTL (mis. 90 hari) agar koleksi tidak membengkak. |

**Contoh dokumen:**

```json
{
  "id": "ntf_1a2b3c4d",
  "userId": "staff_budi_uid",
  "type": "low_stock",
  "severity": "warning",
  "title": "Stok menipis",
  "body": "Kabel NYM 3x2.5mm tersisa 45 roll (minimum 50).",
  "link": "/items/itm_00123",
  "entityType": "items",
  "entityId": "itm_00123",
  "isRead": false,
  "readAt": null,
  "channels": { "inApp": true, "email": false },
  "createdAt": "2026-10-06T05:00:00Z",
  "expiresAt": "2027-01-04T05:00:00Z"
}
```

**Index:**
- Single-field: `userId`, `isRead`, `createdAt` (desc).
- Composite: `userId ASC, isRead ASC, createdAt DESC` → daftar notifikasi belum dibaca.
- Composite: `userId ASC, createdAt DESC` → semua notifikasi user (terbaru dulu).

---

### 3.12 `settings`

**Tujuan:** konfigurasi aplikasi & **counter penomoran dokumen**. Menggunakan pola
**singleton doc** (`settings/{key}`) — satu dokumen per kelompok konfigurasi, bukan
key-value per baris. Alasan: konfigurasi dibaca sebagai satu kesatuan dan jumlahnya sedikit.

**Doc yang didefinisikan:**

- `settings/global` — identitas perusahaan & format.
- `settings/lowStock` — aturan peringatan stok.
- `settings/numbering` — counter nomor `TRX-*` dan `REQ-*`.

#### `settings/global`

| Field | Tipe | Wajib? | Contoh | Keterangan |
|---|---|---|---|---|
| `companyName` | string | ya | `"PT ABC Indonesia"` | Nama perusahaan (header laporan). |
| `logoUrl` | string | tidak | `"https://..."` | Logo dari Storage. |
| `timezone` | string | ya | `"Asia/Jakarta"` | Zona waktu untuk tampilan & penjadwalan. |
| `currency` | string | ya | `"IDR"` | Mata uang (integer Rupiah). |
| `locale` | string | ya | `"id-ID"` | Format angka/tanggal. |
| `lowStockCheckCron` | string | tidak | `"0 7 * * *"` | Jadwal pemeriksaan stok (informatif; jadwal asli di Cloud Scheduler). |
| `allowNegativeStock` | boolean | ya | `false` | Jika `false`, stok keluar yang melebihi stok **ditolak**. |
| `updatedAt` | Timestamp | ya | — | — |
| `updatedBy` | string | ya | `"sys_admin_uid"` | — |

#### `settings/lowStock`

| Field | Tipe | Wajib? | Contoh | Keterangan |
|---|---|---|---|---|
| `defaultMinStock` | number | ya | `0` | Nilai `minStock` default saat item baru dibuat tanpa nilai eksplisit. **Default `0`**, selaras dengan BR-12 (bukan 10). Boleh dinaikkan admin bila ingin semua item baru otomatis punya ambang peringatan. |
| `notifyRoles` | array<string> | ya | `["admin"]` | Role yang menerima notifikasi stok menipis. |
| `notifyEmails` | array<string> | tidak | `["gudang@ptabc.co.id"]` | Email tambahan. |
| `cooldownHours` | number | ya | `24` | Jeda minimal antar-notifikasi untuk item yang sama (anti-spam). |
| `updatedAt` | Timestamp | ya | — | — |
| `updatedBy` | string | ya | `"sys_admin_uid"` | — |

#### `settings/numbering`

| Field | Tipe | Wajib? | Contoh | Keterangan |
|---|---|---|---|---|
| `transaction.prefix` | string | ya | `"TRX"` | Prefix nomor transaksi. |
| `transaction.lastNumber` | number | ya | `123` | Nomor terakhir. Dinaikkan **di dalam transaksi** agar unik. |
| `transaction.resetPeriod` | string | ya | `"yearly"` | `yearly` \| `monthly` \| `never`. |
| `transaction.lastPeriod` | string | ya | `"2026"` | Periode terakhir; jika berbeda → reset ke 1. |
| `request.prefix` | string | ya | `"REQ"` | Prefix nomor permintaan. |
| `request.lastNumber` | number | ya | `45` | — |
| `request.resetPeriod` | string | ya | `"yearly"` | — |
| `request.lastPeriod` | string | ya | `"2026"` | — |
| `updatedAt` | Timestamp | ya | — | — |

**Contoh dokumen `settings/numbering`:**

```json
{
  "transaction": { "prefix": "TRX", "lastNumber": 123, "resetPeriod": "yearly", "lastPeriod": "2026" },
  "request":     { "prefix": "REQ", "lastNumber": 45,  "resetPeriod": "yearly", "lastPeriod": "2026" },
  "updatedAt": "2026-10-06T03:00:00Z"
}
```

**Catatan penting (race condition):** penomoran dokumen **wajib** dilakukan di dalam
`runTransaction` bersama pembuatan dokumennya. Jika dibaca lalu ditulis di luar transaksi,
dua user bisa mendapat nomor yang sama. Lihat [§6.4](#64-penomoran-dokumen-yang-aman).

**Index:** tidak ada (hanya dibaca per dokumen).

---

### 3.13 `idempotencyKeys` (anti double-submit)

**Tujuan:** mencegah operasi tulis terduplikasi saat retry jaringan / double-click. Dipakai
untuk endpoint non-idempoten: `POST /stock-transactions`, `POST /requests`, `POST /users`,
`POST /requests/{id}/submit`, dan `POST /requests/{id}/fulfill`. Klien mengirim header `Idempotency-Key`
(UUID); backend menyimpan hasilnya agar permintaan berulang mengembalikan respons **sama**
tanpa menulis ulang (lihat API.md §1.4, SECURITY.md §9.4).

**Doc ID = nilai `Idempotency-Key`** (atau hash-nya), sehingga pengecekan cukup 1 read.

| Field | Tipe | Wajib? | Contoh | Keterangan |
|---|---|---|---|---|
| `key` | string | ya | `"3f1c9e2a-..."` | Sama dengan doc ID. |
| `requestHash` | string | ya | `"sha256:..."` | Hash payload + endpoint; jika key sama tapi payload beda → `409 IDEMPOTENCY_KEY_REUSED`. |
| `endpoint` | string | ya | `"POST /api/v1/stock-transactions"` | Aksi yang di-klaim. |
| `responseRef` | string \| null | tidak | `"trx_9f8a7b6c"` | ID resource hasil (untuk replay respons). |
| `actorId` | string | ya | `"staff_budi_uid"` | uid pengirim. |
| `status` | string | ya | `"completed"` | `in_progress` \| `completed` (menandai lock saat diproses). |
| `createdAt` | Timestamp | ya | — | Waktu key diterima. |
| `expiresAt` | Timestamp | ya | `2026-10-07T03:00:00Z` | TTL (mis. 24 jam) — lihat §10.3. |

**Index:** single-field `expiresAt` (untuk TTL), `actorId` (opsional).

> **Alur:** dalam `runTransaction`, (1) baca `idempotencyKeys/{key}`; jika ada & `completed` →
> kembalikan respons tersimpan; (2) jika belum ada → buat dokumen `in_progress`, jalankan
> operasi, lalu set `completed` + `responseRef`. Dokumen key dibersihkan otomatis via TTL.

---

## 4. Keputusan embed vs reference

Firestore tidak punya JOIN, jadi setiap relasi harus diputuskan: **reference** (simpan ID,
ambil terpisah) atau **embed** (salin data). Aturan praktis yang dipakai di proyek ini:

> **Reference** jika data sumber **sering berubah**, **besar**, atau **dipakai banyak**
> dokumen lain. **Embed/denormalisasi** jika data **jarang berubah** dan **selalu dibaca
> bersama** dokumen pemiliknya.

Berikut keputusan per relasi:

| Relasi | Pilihan | Alasan (mengacu pola akses) |
|---|---|---|
| `items` → `categories` | **Reference + denorm** (`categoryId` + `categoryName`) | Satu kategori dipakai ratusan item. Kalau embed penuh, ganti nama kategori = update ratusan dokumen. Kita simpan `categoryId` (kebenaran) + `categoryName` (tampilan). Akses: daftar item selalu butuh nama kategori → denorm menghindari N+1 read. |
| `items` → `units` | **Reference + denorm** (`unitId` + `unitSymbol`) | Sama seperti kategori: satuan dipakai banyak item dan jarang berubah. `unitSymbol` dibutuhkan di setiap baris daftar item dan struk. |
| `items` → `suppliers` | **Reference + denorm** (`supplierId` + `supplierName`, nullable) | Supplier default jarang berubah tapi dipakai lintas item. Denorm nama mempercepat tampilan; supplier bisa `null`. |
| `items` → `warehouses` (stok per gudang) | **Embed sebagai map** (`stockByWarehouse`) | Pola akses: kita hampir selalu membaca **semua** stok item sekaligus, dan jumlah gudang sedikit (2–10). Map = 1 read. Jika gudang bertambah banyak atau butuh metadata per gudang, migrasikan ke subkoleksi (lihat §10). |
| `stockTransactions` → `items` | **Reference + snapshot** (`itemId` + `itemSku/itemName/unitSymbol`) | Transaksi = **riwayat**. Nilai historis harus tetap benar walau item di-rename/di-nonaktifkan. Karena itu kita **menyalin snapshot**, bukan mengambil ulang. Kita **tidak** embed seluruh dokumen item (akan basi & besar). |
| `stockTransactions` → `warehouses` | **Reference + snapshot** (`warehouseId` + `warehouseName`) | Sama: laporan lama harus menampilkan nama gudang saat transaksi. |
| `stockTransactions` → `suppliers` | **Reference + snapshot** (`supplierId` + `supplierName`, nullable) | Sama, untuk stok masuk. |
| `requests` → `requestItems` | **Embed sebagai subkoleksi** | Baris **selalu** dibaca bersama header (detail permintaan), jumlahnya kecil & terbatas (< ~50), dan **tidak pernah** diakses tanpa header-nya. Subkoleksi memberi isolasi + bisa ditulis atomik bersama header dalam satu transaksi/batch. Trade-off: query lintas permintaan butuh collection-group (jarang dipakai). |
| `requestItems` → `items` | **Reference + snapshot** (`itemId` + `itemSku/itemName/unitSymbol`) | Baris permintaan harus tetap menampilkan item seperti saat diminta, walau master item berubah. |
| `requests` → `users` (pemohon/penyetuju) | **Reference + denorm** (`requestedBy` + `requestedByName`) | Daftar permintaan menampilkan nama pemohon; denorm menghindari read ke `users` per baris. |
| `stockTransactions`/`requests`/`auditLogs` → `users` (pelaku) | **Reference + snapshot** (`createdBy` + `createdByName`/`actorName`) | Jejak audit harus menampilkan siapa **saat itu**, walau user ganti nama/dinonaktifkan. |
| `notifications` → `users` | **Reference** (`userId`, top-level) | Notifikasi adalah feed per user yang bertumbuh; disimpan top-level agar mudah di-query per user & diberi TTL. Tidak di-embed ke `users` karena jumlahnya tak terbatas (akan menembus batas 1 MiB). |
| `auditLogs` → entitas apa pun | **Reference saja** (`entityType` + `entityId`) | Log tidak boleh "memiliki" data entitas; ia hanya menunjuk. Menyimpan salinan penuh akan membengkakkan dan berisiko menyimpan data sensitif. Kita simpan hanya `before`/`after` field yang berubah. |
| `settings` | **Singleton docs** | Konfigurasi dibaca utuh per kelompok; tidak ada relasi. |

**Ringkasan prinsip:** *snapshot* dipakai untuk **riwayat/jejak** (harus beku), *denorm nama*
dipakai untuk **tampilan daftar** (harus murah), dan *reference* dipakai untuk **kebenaran
relasi** (harus satu sumber).

---

## 5. Struktur `items` secara mendalam

`items` adalah koleksi yang paling sering dibaca dan paling sensitif terhadap konsistensi.
Berikut penjelasan field penting.

### 5.1 Identitas barang

- **`sku`** — kode unik internal, mis. `ELK-0001`. Dipakai di barcode, dokumen, dan laporan.
  Keunikan dijaga **di aplikasi** (cek sebelum create) + dicek ulang di dalam transaksi.
  Firestore tidak punya constraint UNIQUE, jadi kita tidak boleh mengandalkan database saja.
- **`barcode`** — opsional; untuk pemindaian. Boleh kosong. Jika diisi, idealnya unik juga,
  tetapi praktiknya cukup dicek di aplikasi.
- **`name` / `normalizedName`** — `normalizedName` = nama huruf kecil. Alasan: Firestore
  pencarian bersifat **case-sensitive**; menyimpan versi lowercase memungkinkan pencarian
  prefix (`>= 'kabel'`, `< 'kabel'`) yang bekerja tanpa layanan pencarian eksternal.

### 5.2 Klasifikasi & satuan

- **`categoryId` / `categoryName`** — kategori menentukan pengelompokan laporan.
  Nama disalin agar daftar item tidak perlu membaca `categories` satu per satu.
- **`unitId` / `unitSymbol`** — satuan menentukan validasi kuantitas (`allowDecimal`).
  Simbol disalin karena muncul di setiap baris UI dan struk.

### 5.3 Lokasi & stok

Ini bagian paling penting. Ada **tiga field stok**:

| Field | Arti | Siapa yang boleh mengubah |
|---|---|---|
| `currentStock` | Total stok (cache) | **Hanya** sistem, lewat transaksi stok |
| `stockByWarehouse` | Stok per gudang (map `warehouseId → qty`); opsional di MVP single warehouse | **Hanya** sistem, lewat transaksi stok |
| `isLowStock` | Boolean turunan `currentStock <= minStock` | **Hanya** sistem, otomatis dari transaksi |

- **`minStock`** — titik pesan ulang (reorder point). Boleh diubah admin (master data).
  Perubahan `minStock` harus **langsung** menghitung ulang `isLowStock` (dalam transaksi yang
  sama), karena `isLowStock` adalah fungsi dari `currentStock` dan `minStock`.
- **`maxStock`** — batas atas, dipakai untuk saran pembelian.

### 5.4 Harga & media

- **`costPrice`** — harga pokok terakhir. Dipakai untuk estimasi nilai stok. Diperbarui saat
  ada transaksi masuk (opsional: rata-rata bergerak; lihat catatan di §6.5).
- **`sellPrice`** — opsional, hanya jika modul penjualan dipakai.
- **`imageUrl` / `imagePath`** — foto barang di Firebase Storage. Menyimpan **keduanya**
  bermanfaat: `imageUrl` untuk langsung ditampilkan, `imagePath` untuk menghapus/mengganti
  berkas tanpa menebak path.

### 5.5 Kenapa stok **tidak boleh** diubah langsung oleh user

Aturan mutlak: **tidak ada endpoint/UI** yang mengizinkan user menulis `currentStock`,
`stockByWarehouse`, atau `isLowStock` secara langsung. Security rules juga menolak write ke
field-field ini dari klien.

Alasan:

1. **Integritas jejak.** Setiap perubahan stok harus meninggalkan jejak di
   `stockTransactions`. Jika user bisa menimpa `currentStock`, angka bisa berubah tanpa
   sebab, dan kita kehilangan kemampuan menjawab "kenapa stok jadi 95?".
2. **Mencegah stok negatif & kesalahan.** Transaksi memvalidasi: stok keluar tidak melebihi
   stok tersedia, kuantitas > 0, satuan sesuai. Menulis angka langsung melewati semua
   validasi ini.
3. **Konsistensi antar-field.** `currentStock`, `stockByWarehouse`, dan `isLowStock` harus
   selalu sinkron. Jika user mengubah salah satunya, ketiganya bisa saling bertentangan.
4. **Audit & akuntabilitas.** Sistem inventaris harus bisa diaudit. Perubahan langsung tanpa
   dokumen sumber membuat audit mustahil.

**Konsekuensi desain:** satu-satunya jalan mengubah stok adalah membuat
`stockTransactions` melalui API/Cloud Function. Jika angka stok salah, solusinya adalah
**transaksi `adjustment`** dengan alasan (mis. hasil stok opname), bukan edit langsung.

---

## 6. Model stok & kenapa harus lewat transaksi

### 6.1 Ledger sebagai sumber kebenaran

`stockTransactions` adalah **ledger append-only** (seperti buku besar akuntansi). Secara
teoretis, stok bisa dihitung ulang dari nol:

```text
currentStock(item, warehouse) = Σ signedQuantity
                                 untuk semua transaksi item tsb di gudang tsb
```

Tetapi menghitung ulang setiap kali halaman dibuka berarti membaca ribuan dokumen (mahal,
lambat). Karena itu kita menyimpan **cache materialized**: `items.currentStock` dan
`items.stockByWarehouse`.

**Hubungan keduanya:**

- **Ledger = kebenaran.** Bisa dipakai untuk audit, rekonstruksi, dan rekonsiliasi.
- **Cache = kenyamanan.** Dipakai untuk query cepat, filter stok menipis, dan dashboard.
- **Invariant:** `currentStock` harus selalu sama dengan jumlah ledger. Jika tidak,
  ada bug. Sebuah **Cloud Function terjadwal** memverifikasi ini (rekonsiliasi) dan
  melaporkan selisihnya (lihat §6.5).

### 6.2 Kenapa tidak boleh "baca lalu tulis" dari klien

Pola naif yang **salah**:

```text
1. Baca item → currentStock = 100
2. Hitung 100 - 5 = 95
3. Tulis currentStock = 95
```

Jika dua orang melakukannya bersamaan:

```text
User A: baca 100 → hitung 95 ─┐
User B: baca 100 → hitung 95 ─┘  → keduanya menulis 95
Hasil: stok 95, padahal seharusnya 90 (dua kali keluar 5).
```

Ini disebut **lost update** (masalah *time-of-check to time-of-use* / TOCTOU). Firestore
tidak mengunci dokumen saat dibaca biasa, jadi pola ini berbahaya.

### 6.3 Solusi: Firestore transaction (`runTransaction`)

Semua perubahan stok **wajib** lewat `runTransaction` (Admin SDK di backend/Cloud Function):

```text
runTransaction(async (tx) => {
  // ---- FASE BACA (semua read harus sebelum write) ----
  const itemRef  = db.doc(`items/${itemId}`)
  const itemSnap = await tx.get(itemRef)
  if (!itemSnap.exists) throw new Error('ITEM_NOT_FOUND')

  const item  = itemSnap.data()
  const whQty = item.stockByWarehouse?.[warehouseId] ?? 0
  const settingsSnap = await tx.get(db.doc('settings/global'))

  // ---- VALIDASI ----
  const delta = (type === 'in') ? +quantity
              : (type === 'out') ? -quantity
              : signedAdjustment                    // adjustment: +/- selisih
  const afterWarehouse = whQty + delta
  const afterTotal     = item.currentStock + delta

  if (quantity <= 0) throw new Error('QTY_MUST_BE_POSITIVE')
  if (afterWarehouse < 0 && !settingsSnap.data().allowNegativeStock) {
    throw new Error('STOCK_INSUFFICIENT')               // jamin stok tidak negatif
  }

  // ---- FASE TULIS (create/update) ----
  const trxRef = db.collection('stockTransactions').doc()
  tx.set(trxRef, {                                       // 1) catat ledger
    transactionNo, type, itemId, itemSku: item.sku, itemName: item.name,
    unitSymbol: item.unitSymbol, warehouseId, warehouseName,
    quantity, signedQuantity: delta,
    stockBefore: whQty, stockAfter: afterWarehouse,
    occurredAt: FieldValue.serverTimestamp(), /* ...dst... */
  })
  tx.update(itemRef, {                                   // 2) perbarui cache
    [`stockByWarehouse.${warehouseId}`]: afterWarehouse,
    currentStock: afterTotal,
    isLowStock: afterTotal <= item.minStock,             // 3) field turunan
    updatedAt: FieldValue.serverTimestamp(),
    updatedBy: actorId,
  })
  tx.set(db.collection('auditLogs').doc(), { /* ...jejak... */ })
})
```

**Mengapa ini aman (optimistic concurrency):**

- Firestore transaction memakai **penguncian optimistik pada level dokumen**. Saat commit,
  Firestore memeriksa apakah dokumen yang **dibaca** (`itemRef`) sudah berubah sejak
  pembacaan.
- Jika ya, transaksi **digagalkan dan dijalankan ulang** secara otomatis dengan data terbaru.
  Jadi pada contoh di atas: User B akan membaca ulang stok terbaru (95), lalu menulis 90 —
  benar.
- **Dokumen item menjadi titik serialisasi**: semua transaksi yang menyentuh item yang sama
  berbaris (serialize) satu per satu. Ini menjamin tidak ada lost update dan stok tidak
  pernah negatif.
- **Semua read harus dilakukan sebelum write** dalam transaksi (aturan Firestore). Itulah
  sebabnya pembacaan `item` dan `settings` dilakukan di atas sebelum `tx.set`/`tx.update`.

> **Koreksi penting soal titik serialisasi.** Klaim "beban terbagi per item" hanya berlaku
> **jika penomoran tidak diikutkan** ke transaksi ini. Bila counter `settings/numbering` (§6.4)
> dibaca+ditulis di transaksi yang **sama**, maka dokumen `settings/numbering` menjadi **titik
> serialisasi global** — semua transaksi (semua item) berebut satu dokumen, sehingga paralelisme
> hilang dan retry/timeout bisa naik pada volume tinggi. Karena itu: pisahkan penomoran (§6.4),
> atau terima hotspot dengan menaikkan batas retry. Untuk skala perusahaan menengah (mis. ~300
> transaksi/hari) hotspot ini masih dapat diterima, tetapi **harus disadari**, bukan diklaim
> bebas hambatan.

**Catatan penting:** `runTransaction` memiliki batas retry. Untuk beban sangat tinggi pada
satu item "panas", pertimbangkan **sharded counter** atau antrean (Cloud Tasks) —
tetapi untuk skala perusahaan menengah, transaction per item sudah memadai.

### 6.4 Penomoran dokumen yang aman

Nomor `TRX-2026-000123` harus unik. Pola aman: naikkan counter di `settings/numbering`
**di dalam transaksi yang sama** dengan pembuatan dokumennya:

```text
runTransaction(async (tx) => {
  // `trxRef` = dokumen transaksi yang sedang dibuat (didefinisikan pemanggil;
  // biasanya db.collection('stockTransactions').doc()).
  const numRef  = db.doc('settings/numbering')
  const globalRef = db.doc('settings/global')
  const numSnap = await tx.get(numRef)            // read dulu
  const globSnap = await tx.get(globalRef)        // untuk timezone (read sebelum write)
  const cfg     = numSnap.data().transaction
  const tz      = globSnap.data().timezone || 'Asia/Jakarta'

  // Periode dihitung di zona waktu bisnis (bukan waktu lokal server), agar reset
  // tahun/bulan tidak salah di batas pergantian tanggal.
  const now     = new Date()
  const yyyy    = new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric' }).format(now)
  const mm      = new Intl.DateTimeFormat('en-CA', { timeZone: tz, month: '2-digit' }).format(now)
  const period  = cfg.resetPeriod === 'monthly' ? `${yyyy}-${mm}`
                : cfg.resetPeriod === 'never'   ? 'ALL'
                : yyyy                                        // 'yearly' (default)

  const next    = (cfg.lastPeriod === period) ? cfg.lastNumber + 1 : 1

  tx.update(numRef, {                              // write
    'transaction.lastNumber': next,
    'transaction.lastPeriod': period,
  })
  tx.set(trxRef, { transactionNo: `${cfg.prefix}-${period}-${pad(next, 6)}` })
})
```

- `resetPeriod` menangani ketiga nilai yang didukung `settings/numbering` (§3.12):
  `'yearly'` (`2026`), `'monthly'` (`2026-10`), dan `'never'` (`ALL` — tidak pernah reset).
- Periode memakai **`settings/global.timezone`** (default `Asia/Jakarta`), bukan
  `new Date().getFullYear()` (waktu lokal server) — mencegah reset salah di batas tahun/bulan.

Karena counter dan dokumen berada di satu transaksi, dua user tidak bisa memperoleh nomor
yang sama.

> **Trade-off (lihat §6.3):** karena counter ikut di transaksi, `settings/numbering` menjadi
> **titik serialisasi global**. Alternatif bila volume tinggi: alokasikan nomor di luar transaksi
> stok (mis. blok nomor dari **Cloud Task**/sharded counter) lalu pakai nomor itu di transaksi.

### 6.5 Jenis transaksi & kasus khusus

- **`in`** (masuk): dari pembelian/retur. `signedQuantity` positif. Mengisi `supplierId`,
  `unitCost`. Opsional memperbarui `items.costPrice` (harga terakhir) — atau hitung
  **rata-rata bergerak** bila diinginkan (dokumentasikan pilihannya). `quantity` wajib
  **integer positif** bila `unit.allowDecimal = false`, dan boleh desimal terkontrol bila
  `allowDecimal = true` (BR-18).
- **`out`** (keluar): dari permintaan yang disetujui, atau pemakaian manual. Wajib mengisi
  `divisionId`. Validasi stok tidak boleh negatif. Menautkan `requestId`.
- **`adjustment`** (penyesuaian): koreksi hasil **stok opname**. **Tidak** memakai `quantity`
  sebagai delta; simpan `quantityBefore`, `quantityAfter` (keduanya ≥ 0), dan
  `delta = quantityAfter − quantityBefore` (boleh negatif — BR-18 tidak berlaku untuk `delta`).
  **Wajib** ada `note` (alasan opname, BR-19) dan **hanya `admin`** yang boleh (bukan `staff`).
  Ini satu-satunya cara "memperbaiki" stok tanpa transaksi in/out biasa.
- **`reversal`** (pembalikan): dokumen lawan untuk mengoreksi transaksi yang sudah tercatat.
  `referenceType: 'reversal'`, `referenceId` = id transaksi asal, `reversalOf` = id transaksi
  asal, angka berlawanan. Hanya `admin`. Transaksi asal tidak diubah (BR-02).
- **Transfer antar gudang** (opsional, fase lanjut): dicatat sebagai **dua** transaksi
  (`out` dari gudang asal + `in` ke gudang tujuan) dengan `referenceType: 'transfer'` dan
  `referenceId` yang sama, ditulis dalam satu transaksi Firestore agar atomik.

**Rekonsiliasi (scheduled Cloud Function):** secara berkala, hitung ulang stok dari ledger
untuk item yang aktif dan bandingkan dengan cache. Jika ada selisih, tulis laporan/notifikasi
ke admin. Ini menjaga kepercayaan pada cache dan mendeteksi bug lebih awal.

---

## 7. Denormalisasi yang disengaja

Berikut daftar field yang **sengaja** diduplikasi, beserta risikonya dan cara menjaganya.

| Field duplikat | Disalin dari | Disalin ke | Mengapa | Risiko | Cara menjaga konsistensi |
|---|---|---|---|---|---|
| `categoryName` | `categories.name` | `items.categoryName` | Daftar item menampilkan kategori tanpa read tambahan | Basi jika kategori di-rename | Cloud Function `onUpdate(categories)`: batch update semua `items` dengan `categoryId` tsb (chunk 500) |
| `unitSymbol` | `units.symbol` | `items.unitSymbol` | Muncul di setiap baris UI/struk | Basi jika simbol diubah | Sama: trigger `onUpdate(units)`, batch update item terkait |
| `supplierName` | `suppliers.name` | `items.supplierName` | Menampilkan supplier default | Basi jika supplier di-rename | Trigger `onUpdate(suppliers)` |
| `itemSku`, `itemName`, `unitSymbol` | `items.*` | `stockTransactions.*` | **Snapshot riwayat** — harus tetap seperti saat transaksi | **Sengaja tidak disinkronkan** (harus beku) | Tidak diperbarui. Ini nilai historis, bukan cache |
| `warehouseName` | `warehouses.name` | `stockTransactions.warehouseName` | Snapshot riwayat gudang | Sengaja beku | Tidak diperbarui |
| `supplierName` | `suppliers.name` | `stockTransactions.supplierName` | Snapshot riwayat supplier | Sengaja beku | Tidak diperbarui |
| `createdByName` / `actorName` / `requestedByName` / `approvedByName` | `users.displayName` | berbagai koleksi | Menampilkan nama pelaku tanpa read ke `users` | Basi bila user ganti nama | Untuk **daftar** boleh di-refresh via trigger; untuk **audit/riwayat** biarkan beku |
| `itemSku`, `itemName`, `unitSymbol` | `items.*` | `requestItems.*` | Snapshot baris permintaan | Sengaja beku | Tidak diperbarui |
| `categoryId → itemCount` | hitungan `items` | `categories.itemCount` | Dashboard kategori tanpa `count()` mahal | Drift (counter bisa meleset) | Naikkan/turunkan di dalam transaksi item create/delete/pindah kategori; **job rekonsiliasi** berkala |
| `requestId → itemCount`, `totalQuantity` | `requestItems` | `requests.*` | Daftar permintaan tanpa membaca baris | Drift saat baris diubah | Hitung ulang & tulis di dalam transaksi yang sama saat baris ditambah/diubah/dihapus |
| `isLowStock` | turunan `currentStock`/`minStock` | `items.isLowStock` | Firestore tidak bisa banding antar-field di query (§1.3) | Salah bila lupa update | Selalu hitung ulang di setiap transaksi stok **dan** saat `minStock` diubah |

**Aturan umum:** bedakan **snapshot riwayat** (harus beku, tidak pernah disinkronkan) dari
**cache tampilan** (harus disinkronkan, boleh di-refresh). Jangan pernah memperbarui
snapshot riwayat, dan jangan pernah membiarkan cache tampilan basi tanpa mekanisme perbaikan.

**Jaring pengaman:** sediakan **job rekonsiliasi** (Cloud Function terjadwal) yang
menghitung ulang counter/cache dari sumber kebenaran dan mencatat/memperbaiki selisih.
Denormalisasi tanpa jaring pengaman adalah utang yang cepat berubah jadi bug.

---

## 8. Audit log

### 8.1 Apa yang dicatat

`auditLogs` mencatat **aksi bermakna** (bukan setiap klik):

- **Master data:** create/update/delete pada `items`, `categories`, `suppliers`, `units`,
  `warehouses` — termasuk **field apa** yang berubah (`changedFields`, `before`, `after`).
- **Transaksi stok:** setiap `stock_in`, `stock_out`, `adjustment` (menyimpan snapshot +
  tautan ke `stockTransactions`).
- **Workflow permintaan:** `submitted`, `approved`, `rejected`, `fulfilled`, `cancelled`.
- **Keamanan & akun:** `login`, `logout`, `role_change`, perubahan status aktif user.
- **Ekspor & operasi sensitif:** `export` laporan, impor massal, perubahan `settings`.

### 8.2 Kapan & oleh siapa

- **Kapan:** setiap kali aksi di atas terjadi — ditulis **di dalam transaksi/batch yang
  sama** dengan perubahan datanya, sehingga tidak mungkin "data berubah tapi log tidak
  tertulis".
- **Oleh siapa:** ditulis oleh **backend (Admin SDK)** menggunakan identitas pelaku dari
  token (`actorId`, `actorRole`), **bukan** oleh klien. Klien tidak boleh menulis log.
- **Konteks:** menyertakan `ip`, `userAgent`, `traceId`, dan `source` untuk investigasi.

### 8.3 Kenapa tidak boleh diubah/dihapus

1. **Nilai bukti.** Audit log kehilangan makna jika bisa diedit pelaku. Itu seperti buku
   besar yang bisa dihapus — tidak bisa dipercaya.
2. **Deteksi penyalahgunaan.** Jika stok hilang, log menjawab "siapa, kapan, apa yang
   berubah". Log yang bisa dihapus membuat investigasi mustahil.
3. **Kepatuhan.** Banyak audit internal/eksternal mensyaratkan jejak yang tidak dapat
   diubah (append-only).

**Penegakan (3 lapis):**

1. **Security rules:** `allow update, delete: if false;` dan `allow create: if false;` untuk
   klien (hanya Admin SDK yang bisa create).
2. **Tidak ada endpoint** di API untuk mengubah/menghapus log.
3. **Larangan di level kode:** repository log hanya punya method `append()`.

> **Pengecualian retensi (TTL).** Field `expiresAt` (§3.10, §10.3) memicu **Firestore TTL
> policy** yang menghapus dokumen kedaluwarsa. TTL berjalan di level sistem dan **tidak melalui
> security rules**, sehingga tidak melanggar `allow update, delete: if false`. Ini satu-satunya
> jalur penghapusan yang sah. Agar nilai bukti tetap terjaga, Cloud Function terjadwal **wajib
> mengekspor/mengarsipkan** log ke Cloud Storage/BigQuery **sebelum** TTL menghapusnya.

**Catatan lanjutan (opsional):** untuk tamper-evidence yang lebih kuat, bisa diterapkan
**hash chain** (setiap log menyimpan `prevHash` + `hash` dari isi dirinya). Ini menjadikan
penghapusan satu baris terdeteksi. Dicatat sebagai pengembangan lanjutan, tidak wajib untuk
MVP.

---

## 9. Contoh query nyata

Semua contoh memakai **Firebase Web/Admin SDK modular (v9+)**. Nama index ditulis dalam
format yang cocok dengan `firestore.indexes.json`.

> **Penting:** setiap query dengan **kesetaraan pada satu field + urutan/rentang pada field
> lain** membutuhkan **composite index**. Query dengan satu field saja memakai single-field
> index otomatis.

### Q1. Daftar item stok di bawah minimum (dashboard "stok menipis")

**Kenapa begini:** Firestore tidak bisa membandingkan `currentStock` dengan `minStock`
(§1.3). Karena itu kita memakai field turunan `isLowStock`.

```ts
import { collection, query, where, orderBy, limit, getDocs } from 'firebase/firestore';

const q = query(
  collection(db, 'items'),
  where('isActive', '==', true),
  where('isLowStock', '==', true),
  orderBy('name', 'asc'),
  limit(50)
);
const snap = await getDocs(q);
```

**Index:** `items`: `isActive ASC, isLowStock ASC, name ASC`

---

### Q2. Transaksi stok hari ini (log aktivitas gudang)

```ts
const startOfDay = new Date(); startOfDay.setHours(0, 0, 0, 0);

const q = query(
  collection(db, 'stockTransactions'),
  where('occurredAt', '>=', startOfDay),
  orderBy('occurredAt', 'desc'),
  limit(100)
);
```

**Index:** single-field `occurredAt DESC` (otomatis).

---

### Q3. Kartu stok satu item (riwayat per item)

```ts
const q = query(
  collection(db, 'stockTransactions'),
  where('itemId', '==', itemId),
  orderBy('occurredAt', 'desc'),
  limit(50)                        // pagination dengan startAfter
);
```

**Index:** `stockTransactions`: `itemId ASC, occurredAt DESC`

---

### Q4. Kartu stok per item **per gudang**

```ts
const q = query(
  collection(db, 'stockTransactions'),
  where('itemId', '==', itemId),
  where('warehouseId', '==', warehouseId),
  orderBy('occurredAt', 'desc'),
  limit(50)
);
```

**Index:** `stockTransactions`: `itemId ASC, warehouseId ASC, occurredAt DESC`

---

### Q5. Permintaan menunggu approval (antrean admin, FIFO)

```ts
const q = query(
  collection(db, 'requests'),
  where('status', '==', 'submitted'),
  orderBy('createdAt', 'asc'),     // terlama dulu → adil
  limit(20)
);
```

**Index:** `requests`: `status ASC, createdAt ASC`

---

### Q6. Permintaan milik satu user, difilter status

```ts
const q = query(
  collection(db, 'requests'),
  where('requestedBy', '==', uid),
  where('status', '==', 'submitted'),
  orderBy('createdAt', 'desc'),
  limit(20)
);
```

**Index:** `requests`: `requestedBy ASC, status ASC, createdAt DESC`

---

### Q7. Rekap transaksi periode tertentu (laporan bulanan)

```ts
const q = query(
  collection(db, 'stockTransactions'),
  where('occurredAt', '>=', startDate),
  where('occurredAt', '<', endDate),
  where('type', '==', 'out'),
  orderBy('occurredAt', 'desc'),
  limit(500)
);
```

**Index:** `stockTransactions`: `type ASC, occurredAt DESC`

> **Catatan biaya:** menarik semua transaksi sebulan bisa jadi ribuan reads. Untuk laporan
> besar, gunakan **agregasi** (`count()`, `sum()`) atau **dokumen ringkasan harian/bulanan**
> yang dipelihara Cloud Function terjadwal.

---

### Q8. Notifikasi belum dibaca milik user

```ts
const q = query(
  collection(db, 'notifications'),
  where('userId', '==', uid),
  where('isRead', '==', false),
  orderBy('createdAt', 'desc'),
  limit(20)
);
```

**Index:** `notifications`: `userId ASC, isRead ASC, createdAt DESC`

---

### Q9. Riwayat audit satu entitas

```ts
const q = query(
  collection(db, 'auditLogs'),
  where('entityType', '==', 'items'),
  where('entityId', '==', 'itm_00123'),
  orderBy('createdAt', 'desc'),
  limit(50)
);
```

**Index:** `auditLogs`: `entityType ASC, entityId ASC, createdAt DESC`

---

### Q10. Pencarian item berdasarkan prefix nama (autocomplete)

```ts
const q = query(
  collection(db, 'items'),
  where('isActive', '==', true),
  where('normalizedName', '>=', term.toLowerCase()),
  where('normalizedName', '<=', term.toLowerCase() + ''),
  orderBy('normalizedName', 'asc'),
  limit(10)
);
```

**Index:** `items`: `isActive ASC, normalizedName ASC`

> `` (U+F8FF, Private Use Area) bukan "karakter Unicode tertinggi" — karakter tertinggi
> adalah U+10FFFF. Namun trik ini tetap standar untuk query "starts with": U+F8FF berada di
> **Private Use Area** dan nilainya **lebih tinggi dari hampir semua teks biasa**, sehingga
> rentang `>= term` dan `<= term + ''` menangkap semua nama yang diawali `term`.
> Tulis sebagai escape ``, bukan karakter literal, agar terbaca di kode.

---

### Ringkasan index (`firestore.indexes.json` — cuplikan)

```json
{
  "indexes": [
    { "collectionGroup": "items",
      "fields": [
        { "fieldPath": "isActive", "order": "ASCENDING" },
        { "fieldPath": "isLowStock", "order": "ASCENDING" },
        { "fieldPath": "name", "order": "ASCENDING" }
      ]},
    { "collectionGroup": "stockTransactions",
      "fields": [
        { "fieldPath": "itemId", "order": "ASCENDING" },
        { "fieldPath": "occurredAt", "order": "DESCENDING" }
      ]},
    { "collectionGroup": "requests",
      "fields": [
        { "fieldPath": "status", "order": "ASCENDING" },
        { "fieldPath": "createdAt", "order": "ASCENDING" }
      ]},
    { "collectionGroup": "notifications",
      "fields": [
        { "fieldPath": "userId", "order": "ASCENDING" },
        { "fieldPath": "isRead", "order": "ASCENDING" },
        { "fieldPath": "createdAt", "order": "DESCENDING" }
      ]},
    { "collectionGroup": "divisions",
      "fields": [
        { "fieldPath": "isActive", "order": "ASCENDING" },
        { "fieldPath": "name", "order": "ASCENDING" }
      ]}
  ],
  "fieldOverrides": [
    { "collectionGroup": "auditLogs", "fieldPath": "expiresAt",
      "ttl": true, "indexes": [] },
    { "collectionGroup": "notifications", "fieldPath": "expiresAt",
      "ttl": true, "indexes": [] },
    { "collectionGroup": "idempotencyKeys", "fieldPath": "expiresAt",
      "ttl": true, "indexes": [] }
  ]
}
```

> **Catatan:** Firestore otomatis menyarankan index yang hilang lewat pesan error saat
> development. Tetap deklarasikan index di repo (bukan klik manual di console) agar
> lingkungan dev/staging/prod konsisten — ini bagian dari "infrastruktur sebagai kode".

---

## 10. Pertumbuhan data & strategi

### 10.1 Perkiraan volume (asumsi perusahaan menengah)

| Koleksi | Laju | Estimasi 1 tahun | Estimasi 3 tahun | Catatan |
|---|---|---|---|---|
| `users` | statis | ~50 | ~80 | Kecil, tidak jadi masalah |
| `categories` | jarang | ~30 | ~50 | Kecil |
| `suppliers` | jarang | ~100 | ~300 | Kecil |
| `divisions` | jarang | ~15 | ~25 | Kecil |
| `units` | sangat jarang | ~20 | ~30 | Kecil |
| `items` | lambat | ~2.000 | ~5.000 | Tiap dokumen kecil (< 2 KB) |
| `warehouses` | jarang | ~10 | ~20 | Kecil |
| `stockTransactions` | ~300/hari | **~110.000** | **~330.000** | Koleksi **terbesar** & tercepat tumbuh |
| `requests` | ~50/hari | ~18.000 | ~55.000 | — |
| `requestItems` | ~3× requests | ~55.000 | ~165.000 | Subkoleksi |
| `auditLogs` | ~500–1.000/hari | **~250.000** | **~750.000** | Tumbuh cepat; kandidat arsip |
| `notifications` | ~200/hari | ~70.000 | ~210.000 | Kandidat TTL |
| `settings` | statis | ~5 | ~5 | Singleton |

**Kesimpulan:** `stockTransactions`, `auditLogs`, dan `notifications` adalah koleksi yang
harus direncanakan sejak awal. Yang lain kecil dan tidak perlu strategi khusus.

### 10.2 Pagination — selalu berbasis cursor

**Jangan** memakai `offset()`. Alasan: Firestore tetap **membaca** semua dokumen yang
dilewati (dibayar) dan hasilnya bisa bergeser saat data baru masuk. Gunakan **cursor**
(`startAfter`) dengan `orderBy` yang deterministik:

```ts
// Halaman berikutnya: gunakan snapshot dokumen terakhir halaman sebelumnya
const q = query(
  collection(db, 'stockTransactions'),
  orderBy('occurredAt', 'desc'),
  startAfter(lastVisibleDoc),      // cursor, bukan offset
  limit(50)
);
```

**Tips penting:** `orderBy` harus **unik dan stabil**. Jika hanya mengurutkan `occurredAt`
dan ada dua transaksi dengan waktu identik, urutan bisa tidak konsisten antar halaman.
Solusinya: tambahkan tie-breaker, mis. `orderBy('occurredAt','desc')` + `orderBy('__name__','desc')`,
dan sertakan `__name__` di composite index.

**Standar API:** endpoint daftar mengembalikan `{ data, nextCursor, hasMore }`. Frontend
(TanStack Query) memakai `useInfiniteQuery` dengan `nextCursor` tersebut.

### 10.3 Retensi & pengarsipan

| Koleksi | Kebijakan | Mekanisme |
|---|---|---|
| `auditLogs` | Simpan **panas** 12–24 bulan, lalu arsip | Tulis `expiresAt`; **Firestore TTL policy** menghapus otomatis setelah kedaluwarsa. **Sebelum** TTL menghapus, Cloud Function terjadwal mengekspor ke Cloud Storage/BigQuery untuk arsip jangka panjang. |
| `notifications` | TTL 90–180 hari | `expiresAt` + TTL policy. Notifikasi lama tidak bernilai. |
| `idempotencyKeys` | TTL 24 jam | `expiresAt` + TTL policy (lihat §3.13). Key lama tidak diperlukan lagi. |
| `stockTransactions` | **Jangan dihapus.** Retensi permanen (ledger) | Jika perlu meringankan query, arsipkan ke koleksi tahunan, mis. `stockTransactionsArchive`, **tetap** di Firestore atau ekspor ke BigQuery untuk analitik. |
| `requests` + `requestItems` | Simpan 3–5 tahun | Arsip ke koleksi terpisah bila perlu. |
| `items`, master data | Permanen | Gunakan `isActive: false`, **jangan hapus**. |

**Mengapa audit log boleh di-TTL sedangkan transaksi tidak:** audit log punya nilai
operasional jangka pendek (investigasi insiden), sedangkan `stockTransactions` adalah
**buku besar** yang harus abadi untuk akuntabilitas stok. Arsip audit log **wajib** disimpan
di luar Firestore sebelum TTL berjalan, agar tetap bisa diaudit jika diperlukan.

### 10.4 Strategi menekan biaya baca

1. **Cache ringkasan.** Dashboard tidak menghitung ulang; ia membaca `items.isLowStock`,
   `categories.itemCount`, atau dokumen ringkasan harian.
2. **Agregasi native.** Gunakan `count()`/`sum()` untuk laporan ad-hoc, bukan menarik semua
   dokumen.
3. **Denormalisasi.** Satu query daftar tidak boleh memicu puluhan read tambahan.
4. **Batasi halaman.** Selalu `limit()`; sediakan pagination.
5. **Ringkasan harian terjadwal.** Cloud Function menulis
   `dailyAggregates/{YYYY-MM-DD}` (total masuk/keluar/nilai, dirinci per gudang & kategori)
   agar laporan bulanan cukup membaca ~30 dokumen, bukan ratusan ribu transaksi. Nama koleksi
   ini **kanonik** dan dipakai di `docs/API.md` §7.3/§7.5.

### 10.5 Utang teknis yang dicatat (untuk fase lanjut)

- **Multi-gudang.** MVP berjalan **single warehouse** (PROJECT.md §5.2): hanya satu dokumen
  `warehouses` (default), `stockByWarehouse` berisi satu kunci, dan `warehouseId` opsional.
  Mengaktifkan multi-gudang penuh (UI pengelolaan gudang, transfer antar gudang, pemilihan
  gudang per transaksi) = nice-to-have fase lanjut; skema sudah siap tanpa migrasi.
- `items.stockByWarehouse` sebagai map → migrasi ke subkoleksi
  `items/{id}/warehouseStocks` jika gudang > ~20 atau butuh bin/rak.
- **UI pengelolaan `units`.** Di MVP `units` di-seed statis (lihat §3.4); UI CRUD satuan =
  nice-to-have fase lanjut.
- Approval saat ini **satu tingkat**. Jika butuh multi-level, tambahkan koleksi
  `approvalSteps` (subkoleksi di `requests`) — desain saat ini sudah kompatibel.
- Pencarian teks penuh (fuzzy) → jika kebutuhan tumbuh, integrasikan layanan pencarian
  eksternal; `normalizedName` hanya mendukung pencarian prefix.

---

## 11. Konvensi ringkas

Agar semua dokumen dan kode konsisten:

| Aspek | Konvensi |
|---|---|
| Nama koleksi | camelCase jamak: `users`, `categories`, `suppliers`, `divisions`, `units`, `items`, `warehouses`, `stockTransactions`, `requests`, `requestItems`, `auditLogs`, `notifications`, `functionRuns`, `cacheEntries`, `idempotencyKeys`, `dailyAggregates`, `settings`, `itemCodes` |
| Subkoleksi | `requests/{requestId}/requestItems/{requestItemId}` |
| REST endpoint | `/api/v1/...`, resource jamak, mis. `GET /api/v1/items`, `POST /api/v1/stock-transactions` |
| Role | `admin` \| `staff` \| `viewer` |
| Tipe transaksi stok (`type`) | `in` \| `out` \| `adjustment` |
| Status transaksi stok (`status`) | `completed` \| `cancelled` |
| Status permintaan | `draft` \| `submitted` \| `approved` \| `rejected` \| `fulfilled` \| `cancelled` |
| Waktu | Firestore `Timestamp` (`serverTimestamp()`), tampil di `Asia/Jakarta` |
| Uang | integer Rupiah (tanpa desimal) |
| Referensi user | simpan `uid` + salinan nama (`createdByName`, dst.) |
| Riwayat | `stockTransactions` & `auditLogs` **append-only** (angka tidak pernah di-update/dihapus); `auditLogs` boleh dihapus **hanya** oleh TTL policy terjadwal (§3.10, §8.3) |
| Perubahan stok | **wajib** lewat `runTransaction`; `items.currentStock` hanya diubah sistem |
| Index | dideklarasikan di `firestore.indexes.json` (infrastruktur sebagai kode) |

---

### Catatan akhir

Dokumen ini adalah **kontrak data**. Setiap perubahan struktur (menambah field, koleksi,
atau index) harus:

1. diperbarui di dokumen ini,
2. disertai alasan (kenapa),
3. disertai rencana migrasi untuk data yang sudah ada, dan
4. disertai pembaruan security rules & index.

Backend, Cloud Functions, security rules, dan skrip migrasi **wajib** mengacu ke dokumen ini.
