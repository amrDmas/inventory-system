import AppLayout from '../components/layout/AppLayout'
import './DashboardPage.css'

/**
 * DashboardPage — halaman pertama aplikasi.
 *
 * Angka-angka di bawah masih DUMMY (ditulis langsung di kode).
 * Nanti (Fase 5) angka ini diambil dari API — tapi bentuk tampilannya
 * sudah kita tetapkan sekarang, supaya arahnya jelas.
 */

/** Data ringkasan. Sementara dummy; nanti dari API. */
const summary = [
  { label: 'Total Barang', value: '0', hint: 'jenis barang terdaftar', tone: '' },
  { label: 'Nilai Stok', value: 'Rp 0', hint: 'estimasi nilai persediaan', tone: '' },
  {
    label: 'Stok Menipis',
    value: '0',
    hint: 'barang di bawah batas minimum',
    tone: 'warning',
  },
  {
    label: 'Stok Habis',
    value: '0',
    hint: 'barang dengan stok nol',
    tone: 'danger',
  },
]

export default function DashboardPage() {
  return (
    <AppLayout
      title="Dashboard"
      subtitle="Ringkasan kondisi inventaris gudang"
    >
      {/* --- Kartu ringkasan --- */}
      <section className="stat-grid">
        {summary.map((item) => (
          <div className="stat-card" key={item.label}>
            <div className="stat-card__label">{item.label}</div>
            <div
              className={
                'stat-card__value' +
                (item.tone ? ` stat-card__value--${item.tone}` : '')
              }
            >
              {item.value}
            </div>
            <div className="stat-card__hint">{item.hint}</div>
          </div>
        ))}
      </section>

      {/* --- Panel aktivitas --- */}
      <section className="panel">
        <div className="panel__header">
          <div className="panel__title">Aktivitas Terbaru</div>
        </div>
        <div className="panel__body">
          <div className="placeholder">
            <span className="placeholder__icon">📋</span>
            <div className="placeholder__title">Belum ada aktivitas</div>
            <div className="placeholder__text">
              Riwayat transaksi stok akan muncul di sini setelah fitur transaksi
              dibuat (Fase 3). Setiap barang masuk dan keluar akan tercatat
              beserta pelakunya.
            </div>
          </div>
        </div>
      </section>

      {/* --- Panel peringatan --- */}
      <section className="panel">
        <div className="panel__header">
          <div className="panel__title">Barang Perlu Perhatian</div>
        </div>
        <div className="panel__body">
          <div className="placeholder">
            <span className="placeholder__icon">⚠️</span>
            <div className="placeholder__title">Belum ada data</div>
            <div className="placeholder__text">
              Daftar barang dengan stok di bawah minimum akan muncul di sini.
              Peringatan otomatis dibuat pada Fase 6.
            </div>
          </div>
        </div>
      </section>
    </AppLayout>
  )
}
