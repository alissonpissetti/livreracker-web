import type {
  AccountDevice,
  AccountOrder,
  DeviceLocationsResponse,
  AdminManagedDevice,
  AdminOrder,
  AdminOverview,
  AdminUser,
  AdminUserDetail,
  AdminVoucher,
  AuthResponse,
  LoginChallengeResponse,
  LoginResult,
  CheckoutResult,
  Product,
  User,
  VoucherPreview,
} from '../types';

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
  return api<LoginResult>('/v1/auth/login', {
    method: 'POST',
    body: JSON.stringify(body),
    auth: false,
  });
}

export function verifyLoginOtp(body: {
  login_challenge_token: string;
  code: string;
}) {
  return api<AuthResponse>('/v1/auth/login/verify-otp', {
    method: 'POST',
    body: JSON.stringify(body),
    auth: false,
  });
}

export function resendLoginOtp(body: { login_challenge_token: string }) {
  return api<LoginChallengeResponse>('/v1/auth/login/resend-otp', {
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
  return api<Product[]>('/v1/store/products', { auth: false });
}

export function checkout(
  items: { product_slug: string; quantity: number }[],
  voucherCode?: string,
) {
  return api<CheckoutResult>('/v1/store/checkout', {
    method: 'POST',
    body: JSON.stringify({
      items,
      voucher_code: voucherCode?.trim() || undefined,
    }),
  });
}

export function previewVoucher(
  items: { product_slug: string; quantity: number }[],
  voucherCode: string,
) {
  return api<VoucherPreview>('/v1/store/voucher/preview', {
    method: 'POST',
    body: JSON.stringify({ items, voucher_code: voucherCode }),
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
  params?: { from?: string; to?: string; limit?: number },
) {
  const search = new URLSearchParams();
  if (params?.from) search.set('from', params.from);
  if (params?.to) search.set('to', params.to);
  if (params?.limit) search.set('limit', String(params.limit));
  const query = search.toString();
  return api<DeviceLocationsResponse>(
    `/v1/account/devices/${deviceSlotId}/locations${query ? `?${query}` : ''}`,
  );
}

export function renewDevice(deviceSlotId: string) {
  return api<AccountDevice>(`/v1/account/devices/${deviceSlotId}/renew`, {
    method: 'PATCH',
    body: JSON.stringify({ days: 30 }),
  });
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
