const normalizePaymentMethod = (value) => {
  if (!value) return '';
  const raw = String(value).trim();
  if (!raw) return '';
  const upper = raw.toUpperCase();
  if (upper.includes('NETS') && upper.includes('QR')) return 'NETS QR';
  if (upper.includes('NETS')) return 'NETS';
  if (upper.includes('PAYNOW')) return 'PayNow';
  if (upper.includes('PAYPAL')) return 'PayPal';
  return raw;
};

const resolvePaymentMethod = ({ order, transaction }) => {
  const direct = normalizePaymentMethod(order && order.payment_method);
  if (direct) return direct;

  const payerId = transaction && transaction.payerId ? String(transaction.payerId).trim() : '';
  const payerUpper = payerId.toUpperCase();
  if (payerUpper.includes('NETS')) return 'NETS';
  if (payerUpper.includes('PAYNOW')) return 'PayNow';

  if (payerId || (transaction && (transaction.payerEmail || transaction.captureId))) {
    return 'PayPal';
  }

  if (order && (order.status === 'paid' || order.status === 'refunded')) {
    return 'PayPal';
  }

  return '';
};

module.exports = { normalizePaymentMethod, resolvePaymentMethod };
