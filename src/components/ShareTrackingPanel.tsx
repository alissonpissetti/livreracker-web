import { useEffect, useRef, useState } from 'react';
import {
  createDeviceShareLink,
  dismissDeviceShareLink,
  listDeviceShareLinks,
  revokeDeviceShareLink,
} from '../api/client';
import type { TrackingShareLink } from '../types';

type ShareTrackingPanelProps = {
  deviceSlotId: string;
  disabled?: boolean;
};

const EXPIRY_OPTIONS = [
  { value: '4', label: '4 horas' },
  { value: '8', label: '8 horas' },
  { value: '12', label: '12 horas (padrão)' },
  { value: '24', label: '24 horas' },
  { value: 'none', label: 'Sem expiração' },
] as const;

function formatShareExpiry(iso: string | null): string {
  if (!iso) {
    return 'Sem expiração';
  }
  return new Date(iso).toLocaleString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function ShareTrackingPanel({ deviceSlotId, disabled = false }: ShareTrackingPanelProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [recipientName, setRecipientName] = useState('');
  const [expiry, setExpiry] = useState<(typeof EXPIRY_OPTIONS)[number]['value']>('12');
  const [shares, setShares] = useState<TrackingShareLink[]>([]);
  const [loading, setLoading] = useState(false);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState('');
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [createdLink, setCreatedLink] = useState<TrackingShareLink | null>(null);

  const activeCount = shares.filter((share) => share.is_active).length;

  async function loadShares() {
    setLoading(true);
    setError('');
    try {
      const data = await listDeviceShareLinks(deviceSlotId);
      setShares(data.shares);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao carregar links');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (!deviceSlotId) {
      return;
    }
    void loadShares();
  }, [deviceSlotId]);

  useEffect(() => {
    if (open && deviceSlotId) {
      void loadShares();
    }
  }, [open, deviceSlotId]);

  useEffect(() => {
    if (!open) {
      return;
    }

    function handlePointerDown(event: MouseEvent) {
      if (!rootRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        setOpen(false);
      }
    }

    document.addEventListener('mousedown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [open]);

  async function handleCreate(event: React.FormEvent) {
    event.preventDefault();
    if (!recipientName.trim()) {
      return;
    }

    setCreating(true);
    setError('');
    setCreatedLink(null);
    try {
      const body: { recipient_name: string; expires_in_hours?: number } = {
        recipient_name: recipientName.trim(),
      };
      if (expiry !== 'none') {
        body.expires_in_hours = Number(expiry);
      }
      const share = await createDeviceShareLink(deviceSlotId, body);
      setCreatedLink(share);
      setRecipientName('');
      await loadShares();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao criar link');
    } finally {
      setCreating(false);
    }
  }

  async function handleRevoke(shareId: string) {
    setError('');
    try {
      await revokeDeviceShareLink(deviceSlotId, shareId);
      await loadShares();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao encerrar link');
    }
  }

  async function handleDismiss(shareId: string) {
    setError('');
    try {
      await dismissDeviceShareLink(deviceSlotId, shareId);
      await loadShares();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao remover link');
    }
  }

  async function handleCopy(share: TrackingShareLink) {
    try {
      await navigator.clipboard.writeText(share.share_url);
      setCopiedId(share.id);
      window.setTimeout(() => setCopiedId(null), 2000);
    } catch {
      setError('Não foi possível copiar o link');
    }
  }

  return (
    <div className="tracking-share-compact" ref={rootRef}>
      <button
        type="button"
        className={`tracking-share-trigger${open ? ' tracking-share-trigger-open' : ''}`}
        disabled={disabled}
        aria-expanded={open}
        aria-haspopup="dialog"
        onClick={() => setOpen((current) => !current)}
      >
        Compartilhar
        {activeCount > 0 ? (
          <span className="tracking-share-trigger-badge" aria-label={`${activeCount} link ativo`}>
            {activeCount}
          </span>
        ) : null}
      </button>

      {open ? (
        <div className="tracking-share-popover card" role="dialog" aria-label="Compartilhar rastreio ao vivo">
          <p className="muted tracking-share-popover-intro">
            Link público para acompanhar em tempo real, sem conta.
          </p>

          <form className="tracking-share-form" onSubmit={handleCreate}>
            <label className="tracking-share-field">
              Nome de quem vai acompanhar
              <input
                type="text"
                value={recipientName}
                onChange={(event) => setRecipientName(event.target.value)}
                placeholder="Ex.: Vanessa"
                maxLength={120}
                required
              />
            </label>
            <label className="tracking-share-field">
              Validade
              <select value={expiry} onChange={(event) => setExpiry(event.target.value as typeof expiry)}>
                {EXPIRY_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
            <button type="submit" className="btn btn-primary btn-small" disabled={creating || disabled}>
              {creating ? 'Gerando…' : 'Gerar link'}
            </button>
          </form>

          {createdLink ? (
            <div className="tracking-share-created">
              <p>
                Link para <strong>{createdLink.recipient_name}</strong>
              </p>
              <div className="tracking-share-url-row">
                <input type="text" readOnly value={createdLink.share_url} aria-label="Link público" />
                <button type="button" className="btn btn-secondary btn-small" onClick={() => handleCopy(createdLink)}>
                  {copiedId === createdLink.id ? 'Copiado!' : 'Copiar'}
                </button>
              </div>
            </div>
          ) : null}

          {error ? <p className="error-text">{error}</p> : null}

          <div className="tracking-share-list-wrap">
            {loading ? (
              <p className="muted tracking-share-list-empty">Carregando…</p>
            ) : shares.length === 0 ? (
              <p className="muted tracking-share-list-empty">Nenhum link gerado ainda.</p>
            ) : (
              <ul className="tracking-share-list">
                {shares.map((share) => (
                  <li key={share.id} className="tracking-share-list-item">
                    <div className="tracking-share-list-copy">
                      <strong>{share.recipient_name}</strong>
                      <span className={`tracking-share-status${share.is_active ? ' tracking-share-status-active' : ''}`}>
                        {share.is_active ? 'Ativo' : 'Encerrado'}
                      </span>
                      <p className="muted tracking-share-meta">
                        {share.is_active ? `Expira ${formatShareExpiry(share.expires_at)}` : 'Inativo'}
                      </p>
                    </div>
                    {share.is_active ? (
                      <div className="tracking-share-actions">
                        <button type="button" className="btn btn-secondary btn-small" onClick={() => handleCopy(share)}>
                          {copiedId === share.id ? 'Copiado!' : 'Copiar'}
                        </button>
                        <button type="button" className="btn btn-secondary btn-small" onClick={() => handleRevoke(share.id)}>
                          Encerrar
                        </button>
                      </div>
                    ) : (
                      <div className="tracking-share-actions">
                        <button type="button" className="btn btn-secondary btn-small" onClick={() => handleDismiss(share.id)}>
                          Remover
                        </button>
                      </div>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}
