import DashboardPage from './pages/DashboardPage'

/**
 * App — komponen paling atas.
 *
 * Sekarang isinya cuma satu halaman. Nanti (Fase 1) di sini akan dipasang
 * React Router supaya bisa berpindah halaman, dan proteksi login.
 *
 * Kenapa dipisah dari main.tsx?
 * - main.tsx  : menyiapkan React dan menempelkannya ke HTML (sekali seumur aplikasi)
 * - App.tsx   : menentukan "aplikasi ini tampilannya seperti apa"
 * Pemisahan ini membuat keduanya mudah diuji dan diubah.
 */
export default function App() {
  return <DashboardPage />
}
