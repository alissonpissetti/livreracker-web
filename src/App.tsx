import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { AdminLayout } from './components/AdminLayout';
import { AdminRoute } from './components/AdminRoute';
import { Layout } from './components/Layout';
import { ProtectedRoute } from './components/ProtectedRoute';
import { AuthProvider } from './context/AuthContext';
import { AccountPage } from './pages/AccountPage';
import { DeviceTrackingPage } from './pages/DeviceTrackingPage';
import { CheckoutPage } from './pages/CheckoutPage';
import { HomePage } from './pages/HomePage';
import { LoginPage } from './pages/LoginPage';
import { RecoverPasswordPage } from './pages/RecoverPasswordPage';
import { PublicTrackingPage } from './pages/PublicTrackingPage';
import { RegisterPage } from './pages/RegisterPage';
import { ShopPage } from './pages/ShopPage';
import { AdminDevicesPage } from './pages/admin/AdminDevicesPage';
import { AdminOrdersPage } from './pages/admin/AdminOrdersPage';
import { AdminOverviewPage } from './pages/admin/AdminOverviewPage';
import { AdminUserDetailPage } from './pages/admin/AdminUserDetailPage';
import { AdminUsersPage } from './pages/admin/AdminUsersPage';
import { AdminVouchersPage } from './pages/admin/AdminVouchersPage';

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route element={<Layout />}>
            <Route index element={<HomePage />} />
            <Route path="loja" element={<ShopPage />} />
            <Route path="acompanhar/:token" element={<PublicTrackingPage />} />
            <Route path="entrar" element={<LoginPage />} />
            <Route path="recuperar-senha" element={<RecoverPasswordPage />} />
            <Route path="cadastro" element={<RegisterPage />} />
            <Route
              path="checkout"
              element={
                <ProtectedRoute>
                  <CheckoutPage />
                </ProtectedRoute>
              }
            />
            <Route
              path="conta"
              element={
                <ProtectedRoute>
                  <AccountPage />
                </ProtectedRoute>
              }
            />
            <Route
              path="conta/rastreadores/:deviceId"
              element={
                <ProtectedRoute>
                  <DeviceTrackingPage />
                </ProtectedRoute>
              }
            />
            <Route path="painel" element={<Navigate to="/conta" replace />} />
          </Route>

          <Route
            path="admin"
            element={
              <AdminRoute>
                <AdminLayout />
              </AdminRoute>
            }
          >
            <Route index element={<AdminOverviewPage />} />
            <Route path="contas" element={<AdminUsersPage />} />
            <Route path="contas/:userId" element={<AdminUserDetailPage />} />
            <Route path="equipamentos" element={<AdminDevicesPage />} />
            <Route path="pedidos" element={<AdminOrdersPage />} />
            <Route path="vouchers" element={<AdminVouchersPage />} />
          </Route>

          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}
