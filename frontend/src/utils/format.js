const currency = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR' });

export const formatMoney = (value) => currency.format(Number(value || 0));

export const formatDateTime = (iso) =>
  iso
    ? new Date(iso).toLocaleString(undefined, {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
      })
    : '—';

export const formatDate = (iso) =>
  iso ? new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' }) : '—';

export function timeAgo(iso) {
  if (!iso) return '';
  const minutes = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} h ago`;
  return `${Math.round(hours / 24)} d ago`;
}

export const ORDER_FLOW = ['PLACED', 'ACCEPTED', 'PREPARING', 'READY', 'ASSIGNED', 'OUT_FOR_DELIVERY', 'DELIVERED'];

export const ORDER_STATUSES = [...ORDER_FLOW, 'CANCELLED', 'REFUNDED'];

export const STATUS_LABEL = {
  PLACED: 'Placed',
  ACCEPTED: 'Accepted',
  PREPARING: 'Preparing',
  READY: 'Ready for pickup',
  ASSIGNED: 'Rider assigned',
  OUT_FOR_DELIVERY: 'Out for delivery',
  DELIVERED: 'Delivered',
  CANCELLED: 'Cancelled',
  REFUNDED: 'Refunded',
  mock_paid: 'Paid (mock)',
  pending: 'Payment pending',
  refunded: 'Refunded',
  requested: 'Return requested',
  approved: 'Return approved',
  rejected: 'Return rejected',
};

export const CUISINE_EMOJI = {
  'north indian': '🍛',
  italian: '🍕',
  healthy: '🥗',
  chinese: '🥡',
  japanese: '🍣',
  mexican: '🌮',
  desserts: '🍰',
  cafe: '☕',
  burgers: '🍔',
};

export const cuisineEmoji = (cuisine) => CUISINE_EMOJI[(cuisine || '').toLowerCase()] || '🍽️';

/** Owner/partner action -> human button label */
export const ACTION_LABEL = {
  'status:ACCEPTED': 'Accept order',
  'status:CANCELLED': 'Reject order',
  'status:PREPARING': 'Start preparing',
  'status:READY': 'Mark ready',
  'status:OUT_FOR_DELIVERY': 'Picked up · Out for delivery',
  'status:DELIVERED': 'Mark delivered',
};
