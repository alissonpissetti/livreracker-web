import { useEffect, useState } from 'react';
import { getAdminOrders } from '../../api/client';
import type { AdminOrder } from '../../types';

export function AdminOrdersPage() {
  const [orders, setOrders] = useState<AdminOrder[]>([]);
  const [error, setError] = useState('');

  useEffect(() => {
    getAdminOrders()
      .then((data) => setOrders(data.orders))
      .catch((err: Error) => setError(err.message));
  }, []);

  return (
    <div className="container page">
      <div className="page-head">
        <h1>Pedidos</h1>
        <p className="muted">Histórico de compras de todos os clientes.</p>
      </div>

      {error ? <p className="error-text">{error}</p> : null}

      <div className="stack">
        {orders.map((order) => (
          <article key={order.id} className="card order-card">
            <div className="subscription-head">
              <div>
                <h2>
                  {order.owner_name} — #{order.id.slice(0, 8)}
                </h2>
                <p className="muted">
                  {order.customer_email} ·{' '}
                  {new Date(order.created_at).toLocaleString('pt-BR')}
                  {order.voucher_code ? ` · Voucher ${order.voucher_code}` : ''}
                </p>
              </div>
              <div className="order-total-block">
                {order.discount_label ? (
                  <span className="muted order-discount">-{order.discount_label}</span>
                ) : null}
                <strong>{order.total_label}</strong>
              </div>
            </div>
            <ul className="summary-list">
              {order.items.map((item) => (
                <li key={`${order.id}-${item.product_name}`}>
                  <span>
                    {item.quantity}x {item.product_name}
                  </span>
                  <strong>{item.line_total_label}</strong>
                </li>
              ))}
            </ul>
          </article>
        ))}
      </div>

      {orders.length === 0 ? <p className="muted">Nenhum pedido.</p> : null}
    </div>
  );
}
