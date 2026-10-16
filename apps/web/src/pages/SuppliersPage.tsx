import AppLayout from '../components/layout/AppLayout.tsx'

export default function SuppliersPage() {
  return (
    <AppLayout title="Supplier" subtitle="Data pemasok barang">
      <p>
        Halaman ini akan menyimpan data pemasok: nama, kontak, dan alamat.
        Setiap barang masuk akan tercatat dari supplier mana (Fase 2).
      </p>
    </AppLayout>
  )
}
