const db = require('../db');

const isMissingTableError = (err) => {
  return err && (err.code === 'ER_NO_SUCH_TABLE' || err.code === 'ER_BAD_TABLE_ERROR');
};

const ensureCaptureColumns = () => {
  const columns = [
    { name: 'captureId', definition: 'VARCHAR(255) DEFAULT NULL' },
    { name: 'refundReason', definition: 'VARCHAR(255) DEFAULT NULL' }
  ];

  columns.forEach((column) => {
    const sql = `ALTER TABLE transactions ADD COLUMN \`${column.name}\` ${column.definition}`;
    db.query(sql, (err) => {
      if (!err) return;
      if (isMissingTableError(err)) return;
      if (err.code === 'ER_DUP_FIELDNAME') return;
      console.warn('transactions schema sync failed:', err.code || err.message);
    });
  });
};

ensureCaptureColumns();

const Transaction = {
  create: (data, callback) => {
    const sql = `INSERT INTO transactions (orderId, payerId, payerEmail, amount, currency, status, time, captureId, refundReason)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`;
    const params = [
      data.orderId,
      data.payerId,
      data.payerEmail,
      data.amount,
      data.currency,
      data.status,
      data.time,
      data.captureId || null,
      data.refundReason || null
    ];
    db.query(sql, params, (err, result) => {
      if (err && isMissingTableError(err)) {
        console.warn('transactions table missing; skipping transaction insert');
        if (callback) return callback(null, { skipped: true });
        return;
      }
      if (callback) callback(err, result);
    });
  },

  getByOrderId: async (orderId) => {
    return new Promise((resolve, reject) => {
      db.query('SELECT * FROM transactions WHERE orderId = ? LIMIT 1', [orderId], (err, results) => {
        if (err && isMissingTableError(err)) {
          console.warn('transactions table missing; returning null for getByOrderId');
          return resolve(null);
        }
        if (err) return reject(err);
        resolve(results && results[0] ? results[0] : null);
      });
    });
  },

  updateStatusByOrderId: async (orderId, status, reason) => {
    return new Promise((resolve, reject) => {
      const params = [status, reason, orderId];
      db.query('UPDATE transactions SET status = ?, refundReason = ? WHERE orderId = ?', params, (err, result) => {
        if (err && isMissingTableError(err)) {
          console.warn('transactions table missing; skipping updateStatusByOrderId');
          return resolve({ skipped: true });
        }
        if (!err) return resolve(result);
        if (err.code === 'ER_BAD_FIELD_ERROR') {
          db.query('UPDATE transactions SET status = ?, refund_reason = ? WHERE orderId = ?', params, (fallbackErr, fallbackResult) => {
            if (fallbackErr) return reject(fallbackErr);
            return resolve(fallbackResult);
          });
          return;
        }
        return reject(err);
      });
    });
  }
};

module.exports = Transaction;
