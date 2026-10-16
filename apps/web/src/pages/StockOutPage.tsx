import AppLayout from '../components/layout/AppLayout.tsx'

export default function StockOutPage() {
  return (
    <AppLayout
      title="Barang Keluar"
      subtitle="Catat barang keluar untuk divisi"
    >
      <p>
        Halaman ini untuk mencatat barang keluar. Sistem akan menolak transaksi
        yang membuat stok menjadi negatif (Fase 3).
      </p>
    </AppLayout>
  )
}
