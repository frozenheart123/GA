const db = require('../db');

exports.getOrdersByUser = (userId) => {
  return new Promise((resolve, reject) => {
    const sql = `SELECT order_id, user_id, subtotal_amount, discount_amount, total_amount, status, created_at
                 FROM orders WHERE user_id = ? ORDER BY created_at DESC`;
    db.query(sql, [userId], (err, rows) => {
      if (err) return reject(err);
      resolve(rows || []);
    });
  });
};

exports.getItemsForOrders = (orderIds) => {
  return new Promise((resolve, reject) => {
    if (!orderIds || !orderIds.length) return resolve([]);
    const placeholders = orderIds.map(() => '?').join(',');
    const sql = `SELECT oi.order_id, oi.product_id, oi.quantity, oi.unit_price, oi.line_total, p.name
                 FROM order_item oi
                 JOIN product p ON p.product_id = oi.product_id
                 WHERE oi.order_id IN (${placeholders})
                 ORDER BY oi.order_id ASC, oi.order_item_id ASC`;
    db.query(sql, orderIds, (err, rows) => {
      if (err) return reject(err);
      resolve(rows || []);
    });
  });
};

const STATUS_OPTIONS = ['Pending', 'Preparing', 'Ready', 'Completed', 'Cancelled'];

exports.adminList = ({ q, status } = {}) => {
  return new Promise((resolve, reject) => {
    const where = [];
    const params = [];
    if (status && status !== 'All') {
      where.push('o.status = ?');
      params.push(status);
    }
    if (q) {
      const like = `%${q}%`;
      where.push('(o.order_id LIKE ? OR u.name LIKE ?)');
      params.push(like, like);
    }
    const sql = `
      SELECT o.order_id, o.user_id, IFNULL(u.name, 'Guest') AS user_name, o.subtotal_amount, o.discount_amount,
             o.total_amount, o.status, o.created_at
      FROM orders o
      LEFT JOIN users u ON u.user_id = o.user_id
      ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
      ORDER BY o.created_at DESC
    `;
    db.query(sql, params, (err, rows) => {
      if (err) return reject(err);
      resolve(rows || []);
    });
  });
};

exports.getById = (orderId) => {
  return new Promise((resolve, reject) => {
    const sql = `
      SELECT o.order_id, o.user_id, IFNULL(u.name, 'Guest') AS user_name, o.subtotal_amount,
             o.discount_amount, o.total_amount, o.status, o.created_at
      FROM orders o
      LEFT JOIN users u ON u.user_id = o.user_id
      WHERE o.order_id = ? LIMIT 1
    `;
    db.query(sql, [orderId], (err, rows) => {
      if (err) return reject(err);
      resolve(rows && rows[0] ? rows[0] : null);
    });
  });
};

exports.updateStatus = (orderId, status) => {
  return new Promise((resolve, reject) => {
    db.query('UPDATE orders SET status = ? WHERE order_id = ?', [status, orderId], (err, result) => {
      if (err) return reject(err);
      resolve(result.affectedRows > 0);
    });
  });
};

// Create a new order
exports.createOrder = (userId, totalAmount, address) => {
  return new Promise((resolve, reject) => {
    // Note: Adjust column names based on your actual database schema
    // If 'address' column doesn't exist, remove it from the INSERT
    const sql = `INSERT INTO orders (user_id, subtotal_amount, discount_amount, total_amount, status, created_at)
                 VALUES (?, ?, ?, ?, 'Pending', NOW())`;
    const params = [userId, totalAmount, 0, totalAmount];
    db.query(sql, params, (err, result) => {
      if (err) {
        console.error('Error creating order:', err);
        return reject(err);
      }
      resolve(result);
    });
  });
};

// Add items to an order
exports.addOrderItems = (orderId, items, address) => {
  return new Promise((resolve, reject) => {
    if (!items || !items.length) {
      return resolve({ affectedRows: 0 });
    }
    
    const values = items.map(item => [
      orderId,
      item.productId || item.product_id,
      item.quantity,
      item.price,
      item.total || (item.price * item.quantity)
    ]);
    
    const sql = `INSERT INTO order_item (order_id, product_id, quantity, unit_price, line_total)
                 VALUES ?`;
    db.query(sql, [values], (err, result) => {
      if (err) return reject(err);
      resolve(result);
    });
  });
};

exports.statusOptions = () => STATUS_OPTIONS.slice();
