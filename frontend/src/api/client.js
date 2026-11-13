export const API_URL = (import.meta.env.VITE_API_URL || 'http://localhost:8000').replace(/\/$/, '');
export const TOKEN_KEY = 'campusbite_token';
export const USER_KEY = 'campusbite_user';

export class ApiError extends Error {
  constructor(message, status, data) {
    super(message);
    this.status = status;
    this.data = data;
  }
}

function buildUrl(path, params) {
  const url = new URL(API_URL + path);
  Object.entries(params || {}).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== '') url.searchParams.set(key, value);
  });
  return url.toString();
}

function errorMessage(data, res) {
  const detail = data?.detail;
  if (typeof detail === 'string') return detail;
  if (Array.isArray(detail)) return detail.map((d) => d.msg).join('; ');
  if (res.status === 429) return 'Too many requests. Please slow down and try again shortly.';
  if (res.status >= 500) return 'The server ran into a problem. Please try again.';
  return res.statusText || 'Request failed';
}

/**
 * Small fetch wrapper: JSON in/out, attaches the JWT from localStorage,
 * and normalises errors into ApiError.
 */
export async function api(path, { method = 'GET', body, params, form } = {}) {
  const headers = { Accept: 'application/json' };
  const token = localStorage.getItem(TOKEN_KEY);
  if (token) headers.Authorization = `Bearer ${token}`;

  let payload;
  if (form) {
    payload = new URLSearchParams(form);
    headers['Content-Type'] = 'application/x-www-form-urlencoded';
  } else if (body !== undefined) {
    payload = JSON.stringify(body);
    headers['Content-Type'] = 'application/json';
  }

  let res;
  try {
    res = await fetch(buildUrl(path, params), { method, headers, body: payload });
  } catch {
    throw new ApiError('Cannot reach the CampusBite server. Is the backend running?', 0);
  }

  const data = res.status === 204 ? null : await res.json().catch(() => null);
  if (!res.ok) {
    if (res.status === 401 && token) {
      window.dispatchEvent(new Event('campusbite:unauthorized'));
    }
    throw new ApiError(errorMessage(data, res), res.status, data);
  }
  return data;
}

// Endpoint helpers grouped by feature
export const authApi = {
  login: (email, password) => api('/api/auth/login', { method: 'POST', body: { email, password } }),
  register: (payload) => api('/api/auth/register', { method: 'POST', body: payload }),
  me: () => api('/api/auth/me'),
  updateMe: (payload) => api('/api/auth/me', { method: 'PATCH', body: payload }),
};

export const restaurantApi = {
  list: (params) => api('/api/restaurants', { params }),
  cuisines: () => api('/api/restaurants/cuisines'),
  get: (id) => api(`/api/restaurants/${id}`),
  menu: (id, params) => api(`/api/restaurants/${id}/menu`, { params }),
  categories: (id) => api(`/api/restaurants/${id}/categories`),
  reviews: (id, params) => api(`/api/restaurants/${id}/reviews`, { params }),
  searchDishes: (params) => api('/api/dishes', { params }),
};

export const orderApi = {
  place: (payload) => api('/api/orders', { method: 'POST', body: payload }),
  list: (params) => api('/api/orders', { params }),
  get: (id) => api(`/api/orders/${id}`),
  cancel: (id) => api(`/api/orders/${id}/cancel`, { method: 'POST' }),
  review: (id, payload) => api(`/api/orders/${id}/review`, { method: 'POST', body: payload }),
  requestReturn: (id, reason) => api(`/api/orders/${id}/return`, { method: 'POST', body: { reason } }),
};

export const ownerApi = {
  restaurant: () => api('/api/owner/restaurant'),
  createRestaurant: (payload) => api('/api/owner/restaurant', { method: 'POST', body: payload }),
  updateRestaurant: (payload) => api('/api/owner/restaurant', { method: 'PATCH', body: payload }),
  stats: () => api('/api/owner/stats'),
  menu: (params) => api('/api/owner/menu', { params }),
  addDish: (payload) => api('/api/owner/menu', { method: 'POST', body: payload }),
  updateDish: (id, payload) => api(`/api/owner/menu/${id}`, { method: 'PATCH', body: payload }),
  setAvailability: (id, isAvailable) =>
    api(`/api/owner/menu/${id}/availability`, { method: 'PATCH', body: { is_available: isAvailable } }),
  deleteDish: (id) => api(`/api/owner/menu/${id}`, { method: 'DELETE' }),
  orders: (params) => api('/api/owner/orders', { params }),
  order: (id) => api(`/api/owner/orders/${id}`),
  updateStatus: (id, status, note) =>
    api(`/api/owner/orders/${id}/status`, { method: 'PATCH', body: { status, note } }),
  partners: () => api('/api/owner/delivery-partners'),
  assign: (id, partnerId) =>
    api(`/api/owner/orders/${id}/assign`, { method: 'POST', body: { delivery_partner_id: partnerId } }),
  returns: (params) => api('/api/owner/returns', { params }),
  approveReturn: (id, note) => api(`/api/owner/returns/${id}/approve`, { method: 'POST', body: { note } }),
  rejectReturn: (id, note) => api(`/api/owner/returns/${id}/reject`, { method: 'POST', body: { note } }),
  reminders: (params) => api('/api/owner/reminders', { params }),
  dismissReminder: (id) => api(`/api/owner/reminders/${id}/dismiss`, { method: 'POST' }),
};

export const deliveryApi = {
  orders: (params) => api('/api/delivery/orders', { params }),
  order: (id) => api(`/api/delivery/orders/${id}`),
  stats: () => api('/api/delivery/stats'),
  updateStatus: (id, status) => api(`/api/delivery/orders/${id}/status`, { method: 'PATCH', body: { status } }),
};

export const aiApi = {
  ask: (question) => api('/api/ai/insights', { method: 'POST', body: { question } }),
};
