import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { createRenewalCheckout, getDevices, getRenewalPlans } from '../api/client';
import { DeviceIconGlyph } from '../components/DeviceIcon';
import { DEFAULT_DEVICE_ICON, isDeviceIcon } from '../constants/deviceIcons';
import type { AccountDevice } from '../types';
import type { RenewalPlan } from '../types/store';
import { formatDevicePeriodRange } from '../utils/devicePeriod';

export function RenewDevicePage() {
  const { deviceId = '' } = useParams();
  const navigate = useNavigate();
  const [device, setDevice] = useState<AccountDevice | null>(null);
  const [plans, setPlans] = useState<RenewalPlan[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    async function load() {
      setLoading(true);
      setError('');
      try {
        const [devicesData, plansData] = await Promise.all([
          getDevices(),
          getRenewalPlans(),
        ]);
        const found = devicesData.devices.find((item) => item.id === deviceId) ?? null;
        if (!found) {
          throw new Error('Equipamento não encontrado');
        }
        setDevice(found);
        setPlans(plansData.plans);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Erro ao carregar renovação');
      } finally {
        setLoading(false);
      }
    }
    void load();
  }, [deviceId]);

  async function onSelectPlan(planSlug: string) {
    setSubmitting(planSlug);
    setError('');
    try {
      const result = await createRenewalCheckout(deviceId, planSlug);
      if (result.status === 'paid') {
        navigate(result.redirect_to ?? '/conta');
        return;
      }
      navigate(result.redirect_to ?? `/pagar/${result.order_id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha ao iniciar renovação');
    } finally {
      setSubmitting('');
    }
  }

  if (loading) {
    return (
      <div className="container page">
        <div className="card">
          <p className="muted">Carregando planos...</p>
        </div>
      </div>
    );
  }

  if (!device) {
    return (
      <div className="container page">
        <div className="card">
          <h1>Equipamento não encontrado</h1>
          <Link className="btn btn-primary" to="/conta">
            Voltar para minha conta
          </Link>
        </div>
      </div>
    );
  }

  const icon = isDeviceIcon(device.icon) ? device.icon : DEFAULT_DEVICE_ICON;

  return (
    <div className="container page checkout-page">
      <div className="page-head">
        <Link className="tracking-back" to="/conta">
          <span className="tracking-back-icon" aria-hidden="true">
            ←
          </span>
          Voltar para minha conta
        </Link>
        <h1>Renovar plano</h1>
        <p className="muted">
          O período escolhido será <strong>somado</strong> à data de vencimento atual
          do equipamento.
        </p>
      </div>

      <div className="card renew-device-summary">
        <div className="tracking-hero">
          <div className="tracking-hero-icon" aria-hidden="true">
            <DeviceIconGlyph icon={icon} size={28} />
          </div>
          <div className="tracking-hero-copy">
            <h2>{device.label ?? 'Rastreador'}</h2>
            <p className="muted">
              Vencimento atual:{' '}
              {formatDevicePeriodRange(
                device.current_period_start,
                device.current_period_end,
              )}
            </p>
          </div>
        </div>
      </div>

      {error ? <p className="error-text">{error}</p> : null}

      <div className="renew-plans-grid">
        {plans.map((plan) => (
          <article key={plan.slug} className="card renew-plan-card">
            <div className="renew-plan-head">
              <h2>{plan.name}</h2>
              {plan.slug === 'renovacao-12-meses' ? (
                <span className="renew-plan-badge">Melhor custo</span>
              ) : null}
            </div>
            <p className="muted">{plan.description}</p>
            <p className="renew-plan-price">
              <strong>{plan.monthly_label}</strong>
              <span>/mês</span>
            </p>
            <p className="renew-plan-total muted">
              Total: <strong>{plan.total_label}</strong> · +{plan.months} meses
            </p>
            <button
              type="button"
              className="btn btn-primary"
              disabled={!!submitting}
              onClick={() => onSelectPlan(plan.slug)}
            >
              {submitting === plan.slug ? 'Criando pedido...' : 'Continuar para pagamento'}
            </button>
          </article>
        ))}
      </div>
    </div>
  );
}
