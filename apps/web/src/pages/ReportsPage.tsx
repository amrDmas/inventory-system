import AppLayout from '../components/layout/AppLayout.tsx'

export default function ReportsPage() {
  return (
    <AppLayout title="Laporan" subtitle="Laporan stok dan transaksi">
      <p>
        Halaman ini akan menampilkan laporan stok, mutasi barang, dan barang
        yang paling cepat habis. Bisa diekspor ke Excel/PDF (Fase 5).
      </p>
    </AppLayout>
  )
}
