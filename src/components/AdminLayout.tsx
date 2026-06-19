import { Link, Outlet, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { SiteNav, type SiteNavItem } from './SiteNav';

export function AdminLayout() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  const navItems: SiteNavItem[] = [
    { type: 'link', to: '/admin', label: 'Visão geral' },
    { type: 'link', to: '/admin/contas', label: 'Contas' },
    { type: 'link', to: '/admin/equipamentos', label: 'Equipamentos' },
    { type: 'link', to: '/admin/pedidos', label: 'Pedidos' },
    { type: 'link', to: '/admin/vouchers', label: 'Vouchers' },
    {
      type: 'button',
      label: 'Sair',
      onClick: () => {
        logout();
        navigate('/entrar');
      },
    },
  ];

  return (
    <div className="app admin-app">
      <header className="header admin-header">
        <div className="container header-inner">
          <Link to="/admin" className="brand">
            <span className="brand-mark admin-mark">AD</span>
            <span className="brand-text">LIVRE TRACKER Admin</span>
          </Link>
          <SiteNav
            items={navItems}
            trailing={user?.email ? <span className="muted admin-user">{user.email}</span> : null}
          />
        </div>
      </header>

      <main className="main">
        <Outlet />
      </main>
    </div>
  );
}
