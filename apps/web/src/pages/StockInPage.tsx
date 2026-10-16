import AppLayout from '../components/layout/AppLayout.tsx'

export default function StockInPage() {
  return (
    <AppLayout
      title="Barang Masuk"
      subtitle="Catat barang masuk dari supplier"
    >
      <p>
        Halaman ini untuk mencatat barang masuk. Setiap pencatatan akan menambah
        stok dan menyimpan riwayat siapa yang mencatat (Fase 3).
      </p>
    </AppLayout>
  )
}
