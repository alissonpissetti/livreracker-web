import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  adminBlockDevice,
  adminUnblockDevice,
  getAdminDevices,
} from '../../api/client';
import type { AdminManagedDevice } from '../../types';

export function AdminDevicesPage() {
  const [devices, setDevices] = useState<AdminManagedDevice[]>([]);
  const [error, setError] = useState('');
  const [actionId, setActionId] = useState('');
  const [blockReason, setBlockReason] = useState<Record<string, string>>({});

  async function load() {
    const data = await getAdminDevices();
    setDevices(data.devices);
  }

  useEffect(() => {
    load().catch((err: Error) => setError(err.message));
  }, []);

  async function onBlock(deviceId: string) {
    setActionId(deviceId);
    setError('');
    try {
      await adminBlockDevice(deviceId, blockReason[deviceId] || 'Bloqueio administrativo');
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha ao bloquear');
    } finally {
      setActionId('');
    }
  }

  async function onUnblock(deviceId: string) {
    setActionId(deviceId);
    setError('');
    try {
      await adminUnblockDevice(deviceId);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha ao desbloquear');
    } finally {
      setActionId('');
    }
  }

  return (
    <div className="container page">
      <div className="page-head">
        <h1>Equipamentos</h1>
        <p className="muted">
          Todos os rastreadores, donos e status. Bloqueie IMEIs que não devem enviar posição.
        </p>
      </div>

      {error ? <p className="error-text">{error}</p> : null}

      <div className="table-card card">
        <table className="data-table">
          <thead>
            <tr>
              <th>Label</th>
              <th>IMEI</th>
              <th>Cliente</th>
              <th>Status</th>
              <th>Última posição</th>
              <th>Ações</th>
            </tr>
          </thead>
          <tbody>
            {devices.map((device) => (
              <tr key={device.subscription_id}>
                <td>{device.label ?? '—'}</td>
                <td>{device.device_id ?? 'Pendente'}</td>
                <td>
                  {device.owner_name ? (
                    <>
                      {device.owner_name}
                      <br />
                      <span className="muted">{device.owner_email}</span>
                      {device.owner_user_id ? (
                        <>
                          <br />
                          <Link to={`/admin/contas/${device.owner_user_id}`}>
                            Ver conta
                          </Link>
                        </>
                      ) : null}
                    </>
                  ) : (
                    '—'
                  )}
                </td>
                <td>
                  {device.blocked ? (
                    <span className="badge badge-warning">Bloqueado</span>
                  ) : device.awaiting_activation ? (
                    <span className="badge badge-warning">Sem IMEI</span>
                  ) : device.is_active ? (
                    <span className="badge badge-success">Ativo</span>
                  ) : (
                    <span className="badge badge-muted">{device.status}</span>
                  )}
                </td>
                <td>
                  {device.last_latitude != null && device.last_longitude != null ? (
                    <>
                      {device.last_latitude.toFixed(5)}, {device.last_longitude.toFixed(5)}
                      <br />
                      <span className="muted">
                        {device.last_seen_at
                          ? new Date(device.last_seen_at).toLocaleString('pt-BR')
                          : ''}
                      </span>
                    </>
                  ) : (
                    '—'
                  )}
                </td>
                <td>
                  {device.device_id ? (
                    device.blocked ? (
                      <button
                        type="button"
                        className="btn btn-secondary btn-small"
                        disabled={actionId === device.device_id}
                        onClick={() => onUnblock(device.device_id!)}
                      >
                        Desbloquear
                      </button>
                    ) : (
                      <div className="inline-form compact-form">
                        <input
                          placeholder="Motivo"
                          value={blockReason[device.device_id] ?? ''}
                          onChange={(e) =>
                            setBlockReason((current) => ({
                              ...current,
                              [device.device_id!]: e.target.value,
                            }))
                          }
                        />
                        <button
                          type="button"
                          className="btn btn-secondary btn-small"
                          disabled={actionId === device.device_id}
                          onClick={() => onBlock(device.device_id!)}
                        >
                          Bloquear
                        </button>
                      </div>
                    )
                  ) : (
                    '—'
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {devices.length === 0 ? (
          <p className="muted table-empty">Nenhum equipamento cadastrado.</p>
        ) : null}
      </div>
    </div>
  );
}
