import Sidebar from './components/layout/Sidebar'
import './App.css'

export default function App() {
  return (
    <div>
      <Sidebar />

      <main className="app__content">
        <h1>Sistem Inventaris Gudang</h1>
        <p>Kelola stok, transaksi, dan laporan gudang dalam satu tempat.</p>
      </main>
    </div>
  )
}