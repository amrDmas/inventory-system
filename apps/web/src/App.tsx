import Sidebar from './components/layout/Sidebar'
import Header from './components/layout/Header'
import './App.css'

export default function App() {
  return (
    <div>
      <Sidebar />

      <div className="app__main">
        <Header
          title="Dashboard"
          subtitle="Ringkasan kondisi inventaris gudang"
        />

        <main className="app__content">
          <h1>Sistem Inventaris Gudang</h1>
          <p>Kelola stok, transaksi, dan laporan gudang dalam satu tempat.</p>
        </main>
      </div>
    </div>
  )
}
