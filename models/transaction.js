const db = require('../db');


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
      if (callback) callback(err, result);
    });
  },

  getByOrderId: async (orderId) => {
    return new Promise((resolve, reject) => {
      db.query('SELECT * FROM transactions WHERE orderId = ? LIMIT 1', [orderId], (err, results) => {
        if (err) return reject(err);
        resolve(results && results[0] ? results[0] : null);
      });
    });
  },

  updateStatusByOrderId: async (orderId, status, reason) => {
    return new Promise((resolve, reject) => {
      const params = [status, reason, orderId];
      db.query('UPDATE transactions SET status = ?, refundReason = ? WHERE orderId = ?', params, (err, result) => {
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