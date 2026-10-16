import AppLayout from '../components/layout/AppLayout.tsx'

export default function RequestsPage() {
  return (
    <AppLayout
      title="Permintaan Barang"
      subtitle="Pengajuan dan persetujuan permintaan"
    >
      <p>
        Halaman ini untuk mengajukan permintaan barang dan memantau statusnya:
        draft, diajukan, disetujui, ditolak, atau selesai (Fase 4).
      </p>
    </AppLayout>
  )
}
