import { type FormEvent, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { BrazilPhoneInput } from '../components/BrazilPhoneInput';
import { useAuth } from '../context/AuthContext';
import { brazilPhoneToE164 } from '../utils/phone';

export function RegisterPage() {
  const { register } = useAuth();
  const navigate = useNavigate();

  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setError('');
    setLoading(true);
    try {
      await register(
        name.trim(),
        email.trim().toLowerCase(),
        brazilPhoneToE164(phone),
        password,
      );
      navigate('/conta');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha no cadastro');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="container page auth-page">
      <div className="card auth-card">
        <h1>Criar conta</h1>
        <p className="muted">
          Compre quantos rastreadores precisar e gerencie tudo em um só lugar.
        </p>
        <form onSubmit={onSubmit}>
          <label>
            Nome completo
            <input
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </label>
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
            Telefone
            <BrazilPhoneInput
              required
              value={phone}
              onChange={setPhone}
            />
          </label>
          <label>
            Senha (mín. 8 caracteres)
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
            {loading ? 'Criando...' : 'Criar conta'}
          </button>
        </form>
        <p className="muted">
          Já tem conta? <Link to="/entrar">Entrar</Link>
        </p>
      </div>
    </div>
  );
}
