import type {
  AccountDevice,
  AccountOrder,
  DeviceLocationsResponse,
  PublicTrackingResponse,
  TrackingShareLink,
  AdminManagedDevice,
  AdminOrder,
  AdminOverview,
  AdminUser,
  AdminUserDetail,
  AdminVoucher,
  AuthResponse,
  PhoneLoginRequestResponse,
  Product,
  User,
  VoucherPreview,
} from '../types';
import type {
  CheckoutCreateResult,
  CheckPaymentResult,
  PayOrderResult,
  PixQrResult,
  RenewalPlan,
  StoreOrder,
} from '../types/store';
import { presentProduct } from '../utils/productPresentation';

const API_BASE = import.meta.env.VITE_API_URL ?? '';
const TOKEN_KEY = 'livre_tracker_token';

export function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

export function setToken(token: string) {
  localStorage.setItem(TOKEN_KEY, token);
}

export function clearToken() {
  localStorage.removeItem(TOKEN_KEY);
}

async function parseError(response: Response): Promise<string> {
  if (response.status === 502 || response.status === 503) {
    return 'API indisponível. Inicie o backend com: npm run dev:api (ou npm run dev na raiz do projeto).';
  }

  if (response.status >= 500) {
    return 'Erro no servidor. Tente novamente em instantes.';
  }

  try {
    const data = await response.json();
    if (Array.isArray(data.message)) {
      return data.message.join(', ');
    }
    if (typeof data.message === 'string') {
      return data.message;
    }
  } catch {
    // ignore
  }
  return `Erro ${response.status}`;
}

export async function api<T>(
  path: string,
  options?: RequestInit & { auth?: boolean },
): Promise<T> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options?.headers as Record<string, string> | undefined),
  };

  if (options?.auth !== false) {
    const token = getToken();
    if (token) {
      headers.Authorization = `Bearer ${token}`;
    }
  }

  let response: Response;
  try {
    response = await fetch(`${API_BASE}${path}`, {
      ...options,
      headers,
    });
  } catch {
    const hint = API_BASE
      ? `Não foi possível conectar em ${API_BASE}. Verifique se a API está no ar e se WEB_ORIGIN inclui ${window.location.origin}.`
      : 'VITE_API_URL não foi definida no build do site. Configure no Coolify (ex: https://api.livretracker.com) e faça redeploy.';
    throw new Error(hint);
  }

  if (!response.ok) {
    throw new Error(await parseError(response));
  }

  return response.json() as Promise<T>;
}

export function register(body: {
  name: string;
  email: string;
  phone: string;
  password: string;
}) {
  return api<AuthResponse>('/v1/auth/register', {
    method: 'POST',
    body: JSON.stringify(body),
    auth: false,
  });
}

export function login(body: { email: string; password: string }) {
  return api<AuthResponse>('/v1/auth/login', {
    method: 'POST',
    body: JSON.stringify(body),
    auth: false,
  });
}

export function requestPhoneLogin(body: { phone: string }) {
  return api<PhoneLoginRequestResponse>('/v1/auth/login/phone', {
    method: 'POST',
    body: JSON.stringify(body),
    auth: false,
  });
}

export function verifyPhoneLogin(body: { phone: string; code: string }) {
  return api<AuthResponse>('/v1/auth/login/phone/verify', {
    method: 'POST',
    body: JSON.stringify(body),
    auth: false,
  });
}

export function resendPhoneLogin(body: { phone: string }) {
  return api<PhoneLoginRequestResponse>('/v1/auth/login/phone/resend', {
    method: 'POST',
    body: JSON.stringify(body),
    auth: false,
  });
}

export function requestPasswordRecovery(body: { phone: string }) {
  return api<{ phone_mask: string; message: string }>('/v1/auth/recover/request', {
    method: 'POST',
    body: JSON.stringify(body),
    auth: false,
  });
}

export function resetPasswordWithOtp(body: {
  phone: string;
  code: string;
  new_password: string;
}) {
  return api<AuthResponse>('/v1/auth/recover/reset', {
    method: 'POST',
    body: JSON.stringify(body),
    auth: false,
  });
}

export function getMe() {
  return api<User>('/v1/auth/me');
}

export function getProducts() {
  return api<Product[]>('/v1/store/products', { auth: false }).then((items) =>
    items.map(presentProduct),
  );
}

export function getRenewalPlans() {
  return api<{ plans: RenewalPlan[] }>('/v1/store/renewal/plans');
}

export function createRenewalCheckout(subscriptionId: string, planSlug: string) {
  return api<CheckoutCreateResult>('/v1/store/renewal/checkout', {
    method: 'POST',
    body: JSON.stringify({
      subscription_id: subscriptionId,
      plan_slug: planSlug,
    }),
  });
}

export function checkout(
  items: { product_slug: string; quantity: number }[],
  voucherCode?: string,
) {
  return api<CheckoutCreateResult>('/v1/store/checkout', {
    method: 'POST',
    body: JSON.stringify({
      items,
      voucher_code: voucherCode?.trim() || undefined,
    }),
  });
}

export function getStoreOrder(orderId: string) {
  return api<StoreOrder>(`/v1/store/orders/${orderId}`);
}

export function identifyStoreClient(
  orderId: string,
  data: { name: string; cpf: string; phone: string; email: string },
) {
  return api<{ ok: boolean }>(`/v1/store/orders/${orderId}/identify-client`, {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

export function payStoreOrder(
  orderId: string,
  paymentData: {
    paymentMethod: 'pix' | 'creditCard';
    installments?: number;
    creditCard?: {
      holderName: string;
      number: string;
      expiryMonth: string;
      expiryYear: string;
      ccv: string;
    };
    creditCardHolderInfo?: {
      name: string;
      email: string;
      cpfCnpj: string;
      postalCode: string;
      addressNumber: string;
      addressComplement?: string | null;
      phone: string;
      mobilePhone: string;
    };
  },
) {
  const installments = Number(paymentData.installments);
  return api<PayOrderResult>(`/v1/store/orders/${orderId}/pay`, {
    method: 'POST',
    body: JSON.stringify({
      ...paymentData,
      installments:
        Number.isFinite(installments) && installments >= 1
          ? Math.min(3, Math.floor(installments))
          : 1,
    }),
  });
}

export function getStoreOrderPix(orderId: string) {
  return api<PixQrResult>(`/v1/store/orders/${orderId}/pix`);
}

export function checkStoreOrderPayment(orderId: string) {
  return api<CheckPaymentResult>(`/v1/store/orders/${orderId}/check`, {
    method: 'POST',
    body: JSON.stringify({}),
  });
}

export function cancelStorePendingPayment(orderId: string) {
  return api<{ ok: boolean; cancelled: number }>(
    `/v1/store/orders/${orderId}/cancel-pending-payment`,
    { method: 'POST', body: JSON.stringify({}) },
  );
}

export function previewVoucher(
  items: { product_slug: string; quantity: number }[],
  voucherCode: string,
  paymentMethod: 'pix' | 'creditCard' = 'pix',
) {
  return api<VoucherPreview>('/v1/store/voucher/preview', {
    method: 'POST',
    body: JSON.stringify({
      items,
      voucher_code: voucherCode,
      payment_method: paymentMethod,
    }),
  });
}

export function getOrders() {
  return api<{ orders: AccountOrder[] }>('/v1/account/orders');
}

export function getDevices() {
  return api<{ devices: AccountDevice[] }>('/v1/account/devices');
}

export function activateDevice(deviceSlotId: string, deviceId: string) {
  return api<AccountDevice>(`/v1/account/devices/${deviceSlotId}/activate`, {
    method: 'PATCH',
    body: JSON.stringify({ device_id: deviceId }),
  });
}

export function updateDevice(
  deviceSlotId: string,
  body: { label?: string; icon?: string },
) {
  return api<AccountDevice>(`/v1/account/devices/${deviceSlotId}`, {
    method: 'PATCH',
    body: JSON.stringify(body),
  });
}

export function getDeviceLocations(
  deviceSlotId: string,
  params?: { from?: string; to?: string; since?: string; limit?: number; full?: boolean },
) {
  const search = new URLSearchParams();
  if (params?.from) search.set('from', params.from);
  if (params?.to) search.set('to', params.to);
  if (params?.since) search.set('since', params.since);
  if (params?.limit) search.set('limit', String(params.limit));
  if (params?.full) search.set('full', 'true');
  const query = search.toString();
  return api<DeviceLocationsResponse>(
    `/v1/account/devices/${deviceSlotId}/locations${query ? `?${query}` : ''}`,
  );
}

export function activateDeviceEmergency(deviceSlotId: string) {
  return api<AccountDevice>(`/v1/account/devices/${deviceSlotId}/emergency`, {
    method: 'POST',
    body: JSON.stringify({}),
  });
}

export function deactivateDeviceEmergency(deviceSlotId: string) {
  return api<AccountDevice>(`/v1/account/devices/${deviceSlotId}/emergency`, {
    method: 'DELETE',
  });
}

export function createDeviceShareLink(
  deviceSlotId: string,
  body: { recipient_name: string; expires_in_hours?: number },
) {
  return api<TrackingShareLink>(`/v1/account/devices/${deviceSlotId}/share-links`, {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

export function listDeviceShareLinks(deviceSlotId: string) {
  return api<{ shares: TrackingShareLink[] }>(
    `/v1/account/devices/${deviceSlotId}/share-links`,
  );
}

export function revokeDeviceShareLink(deviceSlotId: string, shareId: string) {
  return api<TrackingShareLink>(
    `/v1/account/devices/${deviceSlotId}/share-links/${shareId}`,
    { method: 'DELETE' },
  );
}

export function dismissDeviceShareLink(deviceSlotId: string, shareId: string) {
  return api<{ ok: true }>(`/v1/account/devices/${deviceSlotId}/share-links/${shareId}/dismiss`, {
    method: 'POST',
  });
}

export function getPublicTracking(
  token: string,
  params?: { since?: string; limit?: number },
) {
  const search = new URLSearchParams();
  if (params?.since) search.set('since', params.since);
  if (params?.limit) search.set('limit', String(params.limit));
  const query = search.toString();
  return api<PublicTrackingResponse>(
    `/v1/public/track/${encodeURIComponent(token)}${query ? `?${query}` : ''}`,
    { auth: false },
  );
}

export function getAdminOverview() {
  return api<AdminOverview>('/v1/admin/overview');
}

export function getAdminUsers() {
  return api<{ users: AdminUser[] }>('/v1/admin/users');
}

export function getAdminUserDetail(userId: string) {
  return api<AdminUserDetail>(`/v1/admin/users/${userId}`);
}

export function getAdminDevices() {
  return api<{ devices: AdminManagedDevice[] }>('/v1/admin/devices');
}

export function getAdminOrders() {
  return api<{ orders: AdminOrder[] }>('/v1/admin/orders');
}

export function adminBlockDevice(deviceId: string, reason?: string) {
  return api(`/v1/admin/devices/${deviceId}/block`, {
    method: 'PATCH',
    body: JSON.stringify({ reason }),
  });
}

export function adminUnblockDevice(deviceId: string) {
  return api(`/v1/admin/devices/${deviceId}/unblock`, {
    method: 'PATCH',
    body: JSON.stringify({}),
  });
}

export function getAdminVouchers() {
  return api<{ vouchers: AdminVoucher[] }>('/v1/admin/vouchers');
}

export function createAdminVoucher(body: {
  code: string;
  discount_type: 'percent' | 'fixed';
  discount_value: number;
  max_uses?: number;
  expires_at?: string;
  min_order_cents?: number;
  description?: string;
}) {
  return api<{ voucher: AdminVoucher }>('/v1/admin/vouchers', {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

export function updateAdminVoucher(voucherId: string, active: boolean) {
  return api<{ voucher: AdminVoucher }>(`/v1/admin/vouchers/${voucherId}`, {
    method: 'PATCH',
    body: JSON.stringify({ active }),
  });
}
