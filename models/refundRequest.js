const db = require('../db');

const isMissingTableError = (err) => {
  return err && (err.code === 'ER_NO_SUCH_TABLE' || err.code === 'ER_BAD_TABLE_ERROR');
};

const RefundRequest = {
  upsert: (orderId, userId, reason, callback) => {
    const sql = `
      INSERT INTO refund_request (order_id, user_id, reason, status, created_at)
      VALUES (?, ?, ?, 'requested', NOW())
      ON DUPLICATE KEY UPDATE
        reason = VALUES(reason),
        status = 'requested',
        admin_id = NULL,
        admin_note = NULL,
        processed_at = NULL
    `;
    db.query(sql, [orderId, userId, reason], (err, result) => {
      if (err && isMissingTableError(err)) {
        console.warn('refund_request table missing; skipping upsert');
        if (callback) return callback(null, { skipped: true });
        return;
      }
      if (callback) callback(err, result);
    });
  },

  getByOrderIds: (orderIds) => {
    return new Promise((resolve, reject) => {
      if (!orderIds || !orderIds.length) return resolve([]);
      const placeholders = orderIds.map(() => '?').join(',');
      const sql = `SELECT * FROM refund_request WHERE order_id IN (${placeholders})`;
      db.query(sql, orderIds, (err, rows) => {
        if (err && isMissingTableError(err)) {
          console.warn('refund_request table missing; returning empty set');
          return resolve([]);
        }
        if (err) return reject(err);
        resolve(rows || []);
      });
    });
  },

  getByOrderId: (orderId) => {
    return new Promise((resolve, reject) => {
      db.query('SELECT * FROM refund_request WHERE order_id = ? LIMIT 1', [orderId], (err, rows) => {
        if (err && isMissingTableError(err)) {
          console.warn('refund_request table missing; returning null');
          return resolve(null);
        }
        if (err) return reject(err);
        resolve(rows && rows[0] ? rows[0] : null);
      });
    });
  },

  markApproved: (orderId, adminId, note) => {
    return new Promise((resolve, reject) => {
      const sql = `
        UPDATE refund_request
        SET status = 'approved',
            admin_id = ?,
            admin_note = ?,
            processed_at = NOW()
        WHERE order_id = ?
      `;
      db.query(sql, [adminId || null, note || null, orderId], (err, result) => {
        if (err && isMissingTableError(err)) {
          console.warn('refund_request table missing; skipping markApproved');
          return resolve({ skipped: true });
        }
        if (err) return reject(err);
        resolve(result);
      });
    });
  }
};

module.exports = RefundRequest;
