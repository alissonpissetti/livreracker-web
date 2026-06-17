import { Link, Outlet, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

export function AdminLayout() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  return (
    <div className="app admin-app">
      <header className="header admin-header">
        <div className="container header-inner">
          <Link to="/admin" className="brand">
            <span className="brand-mark admin-mark">AD</span>
            <span>LIVRE TRACKER Admin</span>
          </Link>
          <nav className="nav">
            <Link to="/admin">Visão geral</Link>
            <Link to="/admin/contas">Contas</Link>
            <Link to="/admin/equipamentos">Equipamentos</Link>
            <Link to="/admin/pedidos">Pedidos</Link>
            <Link to="/admin/vouchers">Vouchers</Link>
            <span className="muted admin-user">{user?.email}</span>
            <button
              type="button"
              className="link-button"
              onClick={() => {
                logout();
                navigate('/entrar');
              }}
            >
              Sair
            </button>
          </nav>
        </div>
      </header>

      <main className="main">
        <Outlet />
      </main>
    </div>
  );
}
