import { type FormEvent, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { isLoginChallenge } from '../types';

export function LoginPage() {
  const { login, verifyLoginOtp, resendLoginOtp } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const from = (location.state as { from?: string } | null)?.from ?? '/conta';

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [challengeToken, setChallengeToken] = useState('');
  const [phoneMask, setPhoneMask] = useState('');
  const [otpCode, setOtpCode] = useState('');
  const [step, setStep] = useState<'credentials' | 'otp'>('credentials');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function onSubmitCredentials(event: FormEvent) {
    event.preventDefault();
    setError('');
    setMessage('');
    setLoading(true);
    try {
      const result = await login(email.trim().toLowerCase(), password);
      if (isLoginChallenge(result)) {
        setChallengeToken(result.login_challenge_token);
        setPhoneMask(result.phone_mask);
        setMessage(result.message);
        setStep('otp');
        return;
      }
      navigate(result.role === 'admin' ? '/admin' : from);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha no login');
    } finally {
      setLoading(false);
    }
  }

  async function onSubmitOtp(event: FormEvent) {
    event.preventDefault();
    setError('');
    setMessage('');
    setLoading(true);
    try {
      const loggedUser = await verifyLoginOtp(challengeToken, otpCode.trim());
      navigate(loggedUser.role === 'admin' ? '/admin' : from);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Código inválido');
    } finally {
      setLoading(false);
    }
  }

  async function onResendOtp() {
    setError('');
    setMessage('');
    setLoading(true);
    try {
      const result = await resendLoginOtp(challengeToken);
      setMessage(result.message);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Não foi possível reenviar');
    } finally {
      setLoading(false);
    }
  }

  function backToCredentials() {
    setStep('credentials');
    setOtpCode('');
    setChallengeToken('');
    setPhoneMask('');
    setMessage('');
    setError('');
  }

  if (step === 'otp') {
    return (
      <div className="container page auth-page">
        <div className="card auth-card">
          <h1>Confirme o login</h1>
          <p className="muted">
            Enviamos um código por SMS para o telefone terminado em{' '}
            <strong>{phoneMask}</strong>.
          </p>
          <form onSubmit={onSubmitOtp}>
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
          </form>
          <p className="muted">
            <button
              type="button"
              className="link-button"
              onClick={onResendOtp}
              disabled={loading}
            >
              Reenviar código
            </button>
            {' · '}
            <button
              type="button"
              className="link-button"
              onClick={backToCredentials}
              disabled={loading}
            >
              Voltar
            </button>
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="container page auth-page">
      <div className="card auth-card">
        <h1>Entrar</h1>
        <p className="muted">Acesse seus pedidos e equipamentos.</p>
        <form onSubmit={onSubmitCredentials}>
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
        <p className="muted">
          Não tem conta? <Link to="/cadastro">Criar conta</Link>
          {' · '}
          <Link to="/recuperar-senha">Esqueci a senha</Link>
        </p>
      </div>
    </div>
  );
}
