import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { activateDevice, getDevices, getOrders } from '../api/client';
import { AccountDeviceCard } from '../components/AccountDeviceCard';
import { AccountProfileSection } from '../components/AccountProfileSection';
import { useAuth } from '../context/AuthContext';
import type { AccountDevice, AccountOrder } from '../types';

export function AccountPage() {
  const { user, refresh } = useAuth();
  const [orders, setOrders] = useState<AccountOrder[]>([]);
  const [devices, setDevices] = useState<AccountDevice[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [imeiBySlot, setImeiBySlot] = useState<Record<string, string>>({});
  const [actionId, setActionId] = useState('');

  async function load() {
    setLoading(true);
    setError('');
    setSuccess('');
    try {
      const [ordersData, devicesData] = await Promise.all([
        getOrders(),
        getDevices(),
      ]);
      setOrders(ordersData.orders);
      setDevices(devicesData.devices);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao carregar conta');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  const activeDeviceCount = devices.filter((device) => !device.awaiting_activation).length;

  useEffect(() => {
    if (activeDeviceCount === 0) {
      return undefined;
    }

    const intervalId = window.setInterval(() => {
      void getDevices()
        .then((data) => setDevices(data.devices))
        .catch(() => {});
    }, 20000);

    return () => window.clearInterval(intervalId);
  }, [activeDeviceCount]);

  async function onActivate(slotId: string) {
    const deviceId = imeiBySlot[slotId]?.trim();
    if (!deviceId) {
      setError('Informe o IMEI do equipamento');
      return;
    }

    setActionId(slotId);
    setError('');
    setSuccess('');
    try {
      await activateDevice(slotId, deviceId);
      setImeiBySlot((current) => ({ ...current, [slotId]: '' }));
      setSuccess(`IMEI ${deviceId} ativado com sucesso.`);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha ao ativar IMEI');
    } finally {
      setActionId('');
    }
  }

  const pending = devices.filter((d) => d.awaiting_activation);
  const active = devices.filter((d) => !d.awaiting_activation);

  if (!user) {
    return null;
  }

  return (
    <div className="container page">
      <div className="page-head">
        <h1>Minha conta</h1>
        <p className="muted">
          Gerencie seus dados, rastreadores e pedidos.
        </p>
      </div>

      {success ? <p className="success-text">{success}</p> : null}
      {error ? <p className="error-text">{error}</p> : null}
      {loading ? <p>Carregando...</p> : null}

      <div className="account-overview">
        <AccountProfileSection user={user} onUpdated={() => refresh()} />

        <section className="account-section account-section-devices">
          <div className="section-head">
            <h2>Meus rastreadores</h2>
            <Link className="btn btn-secondary btn-sm" to="/loja">
              Comprar mais
            </Link>
          </div>

          {!loading && devices.length === 0 ? (
            <div className="card empty-state">
              <p>Você ainda não comprou nenhum rastreador.</p>
              <Link className="btn btn-primary" to="/loja">
                Ver equipamentos
              </Link>
            </div>
          ) : null}

          {devices.length > 0 ? (
            <div className="device-list-compact">
              {pending.length > 0 ? (
                <div className="stack">
                  <h3 className="section-subtitle">Aguardando ativação</h3>
                  {pending.map((device) => (
                    <AccountDeviceCard
                      key={device.id}
                      device={device}
                      busy={actionId === device.id}
                      imeiValue={imeiBySlot[device.id] ?? ''}
                      onImeiChange={(value) =>
                        setImeiBySlot((current) => ({
                          ...current,
                          [device.id]: value,
                        }))
                      }
                      onActivate={() => onActivate(device.id)}
                    />
                  ))}
                </div>
              ) : null}

              {active.length > 0 ? (
                <div className="stack">
                  {pending.length > 0 ? (
                    <h3 className="section-subtitle">Ativos na conta</h3>
                  ) : null}
                  {active.map((device) => (
                    <AccountDeviceCard
                      key={device.id}
                      device={device}
                      busy={actionId === device.id}
                      imeiValue=""
                      onImeiChange={() => {}}
                    />
                  ))}
                </div>
              ) : null}
            </div>
          ) : null}
        </section>
      </div>

      <section className="account-section">
        <h2>Meus pedidos</h2>
        <div className="stack">
          {orders.map((order) => (
            <article key={order.id} className="card order-card">
              <div className="subscription-head">
                <div>
                  <h2>Pedido #{order.id.slice(0, 8)}</h2>
                  <p className="muted">
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
                  <li key={`${order.id}-${item.product_slug}`}>
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
        {!loading && orders.length === 0 ? (
          <p className="muted">Nenhum pedido ainda.</p>
        ) : null}
      </section>
    </div>
  );
}
