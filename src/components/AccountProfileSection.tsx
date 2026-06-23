import { useEffect, useState, type FormEvent } from 'react';
import { updateAccountProfile } from '../api/client';
import { BrazilPhoneInput } from './BrazilPhoneInput';
import type { User } from '../types';
import {
  brazilPhoneToE164,
  maskBrazilPhone,
  phoneStoredToBrazilInput,
} from '../utils/phone';

type AccountProfileSectionProps = {
  user: User;
  onUpdated: (user: User) => void;
};

export function AccountProfileSection({
  user,
  onUpdated,
}: AccountProfileSectionProps) {
  const [name, setName] = useState(user.name);
  const [phone, setPhone] = useState(phoneStoredToBrazilInput(user.phone));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  useEffect(() => {
    setName(user.name);
    setPhone(phoneStoredToBrazilInput(user.phone));
  }, [user]);

  const dirty =
    name.trim() !== user.name.trim() ||
    phoneStoredToBrazilInput(user.phone) !== phone.trim();

  async function handleSave(event: FormEvent) {
    event.preventDefault();
    setError('');
    setSuccess('');

    const trimmedName = name.trim();
    if (trimmedName.length < 2) {
      setError('Informe seu nome completo.');
      return;
    }

    let phoneE164: string | null = null;
    if (phone.trim().length > 0) {
      try {
        phoneE164 = brazilPhoneToE164(phone);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Telefone inválido.');
        return;
      }
    }

    setSaving(true);
    try {
      const updated = await updateAccountProfile({
        name: trimmedName,
        phone: phoneE164,
      });
      onUpdated(updated);
      setSuccess('Dados atualizados com sucesso.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha ao salvar seus dados.');
    } finally {
      setSaving(false);
    }
  }

  async function handleRemovePhone() {
    setError('');
    setSuccess('');
    setSaving(true);
    try {
      const updated = await updateAccountProfile({ phone: null });
      setPhone('');
      onUpdated(updated);
      setSuccess('Celular de alerta removido.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha ao remover telefone.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="account-section account-section-profile">
      <div className="section-head">
        <h2>Meus dados</h2>
      </div>

      <form className="card account-profile-card" onSubmit={handleSave}>
        <p className="muted account-profile-lead">
          Gerencie suas informações e o celular usado para alertas e login por SMS.
        </p>

        <label className="auth-field">
          <span className="field-label">Nome</span>
          <input
            className="input"
            value={name}
            onChange={(event) => setName(event.target.value)}
            autoComplete="name"
            maxLength={120}
          />
        </label>

        <label className="auth-field">
          <span className="field-label">E-mail</span>
          <input className="input" value={user.email} disabled readOnly />
        </label>

        <label className="auth-field">
          <span className="field-label">Celular de alerta</span>
          <BrazilPhoneInput
            className="input"
            value={phone}
            onChange={setPhone}
          />
          <span className="field-hint">
            {user.phone
              ? `Cadastrado: ${maskBrazilPhone(user.phone)} · usado para alertas e recuperação de senha`
              : 'Cadastre seu celular para receber alertas e usar login por SMS'}
          </span>
        </label>

        <p className="muted account-profile-meta">
          Conta criada em {new Date(user.created_at).toLocaleDateString('pt-BR')}
        </p>

        {success ? <p className="success-text">{success}</p> : null}
        {error ? <p className="error-text">{error}</p> : null}

        <div className="account-profile-actions">
          <button className="btn btn-primary" type="submit" disabled={!dirty || saving}>
            {saving ? 'Salvando...' : 'Salvar alterações'}
          </button>
          {user.phone ? (
            <button
              className="btn btn-secondary"
              type="button"
              disabled={saving}
              onClick={() => void handleRemovePhone()}
            >
              Remover celular
            </button>
          ) : null}
        </div>
      </form>
    </section>
  );
}
