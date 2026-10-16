import { Link, useLocation } from 'react-router-dom'
import './Sidebar.css'

const menu = [
  { label: 'Dashboard', icon: '📊', path: '/' },
  { label: 'Barang', icon: '📦', path: '/items' },
  { label: 'Kategori', icon: '🏷️', path: '/categories' },
  { label: 'Supplier', icon: '🚚', path: '/suppliers' },
  { label: 'Barang Masuk', icon: '⬇️', path: '/stock-in' },
  { label: 'Barang Keluar', icon: '⬆️', path: '/stock-out' },
  { label: 'Permintaan', icon: '📝', path: '/requests' },
  { label: 'Laporan', icon: '📈', path: '/reports' },
  { label: 'Pengguna', icon: '👥', path: '/users' },
  { label: 'Pengaturan', icon: '⚙️', path: '/settings' },
]

export default function Sidebar() {
  const { pathname } = useLocation()

  return (
    <aside className="sidebar">
      <div className="sidebar__brand">
        <span>📦</span>
        <span>Inventaris Gudang</span>
      </div>

      <nav>
        {menu.map((item) => (
          <Link
            key={item.path}
            to={item.path}
            className={
              'sidebar__link' +
              (pathname === item.path ? ' sidebar__link--active' : '')
            }
          >
            {item.icon} {item.label}
          </Link>
        ))}
      </nav>
    </aside>
  )
}