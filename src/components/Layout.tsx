import { Link, Outlet, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { SiteNav, type SiteNavItem } from './SiteNav';

export function Layout() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  const navItems: SiteNavItem[] = user
    ? [
        { type: 'link', to: '/loja', label: 'Equipamentos' },
        { type: 'link', to: '/conta', label: 'Minha conta' },
        {
          type: 'button',
          label: 'Sair',
          onClick: () => {
            logout();
            navigate('/');
          },
        },
      ]
    : [
        { type: 'link', to: '/loja', label: 'Equipamentos' },
        { type: 'link', to: '/entrar', label: 'Entrar' },
        { type: 'link', to: '/cadastro', label: 'Criar conta', className: 'nav-cta' },
      ];

  return (
    <div className="app">
      <header className="header">
        <div className="container header-inner">
          <Link to="/" className="brand">
            <span className="brand-mark">LT</span>
            <span className="brand-text">LIVRE TRACKER</span>
          </Link>
          <SiteNav items={navItems} />
        </div>
      </header>

      <main className="main">
        <Outlet />
      </main>

      <footer className="footer">
        <div className="container footer-inner">
          <p>© {new Date().getFullYear()} LIVRE TRACKER — rastreamento GPS inteligente</p>
        </div>
      </footer>
    </div>
  );
}
