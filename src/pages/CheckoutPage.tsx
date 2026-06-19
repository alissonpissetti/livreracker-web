import { useEffect, useMemo, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { checkout, getProducts, previewVoucher } from '../api/client';
import type { CartItem, PaymentMethod, Product, VoucherPreview } from '../types';

type CheckoutState = {
  items: CartItem[];
};

const PIX_DISCOUNT_PERCENT = 5;

function computeTotals(
  subtotalCents: number,
  voucherDiscountCents: number,
  paymentMethod: PaymentMethod,
) {
  const afterVoucher = Math.max(0, subtotalCents - voucherDiscountCents);
  const paymentDiscountCents =
    paymentMethod === 'pix'
      ? Math.round((afterVoucher * PIX_DISCOUNT_PERCENT) / 100)
      : 0;
  const totalCents = Math.max(0, afterVoucher - paymentDiscountCents);
  return { afterVoucher, paymentDiscountCents, totalCents };
}

export function CheckoutPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const state = location.state as CheckoutState | null;
  const items = state?.items ?? [];

  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(false);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [error, setError] = useState('');
  const [voucherCode, setVoucherCode] = useState('');
  const [preview, setPreview] = useState<VoucherPreview | null>(null);
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('pix');

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

  const voucherDiscountCents = preview?.valid ? preview.discount_cents : 0;
  const totals = useMemo(
    () => computeTotals(subtotalCents, voucherDiscountCents, paymentMethod),
    [subtotalCents, voucherDiscountCents, paymentMethod],
  );

  const formatMoney = (cents: number) =>
    (cents / 100).toLocaleString('pt-BR', {
      style: 'currency',
      currency: 'BRL',
    });

  async function onApplyVoucher() {
    setError('');
    setPreview(null);
    setPreviewLoading(true);

    try {
      const result = await previewVoucher(items, voucherCode, paymentMethod);
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

      if (result.status === 'paid') {
        navigate(result.redirect_to ?? '/conta');
        return;
      }

      navigate(result.redirect_to ?? `/pagar/${result.order_id}`, {
        state: { paymentMethod },
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha ao criar pedido');
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
        <p>Revise os itens e continue para o pagamento.</p>
      </div>

      <div className="checkout-grid">
        <div className="card form-card">
          <h2>Resumo da compra</h2>
          <p className="muted">
            Serão criados <strong>{hardwareCount}</strong> slot(s) de equipamento
            após a confirmação do pagamento.
          </p>

          <div className="payment-methods">
            <button
              type="button"
              className={`payment-method-option${paymentMethod === 'pix' ? ' active' : ''}`}
              onClick={() => {
                setPaymentMethod('pix');
                setPreview(null);
              }}
            >
              <strong>PIX à vista</strong>
              <span>5% de desconto no pagamento</span>
            </button>
            <button
              type="button"
              className={`payment-method-option${paymentMethod === 'creditCard' ? ' active' : ''}`}
              onClick={() => {
                setPaymentMethod('creditCard');
                setPreview(null);
              }}
            >
              <strong>Cartão de crédito</strong>
              <span>Até 3x sem juros</span>
            </button>
          </div>

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
          <button
            className="btn btn-primary"
            type="button"
            disabled={loading || hardwareCount === 0}
            onClick={onConfirm}
          >
            {loading ? 'Criando pedido...' : 'Continuar para pagamento'}
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
                  <strong>{formatMoney(line.lineTotal)}</strong>
                </li>
              ) : null,
            )}
          </ul>
          <div className="summary-total">
            <span>Subtotal</span>
            <strong>{formatMoney(subtotalCents)}</strong>
          </div>
          {voucherDiscountCents > 0 ? (
            <div className="summary-total discount-line">
              <span>Desconto voucher</span>
              <strong>- {formatMoney(voucherDiscountCents)}</strong>
            </div>
          ) : null}
          {totals.paymentDiscountCents > 0 ? (
            <div className="summary-total discount-line">
              <span>Desconto PIX (5%)</span>
              <strong>- {formatMoney(totals.paymentDiscountCents)}</strong>
            </div>
          ) : null}
          <div className="summary-total">
            <span>Total estimado</span>
            <strong>{formatMoney(totals.totalCents)}</strong>
          </div>
        </aside>
      </div>
    </div>
  );
}
