import type { ReactNode } from 'react'
import Sidebar from './Sidebar'
import Header from './Header'
import './AppLayout.css'

/**
 * AppLayout — kerangka utama semua halaman.
 *
 * Susunannya: Sidebar (kiri) + Header (atas) + isi halaman (tengah).
 *
 * Konsep penting: `children`
 * `children` adalah isi yang ditulis DI ANTARA tag pembuka dan penutup:
 *
 *   <AppLayout title="Dashboard">
 *     <p>Isi halaman ada di sini</p>   <-- ini children
 *   </AppLayout>
 *
 * Jadi AppLayout menyediakan "bingkai"-nya, dan tiap halaman mengisi isinya.
 * Ini cara React menghindari penulisan sidebar & header berulang di
 * setiap halaman (prinsip DRY — Don't Repeat Yourself).
 */

type AppLayoutProps = {
  title: string
  subtitle?: string
  children: ReactNode
}

export default function AppLayout({ title, subtitle, children }: AppLayoutProps) {
  return (
    <div className="app-layout">
      <Sidebar />

      <div className="app-layout__main">
        <Header title={title} subtitle={subtitle} />

        <main className="app-layout__content">
          <div className="app-layout__container">{children}</div>
        </main>
      </div>
    </div>
  )
}
