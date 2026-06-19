import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { getProducts } from '../api/client';
import { ProductPrice } from '../components/ProductPrice';
import { useAuth } from '../context/AuthContext';
import type { Product } from '../types';

export function ShopPage() {
  const { user } = useAuth();
  const [products, setProducts] = useState<Product[]>([]);
  const [quantities, setQuantities] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    getProducts()
      .then((items) => {
        setProducts(items);
        setQuantities(
          Object.fromEntries(
            items.map((item) => [item.slug, item.type === 'hardware' ? 1 : 0]),
          ),
        );
      })
      .catch((err: Error) => setError(err.message))
      .finally(() => setLoading(false));
  }, []);

  const cartItems = useMemo(
    () =>
      products
        .map((product) => ({
          product_slug: product.slug,
          quantity: quantities[product.slug] ?? 0,
        }))
        .filter((item) => item.quantity > 0),
    [products, quantities],
  );

  const totalCents = useMemo(
    () =>
      products.reduce(
        (sum, product) =>
          sum + product.price_cents * (quantities[product.slug] ?? 0),
        0,
      ),
    [products, quantities],
  );

  const hardwareCount = products
    .filter((p) => p.type === 'hardware')
    .reduce((sum, p) => sum + (quantities[p.slug] ?? 0), 0);

  const totalLabel = (totalCents / 100).toLocaleString('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  });

  if (loading) {
    return <div className="container page">Carregando produtos...</div>;
  }

  return (
    <div className="container page">
      <div className="page-head">
        <h1>Loja</h1>
        <p>
          Cada kit rastreador LT gera um slot na sua conta. Compre quantas unidades
          precisar.
        </p>
      </div>

      {error ? <p className="error-text">{error}</p> : null}

      <div className="shop-grid">
        {products.map((product) => (
          <article key={product.slug} className="card product-card selected">
            <div className="product-type">
              {product.type === 'hardware' ? 'Equipamento' : 'Assinatura extra'}
            </div>
            <h2>{product.name}</h2>
            <p>{product.description}</p>
            <ProductPrice product={product} />
            <label>
              Quantidade
              <input
                type="number"
                min={0}
                max={99}
                value={quantities[product.slug] ?? 0}
                onChange={(event) =>
                  setQuantities((current) => ({
                    ...current,
                    [product.slug]: Math.max(0, Number(event.target.value)),
                  }))
                }
              />
            </label>
          </article>
        ))}
      </div>

      <div className="card checkout-bar">
        <div>
          <strong>Total:</strong> {totalLabel}
          <p className="muted">
            {hardwareCount} rastreador(es) · cada um vira um equipamento na conta
          </p>
        </div>
        {user ? (
          <Link
            className="btn btn-primary"
            to="/checkout"
            state={{ items: cartItems }}
            onClick={(event) => {
              if (hardwareCount === 0) {
                event.preventDefault();
                setError('Adicione ao menos um kit de rastreador');
              }
            }}
          >
            Finalizar pedido
          </Link>
        ) : (
          <Link className="btn btn-primary" to="/cadastro">
            Criar conta para comprar
          </Link>
        )}
      </div>
    </div>
  );
}
