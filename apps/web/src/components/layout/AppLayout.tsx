import type { ReactNode } from 'react'
import Sidebar from './Sidebar'
import Header from './Header'
import './AppLayout.css'

type AppLayoutProps = {
  title: string
  subtitle?: string
  children: ReactNode
}

export default function AppLayout({ title, subtitle, children }: AppLayoutProps) {
  return (
    <div>
      <Sidebar />

      <div className="app__main">
        <Header title={title} subtitle={subtitle} />

        <main className="app__content">{children}</main>
      </div>
    </div>
  )
}