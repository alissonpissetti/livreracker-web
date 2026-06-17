import { useEffect, useMemo, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { checkout, getProducts, previewVoucher } from '../api/client';
import type { CartItem, Product, VoucherPreview } from '../types';

type CheckoutState = {
  items: CartItem[];
};

export function CheckoutPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const state = location.state as CheckoutState | null;
  const items = state?.items ?? [];

  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(false);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [voucherCode, setVoucherCode] = useState('');
  const [preview, setPreview] = useState<VoucherPreview | null>(null);

  useEffect(() => {
    getProducts().then(setProducts).catch(() => undefined);
  }, []);

  const lines = useMemo(
    () =>
      items
        .map((item) => {
          const product = products.find((p) => p.slug === item.product_slug);
          if (!product) return null;
          return {
            ...product,
            quantity: item.quantity,
            lineTotal: product.price_cents * item.quantity,
          };
        })
        .filter(Boolean),
    [items, products],
  );

  const subtotalCents = lines.reduce((sum, line) => sum + (line?.lineTotal ?? 0), 0);
  const hardwareCount = lines
    .filter((line) => line?.type === 'hardware')
    .reduce((sum, line) => sum + (line?.quantity ?? 0), 0);

  const discountCents = preview?.valid ? preview.discount_cents : 0;
  const totalCents = preview?.valid ? preview.total_cents : subtotalCents;

  const subtotalLabel = (subtotalCents / 100).toLocaleString('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  });

  const discountLabel = (discountCents / 100).toLocaleString('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  });

  const totalLabel = (totalCents / 100).toLocaleString('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  });

  async function onApplyVoucher() {
    setError('');
    setPreview(null);
    setPreviewLoading(true);

    try {
      const result = await previewVoucher(items, voucherCode);
      if (!result.valid) {
        throw new Error(result.message);
      }
      setPreview(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Voucher inválido');
    } finally {
      setPreviewLoading(false);
    }
  }

  async function onConfirm() {
    setError('');
    setLoading(true);
    try {
      const appliedCode = preview?.valid ? preview.voucher_code ?? voucherCode : undefined;
      const result = await checkout(items, appliedCode ?? undefined);
      setSuccess(result.message);
      setTimeout(() => navigate('/conta'), 1500);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha no checkout');
    } finally {
      setLoading(false);
    }
  }

  if (!items.length) {
    return (
      <div className="container page">
        <div className="card">
          <h1>Carrinho vazio</h1>
          <Link className="btn btn-primary" to="/loja">
            Ir para loja
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="container page checkout-page">
      <div className="page-head">
        <h1>Confirmar pedido</h1>
        <p>Pagamento simulado — o pedido entra na sua conta imediatamente.</p>
      </div>

      <div className="checkout-grid">
        <div className="card form-card">
          <h2>Resumo da compra</h2>
          <p className="muted">
            Serão criados <strong>{hardwareCount}</strong> slot(s) de equipamento
            para você ativar o IMEI quando receber cada unidade.
          </p>

          <div className="inline-form compact-form voucher-form">
            <input
              value={voucherCode}
              onChange={(e) => {
                setVoucherCode(e.target.value.toUpperCase());
                setPreview(null);
              }}
              placeholder="Código do voucher"
            />
            <button
              type="button"
              className="btn btn-secondary btn-small"
              disabled={previewLoading || !voucherCode.trim()}
              onClick={onApplyVoucher}
            >
              {previewLoading ? 'Validando...' : 'Aplicar'}
            </button>
          </div>

          {preview?.valid ? (
            <p className="success-text">
              Voucher <strong>{preview.voucher_code}</strong> aplicado — desconto de{' '}
              {preview.discount_label}
            </p>
          ) : null}

          {error ? <p className="error-text">{error}</p> : null}
          {success ? <p className="success-text">{success}</p> : null}
          <button
            className="btn btn-primary"
            type="button"
            disabled={loading || hardwareCount === 0}
            onClick={onConfirm}
          >
            {loading ? 'Processando...' : `Confirmar · ${totalLabel}`}
          </button>
        </div>

        <aside className="card summary-card">
          <h2>Itens</h2>
          <ul className="summary-list">
            {lines.map((line) =>
              line ? (
                <li key={line.slug}>
                  <span>
                    {line.quantity}x {line.name}
                  </span>
                  <strong>
                    {(line.lineTotal / 100).toLocaleString('pt-BR', {
                      style: 'currency',
                      currency: 'BRL',
                    })}
                  </strong>
                </li>
              ) : null,
            )}
          </ul>
          <div className="summary-total">
            <span>Subtotal</span>
            <strong>{subtotalLabel}</strong>
          </div>
          {discountCents > 0 ? (
            <div className="summary-total discount-line">
              <span>Desconto</span>
              <strong>- {discountLabel}</strong>
            </div>
          ) : null}
          <div className="summary-total">
            <span>Total</span>
            <strong>{totalLabel}</strong>
          </div>
        </aside>
      </div>
    </div>
  );
}
