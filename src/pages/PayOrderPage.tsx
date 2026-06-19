import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom';
import {
  cancelStorePendingPayment,
  checkStoreOrderPayment,
  getStoreOrder,
  getStoreOrderPix,
  identifyStoreClient,
  payStoreOrder,
} from '../api/client';
import { useAuth } from '../context/AuthContext';
import type { PaymentMethod } from '../types';
import type { StoreOrder } from '../types/store';

const PIX_DISCOUNT_PERCENT = 5;
const CARD_MAX_INSTALLMENTS = 3;
const BRAZILIAN_STATES = [
  'AC', 'AL', 'AP', 'AM', 'BA', 'CE', 'DF', 'ES', 'GO', 'MA', 'MT', 'MS', 'MG',
  'PA', 'PB', 'PR', 'PE', 'PI', 'RJ', 'RN', 'RS', 'RO', 'RR', 'SC', 'SP', 'SE', 'TO',
];

type PayLocationState = {
  paymentMethod?: PaymentMethod;
};

function formatCpf(value: string): string {
  const digits = value.replace(/\D/g, '').slice(0, 11);
  return digits
    .replace(/(\d{3})(\d)/, '$1.$2')
    .replace(/(\d{3})(\d)/, '$1.$2')
    .replace(/(\d{3})(\d{1,2})$/, '$1-$2');
}

function formatPhone(value: string): string {
  const digits = value.replace(/\D/g, '').slice(0, 11);
  if (digits.length <= 10) {
    return digits.replace(/(\d{2})(\d{4})(\d{0,4})/, '($1) $2-$3').trim();
  }
  return digits.replace(/(\d{2})(\d{5})(\d{0,4})/, '($1) $2-$3').trim();
}

function formatCep(value: string): string {
  const digits = value.replace(/\D/g, '').slice(0, 8);
  return digits.replace(/(\d{5})(\d{0,3})/, '$1-$2');
}

function formatCardNumber(value: string): string {
  return value.replace(/\D/g, '').slice(0, 16);
}

function formatExpiry(value: string): string {
  const digits = value.replace(/\D/g, '').slice(0, 4);
  return digits.length <= 2 ? digits : `${digits.slice(0, 2)}/${digits.slice(2)}`;
}

function money(cents: number) {
  return (cents / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

export function PayOrderPage() {
  const { orderId = '' } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const { user } = useAuth();
  const initialMethod =
    (location.state as PayLocationState | null)?.paymentMethod ?? 'pix';

  const [order, setOrder] = useState<StoreOrder | null>(null);
  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState(false);
  const [pixCancelling, setPixCancelling] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>(initialMethod);
  const [installmentCount, setInstallmentCount] = useState(1);
  const [showPixModal, setShowPixModal] = useState(false);
  const [pixPayload, setPixPayload] = useState('');
  const [pixImage, setPixImage] = useState('');
  const [copiedPix, setCopiedPix] = useState(false);

  const [name, setName] = useState('');
  const [cpf, setCpf] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [zipCode, setZipCode] = useState('');
  const [street, setStreet] = useState('');
  const [number, setNumber] = useState('');
  const [complement, setComplement] = useState('');
  const [neighborhood, setNeighborhood] = useState('');
  const [city, setCity] = useState('');
  const [stateUf, setStateUf] = useState('');
  const [cardName, setCardName] = useState('');
  const [cardNumber, setCardNumber] = useState('');
  const [cardExpiry, setCardExpiry] = useState('');
  const [cardCvv, setCardCvv] = useState('');

  const pollingRef = useRef<number | null>(null);
  const pollingAttempts = useRef(0);

  const payableCents = useMemo(() => {
    if (!order) return 0;
    return Math.max(0, order.subtotal_cents - order.discount_cents);
  }, [order]);

  const chargeQuote = useMemo(() => {
    const paymentDiscountCents =
      paymentMethod === 'pix'
        ? Math.round((payableCents * PIX_DISCOUNT_PERCENT) / 100)
        : 0;
    const totalCents = Math.max(0, payableCents - paymentDiscountCents);
    return { paymentDiscountCents, totalCents };
  }, [payableCents, paymentMethod]);

  const installments = useMemo(() => {
    const cap = CARD_MAX_INSTALLMENTS;
    const total = chargeQuote.totalCents / 100;
    return Array.from({ length: cap }, (_, index) => {
      const count = index + 1;
      return {
        count,
        label: `${count}x de ${(total / count).toLocaleString('pt-BR', {
          style: 'currency',
          currency: 'BRL',
        })} sem juros`,
      };
    });
  }, [chargeQuote.totalCents]);

  async function loadOrder() {
    setLoading(true);
    try {
      const data = await getStoreOrder(orderId);
      setOrder(data);
      setName(data.customer_name || user?.name || '');
      setEmail(data.customer_email || user?.email || '');
      setPhone(formatPhone(data.customer_phone || user?.phone || ''));
      setCpf(formatCpf(data.customer_cpf || ''));
      if (data.status === 'paid') {
        setSuccess('Pagamento já confirmado.');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Pedido não encontrado');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadOrder();
    return () => {
      if (pollingRef.current) {
        window.clearInterval(pollingRef.current);
      }
    };
  }, [orderId]);

  function stopPolling() {
    if (pollingRef.current) {
      window.clearInterval(pollingRef.current);
      pollingRef.current = null;
    }
    pollingAttempts.current = 0;
  }

  function startPolling() {
    stopPolling();
    pollingRef.current = window.setInterval(async () => {
      pollingAttempts.current += 1;
      try {
        const result = await checkStoreOrderPayment(orderId);
        if (result.data.status === 'paid') {
          stopPolling();
          setShowPixModal(false);
          setSuccess(
            result.data.order_type === 'renewal'
              ? 'Pagamento confirmado! O período do equipamento foi atualizado.'
              : 'Pagamento confirmado! Seus equipamentos já estão na conta.',
          );
          setTimeout(() => navigate('/conta'), 2000);
        } else if (pollingAttempts.current >= 30) {
          stopPolling();
        }
      } catch {
        if (pollingAttempts.current >= 30) {
          stopPolling();
        }
      }
    }, 5000);
  }

  function validateCustomer(): string | null {
    const cpfDigits = cpf.replace(/\D/g, '');
    if (!name.trim()) return 'Informe seu nome.';
    if (cpfDigits.length !== 11) return 'Informe um CPF válido.';
    if (phone.replace(/\D/g, '').length < 10) return 'Informe um telefone válido.';
    if (!email.trim()) return 'Informe seu e-mail.';
    return null;
  }

  function validateCard(): string | null {
    const customerError = validateCustomer();
    if (customerError) return customerError;
    const cepDigits = zipCode.replace(/\D/g, '');
    if (cepDigits.length !== 8) return 'Informe o CEP de cobrança.';
    if (!street.trim() || !number.trim() || !neighborhood.trim() || !city.trim() || !stateUf) {
      return 'Preencha o endereço de cobrança.';
    }
    if (cardNumber.replace(/\D/g, '').length < 15) return 'Número do cartão inválido.';
    if (cardExpiry.replace(/\D/g, '').length !== 4) return 'Validade do cartão inválida.';
    if (cardCvv.replace(/\D/g, '').length < 3) return 'CVV inválido.';
    if (!cardName.trim()) return 'Informe o nome impresso no cartão.';
    return null;
  }

  async function onProcessPayment() {
    setError('');
    const validation =
      paymentMethod === 'creditCard' ? validateCard() : validateCustomer();
    if (validation) {
      setError(validation);
      return;
    }

    setProcessing(true);
    try {
      await identifyStoreClient(orderId, {
        name: name.trim(),
        cpf: cpf.replace(/\D/g, ''),
        phone: phone.replace(/\D/g, ''),
        email: email.trim(),
      });

      const paymentData: Parameters<typeof payStoreOrder>[1] = {
        paymentMethod,
        installments: paymentMethod === 'creditCard' ? installmentCount : 1,
      };

      if (paymentMethod === 'creditCard') {
        const exp = cardExpiry.replace(/\D/g, '');
        paymentData.creditCard = {
          holderName: cardName.trim(),
          number: cardNumber.replace(/\D/g, ''),
          expiryMonth: exp.slice(0, 2),
          expiryYear: `20${exp.slice(2, 4)}`,
          ccv: cardCvv.replace(/\D/g, ''),
        };
        const cepDigits = zipCode.replace(/\D/g, '');
        paymentData.creditCardHolderInfo = {
          name: name.trim(),
          email: email.trim(),
          cpfCnpj: cpf.replace(/\D/g, ''),
          postalCode:
            cepDigits.length === 8
              ? `${cepDigits.slice(0, 5)}-${cepDigits.slice(5)}`
              : zipCode.trim(),
          addressNumber: number.trim(),
          addressComplement: complement.trim() || null,
          phone: phone.replace(/\D/g, ''),
          mobilePhone: phone.replace(/\D/g, ''),
        };
      }

      const result = await payStoreOrder(orderId, paymentData);
      setOrder(result.order);

      const gatewayStatus = String(result.gateway_status ?? '').toUpperCase();
      if (
        gatewayStatus === 'CONFIRMED' ||
        gatewayStatus === 'RECEIVED' ||
        gatewayStatus === 'RECEIVED_IN_CASH'
      ) {
        setSuccess(
          order?.order_type === 'renewal'
            ? 'Pagamento confirmado! O período do equipamento foi atualizado.'
            : 'Pagamento confirmado! Seus equipamentos já estão na conta.',
        );
        setTimeout(() => navigate('/conta'), 2000);
        return;
      }

      if (paymentMethod === 'pix') {
        const pix = await getStoreOrderPix(orderId);
        if (pix.process && pix.data && !Array.isArray(pix.data)) {
          setPixPayload(pix.data.payload);
          setPixImage(pix.data.encodedImage);
          setShowPixModal(true);
          startPolling();
        } else {
          throw new Error('Não foi possível gerar o PIX.');
        }
      } else {
        startPolling();
      }
    } catch (err) {
      let msg = err instanceof Error ? err.message : 'Erro ao processar pagamento.';
      if (/m[ií]nimo.*parcela|valor m[ií]nimo por parcela/i.test(msg)) {
        msg += ' Reduza o número de parcelas ou pague em 1x.';
      }
      setError(msg);
    } finally {
      setProcessing(false);
    }
  }

  async function onCancelPix() {
    if (
      !window.confirm(
        'Cancelar este PIX e voltar para escolher outra forma de pagamento?',
      )
    ) {
      return;
    }
    setPixCancelling(true);
    setError('');
    try {
      await cancelStorePendingPayment(orderId);
      setShowPixModal(false);
      setPixPayload('');
      setPixImage('');
      stopPolling();
      await loadOrder();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Não foi possível cancelar o PIX.');
    } finally {
      setPixCancelling(false);
    }
  }

  async function onCopyPix() {
    if (!pixPayload) return;
    try {
      await navigator.clipboard.writeText(pixPayload);
      setCopiedPix(true);
      setTimeout(() => setCopiedPix(false), 2000);
    } catch {
      setError('Não foi possível copiar o código PIX.');
    }
  }

  if (loading) {
    return (
      <div className="container page">
        <div className="card">
          <p className="muted">Carregando pedido…</p>
        </div>
      </div>
    );
  }

  if (!order) {
    return (
      <div className="container page">
        <div className="card">
          <h1>Pedido não encontrado</h1>
          <Link className="btn btn-primary" to="/loja">
            Voltar à loja
          </Link>
        </div>
      </div>
    );
  }

  if (order.status === 'paid') {
    return (
      <div className="container page checkout-page">
        <div className="card form-card">
          <h1>Pedido confirmado</h1>
          <p className="success-text">{success || 'Pagamento já confirmado.'}</p>
          <Link className="btn btn-primary" to="/conta">
            Ir para minha conta
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="container page checkout-page pay-page">
      <div className="page-head">
        <h1>
          {order.order_type === 'renewal' ? 'Pagamento da renovação' : 'Finalizar pagamento'}
        </h1>
        <p className="muted">
          {order.order_type === 'renewal'
            ? 'Após a confirmação, o período do equipamento será estendido automaticamente.'
            : (
              <>
                Pedido <strong>#{order.id.slice(0, 8)}</strong>
              </>
            )}
        </p>
      </div>

      <div className="checkout-grid">
        <div className="card form-card">
          <h2>Dados do comprador</h2>
          <label>
            Nome completo
            <input value={name} onChange={(e) => setName(e.target.value)} />
          </label>
          <label>
            CPF
            <input
              value={cpf}
              onChange={(e) => setCpf(formatCpf(e.target.value))}
              inputMode="numeric"
            />
          </label>
          <label>
            Telefone
            <input
              value={phone}
              onChange={(e) => setPhone(formatPhone(e.target.value))}
              inputMode="tel"
            />
          </label>
          <label>
            E-mail
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </label>

          <h2>Forma de pagamento</h2>
          <div className="payment-methods">
            <button
              type="button"
              className={`payment-method-option${paymentMethod === 'pix' ? ' active' : ''}`}
              onClick={() => setPaymentMethod('pix')}
            >
              <strong>PIX à vista</strong>
              <span>5% de desconto</span>
            </button>
            <button
              type="button"
              className={`payment-method-option${paymentMethod === 'creditCard' ? ' active' : ''}`}
              onClick={() => setPaymentMethod('creditCard')}
            >
              <strong>Cartão de crédito</strong>
              <span>Até 3x sem juros</span>
            </button>
          </div>

          {paymentMethod === 'creditCard' ? (
            <>
              <label>
                Parcelas
                <select
                  value={installmentCount}
                  onChange={(e) => setInstallmentCount(Number(e.target.value))}
                >
                  {installments.map((item) => (
                    <option key={item.count} value={item.count}>
                      {item.label}
                    </option>
                  ))}
                </select>
              </label>

              <h2>Endereço de cobrança</h2>
              <label>
                CEP
                <input
                  value={zipCode}
                  onChange={(e) => setZipCode(formatCep(e.target.value))}
                  inputMode="numeric"
                />
              </label>
              <label>
                Logradouro
                <input value={street} onChange={(e) => setStreet(e.target.value)} />
              </label>
              <label>
                Número
                <input value={number} onChange={(e) => setNumber(e.target.value)} />
              </label>
              <label>
                Complemento
                <input value={complement} onChange={(e) => setComplement(e.target.value)} />
              </label>
              <label>
                Bairro
                <input
                  value={neighborhood}
                  onChange={(e) => setNeighborhood(e.target.value)}
                />
              </label>
              <label>
                Cidade
                <input value={city} onChange={(e) => setCity(e.target.value)} />
              </label>
              <label>
                UF
                <select value={stateUf} onChange={(e) => setStateUf(e.target.value)}>
                  <option value="">Selecione</option>
                  {BRAZILIAN_STATES.map((uf) => (
                    <option key={uf} value={uf}>
                      {uf}
                    </option>
                  ))}
                </select>
              </label>

              <h2>Cartão</h2>
              <label>
                Nome no cartão
                <input value={cardName} onChange={(e) => setCardName(e.target.value)} />
              </label>
              <label>
                Número
                <input
                  value={cardNumber}
                  onChange={(e) => setCardNumber(formatCardNumber(e.target.value))}
                  inputMode="numeric"
                />
              </label>
              <label>
                Validade (MM/AA)
                <input
                  value={cardExpiry}
                  onChange={(e) => setCardExpiry(formatExpiry(e.target.value))}
                  inputMode="numeric"
                  placeholder="MM/AA"
                />
              </label>
              <label>
                CVV
                <input
                  value={cardCvv}
                  onChange={(e) => setCardCvv(e.target.value.replace(/\D/g, '').slice(0, 4))}
                  inputMode="numeric"
                />
              </label>
            </>
          ) : null}

          {error ? <p className="error-text">{error}</p> : null}
          {success ? <p className="success-text">{success}</p> : null}

          <button
            className="btn btn-primary"
            type="button"
            disabled={processing}
            onClick={onProcessPayment}
          >
            {processing
              ? 'Processando...'
              : paymentMethod === 'pix'
                ? 'GERAR PIX'
                : 'PAGAR COM CARTÃO'}
          </button>
        </div>

        <aside className="card summary-card">
          <h2>Resumo</h2>
          <ul className="summary-list">
            {order.items.map((item) => (
              <li key={item.product_slug}>
                <span>
                  {item.quantity}x {item.product_name}
                </span>
                <strong>{item.line_total_label}</strong>
              </li>
            ))}
          </ul>
          <div className="summary-total">
            <span>Subtotal</span>
            <strong>{order.subtotal_label}</strong>
          </div>
          {order.discount_cents > 0 ? (
            <div className="summary-total discount-line">
              <span>Voucher</span>
              <strong>- {order.discount_label}</strong>
            </div>
          ) : null}
          {chargeQuote.paymentDiscountCents > 0 ? (
            <div className="summary-total discount-line">
              <span>Desconto PIX (5%)</span>
              <strong>- {money(chargeQuote.paymentDiscountCents)}</strong>
            </div>
          ) : null}
          <div className="summary-total">
            <span>Total</span>
            <strong>{money(chargeQuote.totalCents)}</strong>
          </div>
        </aside>
      </div>

      {showPixModal ? (
        <div className="pix-modal-backdrop">
          <div className="card payment-card pix-modal">
            <h2>Pague com PIX</h2>
            <p className="muted">Escaneie o QR Code ou copie o código no app do banco.</p>
            {pixImage ? (
              <img
                className="pix-qr"
                src={`data:image/png;base64,${pixImage}`}
                alt="QR Code PIX"
              />
            ) : null}
            {pixPayload ? (
              <div className="pix-copy-box">
                <code>{pixPayload}</code>
              </div>
            ) : null}
            <div className="pix-modal-actions">
              <button type="button" className="btn btn-secondary" onClick={onCopyPix}>
                {copiedPix ? 'Copiado!' : 'Copiar código PIX'}
              </button>
              <button
                type="button"
                className="btn btn-secondary"
                disabled={pixCancelling}
                onClick={onCancelPix}
              >
                {pixCancelling ? 'Cancelando...' : 'Cancelar PIX'}
              </button>
            </div>
            <p className="muted payment-wait-note">
              Assim que o pagamento for confirmado, você será redirecionado.
            </p>
          </div>
        </div>
      ) : null}
    </div>
  );
}
