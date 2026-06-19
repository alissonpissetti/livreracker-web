import type { Product } from '../types';

const PRODUCT_PRESENTATION: Partial<
  Record<string, Pick<Product, 'name' | 'description'>>
> = {
  'kit-tsim7080g': {
    name: 'Kit rastreador LT',
    description:
      'Kit completo com rastreador, antena e chip já configurados para o LIVRE TRACKER. Inclui 12 meses de uso sem mensalidade. A partir do 2º ano, renove em planos de 6 ou 12 meses por R$ 25,90/mês.',
  },
};

export function presentProduct(product: Product): Product {
  const copy = PRODUCT_PRESENTATION[product.slug];
  if (!copy) return product;
  return { ...product, ...copy };
}
