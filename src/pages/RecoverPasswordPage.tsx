import { type FormEvent, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { requestPasswordRecovery, resetPasswordWithOtp, setToken } from '../api/client';
import { BrazilPhoneInput } from '../components/BrazilPhoneInput';
import { useAuth } from '../context/AuthContext';
import { brazilPhoneToE164 } from '../utils/phone';

export function RecoverPasswordPage() {
  const navigate = useNavigate();
  const { refresh } = useAuth();
  const [step, setStep] = useState<'phone' | 'reset'>('phone');
  const [phone, setPhone] = useState('');
  const [code, setCode] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function onRequestCode(event: FormEvent) {
    event.preventDefault();
    setError('');
    setMessage('');
    setLoading(true);
    try {
      const result = await requestPasswordRecovery({
        phone: brazilPhoneToE164(phone),
      });
      setMessage(result.message);
      setStep('reset');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha na solicitação');
    } finally {
      setLoading(false);
    }
  }

  async function onResetPassword(event: FormEvent) {
    event.preventDefault();
    setError('');
    setLoading(true);
    try {
      const result = await resetPasswordWithOtp({
        phone: brazilPhoneToE164(phone),
        code: code.trim(),
        new_password: newPassword,
      });
      setToken(result.access_token);
      await refresh();
      navigate('/conta');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha ao redefinir senha');
    } finally {
      setLoading(false);
    }
  }

  if (step === 'reset') {
    return (
      <div className="container page auth-page">
        <div className="card auth-card">
          <h1>Nova senha</h1>
          <p className="muted">
            Informe o código recebido por SMS e escolha uma nova senha.
          </p>
          {message ? <p className="muted">{message}</p> : null}
          <form onSubmit={onResetPassword}>
            <label>
              Código de 6 dígitos
              <input
                inputMode="numeric"
                pattern="\d{6}"
                maxLength={6}
                required
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
              />
            </label>
            <label>
              Nova senha (mín. 8 caracteres)
              <input
                type="password"
                required
                minLength={8}
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
              />
            </label>
            {error ? <p className="error-text">{error}</p> : null}
            <button className="btn btn-primary" type="submit" disabled={loading}>
              {loading ? 'Salvando...' : 'Redefinir senha'}
            </button>
          </form>
          <p className="muted">
            <button
              type="button"
              className="link-button"
              onClick={() => setStep('phone')}
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
        <h1>Recuperar senha</h1>
        <p className="muted">
          Enviaremos um código por SMS para o telefone cadastrado na sua conta.
        </p>
        <form onSubmit={onRequestCode}>
          <label>
            Telefone
            <BrazilPhoneInput required value={phone} onChange={setPhone} />
          </label>
          {error ? <p className="error-text">{error}</p> : null}
          <button className="btn btn-primary" type="submit" disabled={loading}>
            {loading ? 'Enviando...' : 'Enviar código'}
          </button>
        </form>
        <p className="muted">
          Lembrou a senha? <Link to="/entrar">Entrar</Link>
        </p>
      </div>
    </div>
  );
}
