import AppLayout from '../components/layout/AppLayout.tsx'

export default function ItemsPage() {
  return (
    <AppLayout title="Daftar Barang" subtitle="Kelola data barang inventaris">
      <p>
        Halaman ini akan menampilkan daftar barang beserta stok, kategori, dan
        satuan. Dilengkapi pencarian, filter, dan pagination (Fase 2).
      </p>
    </AppLayout>
  )
}
