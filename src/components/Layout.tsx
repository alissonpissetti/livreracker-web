import { Link, Outlet, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

export function Layout() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  return (
    <div className="app">
      <header className="header">
        <div className="container header-inner">
          <Link to="/" className="brand">
            <span className="brand-mark">LT</span>
            <span>LIVRE TRACKER</span>
          </Link>
          <nav className="nav">
            <Link to="/loja">Equipamentos</Link>
            {user ? (
              <>
                <Link to="/conta">Minha conta</Link>
                <button
                  type="button"
                  className="link-button"
                  onClick={() => {
                    logout();
                    navigate('/');
                  }}
                >
                  Sair
                </button>
              </>
            ) : (
              <>
                <Link to="/entrar">Entrar</Link>
                <Link to="/cadastro" className="nav-cta">
                  Criar conta
                </Link>
              </>
            )}
          </nav>
        </div>
      </header>

      <main className="main">
        <Outlet />
      </main>

      <footer className="footer">
        <div className="container footer-inner">
          <p>© {new Date().getFullYear()} LIVRE TRACKER — rastreamento GPS inteligente</p>
          <p className="muted">LilyGO T-SIM7080G · NB-IoT / LTE-M · LBS + GPS</p>
        </div>
      </footer>
    </div>
  );
}
