import AppLayout from '../components/layout/AppLayout.tsx'

export default function SettingsPage() {
  return (
    <AppLayout title="Pengaturan" subtitle="Konfigurasi sistem">
      <p>
        Halaman ini untuk pengaturan sistem, misalnya data perusahaan, batas
        minimum stok default, dan preferensi notifikasi (Fase 6).
      </p>
    </AppLayout>
  )
}
