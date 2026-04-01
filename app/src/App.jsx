import { BrowserRouter, Routes, Route } from 'react-router-dom'
import ProtectedRoute from './components/ProtectedRoute'
import Layout from './components/Layout'
import Login from './pages/Login'
import ResetPassword from './pages/ResetPassword'
import Hub from './pages/Hub'
import Resources from './pages/Resources'
import Clients from './pages/Clients'
import Pipeline from './pages/Pipeline'
import Submissions from './pages/Submissions'
import Placeholder from './pages/Placeholder'
import './App.css'

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/reset-password" element={<ResetPassword />} />
        <Route element={<ProtectedRoute><Layout /></ProtectedRoute>}>
          <Route index element={<Hub />} />
          <Route path="resources" element={<Resources />} />
          <Route path="scheduling" element={<Placeholder />} />
          <Route path="pipeline" element={<Pipeline />} />
          <Route path="submissions" element={<Submissions />} />
          <Route path="clients" element={<Clients />} />
          <Route path="financials" element={<Placeholder />} />
          <Route path="compliance" element={<Placeholder />} />
        </Route>
      </Routes>
    </BrowserRouter>
  )
}
