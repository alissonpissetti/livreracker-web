import { Link } from 'react-router-dom';
import { ProductPrice } from '../components/ProductPrice';
import { useAuth } from '../context/AuthContext';

export function HomePage() {
  const { user } = useAuth();

  return (
    <section className="hero">
      <div className="container hero-grid">
        <div>
          <p className="eyebrow">Rastreamento simples para veículos e frotas</p>
          <h1>Sua conta, seus kits, tudo em um só lugar</h1>
          <p className="lead">
            Compre o kit rastreador LT com 12 meses de uso incluídos — sem
            mensalidade no 1º ano. A partir do 2º ano, renove em planos de 6 ou
            12 meses por R$ 25,90/mês.
          </p>
          <ProductPrice />
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
            <li>Compre 1 ou mais kits rastreador LT</li>
            <li>Acompanhe os pedidos em Minha conta</li>
            <li>Ao receber, ative o identificador de cada equipamento</li>
            <li>
              Use o 1º ano sem mensalidade; depois, renove em 6 ou 12 meses por
              R$ 25,90/mês
            </li>
          </ol>
        </div>
      </div>
    </section>
  );
}
