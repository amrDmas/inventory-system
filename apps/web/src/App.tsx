import { Routes, Route } from 'react-router-dom'
import DashboardPage from './pages/DashboardPage'
import ItemsPage from './pages/ItemsPage'
import CategoriesPage from './pages/CategoriesPage'
import SuppliersPage from './pages/SuppliersPage'
import StockInPage from './pages/StockInPage'
import StockOutPage from './pages/StockOutPage'
import RequestsPage from './pages/RequestsPage'
import ReportsPage from './pages/ReportsPage'
import UsersPage from './pages/UsersPage'
import SettingsPage from './pages/SettingsPage'

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<DashboardPage />} />
      <Route path="/items" element={<ItemsPage />} />
      <Route path="/categories" element={<CategoriesPage />} />
      <Route path="/suppliers" element={<SuppliersPage />} />
      <Route path="/stock-in" element={<StockInPage />} />
      <Route path="/stock-out" element={<StockOutPage />} />
      <Route path="/requests" element={<RequestsPage />} />
      <Route path="/reports" element={<ReportsPage />} />
      <Route path="/users" element={<UsersPage />} />
      <Route path="/settings" element={<SettingsPage />} />
    </Routes>
  )
}