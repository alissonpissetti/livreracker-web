export const KIT_INCLUDED_MONTHS = 12;
export const KIT_REGULAR_TOTAL_CENTS = 59880;
export const KIT_PROMO_TOTAL_CENTS = 47880;
export const KIT_PROMO_LABEL = 'Promoção de lançamento';
export const RENEWAL_6_MONTHLY_CENTS = 2590;
export const RENEWAL_12_MONTHLY_CENTS = 1990;
export const RENEWAL_6_TOTAL_CENTS = RENEWAL_6_MONTHLY_CENTS * 6;
export const RENEWAL_12_TOTAL_CENTS = RENEWAL_12_MONTHLY_CENTS * 12;
export const RENEWAL_PLAN_OPTIONS = '6 ou 12 meses';
export const RENEWAL_NOTE =
  'A partir do 2º ano, renove em 6 meses (R$ 25,90/mês) ou 12 meses (R$ 19,90/mês).';

export function formatBrl(cents: number): string {
  return (cents / 100).toLocaleString('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  });
}

export function monthlyPriceLabel(totalCents: number, months: number): string {
  return formatBrl(Math.round(totalCents / months));
}

export const KIT_LAUNCH_PRICING = {
  promoLabel: KIT_PROMO_LABEL,
  includedMonths: KIT_INCLUDED_MONTHS,
  compareAtTotalLabel: formatBrl(KIT_REGULAR_TOTAL_CENTS),
  compareAtMonthlyLabel: monthlyPriceLabel(KIT_REGULAR_TOTAL_CENTS, KIT_INCLUDED_MONTHS),
  promoTotalLabel: formatBrl(KIT_PROMO_TOTAL_CENTS),
  promoMonthlyLabel: monthlyPriceLabel(KIT_PROMO_TOTAL_CENTS, KIT_INCLUDED_MONTHS),
  renewalMonthlyLabel: formatBrl(RENEWAL_6_MONTHLY_CENTS),
  renewalPlanOptions: RENEWAL_PLAN_OPTIONS,
  renewalNote: RENEWAL_NOTE,
};

export const RENEWAL_PLANS = [
  {
    slug: 'renovacao-6-meses',
    months: 6,
    monthlyCents: RENEWAL_6_MONTHLY_CENTS,
    totalCents: RENEWAL_6_TOTAL_CENTS,
  },
  {
    slug: 'renovacao-12-meses',
    months: 12,
    monthlyCents: RENEWAL_12_MONTHLY_CENTS,
    totalCents: RENEWAL_12_TOTAL_CENTS,
  },
] as const;
