export type PaymentMethod = 'pix' | 'creditCard';

export type CheckoutCreateResult = {
  order_id: string;
  status: 'pending' | 'paid';
  order_type?: 'purchase' | 'renewal';
  subscription_id?: string;
  plan_slug?: string;
  message: string;
  redirect_to?: string;
  devices_created?: number;
  subscription_ids?: string[];
};

export type RenewalPlan = {
  slug: string;
  name: string;
  description: string;
  months: number;
  days: number;
  monthly_cents: number;
  monthly_label: string;
  total_cents: number;
  total_label: string;
};

export type StoreOrder = {
  id: string;
  status: 'pending' | 'paid';
  order_type: 'purchase' | 'renewal';
  subscription_id: string | null;
  payment_method: PaymentMethod | null;
  payment_status: 'pending' | 'paid' | 'failed' | 'cancelled' | null;
  customer_name: string;
  customer_email: string;
  customer_cpf: string | null;
  customer_phone: string | null;
  subtotal_cents: number;
  subtotal_label: string;
  discount_cents: number;
  discount_label: string | null;
  payment_discount_cents: number;
  payment_discount_label: string | null;
  payable_cents: number;
  payable_label: string;
  total_cents: number;
  total_label: string;
  voucher_code: string | null;
  installment_count: number | null;
  created_at: string;
  items: {
    product_slug: string;
    product_name: string;
    quantity: number;
    unit_price_cents: number;
    line_total_cents: number;
    line_total_label: string;
  }[];
};

export type PayOrderResult = {
  paymentMethod: PaymentMethod;
  installments: number;
  gateway_status: string;
  response: Record<string, unknown>;
  order: StoreOrder;
};

export type PixQrResult = {
  process: boolean;
  data:
    | {
        payload: string;
        encodedImage: string;
        expirationDate?: string | null;
      }
    | Array<{ code?: number; message?: string }>;
};

export type CheckPaymentResult = {
  process: boolean;
  data: StoreOrder;
};
