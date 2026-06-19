import type { Product } from '../types';
import { KIT_LAUNCH_PRICING } from '../utils/productPricing';

type ProductPriceProps = {
  product?: Product | null;
  compact?: boolean;
};

function hasPromo(product: Product): boolean {
  return (
    product.compare_at_price_cents != null &&
    product.compare_at_price_cents > product.price_cents &&
    Boolean(product.monthly_price_label && product.compare_at_monthly_label)
  );
}

function renderRenewalNote() {
  return (
    <p className="price-renewal-note">
      A partir do 2º ano: <strong>6 meses</strong> por R$ 25,90/mês ou{' '}
      <strong>12 meses</strong> por R$ 19,90/mês.
    </p>
  );
}

export function ProductPrice({ product, compact = false }: ProductPriceProps) {
  if (product && hasPromo(product)) {
    const months = product.included_months ?? 12;

    return (
      <div className={`price-block${compact ? ' price-block-compact' : ''}`}>
        {product.promo_label ? (
          <span className="promo-badge">{product.promo_label}</span>
        ) : null}
        <p className="price-compare">
          <span className="price-prefix">De </span>
          <s>{product.compare_at_monthly_label}/mês</s>
          <span className="price-total-muted">
            {' '}
            · {product.compare_at_price_label} em {months} meses
          </span>
        </p>
        <p className="price-current">
          <span className="price-prefix">Por </span>
          <strong>{product.monthly_price_label}/mês</strong>
          <span className="price-total-muted">
            {' '}
            · {product.price_label} em {months} meses
          </span>
        </p>
        {renderRenewalNote()}
      </div>
    );
  }

  if (product) {
    return <p className="price">{product.price_label}</p>;
  }

  const pricing = KIT_LAUNCH_PRICING;

  return (
    <div className={`price-block${compact ? ' price-block-compact' : ''}`}>
      <span className="promo-badge">{pricing.promoLabel}</span>
      <p className="price-compare">
        <span className="price-prefix">De </span>
        <s>{pricing.compareAtMonthlyLabel}/mês</s>
        <span className="price-total-muted">
          {' '}
          · {pricing.compareAtTotalLabel} em {pricing.includedMonths} meses
        </span>
      </p>
      <p className="price-current">
        <span className="price-prefix">Por </span>
        <strong>{pricing.promoMonthlyLabel}/mês</strong>
        <span className="price-total-muted">
          {' '}
          · {pricing.promoTotalLabel} em {pricing.includedMonths} meses
        </span>
      </p>
      {renderRenewalNote()}
    </div>
  );
}
