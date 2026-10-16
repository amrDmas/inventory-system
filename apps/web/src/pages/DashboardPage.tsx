import AppLayout from '../components/layout/AppLayout.tsx'

export default function DashboardPage() {
  return (
    <AppLayout
      title="Dashboard"
      subtitle="Ringkasan kondisi inventaris gudang"
    >
      <h2>Selamat datang</h2>
      <p>
        Halaman ini akan menampilkan ringkasan: total barang, nilai stok, barang
        yang menipis, dan aktivitas terbaru. Datanya diambil dari API pada Fase 5.
      </p>
    </AppLayout>
  )
}
