import './Header.css'

/**
 * Header — bar atas halaman.
 *
 * Menerima `title` dan `subtitle` dari luar (dari halaman yang memakainya).
 * Nilai yang dikirim dari luar ke komponen seperti ini disebut PROPS.
 *
 * Props = cara komponen "berkomunikasi" — sama seperti parameter di fungsi.
 * Bedanya: props berisi data untuk tampilan, bukan data untuk perhitungan.
 */

type HeaderProps = {
  title: string
  subtitle?: string
}

export default function Header({ title, subtitle }: HeaderProps) {
  return (
    <header className="header">
      <div>
        <div className="header__title">{title}</div>
        {subtitle && <div className="header__subtitle">{subtitle}</div>}
      </div>

      <div className="header__actions">
        <button className="header__icon-button" type="button" title="Notifikasi">
          🔔
        </button>
        <button className="header__icon-button" type="button" title="Bantuan">
          ❓
        </button>
      </div>
    </header>
  )
}
