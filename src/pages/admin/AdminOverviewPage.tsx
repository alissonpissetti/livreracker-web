import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { getAdminOverview } from '../../api/client';
import type { AdminOverview } from '../../types';

export function AdminOverviewPage() {
  const [data, setData] = useState<AdminOverview | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    getAdminOverview()
      .then(setData)
      .catch((err: Error) => setError(err.message));
  }, []);

  if (error) {
    return <div className="container page error-text">{error}</div>;
  }

  if (!data) {
    return <div className="container page">Carregando painel...</div>;
  }

  const cards = [
    { label: 'Contas de clientes', value: data.users_total, to: '/admin/contas' },
    {
      label: 'Equipamentos (slots)',
      value: data.subscriptions_total,
      to: '/admin/equipamentos',
    },
    {
      label: 'Assinaturas ativas',
      value: data.subscriptions_active,
      to: '/admin/equipamentos',
    },
    {
      label: 'Aguardando IMEI',
      value: data.subscriptions_pending_activation,
      to: '/admin/equipamentos',
    },
    {
      label: 'IMEIs com telemetria',
      value: data.devices_tracked,
      to: '/admin/equipamentos',
    },
    { label: 'IMEIs bloqueados', value: data.devices_blocked, to: '/admin/equipamentos' },
    { label: 'Pedidos', value: data.orders_total, to: '/admin/pedidos' },
    { label: 'Vouchers ativos', value: data.vouchers_active, to: '/admin/vouchers' },
  ];

  return (
    <div className="container page">
      <div className="page-head">
        <h1>Visão geral</h1>
        <p className="muted">Gestão interna da plataforma LIVRE TRACKER.</p>
      </div>

      <div className="stats-grid">
        {cards.map((card) => (
          <Link key={card.label} to={card.to} className="card stat-card">
            <span className="stat-value">{card.value}</span>
            <span className="stat-label">{card.label}</span>
          </Link>
        ))}
      </div>
    </div>
  );
}
