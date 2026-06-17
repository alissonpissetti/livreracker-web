import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

export function HomePage() {
  const { user } = useAuth();

  return (
    <section className="hero">
      <div className="container hero-grid">
        <div>
          <p className="eyebrow">Rastreamento para veículos e frotas</p>
          <h1>Crie sua conta, compre rastreadores e ative cada IMEI</h1>
          <p className="lead">
            Uma conta para todos os seus equipamentos: pedidos, assinaturas e
            ativação do device_id quando o kit chegar.
          </p>
          <div className="hero-actions">
            {user ? (
              <>
                <Link className="btn btn-primary" to="/loja">
                  Comprar equipamentos
                </Link>
                <Link className="btn btn-secondary" to="/conta">
                  Minha conta
                </Link>
              </>
            ) : (
              <>
                <Link className="btn btn-primary" to="/cadastro">
                  Criar conta grátis
                </Link>
                <Link className="btn btn-secondary" to="/entrar">
                  Já tenho conta
                </Link>
              </>
            )}
          </div>
        </div>

        <div className="hero-card">
          <h3>Fluxo na conta</h3>
          <ol className="steps">
            <li>Crie sua conta no LIVRE TRACKER</li>
            <li>Compre 1 ou mais kits T-SIM7080G</li>
            <li>Acompanhe os pedidos em Minha conta</li>
            <li>Ao receber, ative o IMEI em cada equipamento</li>
            <li>Renove a assinatura para manter o rastreio ativo</li>
          </ol>
        </div>
      </div>
    </section>
  );
}
