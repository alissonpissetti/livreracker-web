import { type FormEvent, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { BrazilPhoneInput } from '../components/BrazilPhoneInput';
import { useAuth } from '../context/AuthContext';
import { brazilPhoneToE164 } from '../utils/phone';

type LoginTab = 'email' | 'phone';
type PhoneStep = 'phone' | 'code';

export function LoginPage() {
  const { login, requestPhoneLogin, verifyPhoneLogin, resendPhoneLogin } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const from = (location.state as { from?: string } | null)?.from ?? '/conta';

  const [tab, setTab] = useState<LoginTab>('email');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [phone, setPhone] = useState('');
  const [phoneMask, setPhoneMask] = useState('');
  const [phoneE164, setPhoneE164] = useState('');
  const [otpCode, setOtpCode] = useState('');
  const [phoneStep, setPhoneStep] = useState<PhoneStep>('phone');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  function switchTab(next: LoginTab) {
    setTab(next);
    setError('');
    setMessage('');
    setPhoneStep('phone');
    setOtpCode('');
  }

  async function onSubmitEmail(event: FormEvent) {
    event.preventDefault();
    setError('');
    setMessage('');
    setLoading(true);
    try {
      const loggedUser = await login(email.trim().toLowerCase(), password);
      navigate(loggedUser.role === 'admin' ? '/admin' : from);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha no login');
    } finally {
      setLoading(false);
    }
  }

  async function onRequestPhoneCode(event: FormEvent) {
    event.preventDefault();
    setError('');
    setMessage('');
    setLoading(true);
    try {
      let normalizedPhone: string;
      try {
        normalizedPhone = brazilPhoneToE164(phone);
      } catch (phoneError) {
        throw phoneError instanceof Error
          ? phoneError
          : new Error('Informe um telefone válido com DDD');
      }

      if (typeof requestPhoneLogin !== 'function') {
        throw new Error('Login por telefone indisponível. Atualize a página (Ctrl+Shift+R).');
      }

      const result = await requestPhoneLogin(normalizedPhone);
      setPhoneE164(normalizedPhone);
      setPhoneMask(result.phone_mask);
      setMessage(result.message);
      setPhoneStep('code');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha ao enviar código');
    } finally {
      setLoading(false);
    }
  }

  async function onSubmitPhoneCode(event: FormEvent) {
    event.preventDefault();
    setError('');
    setMessage('');
    setLoading(true);
    try {
      const loggedUser = await verifyPhoneLogin(phoneE164, otpCode.trim());
      navigate(loggedUser.role === 'admin' ? '/admin' : from);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Código inválido');
    } finally {
      setLoading(false);
    }
  }

  async function onResendPhoneCode() {
    setError('');
    setMessage('');
    setLoading(true);
    try {
      const result = await resendPhoneLogin(phoneE164);
      setPhoneMask(result.phone_mask);
      setMessage(result.message);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Não foi possível reenviar');
    } finally {
      setLoading(false);
    }
  }

  function backToPhoneInput() {
    setPhoneStep('phone');
    setOtpCode('');
    setMessage('');
    setError('');
  }

  return (
    <div className="container page auth-page">
      <div className="card auth-card">
        <h1>Entrar</h1>
        <p className="muted">Acesse seus pedidos e equipamentos.</p>

        <div className="auth-tabs" role="tablist" aria-label="Forma de login">
          <button
            type="button"
            role="tab"
            aria-selected={tab === 'email'}
            className={tab === 'email' ? 'auth-tab active' : 'auth-tab'}
            onClick={() => switchTab('email')}
          >
            E-mail e senha
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={tab === 'phone'}
            className={tab === 'phone' ? 'auth-tab active' : 'auth-tab'}
            onClick={() => switchTab('phone')}
          >
            Telefone (SMS)
          </button>
        </div>

        {tab === 'email' ? (
          <form onSubmit={onSubmitEmail}>
            <label>
              E-mail
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </label>
            <label>
              Senha
              <input
                type="password"
                required
                minLength={8}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </label>
            {error ? <p className="error-text">{error}</p> : null}
            <button className="btn btn-primary" type="submit" disabled={loading}>
              {loading ? 'Entrando...' : 'Entrar'}
            </button>
          </form>
        ) : phoneStep === 'phone' ? (
          <form onSubmit={onRequestPhoneCode}>
            <label>
              Celular
              <BrazilPhoneInput
                required
                value={phone}
                onChange={setPhone}
              />
            </label>
            <p className="muted auth-hint">
              Enviaremos um código de 6 dígitos por SMS para o número cadastrado.
            </p>
            {error ? <p className="error-text">{error}</p> : null}
            <button className="btn btn-primary" type="submit" disabled={loading}>
              {loading ? 'Enviando...' : 'Enviar código'}
            </button>
          </form>
        ) : (
          <form onSubmit={onSubmitPhoneCode}>
            <p className="muted">
              Digite o código enviado para o telefone terminado em{' '}
              <strong>{phoneMask}</strong>.
            </p>
            <label>
              Código de 6 dígitos
              <input
                inputMode="numeric"
                pattern="\d{6}"
                maxLength={6}
                required
                value={otpCode}
                onChange={(e) => setOtpCode(e.target.value.replace(/\D/g, ''))}
              />
            </label>
            {message ? <p className="muted">{message}</p> : null}
            {error ? <p className="error-text">{error}</p> : null}
            <button className="btn btn-primary" type="submit" disabled={loading}>
              {loading ? 'Verificando...' : 'Confirmar'}
            </button>
            <p className="muted">
              <button
                type="button"
                className="link-button"
                onClick={onResendPhoneCode}
                disabled={loading}
              >
                Reenviar código
              </button>
              {' · '}
              <button
                type="button"
                className="link-button"
                onClick={backToPhoneInput}
                disabled={loading}
              >
                Alterar telefone
              </button>
            </p>
          </form>
        )}

        <p className="muted">
          Não tem conta? <Link to="/cadastro">Criar conta</Link>
          {' · '}
          <Link to="/recuperar-senha">Esqueci a senha</Link>
        </p>
      </div>
    </div>
  );
}
