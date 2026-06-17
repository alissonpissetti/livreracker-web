import { useEffect, useState, type FormEvent } from 'react';
import {
  createAdminVoucher,
  getAdminVouchers,
  updateAdminVoucher,
} from '../../api/client';
import type { AdminVoucher } from '../../types';

type CreateForm = {
  code: string;
  discount_type: 'percent' | 'fixed';
  discount_value: string;
  max_uses: string;
  expires_at: string;
  min_order_reais: string;
  description: string;
};

const emptyForm: CreateForm = {
  code: '',
  discount_type: 'percent',
  discount_value: '',
  max_uses: '',
  expires_at: '',
  min_order_reais: '',
  description: '',
};

function toCents(reais: string): number | undefined {
  const normalized = reais.replace(',', '.').trim();
  if (!normalized) return undefined;
  const value = Number(normalized);
  if (Number.isNaN(value) || value < 0) return undefined;
  return Math.round(value * 100);
}

export function AdminVouchersPage() {
  const [vouchers, setVouchers] = useState<AdminVoucher[]>([]);
  const [form, setForm] = useState<CreateForm>(emptyForm);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [loading, setLoading] = useState(false);
  const [actionId, setActionId] = useState('');

  async function load() {
    const data = await getAdminVouchers();
    setVouchers(data.vouchers);
  }

  useEffect(() => {
    load().catch((err: Error) => setError(err.message));
  }, []);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setError('');
    setSuccess('');
    setLoading(true);

    try {
      const discountValue =
        form.discount_type === 'percent'
          ? Number(form.discount_value)
          : toCents(form.discount_value);

      if (!form.code.trim()) {
        throw new Error('Informe o código do voucher');
      }

      if (!discountValue || discountValue < 1) {
        throw new Error('Informe um valor de desconto válido');
      }

      if (form.discount_type === 'percent' && discountValue > 100) {
        throw new Error('Desconto percentual não pode passar de 100%');
      }

      await createAdminVoucher({
        code: form.code.trim(),
        discount_type: form.discount_type,
        discount_value: discountValue,
        max_uses: form.max_uses ? Number(form.max_uses) : undefined,
        expires_at: form.expires_at
          ? new Date(`${form.expires_at}T23:59:59`).toISOString()
          : undefined,
        min_order_cents: toCents(form.min_order_reais),
        description: form.description.trim() || undefined,
      });

      setForm(emptyForm);
      setSuccess('Voucher criado com sucesso.');
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha ao criar voucher');
    } finally {
      setLoading(false);
    }
  }

  async function onToggle(voucher: AdminVoucher) {
    setActionId(voucher.id);
    setError('');
    try {
      await updateAdminVoucher(voucher.id, !voucher.active);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha ao atualizar voucher');
    } finally {
      setActionId('');
    }
  }

  return (
    <div className="container page">
      <div className="page-head">
        <h1>Vouchers</h1>
        <p className="muted">
          Crie códigos de desconto para a loja. O cliente aplica no checkout.
        </p>
      </div>

      {error ? <p className="error-text">{error}</p> : null}
      {success ? <p className="success-text">{success}</p> : null}

      <div className="admin-grid">
        <div className="card form-card">
          <h2>Novo voucher</h2>
          <form className="stack" onSubmit={onSubmit}>
            <label>
              Código
              <input
                value={form.code}
                onChange={(e) => setForm((current) => ({ ...current, code: e.target.value }))}
                placeholder="LIVE10"
                required
              />
            </label>

            <label>
              Tipo de desconto
              <select
                value={form.discount_type}
                onChange={(e) =>
                  setForm((current) => ({
                    ...current,
                    discount_type: e.target.value as CreateForm['discount_type'],
                    discount_value: '',
                  }))
                }
              >
                <option value="percent">Percentual (%)</option>
                <option value="fixed">Valor fixo (R$)</option>
              </select>
            </label>

            <label>
              {form.discount_type === 'percent' ? 'Percentual' : 'Valor em reais'}
              <input
                value={form.discount_value}
                onChange={(e) =>
                  setForm((current) => ({ ...current, discount_value: e.target.value }))
                }
                placeholder={form.discount_type === 'percent' ? '10' : '50,00'}
                required
              />
            </label>

            <label>
              Usos máximos (opcional)
              <input
                type="number"
                min={1}
                value={form.max_uses}
                onChange={(e) => setForm((current) => ({ ...current, max_uses: e.target.value }))}
                placeholder="Ilimitado"
              />
            </label>

            <label>
              Validade (opcional)
              <input
                type="date"
                value={form.expires_at}
                onChange={(e) => setForm((current) => ({ ...current, expires_at: e.target.value }))}
              />
            </label>

            <label>
              Pedido mínimo em R$ (opcional)
              <input
                value={form.min_order_reais}
                onChange={(e) =>
                  setForm((current) => ({ ...current, min_order_reais: e.target.value }))
                }
                placeholder="449,00"
              />
            </label>

            <label>
              Descrição interna (opcional)
              <input
                value={form.description}
                onChange={(e) =>
                  setForm((current) => ({ ...current, description: e.target.value }))
                }
                placeholder="Campanha de lançamento"
              />
            </label>

            <button className="btn btn-primary" type="submit" disabled={loading}>
              {loading ? 'Criando...' : 'Criar voucher'}
            </button>
          </form>
        </div>

        <div className="table-card card">
          <h2>Vouchers cadastrados</h2>
          <table className="data-table">
            <thead>
              <tr>
                <th>Código</th>
                <th>Desconto</th>
                <th>Usos</th>
                <th>Validade</th>
                <th>Pedido mín.</th>
                <th>Status</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {vouchers.map((voucher) => (
                <tr key={voucher.id}>
                  <td>
                    <strong>{voucher.code}</strong>
                    {voucher.description ? (
                      <>
                        <br />
                        <span className="muted">{voucher.description}</span>
                      </>
                    ) : null}
                  </td>
                  <td>{voucher.discount_label}</td>
                  <td>
                    {voucher.used_count}
                    {voucher.max_uses != null ? ` / ${voucher.max_uses}` : ' / ∞'}
                  </td>
                  <td>
                    {voucher.expires_at
                      ? new Date(voucher.expires_at).toLocaleDateString('pt-BR')
                      : '—'}
                  </td>
                  <td>{voucher.min_order_label ?? '—'}</td>
                  <td>
                    {voucher.active ? (
                      <span className="badge badge-success">Ativo</span>
                    ) : (
                      <span className="badge badge-muted">Inativo</span>
                    )}
                  </td>
                  <td>
                    <button
                      type="button"
                      className="btn btn-secondary btn-small"
                      disabled={actionId === voucher.id}
                      onClick={() => onToggle(voucher)}
                    >
                      {voucher.active ? 'Desativar' : 'Ativar'}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {vouchers.length === 0 ? (
            <p className="muted table-empty">Nenhum voucher cadastrado.</p>
          ) : null}
        </div>
      </div>
    </div>
  );
}
