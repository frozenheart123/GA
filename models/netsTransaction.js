const db = require('../db');

const serializePayload = (payload) => {
  if (payload == null) return null;
  if (typeof payload === "string") return payload;
  try {
    return JSON.stringify(payload);
  } catch (err) {
    console.warn("Failed to serialize payload for nets transaction:", err);
    return null;
  }
};

const NetsTransaction = {
  create: (data) => {
    return new Promise((resolve, reject) => {
      const sql = `
        INSERT INTO nets_transactions
          (user_id, order_id, amount, txn_retrieval_ref, net_transaction_id, course_init_id,
           status, response_code, network_status, payload)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `;
      const params = [
        data.userId || null,
        data.orderId || null,
        Number(data.amount || 0).toFixed(2),
        data.txnRetrievalRef,
        data.netTransactionId || null,
        data.courseInitId || null,
        data.status || 'pending',
        data.responseCode || null,
        data.networkStatus != null ? Number(data.networkStatus) : null,
        serializePayload(data.payload)
      ];

      db.query(sql, params, (err, result) => {
        if (err) return reject(err);
        resolve(result.insertId);
      });
    });
  },

  getByTxnRetrievalRef: (txnRetrievalRef) => {
    return new Promise((resolve, reject) => {
      const sql = 'SELECT * FROM nets_transactions WHERE txn_retrieval_ref = ? LIMIT 1';
      db.query(sql, [txnRetrievalRef], (err, rows) => {
        if (err) return reject(err);
        resolve(rows && rows[0] ? rows[0] : null);
      });
    });
  },

  updateByTxnRetrievalRef: (txnRetrievalRef, updates) => {
    return new Promise((resolve, reject) => {
      if (!updates || !Object.keys(updates).length) return resolve(0);
      const sets = [];
      const params = [];
      if (updates.userId !== undefined) {
        sets.push('user_id = ?');
        params.push(updates.userId);
      }
      if (updates.orderId !== undefined) {
        sets.push('order_id = ?');
        params.push(updates.orderId);
      }
      if (updates.amount !== undefined) {
        sets.push('amount = ?');
        params.push(Number(updates.amount || 0).toFixed(2));
      }
      if (updates.netTransactionId !== undefined) {
        sets.push('net_transaction_id = ?');
        params.push(updates.netTransactionId);
      }
      if (updates.courseInitId !== undefined) {
        sets.push('course_init_id = ?');
        params.push(updates.courseInitId);
      }
      if (updates.status !== undefined) {
        sets.push('status = ?');
        params.push(updates.status);
      }
      if (updates.responseCode !== undefined) {
        sets.push('response_code = ?');
        params.push(updates.responseCode);
      }
      if (updates.networkStatus !== undefined) {
        sets.push('network_status = ?');
        params.push(Number(updates.networkStatus));
      }
      if (updates.payload !== undefined) {
        sets.push("payload = ?");
        params.push(serializePayload(updates.payload));
      }

      if (!sets.length) return resolve(0);

      const sql = `UPDATE nets_transactions SET ${sets.join(', ')} WHERE txn_retrieval_ref = ?`;
      params.push(txnRetrievalRef);

      db.query(sql, params, (err, result) => {
        if (err) return reject(err);
        resolve(result.affectedRows);
      });
    });
  },
};

module.exports = NetsTransaction;
