import './Sidebar.css'

const menu = [
  { label: 'Dashboard', icon: '📊', active: true },
  { label: 'Barang', icon: '📦', active: false },
  { label: 'Kategori', icon: '🏷️', active: false },
  { label: 'Supplier', icon: '🚚', active: false },
  { label: 'Barang Masuk', icon: '⬇️', active: false },
  { label: 'Barang Keluar', icon: '⬆️', active: false },
  { label: 'Permintaan', icon: '📝', active: false },
  { label: 'Laporan', icon: '📈', active: false },
]

export default function Sidebar() {
  return (
    <aside className="sidebar">
      <div className="sidebar__brand">
        <span>📦</span>
        <span>Inventaris Gudang</span>
      </div>

      <nav>
        {menu.map((item) => (
          <a
            key={item.label}
            href="#"
            className={
              'sidebar__link' + (item.active ? ' sidebar__link--active' : '')
            }
          >
            {item.icon} {item.label}
          </a>
        ))}
      </nav>
    </aside>
  )
}