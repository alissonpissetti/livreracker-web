export type UserRole = 'customer' | 'admin';

export type User = {
  id: string;
  email: string;
  name: string;
  phone?: string | null;
  role: UserRole;
  created_at: string;
};

export type AuthResponse = {
  access_token: string;
  user: User;
};

export type PhoneLoginRequestResponse = {
  phone_mask: string;
  message: string;
};

export type Product = {
  slug: string;
  name: string;
  description: string;
  type: 'hardware' | 'subscription';
  price_cents: number;
  price_label: string;
  subscription_days?: number;
};

export type CartItem = {
  product_slug: string;
  quantity: number;
};

export type CheckoutResult = {
  order_id: string;
  subtotal_cents: number;
  subtotal_label: string;
  discount_cents: number;
  discount_label: string;
  total_cents: number;
  total_label: string;
  voucher_code: string | null;
  devices_created: number;
  subscription_ids: string[];
  message: string;
};

export type VoucherPreview = {
  valid: boolean;
  subtotal_cents: number;
  discount_cents: number;
  total_cents: number;
  subtotal_label: string;
  discount_label: string;
  total_label: string;
  voucher_code: string | null;
  message: string;
};

export type AdminVoucher = {
  id: string;
  code: string;
  discount_type: 'percent' | 'fixed';
  discount_value: number;
  discount_label: string;
  active: boolean;
  max_uses: number | null;
  used_count: number;
  expires_at: string | null;
  min_order_cents: number;
  min_order_label: string | null;
  description: string | null;
  created_at: string;
};

export type AccountDevice = {
  id: string;
  label?: string;
  icon: string;
  device_id?: string;
  status: string;
  current_period_end: string;
  is_active: boolean;
  awaiting_activation: boolean;
  order_id?: string;
  emergency_until?: string | null;
  emergency_active?: boolean;
};

export type DeviceLocation = {
  id: string;
  latitude: number;
  longitude: number;
  speed_knots?: number;
  accuracy_m?: number;
  battery_percent?: number;
  location_source?: string;
  is_valid?: boolean;
  /** Posição ajustada quando a leitura desvia lateralmente do trecho. */
  corrected_latitude?: number;
  corrected_longitude?: number;
  corridor_corrected?: boolean;
  recorded_at: string;
  received_at: string;
};

export type DeviceLocationsResponse = {
  device: AccountDevice;
  locations: DeviceLocation[];
};

export type TrackingShareLink = {
  id: string;
  token: string;
  recipient_name: string;
  expires_at: string | null;
  created_at: string;
  share_url: string;
  is_active: boolean;
};

export type PublicTrackingResponse = {
  recipient_name: string;
  device_label: string;
  device_icon: string;
  expires_at: string | null;
  locations: DeviceLocation[];
};

export type AccountOrder = {
  id: string;
  status: string;
  subtotal_label: string;
  discount_label: string | null;
  voucher_code: string | null;
  total_label: string;
  created_at: string;
  items: {
    product_slug: string;
    product_name: string;
    quantity: number;
    line_total_label: string;
  }[];
};

export type AdminOverview = {
  users_total: number;
  subscriptions_total: number;
  subscriptions_active: number;
  subscriptions_pending_activation: number;
  devices_tracked: number;
  devices_blocked: number;
  orders_total: number;
  vouchers_total: number;
  vouchers_active: number;
};

export type AdminUser = {
  id: string;
  name: string;
  email: string;
  phone?: string | null;
  created_at: string;
  devices_total: number;
  devices_active: number;
  devices_pending: number;
};

export type AdminManagedDevice = {
  subscription_id: string;
  label?: string;
  device_id?: string;
  status: string;
  is_active: boolean;
  awaiting_activation: boolean;
  current_period_end: string;
  owner_user_id?: string;
  owner_name?: string;
  owner_email?: string;
  blocked: boolean;
  blocked_reason?: string;
  last_latitude?: number;
  last_longitude?: number;
  last_location_source?: string;
  last_seen_at?: string;
};

export type AdminOrder = {
  id: string;
  customer_name: string;
  customer_email: string;
  owner_name: string;
  subtotal_label: string;
  discount_label: string | null;
  voucher_code: string | null;
  total_label: string;
  created_at: string;
  items: {
    product_name: string;
    quantity: number;
    line_total_label: string;
  }[];
};

export type AdminUserDetail = {
  id: string;
  name: string;
  email: string;
  phone?: string | null;
  role: string;
  created_at: string;
  devices: {
    subscription_id: string;
    label?: string;
    device_id?: string;
    status: string;
    is_active: boolean;
    awaiting_activation: boolean;
    current_period_end: string;
    blocked: boolean;
    blocked_reason?: string;
    last_latitude?: number;
    last_longitude?: number;
    last_seen_at?: string;
  }[];
  orders: {
    id: string;
    total_label: string;
    created_at: string;
    items: { product_name: string; quantity: number }[];
  }[];
};
