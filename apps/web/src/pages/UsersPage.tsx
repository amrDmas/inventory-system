import AppLayout from '../components/layout/AppLayout.tsx'

export default function UsersPage() {
  return (
    <AppLayout title="Pengguna" subtitle="Kelola akun dan hak akses">
      <p>
        Halaman ini untuk mengelola akun pengguna dan perannya: admin, staff,
        dan viewer. Hanya admin yang bisa mengakses halaman ini (Fase 1).
      </p>
    </AppLayout>
  )
}
