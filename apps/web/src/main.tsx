import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './styles/global.css'
import App from './App.tsx'

/**
 * main.tsx — titik masuk aplikasi.
 *
 * Baris `createRoot(...).render(...)` artinya:
 * "ambil elemen <div id="root"> di index.html, lalu tampilkan <App /> di dalamnya."
 *
 * Ini hanya dijalankan SEKALI saat halaman dibuka.
 *
 * <StrictMode> bukan tampilan — ia alat bantu saat development yang
 * memberi peringatan kalau ada kode bermasalah. Di production ia tidak
 * berpengaruh. Kita biarkan aktif karena sangat membantu saat belajar.
 */
createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
