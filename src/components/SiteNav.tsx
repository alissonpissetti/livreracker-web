import { useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';

export type SiteNavItem =
  | { type: 'link'; to: string; label: string; className?: string }
  | { type: 'button'; label: string; onClick: () => void; className?: string };

type SiteNavProps = {
  items: SiteNavItem[];
  trailing?: ReactNode;
};

export function SiteNav({ items, trailing }: SiteNavProps) {
  const [open, setOpen] = useState(false);

  function close() {
    setOpen(false);
  }

  return (
    <>
      <button
        type="button"
        className="nav-toggle"
        aria-expanded={open}
        aria-controls="primary-navigation"
        onClick={() => setOpen((current) => !current)}
      >
        <span className="nav-toggle-bars" aria-hidden="true">
          <span />
          <span />
          <span />
        </span>
        <span className="nav-toggle-label">{open ? 'Fechar' : 'Menu'}</span>
      </button>

      {open ? (
        <button
          type="button"
          className="nav-backdrop"
          aria-label="Fechar menu"
          onClick={close}
        />
      ) : null}

      <nav id="primary-navigation" className={`nav${open ? ' is-open' : ''}`}>
        {items.map((item, index) => {
          if (item.type === 'link') {
            return (
              <Link
                key={`${item.to}-${index}`}
                to={item.to}
                className={item.className}
                onClick={close}
              >
                {item.label}
              </Link>
            );
          }

          return (
            <button
              key={`btn-${index}`}
              type="button"
              className={`nav-drawer-button${item.className ? ` ${item.className}` : ''}`}
              onClick={() => {
                item.onClick();
                close();
              }}
            >
              {item.label}
            </button>
          );
        })}
        {trailing ? <div className="nav-trailing">{trailing}</div> : null}
      </nav>
    </>
  );
}
