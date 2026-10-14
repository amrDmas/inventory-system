import './Header.css'

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
