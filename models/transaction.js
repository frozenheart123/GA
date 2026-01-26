const db = require('../db');

const Transaction = {
  create: (data, callback) => {
    const sql = `INSERT INTO transactions (orderId, payerId, payerEmail, amount, currency, status, time)
                 VALUES (?, ?, ?, ?, ?, ?, ?)`;
    const params = [data.orderId, data.payerId, data.payerEmail, data.amount, data.currency, data.status, data.time];
    db.query(sql, params, (err, result) => {
      if (callback) callback(err, result);
    });
  }
};

module.exports = Transaction;