# PROJECT.md — Dokumen Kebutuhan Produk

**Proyek:** inventory-system — Sistem Inventaris & Gudang
**Pemilik:** Dimas (Full Stack Developer)
**Status dokumen:** v1.0 — Fase 0 (Fondasi)
**Terakhir diperbarui:** 2026-10-06

> Dokumen ini adalah **sumber kebenaran tunggal** untuk kebutuhan produk. Semua dokumen lain
> (arsitektur, skema data, API, roadmap) harus konsisten dengan istilah, peran, dan aturan bisnis
> yang didefinisikan di sini. Pembaca: pemilik proyek (pemula–menengah) dan AI agent yang akan
> membantu menulis kode.
>
> **Dokumen turunan** (wajib konsisten dengan dokumen ini):
> [`ARCHITECTURE.md`](./ARCHITECTURE.md) · [`DATA-MODEL.md`](./DATA-MODEL.md) ·
> [`API.md`](./API.md) · [`ROADMAP.md`](./ROADMAP.md) · [`SECURITY.md`](./SECURITY.md).

---

## Daftar Isi

1. [Latar Belakang & Masalah Bisnis](#1-latar-belakang--masalah-bisnis)
2. [Tujuan & Kriteria Sukses](#2-tujuan--kriteria-sukses)
3. [Pengguna & Peran](#3-pengguna--peran)
4. [User Stories](#4-user-stories)
5. [Scope](#5-scope)
6. [Alur Bisnis Utama](#6-alur-bisnis-utama)
7. [Aturan Bisnis](#7-aturan-bisnis)
8. [Glosarium & Konvensi](#8-glosarium--konvensi)
9. [Data Model](#9-data-model)
10. [Keputusan Arsitektur Akses Data](#10-keputusan-arsitektur-akses-data)
11. [Query & Index](#11-query--index)
12. [Pemetaan User Story → Endpoint API](#12-pemetaan-user-story--endpoint-api)
13. [Non-Functional Requirements](#13-non-functional-requirements)
14. [Asumsi, Batasan & Risiko](#14-asumsi-batasan--risiko)

---

## 1. Latar Belakang & Masalah Bisnis

### 1.1 Konteks perusahaan

Perusahaan menengah di Indonesia yang bergerak di bidang distribusi/perdagangan dan memiliki satu
gudang utama. Barang masuk dari beberapa supplier, disimpan di gudang, lalu dikeluarkan untuk
memenuhi kebutuhan divisi internal (produksi, penjualan, operasional) maupun untuk dikirim ke
pelanggan. Saat ini pencatatan stok masih dilakukan secara manual: campuran buku besar, spreadsheet,
dan pesan WhatsApp antar staf.

### 1.2 Masalah yang dihadapi

Pencatatan manual menimbulkan lima masalah utama yang saling berkaitan:

**(a) Stok tidak akurat.**
Angka stok di catatan sering berbeda dengan jumlah fisik di gudang. Penyebabnya: transaksi dicatat
belakangan (bahkan lupa dicatat), ada dua versi spreadsheet yang berbeda, dan tidak ada satu sumber
data yang dipercaya. Akibatnya tim penjualan sering menjanjikan barang yang sebenarnya sudah habis,
atau sebaliknya menolak pesanan padahal stok masih ada.

**(b) Barang hilang atau rusak tanpa jejak.**
Ketika barang hilang atau rusak, tidak ada catatan siapa yang terakhir menangani, kapan, dan berapa
jumlahnya. Tidak ada audit trail. Investigasi berakhir dengan saling menyalahkan antar staf karena
tidak ada bukti tertulis.

**(c) Permintaan barang antar divisi lambat dan tidak terdokumentasi.**
Divisi yang butuh barang mengirim permintaan lewat pesan pribadi atau lisan. Permintaan mudah
terlewat, tidak ada status yang jelas ("sudah diproses atau belum?"), dan tidak ada jejak persetujuan.
Rata-rata permintaan baru dipenuhi lebih dari 2–3 hari.

**(d) Sulit membuat laporan stok.**
Laporan stok bulanan harus dirakit manual dari beberapa file, memakan waktu berhari-hari, dan sering
salah hitung. Manajemen tidak punya gambaran real-time mengenai nilai persediaan dan barang cepat
laku.

**(e) Tidak ada peringatan saat stok menipis.**
Tidak ada mekanisme yang memberi tahu ketika stok sebuah barang mendekati atau berada di bawah batas
minimum. Barang baru dipesan setelah benar-benar habis, sehingga terjadi kekosongan stok dan
gangguan operasional.

### 1.3 Mengapa aplikasi ini dibangun

Sistem Inventaris & Gudang ini dibangun untuk **menggantikan pencatatan manual dengan satu sumber
data digital yang akurat, dapat diaudit, dan real-time.** Setiap perubahan stok harus tercatat beserta
pelakunya, setiap permintaan barang harus punya alur status yang jelas, laporan dibuat otomatis, dan
sistem memberi peringatan sebelum stok habis.

Selain menyelesaikan masalah bisnis, proyek ini adalah **portfolio utama** untuk melamar posisi Full
Stack Developer, sehingga dibangun dengan standar production-grade: TypeScript end-to-end, pengujian
otomatis, CI/CD, dokumentasi, dan perhatian pada keamanan serta reliabilitas.

---

## 2. Tujuan & Kriteria Sukses

### 2.1 Tujuan produk

1. Menyediakan **satu sumber kebenaran** untuk data stok dan transaksi gudang.
2. Mencatat **setiap perubahan stok** secara lengkap dan tidak dapat dihapus (audit trail).
3. Mempercepat dan mendokumentasikan **permintaan barang antar divisi** melalui alur approval.
4. Menghasilkan **laporan stok otomatis** yang dapat diandalkan.
5. Memberi **peringatan dini** ketika stok menipis.

### 2.2 Kriteria sukses (terukur)

| No | Kriteria | Metrik keberhasilan |
|----|----------|---------------------|
| KS-01 | Stok akurat | Selisih antara stok sistem dan hasil stock opname < 1% per periode |
| KS-02 | Setiap perubahan tercatat | 100% perubahan stok memiliki entri di `stockTransactions` dan `auditLogs` |
| KS-03 | Permintaan cepat | Rata-rata waktu dari `submitted` → `fulfilled` < 1 hari kerja |
| KS-04 | Laporan otomatis | Laporan stok dapat dihasilkan < 1 menit, tanpa olah manual |
| KS-05 | Peringatan stok | 100% item dengan stok ≤ `minStock` muncul di daftar alert |
| KS-06 | Akses terkontrol | Tidak ada aksi di luar role yang diizinkan (diverifikasi via test) |
| KS-07 | Kualitas teknis | Lint, typecheck, unit test, dan build hijau di CI pada setiap PR |
| KS-08 | Adopsi nyata | Digunakan oleh minimal 1 gudang dengan ≥ 3 pengguna aktif |

---

## 3. Pengguna & Peran

Sistem mengenal **tiga peran** (`role`), yang disimpan sebagai custom claims pada Firebase
Authentication dan dipakai konsisten di seluruh sistem: `admin`, `staff`, `viewer`.

### 3.1 admin

- **Siapa:** Kepala gudang / manajer operasional / pemilik proses.
- **Pekerjaan harian:** mengawasi operasional gudang, menyetujui permintaan barang, mengelola data
  master (barang, kategori, supplier), mengelola akun pengguna, meninjau laporan dan audit trail.
- **Yang dibutuhkan dari sistem:** visibilitas penuh atas stok dan aktivitas, kemampuan menyetujui
  atau menolak permintaan, kemampuan mengoreksi data master, dan kemampuan mengelola user serta role.

### 3.2 staff

- **Siapa:** Staf gudang / admin gudang yang menjalankan transaksi harian.
- **Pekerjaan harian:** mencatat barang masuk dari supplier, mencatat barang keluar untuk divisi,
  membuat permintaan barang, melakukan penyesuaian stok saat stock opname, mengunggah bukti
  (foto/nota).
- **Yang dibutuhkan dari sistem:** formulir input transaksi yang cepat dan jelas, riwayat transaksi,
  status permintaan, serta kemampuan melihat stok terkini.

### 3.3 viewer

- **Siapa:** Manajemen / divisi lain / auditor internal yang hanya perlu melihat.
- **Pekerjaan harian:** memantau dashboard, membaca laporan stok, memeriksa tren.
- **Yang dibutuhkan dari sistem:** akses baca (read-only) ke dashboard dan laporan, tanpa kemampuan
  mengubah data apa pun.

### 3.4 Ringkasan hak akses

| Kemampuan | admin | staff | viewer | Rujukan |
|-----------|:-----:|:-----:|:------:|---------|
| Lihat dashboard & laporan | ✅ | ✅ | ✅ | US-31–US-34, US-36 |
| Lihat/mengunduh (ekspor) laporan — read-only, tanpa menyimpan dokumen | ✅ | ✅ | ✅ | US-33, US-35, US-13 |
| Lihat master data non-sensitif (item, kategori, satuan, gudang, divisi) | ✅ | ✅ | ✅ | US-11, US-50 |
| Lihat `suppliers` | ✅ | ✅ | ❌ | US-09 |
| Input transaksi stok `in`/`out` | ✅ | ✅ | ❌ | US-14, US-15, US-17, US-19, US-22 |
| Melakukan penyesuaian stok (`adjustment`) | ✅ | ❌ | ❌ | US-16, BR-19 |
| Membalik transaksi stok (`reverse`) | ✅ | ❌ | ❌ | BR-02 |
| Buat & kirim permintaan barang | ✅ | ✅ | ❌ | US-23, US-24 |
| Batalkan permintaan (pemilik atau admin) | ✅ | ✅ (milik sendiri) | ❌ | US-29, BR-09 |
| Setujui / tolak permintaan | ✅ | ❌ | ❌ | US-26, BR-05 |
| Tandai permintaan `fulfilled` | ✅ | ❌ | ❌ | US-28, BR-07 |
| Kelola data master (item, kategori, supplier, divisi) | ✅ | ❌ | ❌ | US-07–US-10, US-50, BR-15 |
| Kelola user & role | ✅ | ❌ | ❌ | US-03, US-05, BR-15 |
| Lihat audit log | ✅ | ❌ | ❌ | US-30, US-45, BR-04 |

> **`adjustment`, `reverse`, dan `fulfill` adalah admin-only.** Ketiganya mengubah angka stok
> secara langsung atau mengeluarkan stok, sehingga dibatasi ke hak tertinggi. `staff` mencatat
> pergerakan rutin `in`/`out` dan mengajukan permintaan. Matriks ini **kanonik** dan harus sama
> dengan `docs/API.md` §2.7 dan `docs/SECURITY.md` §3.2.

> **Catatan:** tabel di atas adalah ringkasan dan merupakan **turunan dari daftar BR** (Bagian 7).
> Setiap aksi yang muncul di user story atau alur bisnis harus punya baris izin di sini. Aturan
> rinci ada di [Bagian 7](#7-aturan-bisnis).
>
> **Viewer bersifat read-only (BR-16):** semua laporan viewer dihitung **on-the-fly** dari data
> yang ada dan **tidak disimpan** sebagai dokumen di Firestore; ekspor CSV hanya mengalirkan data
> ke respons unduhan dan **tidak menulis** ke Firestore/Storage.

---

## 4. User Stories

Format: **"Sebagai `<peran>`, saya ingin `<aksi>`, supaya `<manfaat>`."**
Setiap user story memiliki ID unik (`US-nn`) dan dikelompokkan berdasarkan fase pembangunan.
Prioritas memakai skala MoSCoW: **M** = Must (MVP), **S** = Should, **C** = Could.

### Fase 1 — Autentikasi & Role

| ID | Prioritas | User Story |
|----|:---------:|------------|
| US-01 | M | Sebagai **pengguna**, saya ingin login dengan email dan password, supaya hanya orang berwenang yang bisa mengakses sistem. |
| US-02 | M | Sebagai **pengguna**, saya ingin logout, supaya sesi saya berakhir dengan aman terutama saat memakai perangkat bersama. |
| US-03 | M | Sebagai **admin**, saya ingin menetapkan role (`admin`/`staff`/`viewer`) pada tiap user, supaya akses tiap orang sesuai tanggung jawabnya. |
| US-04 | M | Sebagai **pengguna**, saya ingin melihat menu yang hanya sesuai role saya, supaya saya tidak mencoba aksi yang tidak diizinkan. |
| US-05 | S | Sebagai **admin**, saya ingin menonaktifkan akun user, supaya mantan karyawan tidak bisa lagi masuk. |
| US-06 | C | Sebagai **pengguna**, saya ingin mereset password sendiri, supaya saya tidak perlu menunggu admin saat lupa password. |

### Fase 2 — Master Data

| ID | Prioritas | User Story |
|----|:---------:|------------|
| US-07 | M | Sebagai **admin**, saya ingin mengelola kategori barang (buat/ubah/nonaktifkan), supaya barang tersusun rapi dan mudah dicari. |
| US-08 | M | Sebagai **admin**, saya ingin mengelola data supplier, supaya asal barang masuk terdokumentasi. |
| US-09 | M | Sebagai **admin**, saya ingin mengelola data item (kode/SKU, nama, satuan, kategori, `supplierId` opsional, `costPrice`/`sellPrice`, `minStock`), supaya setiap barang punya identitas tunggal. |
| US-10 | M | Sebagai **admin**, saya ingin menetapkan batas minimum stok (`minStock`) per item, supaya sistem bisa memperingatkan saat stok menipis. |
| US-11 | M | Sebagai **staff**, saya ingin mencari dan memfilter daftar item, supaya saya cepat menemukan barang yang dimaksud. |
| US-12 | S | Sebagai **admin**, saya ingin mengunggah foto produk ke Firebase Storage, supaya staf mudah mengenali barang. |
| US-13 | S | Sebagai **admin**, saya ingin mengekspor daftar item ke CSV, supaya data mudah dibagikan ke pihak lain. |
| US-50 | M | Sebagai **admin**, saya ingin mengelola data divisi (`divisions`: buat/ubah/nonaktifkan via `isActive`), supaya divisi tujuan permintaan dan barang keluar terdokumentasi sebagai master data. |

### Fase 3 — Transaksi Stok

| ID | Prioritas | User Story |
|----|:---------:|------------|
| US-14 | M | Sebagai **staff**, saya ingin mencatat barang masuk (`in`) dari supplier, supaya stok bertambah dan asal barang tercatat. |
| US-15 | M | Sebagai **staff**, saya ingin mencatat barang keluar (`out`) untuk divisi, supaya pengurangan stok terdokumentasi. |
| US-16 | M | Sebagai **admin**, saya ingin melakukan penyesuaian stok (`adjustment`) saat stock opname, supaya angka sistem kembali sesuai fisik. |
| US-17 | M | Sebagai **staff**, saya ingin setiap transaksi menyimpan catatan/alasan, supaya ada konteks ketika data ditinjau kemudian. |
| US-18 | M | Sebagai **staff**, saya ingin melihat riwayat transaksi per item, supaya saya bisa menelusuri pergerakan stok. |
| US-19 | M | Sebagai **staff**, saya ingin sistem menolak transaksi yang membuat stok negatif, supaya data stok tetap masuk akal. |
| US-20 | S | Sebagai **admin**, saya ingin membatalkan atau membalik transaksi dengan mengubah `status` menjadi `cancelled` (bukan menghapus) atau membuat dokumen lawan `reversal` disertai catatan alasan, supaya koreksi tetap terekam. |
| US-21 | S | Sebagai **staff**, saya ingin melampirkan foto/nota pada transaksi, supaya ada bukti pendukung. |
| US-22 | S | Sebagai **staff**, saya ingin mencatat beberapa item dalam satu transaksi (multi-item) melalui payload `lines[]`, supaya input lebih cepat. Setiap baris menjadi satu dokumen `stockTransactions` (ledger satu item per dokumen) dan semuanya berbagi `batchId` yang sama. |

### Fase 4 — Workflow Approval

| ID | Prioritas | User Story |
|----|:---------:|------------|
| US-23 | M | Sebagai **staff**, saya ingin membuat permintaan barang (`requests`), supaya kebutuhan divisi terdokumentasi. |
| US-24 | M | Sebagai **staff**, saya ingin menyimpan permintaan sebagai `draft` lalu mengirimnya (`submitted`), supaya saya bisa menyiapkan permintaan bertahap. |
| US-25 | M | Sebagai **admin**, saya ingin melihat daftar permintaan yang menunggu approval, supaya saya bisa memprosesnya. |
| US-26 | M | Sebagai **admin**, saya ingin menyetujui (`approved`) atau menolak (`rejected`) permintaan beserta alasan, supaya ada jejak keputusan. |
| US-27 | M | Sebagai **staff**, saya ingin melihat status permintaan saya (`draft`/`submitted`/`approved`/`rejected`/`fulfilled`/`cancelled`), supaya saya tahu progresnya. |
| US-28 | M | Sebagai **admin**, saya ingin menandai permintaan yang sudah disetujui sebagai `fulfilled`, supaya stok berkurang dan statusnya tuntas. |
| US-29 | S | Sebagai **staff**, saya ingin membatalkan permintaan saya sendiri (`cancelled`) selama statusnya `draft`, `submitted`, atau `approved` (yaitu belum `fulfilled`), supaya permintaan keliru bisa ditarik. |
| US-30 | S | Sebagai **admin**, saya ingin melihat riwayat approval (siapa, kapan, alasan), supaya keputusan dapat diaudit. |

### Fase 5 — Dashboard & Reporting

| ID | Prioritas | User Story |
|----|:---------:|------------|
| US-31 | M | Sebagai **viewer**, saya ingin melihat dashboard ringkasan (total item, nilai stok agregat dari `items.stockValue`, item menipis), supaya saya cepat memahami kondisi gudang. |
| US-32 | M | Sebagai **viewer**, saya ingin melihat daftar item yang stoknya ≤ `minStock` (via field denormalisasi `isLowStock: true`), supaya saya tahu apa yang perlu segera dipesan. |
| US-33 | M | Sebagai **viewer**, saya ingin melihat laporan stok per periode (dihitung on-the-fly, tanpa menyimpan dokumen), supaya saya bisa melaporkan ke manajemen. |
| US-34 | M | Sebagai **viewer**, saya ingin melihat laporan transaksi masuk/keluar per item/periode, supaya saya bisa menganalisis pergerakan. |
| US-35 | S | Sebagai **viewer**, saya ingin mengunduh (ekspor) laporan ke CSV, supaya laporan mudah dibagikan. |
| US-36 | S | Sebagai **viewer**, saya ingin melihat grafik tren stok, supaya saya bisa melihat pola konsumsi barang. |

### Fase 6 — Automasi (Cloud Functions)

| ID | Prioritas | User Story |
|----|:---------:|------------|
| US-37 | M | Sebagai **admin**, saya ingin menerima notifikasi saat ada permintaan baru (`submitted`), supaya approval tidak tertunda. |
| US-38 | M | Sebagai **admin**, saya ingin menerima peringatan otomatis saat stok ≤ `minStock` (dipicu saat `isLowStock` berubah menjadi `true`), supaya barang cepat dipesan ulang. |
| US-39 | S | Sebagai **admin**, saya ingin laporan harian dikirim otomatis (scheduled), supaya saya tidak perlu membuka sistem tiap hari. |
| US-40 | S | Sebagai **admin**, saya ingin setiap perubahan stok otomatis tercatat di `auditLogs` oleh **Firestore trigger `onWrite`** (satu-satunya penulis audit log), supaya audit trail konsisten tanpa langkah manual dan tanpa entri ganda. |
| US-41 | C | Sebagai **admin**, saya ingin laporan mingguan otomatis tersimpan sebagai file, supaya bisa diarsipkan. |

### Fase 7 — Integrasi API Pihak Ketiga

| ID | Prioritas | User Story |
|----|:---------:|------------|
| US-42 | S | Sebagai **admin**, saya ingin mengirim notifikasi ke layanan pesan (mis. WhatsApp/Telegram/email) saat stok menipis, supaya peringatan sampai ke orang yang tepat. |
| US-43 | C | Sebagai **admin**, saya ingin mengambil data kurs/harga dari API eksternal untuk estimasi nilai impor, supaya laporan lebih akurat. |
| US-44 | C | Sebagai **admin**, saya ingin mengekspor data ke Google Sheets, supaya mudah diolah tim lain. |

### Fase 8 — Hardening (Keamanan, Testing, CI/CD, Monitoring)

| ID | Prioritas | User Story |
|----|:---------:|------------|
| US-45 | M | Sebagai **admin**, saya ingin audit log mencatat siapa mengubah apa dan kapan, supaya aktivitas dapat ditelusuri. |
| US-46 | M | Sebagai **admin**, saya ingin hanya pengguna ber-role tepat yang bisa mengakses endpoint tertentu, supaya data terlindungi. |
| US-47 | M | Sebagai **developer**, saya ingin CI menjalankan lint, typecheck, test, dan build pada setiap PR, supaya kesalahan tertangkap sebelum merge. |
| US-48 | S | Sebagai **developer**, saya ingin log dan monitoring error di produksi, supaya masalah setelah release bisa cepat didiagnosis. |
| US-49 | S | Sebagai **developer**, saya ingin migrasi/seed script untuk data awal, supaya environment baru cepat disiapkan. |

**Total: 50 user stories** (melebihi minimum 25), mencakup master data, transaksi stok, permintaan/approval,
dashboard, laporan, automasi, integrasi, dan user management.

---

## 5. Scope

### 5.1 MVP (wajib — Fase 0–6 + sebagian Fase 8)

Fitur yang harus ada agar sistem dianggap layak dipakai:

- Autentikasi email/password + role `admin`/`staff`/`viewer` (custom claims).
- Master data: `categories`, `suppliers`, `divisions`, `items` (termasuk `minStock`).
- Transaksi stok: `type` `in`, `out`, `adjustment` (multi-item via `lines[]`) dengan validasi stok
  tidak negatif; `status` `completed`/`cancelled`.
- Field denormalisasi pada `items` (`isLowStock`, `stockGap`, `stockValue`) yang dihitung ulang setiap
  stok/harga berubah.
- Workflow permintaan: `draft` → `submitted` → `approved`/`rejected` → `fulfilled`/`cancelled`.
- Dashboard ringkasan + daftar item stok menipis.
- Laporan stok & transaksi per periode (minimal tampilan + ekspor CSV).
- Automasi inti: notifikasi permintaan baru, peringatan stok menipis, pencatatan `auditLogs`.
- Audit trail dan kontrol akses berbasis role.
- CI: lint, typecheck, unit test, build.

### 5.2 Nice-to-have (fase lanjut)

- Integrasi layanan pesan pihak ketiga (WhatsApp/Telegram/email).
- Laporan terjadwal otomatis dan pengarsipan file.
- Grafik tren lanjutan dan analitik konsumsi barang.
- Multi-gudang (multi-warehouse) dan transfer antar gudang.
- Barcode/QR scanning untuk input cepat.
- Ekspor ke Google Sheets, integrasi API eksternal lain.
- Barcode label printing, manajemen batch/expiry.

### 5.3 Di luar scope (explicit non-goals)

- Akuntansi penuh / jurnal keuangan.
- E-commerce / penjualan ke pelanggan akhir.
- Payroll atau HR.
- Aplikasi mobile native (fokus web responsif).

---

## 6. Alur Bisnis Utama

### (a) Barang masuk dari supplier

```
[Staff] Terima barang fisik dari supplier
   │
   ▼
[Staff] Buka form "Barang Masuk" → pilih item + supplier
   │  isi jumlah, tanggal, catatan, (opsional) foto/nota
   ▼
[Sistem] Validasi input (jumlah > 0, item & supplier valid)
   │
   ▼
[Sistem] Buat dokumen di stockTransactions (type: 'in', status: 'completed')
   │        └─ dalam satu Firestore transaction:
   │           ├─ tambah items.currentStock += jumlah (per baris `lines[]`)
   │           └─ hitung ulang items.isLowStock & items.stockGap
   ▼
[Firestore trigger onWrite] Tulis auditLogs (siapa, apa, kapan) — satu-satunya penulis audit
   │
   ▼
[Sistem] Jika isLowStock = true → item masuk daftar alert
   │
   ▼
[Staff] Lihat konfirmasi & riwayat transaksi
```

**Langkah naratif:**
1. Staf menerima barang fisik dan memeriksa kesesuaian dengan surat jalan/nota.
2. Staf membuka menu **Transaksi Stok → Barang Masuk**.
3. Staf memilih supplier asal (`supplierId` per transaksi) dan satu atau beberapa item (baris
   `lines[]`), mengisi jumlah tiap baris, tanggal, dan catatan; dapat melampirkan foto nota.
4. Sistem memvalidasi input dan membuat entri `stockTransactions` dengan `type: 'in'`.
5. Dalam Firestore transaction yang sama, sistem menambah `items.currentStock` tiap baris dan
   menghitung ulang `isLowStock`/`stockGap`.
6. Firestore trigger `onWrite` menulis `auditLogs` untuk mencatat aksi tersebut (lihat §10 & BR-04).
7. Jika `isLowStock` menjadi `true`, item muncul di daftar peringatan.

### (b) Barang keluar untuk divisi

```
[Divisi/Staff] Ajukan kebutuhan barang (lihat alur c)
   │  atau staf langsung mencatat pengeluaran yang sudah disetujui
   ▼
[Staff] Buka form "Barang Keluar" → pilih item + divisi tujuan
   │  isi jumlah, tanggal, catatan
   ▼
[Sistem] Validasi: jumlah ≤ currentStock (stok tidak boleh negatif)
   │        └─ jika gagal → tolak dengan pesan jelas
   ▼
[Sistem] Buat stockTransactions (type: 'out', status: 'completed')
   │        └─ dalam satu Firestore transaction:
   │           ├─ items.currentStock -= jumlah (per baris `lines[]`)
   │           └─ hitung ulang items.isLowStock & items.stockGap
   ▼
[Firestore trigger onWrite] Tulis auditLogs
   ▼
[Sistem] Jika isLowStock = true → masukkan ke daftar alert
   │
   ▼
[Staff] Lihat konfirmasi & riwayat
```

**Langkah naratif:**
1. Barang keluar biasanya berasal dari permintaan yang sudah `approved` (lihat alur c), atau
   pengeluaran operasional yang sah.
2. Staf membuka **Transaksi Stok → Barang Keluar**.
3. Staf memilih item, divisi tujuan (`divisionId`, dari master `divisions`), jumlah, tanggal, dan
   catatan.
4. Sistem memvalidasi bahwa jumlah tiap baris tidak melebihi stok tersedia (BR-01). Jika melebihi,
   transaksi ditolak.
5. Sistem mengurangi `items.currentStock`, mencatat transaksi `type: 'out'`, dan menghitung ulang
   `isLowStock`/`stockGap` dalam transaksi yang sama.
6. Firestore trigger `onWrite` menulis `auditLogs`; daftar peringatan terbarui bila stok menipis.

### (c) Permintaan barang yang butuh approval

```
[Staff] Buat request (status: 'draft')
   │   ├─ tambah item & jumlah yang diminta
   ▼
[Staff] Kirim request → status: 'submitted'
   │
   ▼
[Cloud Function] Kirim notifikasi ke admin (permintaan baru)
   │
   ▼
[Admin] Tinjau request
   ├── Tolak  → status: 'rejected' (+ alasan)  → notifikasi ke pemohon
   └── Setuju → status: 'approved'             → notifikasi ke pemohon
                    │
                    ▼
              [Admin] Siapkan & serahkan barang
                    │
                    ▼
              [Admin] Tandai 'fulfilled'
                    │  └─ sistem membuat stockTransactions type: 'out' (status: 'completed')
                    │  └─ items.currentStock -= jumlah + hitung ulang isLowStock/stockGap
                    ▼
              [Firestore trigger onWrite] Tulis auditLogs
                    ▼
              [Sistem] Request selesai; stok & audit terbarui
```

**Langkah naratif:**
1. Staf membuat permintaan dan menambahkan item beserta jumlah yang diminta; status awal `draft`.
2. Staf mengirim permintaan; status menjadi `submitted`.
3. Cloud Function mengirim notifikasi kepada admin bahwa ada permintaan baru.
4. Admin meninjau permintaan:
   - **Tolak:** status menjadi `rejected`, wajib menyertakan alasan; pemohon diberi tahu.
   - **Setuju:** status menjadi `approved`; pemohon diberi tahu.
5. Setelah barang disiapkan dan diserahkan, admin menandai permintaan `fulfilled` (fulfill adalah aksi admin-only, lihat §3.4 & SECURITY.md §3.2).
6. Saat `fulfilled`, sistem otomatis membuat transaksi stok keluar (`out`) dan mengurangi stok.
7. Pemilik permintaan atau admin dapat membatalkan permintaan (`cancelled`) selama statusnya
   `draft`, `submitted`, atau `approved` (belum `fulfilled`) — lihat BR-06 & BR-09.
8. Firestore trigger `onWrite` menulis `auditLogs` untuk setiap perubahan status.

### (d) Penyesuaian stok saat stock opname

```
[Staff] Lakukan perhitungan fisik di gudang
   │
   ▼
[Staff] Buka form "Penyesuaian Stok" → pilih item
   │  masukkan stok fisik hasil hitung + alasan (mis. "selisih opname", "barang rusak")
   ▼
[Sistem] Hitung delta = stok fisik - currentStock (boleh negatif)
   │
   ▼
[Sistem] Buat stockTransactions (type: 'adjustment', status: 'completed')
   │        └─ simpan quantityBefore, quantityAfter, delta (boleh negatif)
   │        └─ items.currentStock = stok fisik + hitung ulang isLowStock/stockGap
   ▼
[Firestore trigger onWrite] Tulis auditLogs (termasuk nilai sebelum & sesudah)
   ▼
[Staff] Tinjau riwayat penyesuaian
   │
   ▼
[Admin] (opsional) Meninjau laporan selisih opname
```

**Langkah naratif:**
1. Staf menghitung jumlah fisik barang di gudang.
2. Staf membuka **Transaksi Stok → Penyesuaian Stok** dan memilih item.
3. Staf memasukkan hasil hitung fisik dan alasan penyesuaian (mis. "selisih stock opname",
   "barang rusak", "barang kadaluarsa").
4. Sistem menghitung `delta = stok fisik - currentStock` (dapat bernilai negatif bila barang
   hilang/rusak; lihat BR-18 & BR-19).
5. Sistem membuat transaksi `type: 'adjustment'` yang menyimpan `quantityBefore`, `quantityAfter`,
   dan `delta`, serta alasan.
6. Firestore trigger `onWrite` menulis `auditLogs` sehingga perubahan besar dapat ditelusuri dan
   ditinjau admin.

---

## 7. Aturan Bisnis

Aturan bisnis diberi ID (`BR-nn`) dan harus ditegakkan di backend (bukan hanya di UI), karena
frontend dapat dimanipulasi.

| ID | Aturan | Alasan |
|----|--------|--------|
| BR-01 | Stok tidak boleh negatif. Transaksi `out` atau `adjustment` yang membuat `currentStock < 0` harus ditolak. Untuk `adjustment`, nilai stok fisik yang diinput juga tidak boleh negatif. | Stok negatif tidak bermakna secara fisik dan menandakan data korup. |
| BR-02 | Transaksi stok tidak dapat dihapus. Koreksi dilakukan dengan mengubah `status` transaksi menjadi `cancelled` (reversal) disertai catatan alasan. Transaksi `cancelled` tidak dihitung dalam stok berjalan. | Menjaga audit trail dan mencegah manipulasi data. |
| BR-03 | Setiap transaksi stok wajib memiliki `createdBy`, `createdAt`, dan `note`. | Agar setiap perubahan dapat ditelusuri ke pelakunya. |
| BR-04 | Setiap perubahan stok otomatis menulis entri di `auditLogs`. **Satu-satunya penulis `auditLogs` adalah Firestore trigger `onWrite`** pada `stockTransactions`, `requests`, dan `items`; alur API **tidak** menulis `auditLogs` secara manual. Trigger wajib idempoten (menggunakan `event.id` sebagai kunci dokumen) dan memakai retry bawaan Cloud Functions; kegagalan dicatat ke log & alert agar jaminan 100% (KS-02) terpenuhi. | Audit trail harus konsisten tanpa langkah manual dan tanpa entri ganda. |
| BR-05 | Hanya user ber-role `admin` yang dapat menyetujui atau menolak permintaan. | Pemisahan tugas: pemohon ≠ penyetuju. |
| BR-06 | Perubahan status permintaan hanya boleh mengikuti transisi yang sah: `draft` → `submitted`; `submitted` → `approved`\|`rejected`\|`cancelled`; `approved` → `fulfilled`\|`cancelled`; `draft` → `cancelled`. `rejected`, `fulfilled`, dan `cancelled` bersifat terminal. Aktor pembatalan: pemilik permintaan atau `admin`. | Mencegah status ilegal dan alur yang membingungkan. |
| BR-07 | Permintaan hanya dapat `fulfilled` jika sebelumnya `approved`. | Barang tidak boleh keluar tanpa persetujuan. |
| BR-08 | Permintaan `rejected` wajib menyertakan alasan penolakan. | Pemohon berhak tahu alasan dan keputusan dapat diaudit. |
| BR-09 | Hanya pemilik permintaan atau `admin` yang dapat membatalkan (`cancelled`), dan hanya selama statusnya `draft`, `submitted`, atau `approved` (yaitu belum `fulfilled`). `rejected` dan `fulfilled` tidak dapat dibatalkan. | Mencegah pembatalan sepihak atas permintaan yang sudah diproses; selaras dengan US-29 dan BR-06. |
| BR-10 | `currentStock` hanya boleh berubah melalui pembuatan transaksi stok, bukan edit langsung pada `items`. | Menjaga integritas: stok selalu punya jejak transaksi. |
| BR-11 | Item dengan `currentStock <= minStock` harus muncul di daftar peringatan stok menipis. Karena Firestore tidak dapat membandingkan dua field dalam satu query, kondisi ini **tidak** di-query langsung; sebaliknya disimpan sebagai field denormalisasi `isLowStock: boolean` (dan `stockGap = currentStock - minStock`) pada dokumen `items`, lalu di-query dengan `where('isLowStock', '==', true)`. Field ini dihitung ulang setiap `currentStock` atau `minStock` berubah (lihat BR-23). | Mendukung deteksi dini kekosongan stok dengan query yang dapat di-index. |
| BR-12 | `minStock` tidak boleh negatif dan default-nya 0 jika tidak diisi. | Menjaga validitas ambang batas. |
| BR-13 | Kode item (`sku`) harus unik di seluruh sistem. Firestore tidak menyediakan unique index, sehingga penegakan dilakukan melalui koleksi penampung `itemCodes/{SKU}`: saat membuat/mengubah item, backend menjalankan Firestore transaction yang (1) membaca `itemCodes/{SKU}`, (2) menolak dengan HTTP 409 jika sudah dipakai item lain, (3) menulis `itemCodes/{SKU} = {itemId}`. Menghapus item tidak menghapus entri `itemCodes` (kode tetap dikunci untuk menjaga referensi historis). | Mencegah duplikasi identitas barang, termasuk pada input bersamaan (race condition). |
| BR-14 | Item/kategori/supplier/divisi tidak boleh dihapus permanen jika sudah dipakai transaksi; gunakan status nonaktif (`isActive: false`). | Menjaga referensial historis laporan dan audit. |
| BR-15 | Hanya `admin` yang dapat mengelola data master (`categories`, `suppliers`, `divisions`, `items`) dan user. | Kontrol akses atas data kritis. |
| BR-16 | Role `viewer` bersifat read-only: tidak boleh membuat/mengubah data apa pun. Laporan viewer dihitung **on-the-fly** dan tidak disimpan sebagai dokumen; ekspor CSV hanya mengalirkan data ke respons unduhan dan tidak menulis ke Firestore/Storage. | Membatasi akses sesuai prinsip least privilege; mencegah laporan/ekspor dianggap operasi tulis. |
| BR-17 | Role ditentukan melalui custom claims Firebase Auth dan divalidasi di backend untuk setiap request. **Catatan propagasi:** custom claims di-cache pada ID token, sehingga perubahan role (US-03) atau penonaktifan akun (US-05) tidak langsung berlaku. Saat role berubah atau akun dinonaktifkan, backend wajib memanggil `revokeRefreshTokens(uid)` dan frontend memaksa `getIdToken(true)` (refresh) agar token lama tidak lagi diterima. | Jangan percaya klaim dari client; mencegah user nonaktif tetap mengakses sampai token kedaluwarsa. |
| BR-18 | Jumlah pada transaksi **`in`/`out`** harus bilangan bulat positif (> 0), divalidasi per baris `lines[]`; bila `units.allowDecimal = true` (mis. kg/liter), kuantitas boleh desimal terkontrol (maks 3 desimal). Untuk `adjustment`, aturan ini **tidak** berlaku pada `delta`: gunakan `quantityBefore`, `quantityAfter` (keduanya ≥ 0), dan `delta = quantityAfter - quantityBefore` yang boleh bernilai negatif. | Mencegah input tidak valid seperti 0 atau pecahan, sekaligus mengakomodasi selisih opname negatif dan satuan desimal. |
| BR-19 | Setiap penyesuaian stok (`adjustment`) wajib menyertakan alasan (`note`) dan mencatat `quantityBefore`, `quantityAfter`, serta `delta` (boleh negatif). | Perubahan besar perlu konteks untuk investigasi. |
| BR-20 | Semua waktu disimpan dalam UTC (Firestore timestamp) dan ditampilkan dalam zona waktu lokal pengguna. | Menghindari ambiguitas waktu antar perangkat. |
| BR-21 | Setiap permintaan yang disetujui dan `fulfilled` menghasilkan sekumpulan dokumen `stockTransactions` bertipe `out` (status `completed`) — **satu dokumen per item** permintaan — yang ditulis dalam satu Firestore transaction dan berbagi `batchId`, lalu ditautkan lewat `requestId`; tidak boleh dobel. Penandaan `fulfilled` bersifat idempoten (dilindungi Firestore transaction / pengecekan status), sehingga percobaan ganda tidak mengurangi stok dua kali. | Mencegah pengurangan stok ganda. |
| BR-22 | Endpoint REST wajib memvalidasi input dan mengembalikan kode HTTP yang tepat: `200`/`201` (sukses), `400` (payload tidak valid), `401` (tidak terautentikasi), `403` (tidak berwenang), `404` (resource tidak ditemukan), `409` (konflik, mis. kode item duplikat / transisi status ilegal), `422` (validasi semantik, mis. stok tidak cukup), `500`/`503` (kesalahan server). Format error body seragam: `{ "code": "<string_mesin>", "message": "<pesan manusia>", "details": { ... } }`. | Konsistensi API, kemudahan integrasi, dan diagnosis pasca-release (US-48). |
| BR-23 | Field denormalisasi `isLowStock`, `stockGap`, dan `stockValue` pada `items` **wajib dihitung ulang** setiap kali `currentStock`, `minStock`, atau `costPrice` berubah. Perhitungan dilakukan dalam Firestore transaction yang sama dengan penulisan transaksi stok (untuk konsistensi langsung) dan diverifikasi ulang oleh Cloud Function terjadwal sebagai jaring pengaman. `isLowStock = currentStock <= minStock`; `stockGap = currentStock - minStock`; `stockValue = currentStock * costPrice`. | Firestore tidak mendukung perbandingan antar-field maupun agregasi perkalian native; denormalisasi menjaga query alert & nilai stok tetap murah dan dapat di-index. |
| BR-24 | Divisi (`divisions`) adalah **master data tersendiri** yang dikelola `admin`, mendukung `isActive`, dan dirujuk oleh permintaan serta transaksi barang keluar melalui `divisionId`. Divisi tidak disimpan sebagai teks bebas. | Konsistensi pelaporan per divisi dan pencegahan nilai yang tidak seragam. |
| BR-25 | Semua akses data oleh frontend melewati REST API backend (Firestore hanya diakses via Firebase Admin SDK). Bila kelak ada akses baca langsung dari client, Firestore Security Rules & Storage Rules wajib disertakan (lihat §10). | Admin SDK melewati security rules; keputusan jalur akses harus eksplisit agar aman. |

---

## 8. Glosarium & Konvensi

### 8.1 Istilah domain

| Istilah | Arti |
|---------|------|
| Item | Barang yang dikelola stoknya (unit terkecil yang dicatat). |
| `currentStock` | Jumlah stok terkini sebuah item di sistem. |
| `minStock` | Batas minimum stok; jika `currentStock <= minStock`, item dianggap menipis. |
| `isLowStock` | Field denormalisasi boolean pada item; `true` jika `currentStock <= minStock`. Dipakai untuk query daftar alert. |
| `stockGap` | Field denormalisasi angka; `currentStock - minStock` (negatif = stok menipis). |
| `stockValue` | Field denormalisasi angka; `currentStock * costPrice` (nilai stok per item). |
| `type` | Jenis pergerakan pada transaksi stok: `in` (masuk), `out` (keluar), `adjustment` (penyesuaian). |
| `status` | Siklus hidup dokumen. Untuk transaksi stok: `completed`\|`cancelled`; untuk permintaan: `draft`\|`submitted`\|`approved`\|`rejected`\|`fulfilled`\|`cancelled`. |
| `note` | Catatan/alasan bebas yang wajib disertakan pada transaksi stok (mis. alasan adjustment/penolakan). |
| `isActive` | Status aktif/nonaktif master data; item/kategori/supplier/divisi nonaktif tidak muncul di pilihan baru tetapi tetap tersimpan untuk laporan historis. |
| Transaksi stok | Pergerakan stok: `in` (masuk), `out` (keluar), `adjustment` (penyesuaian). |
| Permintaan (request) | Permohonan barang yang diajukan staf dan perlu approval admin. |
| Divisi | Unit internal perusahaan (mis. produksi, penjualan, operasional) sebagai tujuan permintaan/barang keluar; master data tersendiri. |
| Supplier | Pemasok barang; master data tersendiri. Item boleh punya `supplierId` opsional (supplier default), dan tiap transaksi `in` mencatat `supplierId` asal barang. |
| Reversal | Pembatalan transaksi dengan mengubah `status` menjadi `cancelled` (bukan menghapus); transaksi `cancelled` tidak dihitung dalam stok berjalan. |
| Stock opname | Perhitungan fisik stok di gudang untuk direkonsiliasi dengan sistem. |
| Audit log | Catatan aktivitas pengguna untuk keperluan penelusuran. |

### 8.2 Konvensi penamaan (WAJIB konsisten di semua dokumen)

- **Firestore collections:** camelCase jamak — `users`, `categories`, `suppliers`, `divisions`,
  `units`, `items`, `warehouses`, `stockTransactions`, `requests`, `requestItems`, `auditLogs`,
  `notifications`, `functionRuns`, `cacheEntries`, `idempotencyKeys`, `dailyAggregates`, `settings`
  (`itemCodes` adalah koleksi penampung untuk penegakan keunikan kode item, lihat BR-13).
- **REST endpoints:** berawalan `/api/v1/`, resource jamak, **seluruh segmen path memakai
  kebab-case** — mis. `GET /api/v1/items`, `POST /api/v1/stock-transactions`,
  `GET /api/v1/requests`. Perbedaan gaya sengaja: koleksi Firestore camelCase, path REST kebab-case;
  pemetaan dilakukan eksplisit di backend.
- **Role:** `admin` | `staff` | `viewer`.
- **Type transaksi stok:** `in` | `out` | `adjustment`.
- **Status transaksi stok:** `completed` | `cancelled` (lihat BR-02).
- **Status permintaan:** `draft` | `submitted` | `approved` | `rejected` | `fulfilled` | `cancelled`.

### 8.3 Peta fase pembangunan

| Fase | Nama | Fokus |
|:----:|------|-------|
| 0 | Fondasi | Kebutuhan, desain, setup proyek |
| 1 | Autentikasi & Role | Firebase Auth, custom claims, proteksi route |
| 2 | Master Data | `categories`, `suppliers`, `divisions`, `items` (+ `itemCodes` untuk keunikan kode) |
| 3 | Transaksi Stok | `type` `in`, `out`, `adjustment`; `status` `completed`/`cancelled`; multi-item `lines[]`; perhitungan `isLowStock`/`stockGap`/`stockValue`; composite index & paginasi |
| 4 | Workflow Approval | `requests` + transisi status |
| 5 | Dashboard & Reporting | Ringkasan (agregat `stockValue`), laporan on-the-fly, ekspor CSV |
| 6 | Automasi | Cloud Functions (HTTP callable, Firestore trigger penulis `auditLogs`, scheduled verifikasi `isLowStock`) |
| 7 | Integrasi API Pihak Ketiga | Notifikasi & layanan eksternal |
| 8 | Hardening | Security, testing, CI/CD, monitoring |
| 9 | Polish & Deploy | UAT, deployment, dokumentasi akhir |

---

## 9. Data Model

Bagian ini mendefinisikan skema field per koleksi agar setiap field dapat ditelusuri ke alur/BR
yang memakainya (kolom **Dipakai di**). Dokumen lengkap (termasuk contoh JSON, migrasi, dan
validation schema) ada di [`DATA-MODEL.md`](./DATA-MODEL.md); bagian ini adalah ringkasan normatif
yang harus konsisten dengannya.

**Konvensi umum:**
- ID dokumen = string auto-id Firestore, kecuali disebut lain.
- Semua timestamp adalah Firestore `Timestamp` dalam UTC (BR-20).
- Kolom **Wajib** `✅` = harus ada saat create; `❌` = opsional.
- `isActive` default `true`; dokumen nonaktif tetap tersimpan untuk historis (BR-14).

### 9.1 `users`

| Field | Tipe | Wajib | Default | Keterangan | Dipakai di |
|-------|------|:-----:|---------|------------|------------|
| `uid` | string (doc id) | ✅ | — | UID Firebase Auth | US-01, US-03 |
| `email` | string | ✅ | — | Email login | US-01 |
| `displayName` | string | ✅ | — | Nama tampilan | US-30 |
| `role` | `'admin'\|'staff'\|'viewer'` | ✅ | `'viewer'` | Cermin custom claim | US-03, BR-17 |
| `isActive` | boolean | ✅ | `true` | Akun aktif/nonaktif | US-05, BR-17 |
| `divisionId` | string \| null | ❌ | `null` | Divisi asal user (opsional) | US-50 |
| `createdAt` | Timestamp | ✅ | now | — | BR-20 |
| `updatedAt` | Timestamp | ✅ | now | — | — |
| `lastLoginAt` | Timestamp \| null | ❌ | `null` | Audit login | US-45 |

### 9.2 `categories`

| Field | Tipe | Wajib | Default | Keterangan | Dipakai di |
|-------|------|:-----:|---------|------------|------------|
| `name` | string | ✅ | — | Nama kategori | US-07 |
| `description` | string | ❌ | `''` | Keterangan | US-07 |
| `isActive` | boolean | ✅ | `true` | Nonaktif = tidak muncul di pilihan baru | US-07, BR-14 |
| `createdAt` / `updatedAt` | Timestamp | ✅ | now | — | BR-20 |

### 9.3 `suppliers`

| Field | Tipe | Wajib | Default | Keterangan | Dipakai di |
|-------|------|:-----:|---------|------------|------------|
| `name` | string | ✅ | — | Nama supplier | US-08 |
| `contactName` | string | ❌ | `''` | Nama kontak | US-08 |
| `phone` | string | ❌ | `''` | Telepon | US-08 |
| `email` | string | ❌ | `''` | Email | US-08 |
| `address` | string | ❌ | `''` | Alamat | US-08 |
| `isActive` | boolean | ✅ | `true` | — | US-08, BR-14 |
| `createdAt` / `updatedAt` | Timestamp | ✅ | now | — | BR-20 |

### 9.4 `divisions` (BARU — lihat BR-24, US-50)

| Field | Tipe | Wajib | Default | Keterangan | Dipakai di |
|-------|------|:-----:|---------|------------|------------|
| `name` | string | ✅ | — | Nama divisi (mis. Produksi) | US-50, alur (b), (c) |
| `code` | string | ✅ | — | Kode singkat divisi | US-50 |
| `description` | string | ❌ | `''` | Keterangan | US-50 |
| `isActive` | boolean | ✅ | `true` | Nonaktif = tidak muncul di pilihan baru | US-50, BR-14 |
| `createdAt` / `updatedAt` | Timestamp | ✅ | now | — | BR-20 |

### 9.5 `items`

| Field | Tipe | Wajib | Default | Keterangan | Dipakai di |
|-------|------|:-----:|---------|------------|------------|
| `sku` | string | ✅ | — | Kode item unik (BR-13) | US-09, BR-13 |
| `name` | string | ✅ | — | Nama item | US-09 |
| `normalizedName` | string | ✅ | — | Nama lowercase untuk prefix search | US-09, US-13 |
| `unitId` | string | ✅ | — | Ref ke `units` | US-09 |
| `unitSymbol` | string | ✅ | — | Denorm simbol satuan (pcs/kg/liter) | US-09 |
| `categoryId` | string | ✅ | — | Ref ke `categories` | US-07, US-09 |
| `supplierId` | string \| null | ❌ | `null` | Supplier default (opsional) | US-09 |
| `costPrice` | number | ❌ | `0` | Harga pokok (integer Rupiah) | US-09, US-31 |
| `sellPrice` | number | ❌ | `null` | Harga jual (integer Rupiah) | US-09 |
| `minStock` | number | ✅ | `0` | Batas minimum (BR-12) | US-10, BR-11 |
| `maxStock` | number | ❌ | `null` | Batas atas (saran pembelian) | US-10 |
| `currentStock` | number | ✅ | `0` | Stok terkini; hanya berubah via transaksi (BR-10) | US-14–US-19 |
| `stockByWarehouse` | map<string,number> | ❌ | `{}` | Stok per gudang (kunci `warehouseId`) | US-14–US-19 |
| `isLowStock` | boolean | ✅ | computed | Denormalisasi `currentStock <= minStock` (BR-11, BR-23) | US-32, US-38 |
| `stockGap` | number | ❌ | computed | Denormalisasi `currentStock - minStock` (BR-23) | US-32 |
| `stockValue` | number | ✅ | computed | `currentStock * costPrice` (BR-23) | US-31 |
| `imageUrl` | string \| null | ❌ | `null` | URL Firebase Storage | US-12 |
| `isActive` | boolean | ✅ | `true` | — | US-09, BR-14 |
| `createdBy` | string | ✅ | — | UID pembuat | BR-03 |
| `createdAt` / `updatedAt` | Timestamp | ✅ | now | — | BR-20 |

> Skema kanonik ada di `docs/DATA-MODEL.md` §3.5. `stockGap`/`stockValue` adalah field denormalisasi tingkat aplikasi (BR-23); `isLowStock` wajib untuk query alert.

### 9.6 `itemCodes` (koleksi penampung keunikan — BR-13)

| Field | Tipe | Wajib | Keterangan | Dipakai di |
|-------|------|:-----:|------------|------------|
| doc id | string | ✅ | = `sku` item (normalisasi uppercase) | BR-13 |
| `itemId` | string | ✅ | ID item pemilik kode | BR-13 |
| `createdAt` | Timestamp | ✅ | — | BR-13 |

### 9.7 `stockTransactions`

| Field | Tipe | Wajib | Default | Keterangan | Dipakai di |
|-------|------|:-----:|---------|------------|------------|
| `transactionNo` | string | ✅ | generated | Nomor manusiawi `TRX-*` (counter `settings/numbering`) | US-17 |
| `type` | `'in'\|'out'\|'adjustment'` | ✅ | — | Jenis pergerakan | US-14–US-16, §8.2 |
| `status` | `'completed'\|'cancelled'` | ✅ | `'completed'` | Status dokumen (BR-02) | US-20, BR-02 |
| `itemId` | string | ✅ | — | Ref ke `items` (satu dokumen = satu item; multi-item di-*expand* + `batchId`) | US-22, BR-21 |
| `itemSku` / `itemName` / `unitSymbol` | string | ✅ | — | **Snapshot** identitas item saat transaksi | US-34 |
| `quantity` | number | ✅ | — | Jumlah absolut (≥ 0); arah dari `type`/`signedQuantity` | US-14–US-16, BR-18 |
| `signedQuantity` | number | ✅ | — | Perubahan bertanda (`+`/`-`/`±`) untuk agregasi laporan | US-34 |
| `stockBefore` / `stockAfter` | number | ✅ | — | Stok item di gudang itu sebelum/sesudah transaksi (BR-19) | US-20, BR-19 |
| `supplierId` | string \| null | ❌ | `null` | Asal barang; wajib untuk `in` | US-14, alur (a) |
| `divisionId` | string \| null | ❌ | `null` | Divisi tujuan; wajib untuk `out` | US-15, alur (b) |
| `requestId` | string \| null | ❌ | `null` | Ref permintaan sumber (jika dari approval) | US-28, BR-21 |
| `referenceType` / `referenceId` | string | ✅ | `manual` | Sumber transaksi (`purchase`/`request`/`manual`/`opname`/`return`/`transfer`/`reversal`) | US-20, US-28 |
| `quantityBefore` / `quantityAfter` / `delta` | number \| null | ❌ | `null` | Khusus `adjustment` (BR-19); `delta` boleh negatif (BR-18) | US-16 |
| `batchId` | string \| null | ❌ | `null` | Pengelompokan satu input multi-item (US-22) | US-22 |
| `note` | string | ✅ | — | Catatan/alasan (BR-03) | US-17, BR-03 |
| `attachments` | array<map> | ❌ | `[]` | Bukti foto/nota di Storage (`{name,url,path}`) | US-21 |
| `occurredAt` | Timestamp | ✅ | now | Tanggal bisnis transaksi (bisa backdate) | US-17, BR-20 |
| `createdBy` / `createdByName` / `createdByRole` | string | ✅ | — | UID + snapshot pelaku | BR-03 |
| `createdAt` | Timestamp | ✅ | now | Waktu sistem menyimpan | BR-03, BR-20 |
| `cancelledBy` / `cancelledAt` / `cancelReason` | — | ❌ | `null` | Diisi saat `status: 'cancelled'` (BR-02) | US-20, BR-02 |

> Skema kanonik: `docs/DATA-MODEL.md` §3.7. Ledger **append-only**: koreksi lewat `status: 'cancelled'` atau dokumen lawan `referenceType: 'reversal'` (`reversalOf`), bukan edit angka.

### 9.8 `requestItems` (subkoleksi `requests/{requestId}/requestItems`)

| Field | Tipe | Wajib | Keterangan | Dipakai di |
|-------|------|:-----:|------------|------------|
| `itemId` | string | ✅ | Ref ke `items` | US-22, BR-21 |
| `itemSku` / `itemName` / `unitSymbol` | string | ✅ | **Snapshot** identitas item | US-34 |
| `quantityRequested` | number | ✅ | Jumlah diminta (BR-18) | US-23 |
| `quantityApproved` | number \| null | ❌ | Jumlah disetujui (≤ diminta) | US-26 |
| `quantityFulfilled` | number | ✅ | Akumulasi yang sudah keluar gudang | US-28 |
| `lineStatus` | string | ✅ | `pending` \| `approved` \| `rejected` \| `fulfilled` | US-24–US-28 |

### 9.9 `requests`

| Field | Tipe | Wajib | Default | Keterangan | Dipakai di |
|-------|------|:-----:|---------|------------|------------|
| `requestNo` | string | ✅ | generated | Nomor manusiawi `REQ-*` (counter `settings/numbering`) | US-23 |
| `title` | string | ✅ | — | Judul singkat permintaan | US-23 |
| `requestedBy` / `requestedByName` / `requestedByRole` | string | ✅ | — | UID + snapshot pemohon | US-23, BR-09 |
| `department` | string | ✅ | — | Divisi pemohon | US-23, BR-24 |
| `warehouseId` / `warehouseName` | string \| null | ❌ | `null` | Gudang sumber (opsional di MVP) | US-23 |
| `priority` | `'low'\|'normal'\|'high'\|'urgent'` | ✅ | `'normal'` | Prioritas | US-23 |
| `neededAt` | Timestamp \| null | ❌ | `null` | Tanggal dibutuhkan | US-23 |
| `itemCount` / `totalQuantity` / `totalEstimatedValue` | number | ✅ | `0` | Denormalisasi dari `requestItems` | US-23, US-31 |
| `notes` | string | ❌ | `''` | Catatan pemohon | US-23 |
| `status` | enum (6 nilai) | ✅ | `'draft'` | Lihat §8.2 & BR-06 | US-24–US-29 |
| `submittedAt` / `approvedAt` / `approvedBy` / `approvedByName` / `approvalNote` | — | ❌ | `null` | Jejak approval | US-26, BR-05 |
| `rejectedAt` / `rejectedBy` / `rejectionReason` | — | ❌ | `null` | Alasan wajib jika `rejected` (BR-08) | US-26, BR-08 |
| `fulfilledAt` / `fulfilledBy` | — | ❌ | `null` | Jejak fulfill | US-28 |
| `cancelledAt` / `cancelledBy` / `cancelReason` | — | ❌ | `null` | Alasan pembatalan | US-29, BR-09 |
| `createdAt` / `updatedAt` | Timestamp | ✅ | now | — | BR-20 |

> Baris item ada di subkoleksi `requests/{requestId}/requestItems` (§9.8). Skema kanonik: `docs/DATA-MODEL.md` §3.8–§3.9. `fulfilledTransactionId` tidak ada — keterkaitan ke transaksi `out` dilacak dari sisi `stockTransactions.requestId`.

### 9.10 `auditLogs`

Ditulis **hanya** oleh service/trigger (BR-04), idempoten via `event.id`.

| Field | Tipe | Wajib | Keterangan | Dipakai di |
|-------|------|:-----:|------------|------------|
| doc id | string | ✅ | auto-ID / = `event.id` trigger (idempoten) | BR-04 |
| `action` | string | ✅ | `create`\|`update`\|`delete`\|`approve`\|`reject`\|`login`\|`stock_in`\|`stock_out`\|`adjustment`\|`role_change`\|`export` | US-40, US-45 |
| `entityType` / `entityId` / `entityPath` | string | ✅ | Koleksi, doc ID, dan path lengkap sumber | US-40 |
| `entityLabel` | string | ❌ | Label manusiawi (mis. nama item) | US-40 |
| `actorId` / `actorName` / `actorEmail` / `actorRole` | string | ✅* | Snapshot pelaku (`actorName` wajib) | US-45 |
| `changedFields` | string[] | ❌ | Nama field yang berubah | US-45 |
| `before` / `after` | object \| null | ❌ | Snapshot sebelum/sesudah | US-45 |
| `source` | string | ✅ | `api`\|`function`\|`admin-sdk`\|`migration` | US-48 |
| `ip` / `userAgent` | string | ❌ | Konteks request | US-45 |
| `traceId` | string | ❌ | Korelasi request | US-48 |
| `createdAt` | Timestamp | ✅ | Waktu aksi (UTC) | BR-20 |

> Skema kanonik: `docs/DATA-MODEL.md` §3.10 dan `docs/SECURITY.md` §8.1. Nama field `entityType`/`entityId`/`entityPath` (bukan `collection`/`docId`), waktu `createdAt` (bukan `at`), dan `action` enum kanonik (bukan `eventType`).

### 9.11 `dailyAggregates` (opsional, agregat laporan — lihat §11)

| Field | Tipe | Wajib | Keterangan | Dipakai di |
|-------|------|:-----:|------------|------------|
| doc id | string | ✅ | = tanggal `YYYY-MM-DD` | US-31, US-39 |
| `totalStockValue` | number | ✅ | Σ `items.stockValue` | US-31 |
| `lowStockCount` | number | ✅ | Jumlah item `isLowStock = true` | US-31, US-38 |
| `generatedAt` | Timestamp | ✅ | Waktu pembuatan | US-39 |

> Nama koleksi `dailyAggregates` bersifat **kanonik** dan dipakai konsisten di `docs/DATA-MODEL.md` §10.4, `docs/API.md` §7.3/§7.5, dan `docs/ROADMAP.md`.

---

## 10. Keputusan Arsitektur Akses Data

**Keputusan (BR-25):** frontend **tidak** mengakses Firestore langsung. Semua baca/tulis data
melewati **REST API backend** (Node.js + TypeScript + Firebase Admin SDK). Firebase Auth di client
hanya dipakai untuk login/logout, reset password, dan refresh ID token; token dikirim sebagai
`Authorization: Bearer <idToken>` ke REST API, lalu diverifikasi di backend (BR-17).

**Alasan:**
- Admin SDK **melewati Firestore Security Rules**, sehingga seluruh otorisasi terpusat dan dapat
  diuji di satu tempat (KS-06) — tidak ada dua sumber kebenaran aturan akses.
- Menghindari duplikasi logika validasi BR di client dan server.
- Query kompleks (multi-field, agregasi, paginasi) lebih mudah dikontrol dan di-index di backend.

**Konsekuensi & aturan turunan:**
- Firestore Security Rules tetap wajib dipasang sebagai **pertahanan berlapis**: default **deny
  all** (`allow read, write: if false;`) untuk semua koleksi, karena tidak ada akses client langsung.
- **Storage Rules** untuk foto produk (US-12) dan nota transaksi (US-21): baca terbatas pada user
  terautentikasi; tulis hanya oleh `admin`/`staff` terautentikasi, dengan batas ukuran dan tipe MIME.
- Draf aturan disimpan di [`ARCHITECTURE.md`](./ARCHITECTURE.md) (bagian Security Rules) dan wajib
  di-deploy via CI.
- Bila di masa depan sebagian baca langsung diizinkan (mis. realtime dashboard), perubahan harus
  memperbarui bagian ini dan menambah rules spesifik — bukan menghapus deny-all secara global.

**Draf ringkas rules (detail di ARCHITECTURE.md):**
```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /{document=**} { allow read, write: if false; } // default: hanya backend (Admin SDK)
  }
}
```

---

## 11. Query & Index

Firestore memerlukan **composite index** untuk query gabungan (filter + `orderBy` pada field
berbeda). Index berikut wajib didefinisikan di `firestore.indexes.json`:

| Koleksi | Query | Index yang dibutuhkan | Dipakai di |
|---------|-------|-----------------------|------------|
| `items` | Daftar alert | `isLowStock ASC, name ASC` | US-32, BR-11 |
| `items` | Filter kategori + status | `categoryId ASC, isActive ASC, name ASC` | US-11 |
| `stockTransactions` | Riwayat per item | `itemId ASC + occurredAt DESC` | US-18 |
| `stockTransactions` | Laporan per item/periode | `itemId ASC + type ASC + occurredAt DESC` | US-34 |
| `stockTransactions` | Laporan per periode | `type ASC + occurredAt DESC` | US-34, US-39 |
| `stockTransactions` | Batch multi-item | `batchId ASC` | US-22 |
| `requests` | Antrian approval | `status ASC + createdAt ASC` | US-25 |
| `requests` | Permintaan saya | `requestedBy ASC + status ASC + createdAt DESC` | US-27 |
| `auditLogs` | Penelusuran | `entityType ASC + entityId ASC + createdAt DESC` | US-30, US-45 |

**Paginasi & batas:**
- Semua endpoint daftar memakai **cursor pagination** (`limit` + `startAfter` pada dokumen
  terakhir), default `limit=25`, maksimum `limit=100`. Respons menyertakan `nextCursor`.
- Laporan transaksi **wajib** dibatasi rentang tanggal (default 1 bulan, maksimum 12 bulan) untuk
  membatasi biaya baca dan waktu respons (US-34).
- Agregasi `count()`/`sum()` dipakai bila memungkinkan; **perkalian antar-field tidak didukung**,
  sehingga `stockValue` di-denormalisasi (BR-23) dan total nilai stok dibaca dari agregat
  `dailyAggregates`/`items.stockValue` alih-alih membaca seluruh dokumen `items`.
- Field yang di-`orderBy` bersamaan dengan filter harus ada di composite index; CI memvalidasi
  index yang dibutuhkan (Fase 3/5).

---

## 12. Pemetaan User Story → Endpoint API

Daftar lengkap ada di [`API.md`](./API.md). Tabel ini memastikan setiap aksi user story punya jalur
yang jelas. Semua path berawalan `/api/v1/` dan memakai kebab-case (§8.2).

| US | Aksi | Method + Path | Peran | Catatan |
|----|------|---------------|-------|---------|
| US-01 | Login | — | semua | Firebase **client SDK** (`signInWithEmailAndPassword`), bukan REST |
| US-02 | Logout | — | semua | Firebase **client SDK** |
| US-03 | Set role user | `PATCH /api/v1/users/{uid}` | admin | Memicu revoke token (BR-17) |
| US-04 | Menu per role | `GET /api/v1/auth/me` | semua | Mengembalikan role & claims |
| US-05 | Nonaktifkan user | `PATCH /api/v1/users/{uid}` | admin | `isActive=false` + revoke token |
| US-06 | Reset password | — | semua | Firebase **client SDK** (`sendPasswordResetEmail`), bukan REST |
| US-07 | Kelola kategori | `GET/POST/PATCH /api/v1/categories[/{id}]` | admin | |
| US-08 | Kelola supplier | `GET/POST/PATCH /api/v1/suppliers[/{id}]` | admin | |
| US-09 | Kelola item | `GET/POST/PATCH /api/v1/items[/{id}]` | admin | Create/update menegakkan BR-13 |
| US-10 | Set `minStock` | `PATCH /api/v1/items/{id}` | admin | Menghitung ulang `isLowStock` (BR-23) |
| US-11 | Cari/filter item | `GET /api/v1/items?q=&categoryId=&active=` | semua | Paginasi cursor |
| US-12 | Upload foto produk | `POST /api/v1/items/{itemId}/image` | admin | Upload ke Storage, simpan `imageUrl` |
| US-13 | Ekspor item CSV | `GET /api/v1/items/export?format=csv` | admin | Streaming, tidak menulis Firestore |
| US-14 | Barang masuk | `POST /api/v1/stock-transactions` (`type=in`) | admin, staff | |
| US-15 | Barang keluar | `POST /api/v1/stock-transactions` (`type=out`) | admin, staff | |
| US-16 | Penyesuaian | `POST /api/v1/stock-transactions` (`type=adjustment`) | admin | Admin-only (§3.4, BR-19) |
| US-17 | Catatan transaksi | (bagian payload transaksi) | admin, staff | Field `note` |
| US-18 | Riwayat per item | `GET /api/v1/items/{itemId}/transactions` | semua | Butuh composite index (§11) |
| US-19 | Tolak stok negatif | (validasi di `POST /api/v1/stock-transactions`) | — | HTTP 422 |
| US-20 | Batalkan / balik transaksi | `PATCH /api/v1/stock-transactions/{id}/cancel` · `POST /api/v1/stock-transactions/{id}/reverse` | admin | `status=cancelled` atau dokumen `reversal` (BR-02) |
| US-21 | Lampiran foto/nota | `POST /api/v1/stock-transactions/{id}/attachments` | admin, staff | Storage |
| US-22 | Multi-item | (payload `lines[]`, di-*expand* per item + `batchId`) | admin, staff | |
| US-23 | Buat permintaan | `POST /api/v1/requests` | admin, staff | |
| US-24 | Draft → submitted | `POST /api/v1/requests/{id}/submit` | pemilik | |
| US-25 | Antrian approval | `GET /api/v1/requests?filter[status]=submitted` | admin | |
| US-26 | Setujui/tolak | `POST /api/v1/requests/{id}/approve` · `POST /api/v1/requests/{id}/reject` | admin | Body `{ note? }` / `{ reason }` |
| US-27 | Lihat status saya | `GET /api/v1/requests?filter[requestedBy]=me` | semua | `staff` otomatis dibatasi ke miliknya |
| US-28 | Tandai fulfilled | `POST /api/v1/requests/{id}/fulfill` | admin | Idempoten (BR-21) |
| US-29 | Batalkan permintaan | `POST /api/v1/requests/{id}/cancel` | pemilik, admin | BR-06, BR-09 |
| US-30 | Riwayat approval | `GET /api/v1/requests/{id}/history` | admin | |
| US-31 | Dashboard ringkasan | `GET /api/v1/dashboard/summary` | semua | Baca `stockValue`/`dailyAggregates` |
| US-32 | Daftar stok menipis | `GET /api/v1/items?filter[isLowStock]=true` | semua | `where('isLowStock','==',true)` |
| US-33 | Laporan stok | `GET /api/v1/reports/stock-summary?from=&to=` | semua | On-the-fly, read-only |
| US-34 | Laporan transaksi | `GET /api/v1/reports/stock-movement?itemId=&from=&to=` | semua | Composite index |
| US-35 | Ekspor laporan CSV | `POST /api/v1/reports/export` (`{report,format,filters}`) | semua | Async, streaming |
| US-36 | Grafik tren | `GET /api/v1/dashboard/trends?days=30` | semua | |
| US-37–US-39 | Notifikasi/peringatan/laporan terjadwal | Cloud Functions (callable/scheduled) | sistem | Lihat §10 |
| US-40 | Audit log otomatis | Firestore trigger `onWrite` | sistem | BR-04 |
| US-42–US-44 | Integrasi pihak ketiga | Cloud Functions + API eksternal | admin | Fase 7 |
| US-45 | Lihat audit log | `GET /api/v1/audit-logs?...` | admin | |
| US-46 | Kontrol akses endpoint | (middleware `requireRole`) | sistem | BR-17 |
| US-47 | CI | (GitHub Actions) | — | Bukan endpoint |
| US-48 | Monitoring error | (Cloud Logging/Error Reporting) | — | Bukan endpoint |
| US-49 | Migrasi/seed | `npm run seed` (script) | — | Bukan endpoint |
| US-50 | Kelola divisi | `GET/POST/PATCH /api/v1/divisions[/{id}]` | admin | BR-24 |

> **Catatan:** US-01, US-02, US-06 adalah operasi **Firebase client SDK** (bukan endpoint REST) agar
> kredensial tidak pernah menyentuh backend.

---

## 13. Non-Functional Requirements

| ID | Kategori | Requirement | Terkait |
|----|----------|-------------|---------|
| NFR-01 | Performa | p95 waktu respons API < 500 ms untuk endpoint baca umum; < 1,5 s untuk laporan ≤ 12 bulan | KS-04, §11 |
| NFR-02 | Performa | Dashboard ringkasan dimuat < 2 s pada data ≤ 10.000 item (via agregat `stockValue`) | US-31, BR-23 |
| NFR-03 | Keamanan | Semua endpoint kecuali login dilindungi verifikasi ID token + `requireRole` (BR-17) | KS-06, BR-25 |
| NFR-04 | Keamanan | Secret (service account, API key pihak ketiga) hanya di environment variable/Secret Manager, tidak di repo | US-48 |
| NFR-05 | Reliability | Ketersediaan target 99,5% per bulan; kegagalan Cloud Function di-retry + di-alert | KS-02, BR-04 |
| NFR-06 | Reliability | Penulisan stok bersifat atomik (Firestore transaction) — tidak ada stok parsial | BR-10, BR-21 |
| NFR-07 | Audit | `auditLogs` retensi ≥ 2 tahun dan **append-only** (tidak ada endpoint hapus) | KS-02, BR-02 |
| NFR-08 | Backup | Backup Firestore harian + retensi 30 hari; uji restore terdokumentasi | Fase 8 |
| NFR-09 | Observability | Log terstruktur + Error Reporting di produksi; alert untuk error rate & kegagalan trigger | US-48 |
| NFR-10 | Testing | Unit (Vitest) & komponen (Testing Library) coverage ≥ 70% untuk logika BR; e2e Playwright untuk alur kritis | KS-07 |
| NFR-11 | Portabilitas | Frontend responsif (desktop & tablet); Bahasa Indonesia sebagai bahasa UI utama | §5.3 |
| NFR-12 | Biaya | Batasi pembacaan Firestore via paginasi, agregat, dan batas rentang tanggal laporan | §11 |

---

## 14. Asumsi, Batasan & Risiko

### 14.1 Asumsi

- Satu gudang utama (single warehouse); multi-gudang di luar scope (§5.2).
- Pengguna memiliki koneksi internet dan browser modern; aplikasi web (bukan native).
- Firebase (Auth, Firestore, Storage, Functions) tersedia di region yang dipilih; zona waktu
  pengguna WIB (UTC+7) dengan penyimpanan UTC (BR-20).
- Jumlah item ≤ 10.000 dan pengguna aktif ≤ 50 pada fase awal, sehingga strategi denormalisasi &
  paginasi memadai.
- Supplier/divisi dikelola admin; tidak ada self-service untuk master data.

### 14.2 Batasan

- Firestore tidak mendukung unique constraint (diatasi `itemCodes`, BR-13), perbandingan antar-field
  (diatasi `isLowStock`, BR-11/BR-23), dan agregasi perkalian (diatasi `stockValue`, BR-23).
- Custom claims di-cache pada token → perubahan role/nonaktif butuh revoke + refresh (BR-17).
- Admin SDK melewati security rules → otorisasi terpusat di backend (BR-25).

### 14.3 Risiko & mitigasi

| Risiko | Dampak | Mitigasi |
|--------|--------|----------|
| Field denormalisasi tidak sinkron dengan `currentStock` | Alert/nilai stok salah | Hitung ulang dalam transaksi yang sama (BR-23) + verifikasi Cloud Function terjadwal |
| Trigger `auditLogs` gagal | Audit trail bolong (langgar KS-02) | Idempoten via `event.id`, retry bawaan, alert kegagalan (BR-04) |
| Race condition kode item | Duplikasi kode | Firestore transaction pada `itemCodes` (BR-13) |
| Token lama tetap valid setelah nonaktif | Akses tidak sah | Revoke refresh token + paksa refresh (BR-17) |
| Query laporan tanpa index | Error produksi / biaya tinggi | Composite index di §11 + batas rentang & paginasi |

---

*Dokumen ini bersifat hidup (living document) dan akan diperbarui seiring bertambahnya temuan di
fase implementasi. Setiap perubahan pada konvensi penamaan atau aturan bisnis harus disinkronkan ke
seluruh dokumen teknis terkait (ARCHITECTURE.md, DATA-MODEL.md, API.md, ROADMAP.md, SECURITY.md).*
