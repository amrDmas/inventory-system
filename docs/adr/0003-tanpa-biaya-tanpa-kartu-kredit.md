# ADR 0003 — Menjalankan Seluruh Project Tanpa Biaya & Tanpa Kartu Kredit

- **Status:** Diterima
- **Tanggal:** 2026-10-16
- **Konteks:** Project ini adalah portfolio pribadi. Pemilik project **tidak memiliki
  kartu kredit** dan **tidak boleh ada pengeluaran**. Namun JD menuntut pengalaman
  dengan Firebase (Firestore, Authentication, Cloud Functions, Storage).

---

## Masalah

Firebase memiliki dua tingkatan:

| Plan | Biaya | Batasan |
|---|---|---|
| **Spark** | Gratis | **Tidak bisa** Cloud Functions & bucket Storage baru |
| **Blaze** | Bayar sesuai pakai | **Wajib kartu kredit** untuk daftar |

Dua fitur yang dibutuhkan project (automasi terjadwal & upload file) berada di balik
Blaze. Karena kartu kredit tidak tersedia, dua fitur itu perlu pengganti.

---

## Keputusan

**Tetap memakai Firebase untuk fitur yang tersedia di Spark.** Untuk dua fitur yang
memerlukan Blaze, gunakan layanan gratis tanpa kartu kredit yang **memberi pengalaman
setara** — bahkan menambah nilai portofolio.

### Pemetaan teknologi final

| Kebutuhan | Teknologi | Plan / Tier | Kartu kredit? |
|---|---|---|---|
| Frontend | React + TypeScript + Vite | — | Tidak |
| Hosting frontend | **Firebase Hosting** | Spark | Tidak |
| Database | **Firestore** | Spark | Tidak |
| Login & role | **Firebase Authentication** | Spark | Tidak |
| Backend API | Node.js + TypeScript | — | Tidak |
| Hosting API | **Render** (free tier) | Free | Tidak |
| Upload file | **Cloudinary** | Free | Tidak |
| Automasi terjadwal | **GitHub Actions (cron)** | Free (repo publik) | Tidak |
| CI/CD | **GitHub Actions** | Free (repo publik) | Tidak |
| Monitoring error | **Sentry** (free tier) | Free | Tidak |
| Logging | **Better Stack** / Cloud Logging (Spark) | Free | Tidak |

**Hasil: 3 dari 5 layanan Firebase tetap dipakai** (Firestore, Auth, Hosting), sehingga
pengalaman Firebase tetap nyata dan relevan dengan JD.

---

## Alasan tiap penggantian

### Cloud Functions → GitHub Actions (cron)

**Kebutuhan:** menjalankan tugas otomatis berkala — mis. tiap jam cek stok yang menipis
lalu kirim notifikasi; tiap hari menyusun laporan.

**Cloud Functions** melakukan ini dengan *scheduled trigger*. Penggantinya:

```yaml
# .github/workflows/cron-cek-stok.yml
on:
  schedule:
    - cron: '0 * * * *'        # tiap jam
jobs:
  cek-stok:
    runs-on: ubuntu-latest
    steps:
      - name: Panggil endpoint job
        run: |
          curl -X POST https://<api>/api/v1/jobs/cek-stok \
               -H "Authorization: Bearer ${{ secrets.JOB_TOKEN }}"
```

**Cara kerja:** GitHub (penjadwal) memanggil endpoint di REST API kita; **API kita yang
menjalankan logikanya**. Jadi logika bisnis tetap di kode kita, hanya pemicunya berbeda.

**Mengapa ini justru menguntungkan:**
- Gratis tanpa batas menit untuk repository publik
- Melatih **CI/CD + automasi** sekaligus (dua poin JD terpenuhi)
- Ini pola nyata di industri: *scheduled job* memanggil endpoint internal
- Endpoint job tetap bisa diuji secara manual (tidak "ajaib")

**Konsekuensi yang harus diingat:** endpoint job **wajib** dilindungi token rahasia
(disimpan di GitHub Secrets), dan **harus idempoten** — kalau dipanggil dua kali,
hasilnya tidak boleh dobel. Ini justru melatih prinsip keamanan & reliabilitas.

### Firebase Storage → Cloudinary

**Kebutuhan:** menyimpan foto barang & lampiran nota.

**Cloudinary** free tier: 25 GB penyimpanan + transformasi gambar (resize, compress).

**Mengapa ini justru menguntungkan:**
- JD meminta *"integrasi dengan layanan pihak ketiga"* → ini contoh nyata
- Cloudinary bisa resize/optimasi gambar otomatis (Firebase Storage tidak)
- Lebih hemat kuota: gambar di-resize di sisi Cloudinary, bukan diunduh besar-besaran

### Cloud Run → Render (free tier)

**Kebutuhan:** menjalankan REST API Node.js.

**Render free tier** tanpa kartu kredit. Konsekuensi: instance "tidur" setelah ~15 menit
idle, request pertama setelah tidur lambat (~30 detik).

**Mitigasi:** GitHub Actions terjadwal memanggil endpoint `/health` tiap 10 menit pada
jam kerja, sehingga server tetap hangat saat didemokan.

---

## Prinsip yang dipegang: Vendor-Agnostic

Agar penggantian tidak mengunci project, **semua akses ke layanan eksternal melewati
lapisan abstraksi**. Kode aplikasi tidak boleh tahu penyedianya siapa.

```
Kode aplikasi
     ↓
[ StorageProvider ]   ← antarmuka (interface)
     ↓
CloudinaryProvider  |  FirebaseStorageProvider   ← implementasi (bisa ditukar)
```

**Akibatnya:** bila suatu saat kartu kredit tersedia, migrasi ke Firebase Storage
cukup dengan menambah satu implementasi baru — **tanpa mengubah kode aplikasi**.

Pola yang sama diterapkan untuk notifikasi (email/WhatsApp) dan penyimpanan kredensial.

---

## Konsekuensi

### Positif
- Project dapat diselesaikan **sepenuhnya tanpa biaya & tanpa kartu kredit**
- Pengalaman Firebase tetap nyata (Firestore, Auth, Hosting)
- Menambah pengalaman **integrasi pihak ketiga** (Cloudinary) — poin JD
- Menambah pengalaman **automasi & CI/CD** (GitHub Actions) — poin JD
- Melatih **desain berlapis** (abstraction layer) — keterampilan tingkat lanjut

### Negatif / risiko
- Server API "tidur" di free tier → request pertama lambat
- Free tier memiliki batas (Firestore 1 GiB; Render jam bulanan; Cloudinary 25 GB)
- Perlu lebih banyak konfigurasi rahasia (token GitHub, kunci Cloudinary)
- Bila project tumbuh melebihi free tier, perlu penyesuaian

### Mitigasi
- Firestore: retensi & pengarsipan `auditLogs` (lihat `DATA-MODEL.md` §10.3)
- Render: ping berkala via GitHub Actions
- Rahasia: semua kunci di `.env` (lokal) dan GitHub Secrets (CI) — **tidak pernah** ke Git

---

## Pemicu untuk meninjau ulang keputusan ini

Keputusan ini ditinjau ulang bila salah satu terjadi:
1. Kartu kredit tersedia → pertimbangkan Blaze dengan **budget cap** (mis. $1)
2. Project dipakai produksi nyata dengan volume tinggi
3. Free tier terlampaui secara rutin

---

## Catatan untuk interview

Bila ditanya *"kenapa tidak memakai Firebase Storage / Cloud Functions?"*:

> *"Karena keduanya memerlukan Blaze plan yang mengharuskan kartu kredit, saya memakai
> Cloudinary untuk penyimpanan dan GitHub Actions untuk automasi terjadwal. Saya
> merancang lapisan abstraksi (StorageProvider) sehingga migrasi ke Firebase Storage
> hanya perlu menambah satu implementasi baru tanpa mengubah kode aplikasi."*

Jawaban ini menunjukkan **kesadaran biaya, kemampuan beradaptasi, dan desain berlapis** —
lebih kuat daripada sekadar "saya pakai Firebase".

---

## Referensi

- [Firebase Pricing — Spark vs Blaze](https://firebase.google.com/pricing)
- [Firestore Quotas & Free Tier](https://firebase.google.com/docs/firestore/quotas)
- [GitHub Actions — Scheduled workflows](https://docs.github.com/en/actions/using-workflows/events-that-trigger-workflows#schedule)
- [Cloudinary Free Tier](https://cloudinary.com/pricing)
- [Render Free Tier](https://render.com/pricing)
