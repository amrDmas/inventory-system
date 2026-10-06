import './Sidebar.css'

/**
 * Sidebar — menu navigasi utama.
 *
 * Ini KOMPONEN pertama kita. Perhatikan:
 * - Namanya huruf besar (Sidebar) — itu wajib untuk komponen React.
 * - Ini fungsi biasa yang mengembalikan tampilan (JSX).
 * - Isinya masih statis dulu; nanti akan dihubungkan ke React Router
 *   supaya klik menu benar-benar pindah halaman.
 */

/** Menu yang akan muncul di sidebar, dikelompokkan per bagian. */
const menuSections = [
  {
    title: 'Utama',
    items: [
      { label: 'Dashboard', icon: '📊', path: '/', active: true },
      { label: 'Laporan', icon: '📈', path: '/reports', active: false },
    ],
  },
  {
    title: 'Inventaris',
    items: [
      { label: 'Barang', icon: '📦', path: '/items', active: false },
      { label: 'Kategori', icon: '🏷️', path: '/categories', active: false },
      { label: 'Supplier', icon: '🚚', path: '/suppliers', active: false },
    ],
  },
  {
    title: 'Transaksi',
    items: [
      { label: 'Barang Masuk', icon: '⬇️', path: '/stock-in', active: false },
      { label: 'Barang Keluar', icon: '⬆️', path: '/stock-out', active: false },
      { label: 'Permintaan', icon: '📝', path: '/requests', active: false },
    ],
  },
  {
    title: 'Sistem',
    items: [
      { label: 'Pengguna', icon: '👥', path: '/users', active: false },
      { label: 'Pengaturan', icon: '⚙️', path: '/settings', active: false },
    ],
  },
]

export default function Sidebar() {
  return (
    <aside className="sidebar">
      {/* Judul aplikasi */}
      <div className="sidebar__brand">
        <span className="sidebar__brand-icon">📦</span>
        <span>Inventaris Gudang</span>
      </div>

      {/* Daftar menu */}
      <nav className="sidebar__nav">
        {menuSections.map((section) => (
          <div key={section.title}>
            <div className="sidebar__section-title">{section.title}</div>
            {section.items.map((item) => (
              <a
                key={item.path}
                href={item.path}
                className={
                  'sidebar__link' + (item.active ? ' sidebar__link--active' : '')
                }
              >
                <span className="sidebar__link-icon">{item.icon}</span>
                <span>{item.label}</span>
              </a>
            ))}
          </div>
        ))}
      </nav>

      {/* Info user (masih statis; nanti diambil dari Firebase Auth) */}
      <div className="sidebar__footer">
        <div className="sidebar__user">
          <div className="sidebar__avatar">DA</div>
          <div className="sidebar__user-info">
            <div className="sidebar__user-name">Dimas Amirullah</div>
            <div className="sidebar__user-role">Administrator</div>
          </div>
        </div>
      </div>
    </aside>
  )
}
