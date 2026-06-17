import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  activateDevice,
  getDevices,
  getOrders,
  renewDevice,
  updateDevice,
} from '../api/client';
import { AccountDeviceCard } from '../components/AccountDeviceCard';
import { useAuth } from '../context/AuthContext';
import type { DeviceIcon } from '../constants/deviceIcons';
import type { AccountDevice, AccountOrder } from '../types';

export function AccountPage() {
  const { user } = useAuth();
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

  async function onRenew(slotId: string) {
    setActionId(slotId);
    setError('');
    try {
      await renewDevice(slotId);
      setSuccess('Assinatura renovada por mais 30 dias.');
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha ao renovar');
    } finally {
      setActionId('');
    }
  }

  async function onSaveProfile(
    slotId: string,
    label: string,
    icon: DeviceIcon,
  ) {
    setActionId(slotId);
    setError('');
    setSuccess('');
    try {
      await updateDevice(slotId, { label, icon });
      setSuccess('Rastreador atualizado.');
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha ao salvar rastreador');
      throw err;
    } finally {
      setActionId('');
    }
  }

  const pending = devices.filter((d) => d.awaiting_activation);
  const active = devices.filter((d) => !d.awaiting_activation);

  return (
    <div className="container page">
      <div className="page-head">
        <h1>Minha conta</h1>
        <p className="muted">
          Olá, {user?.name}. Veja seus rastreadores, personalize nomes e ícones.
        </p>
      </div>

      {success ? <p className="success-text">{success}</p> : null}
      {error ? <p className="error-text">{error}</p> : null}
      {loading ? <p>Carregando...</p> : null}

      <section className="account-section">
        <div className="section-head">
          <h2>Meus rastreadores</h2>
          <Link className="btn btn-secondary" to="/loja">
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
          <div className="device-grid">
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
                    onSaveProfile={(label, icon) =>
                      onSaveProfile(device.id, label, icon)
                    }
                  />
                ))}
              </div>
            ) : null}

            {active.length > 0 ? (
              <div className="stack">
                <h3 className="section-subtitle">Ativos na conta</h3>
                {active.map((device) => (
                  <AccountDeviceCard
                    key={device.id}
                    device={device}
                    busy={actionId === device.id}
                    imeiValue=""
                    onImeiChange={() => {}}
                    onRenew={() => onRenew(device.id)}
                    onSaveProfile={(label, icon) =>
                      onSaveProfile(device.id, label, icon)
                    }
                  />
                ))}
              </div>
            ) : null}
          </div>
        ) : null}
      </section>

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
