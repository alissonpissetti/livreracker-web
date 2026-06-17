import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { getAdminUserDetail } from '../../api/client';
import type { AdminUserDetail } from '../../types';

export function AdminUserDetailPage() {
  const { userId } = useParams();
  const [user, setUser] = useState<AdminUserDetail | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!userId) return;
    getAdminUserDetail(userId)
      .then(setUser)
      .catch((err: Error) => setError(err.message));
  }, [userId]);

  if (error) {
    return <div className="container page error-text">{error}</div>;
  }

  if (!user) {
    return <div className="container page">Carregando conta...</div>;
  }

  return (
    <div className="container page">
      <div className="page-head">
        <Link to="/admin/contas" className="muted">
          ← Voltar às contas
        </Link>
        <h1>{user.name}</h1>
        <p className="muted">{user.email}</p>
      </div>

      <section className="account-section">
        <h2>Equipamentos desta conta</h2>
        <div className="stack">
          {user.devices.map((device) => (
            <article key={device.subscription_id} className="card subscription-card">
              <div className="subscription-head">
                <div>
                  <h2>{device.label ?? 'Rastreador'}</h2>
                  <p className="muted">
                    IMEI: {device.device_id ?? 'Não ativado'}
                  </p>
                </div>
                <span className={device.is_active ? 'badge badge-success' : 'badge badge-muted'}>
                  {device.awaiting_activation
                    ? 'Aguardando IMEI'
                    : device.is_active
                      ? 'Ativo'
                      : device.status}
                </span>
              </div>
              <dl className="meta-grid">
                <div>
                  <dt>Válido até</dt>
                  <dd>
                    {new Date(device.current_period_end).toLocaleString('pt-BR')}
                  </dd>
                </div>
                <div>
                  <dt>Bloqueado</dt>
                  <dd>{device.blocked ? 'Sim' : 'Não'}</dd>
                </div>
              </dl>
            </article>
          ))}
        </div>
      </section>

      <section className="account-section">
        <h2>Pedidos</h2>
        <div className="stack">
          {user.orders.map((order) => (
            <article key={order.id} className="card order-card">
              <div className="subscription-head">
                <div>
                  <h2>Pedido #{order.id.slice(0, 8)}</h2>
                  <p className="muted">
                    {new Date(order.created_at).toLocaleString('pt-BR')}
                  </p>
                </div>
                <strong>{order.total_label}</strong>
              </div>
              <ul className="summary-list">
                {order.items.map((item) => (
                  <li key={`${order.id}-${item.product_name}`}>
                    <span>
                      {item.quantity}x {item.product_name}
                    </span>
                  </li>
                ))}
              </ul>
            </article>
          ))}
        </div>
      </section>
    </div>
  );
}
