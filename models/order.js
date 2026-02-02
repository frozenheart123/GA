const db = require('../db');
const Product = require('./product');

let cachedHasPaymentMethod = null;

const hasPaymentMethodColumn = () => {
  if (cachedHasPaymentMethod !== null) {
    return Promise.resolve(cachedHasPaymentMethod);
  }
  return new Promise((resolve) => {
    db.query("SHOW COLUMNS FROM orders LIKE 'payment_method'", (err, rows) => {
      if (err) {
        cachedHasPaymentMethod = false;
        return resolve(false);
      }
      cachedHasPaymentMethod = !!(rows && rows.length);
      return resolve(cachedHasPaymentMethod);
    });
  });
};

exports.createOrder = (userId, subtotal, discount, total, cartItems, paymentMethod) => {
  return new Promise((resolve, reject) => {
    hasPaymentMethodColumn()
      .then((hasPaymentMethod) => {
        // Start transaction
        db.beginTransaction((err) => {
          if (err) return reject(err);

          const orderSql = hasPaymentMethod
            ? `INSERT INTO orders (user_id, subtotal_amount, discount_amount, total_amount, status, contains_membership, created_at, payment_method)
               VALUES (?, ?, ?, ?, 'paid', 0, NOW(), ?)`
            : `INSERT INTO orders (user_id, subtotal_amount, discount_amount, total_amount, status, contains_membership, created_at)
               VALUES (?, ?, ?, ?, 'paid', 0, NOW())`;
          const orderParams = hasPaymentMethod
            ? [userId, subtotal, discount, total, paymentMethod]
            : [userId, subtotal, discount, total];

          db.query(orderSql, orderParams, (err, result) => {
            if (err) {
              return db.rollback(() => reject(err));
            }

            const orderId = result.insertId;

            // Insert order items
            if (!cartItems || !cartItems.length) {
              return db.commit((commitErr) => {
                if (commitErr) {
                  return db.rollback(() => reject(commitErr));
                }
                resolve(orderId);
              });
            }

            const itemPromises = cartItems.map(item => {
              return new Promise((resolveItem, rejectItem) => {
                const itemSql = `INSERT INTO order_item (order_id, product_id, quantity, unit_price, line_total)
                                 VALUES (?, ?, ?, ?, ?)`;
                const lineTotal = Number(item.quantity) * Number(item.price);
                db.query(itemSql, [orderId, item.productId, item.quantity, item.price, lineTotal], (err) => {
                  if (err) rejectItem(err);
                  else resolveItem();
                });
              });
            });

            Promise.all(itemPromises)
              .then(() => {
                db.commit((commitErr) => {
                  if (commitErr) {
                    return db.rollback(() => reject(commitErr));
                  }
                  resolve(orderId);
                });
              })
              .catch((itemErr) => {
                db.rollback(() => reject(itemErr));
              });
          });
        });
      })
      .catch(reject);
  });
};

exports.getItemsByOrderId = (orderId) => {
  return new Promise((resolve, reject) => {
    const sql = `SELECT product_id, quantity, unit_price, line_total
                 FROM order_item WHERE order_id = ?`;
    db.query(sql, [orderId], (err, rows) => {
      if (err) return reject(err);
      resolve(rows || []);
    });
  });
};

exports.getItemsWithIdsByOrderId = (orderId) => {
  return new Promise((resolve, reject) => {
    const sql = `SELECT order_item_id, product_id, quantity, unit_price, line_total
                 FROM order_item WHERE order_id = ?`;
    db.query(sql, [orderId], (err, rows) => {
      if (err) return reject(err);
      resolve(rows || []);
    });
  });
};

exports.getOrdersByUser = (userId) => {
  return new Promise((resolve, reject) => {
    hasPaymentMethodColumn()
      .then((hasPaymentMethod) => {
        const sql = hasPaymentMethod
          ? `SELECT order_id, user_id, subtotal_amount, discount_amount, total_amount, status, created_at, payment_method
             FROM orders WHERE user_id = ? ORDER BY created_at DESC`
          : `SELECT order_id, user_id, subtotal_amount, discount_amount, total_amount, status, created_at
             FROM orders WHERE user_id = ? ORDER BY created_at DESC`;
        db.query(sql, [userId], (err, rows) => {
          if (err) return reject(err);
          resolve(rows || []);
        });
      })
      .catch(reject);
  });
};

exports.getItemsForOrders = (orderIds) => {
  return new Promise((resolve, reject) => {
    if (!orderIds || !orderIds.length) return resolve([]);
    const placeholders = orderIds.map(() => '?').join(',');
    const sql = `SELECT oi.order_item_id, oi.order_id, oi.product_id, oi.quantity, oi.unit_price, oi.line_total, p.name
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

const STATUS_OPTIONS = ['awaiting_payment', 'paid', 'shipped', 'completed', 'cancelled', 'refunded'];

exports.adminList = ({ q, status } = {}) => {
  return new Promise((resolve, reject) => {
    hasPaymentMethodColumn()
      .then((hasPaymentMethod) => {
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
                 o.total_amount, o.status, o.created_at${hasPaymentMethod ? ', o.payment_method' : ''}
          FROM orders o
          LEFT JOIN users u ON u.user_id = o.user_id
          ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
          ORDER BY o.created_at DESC
        `;
        db.query(sql, params, (err, rows) => {
          if (err) return reject(err);
          resolve(rows || []);
        });
      })
      .catch(reject);
  });
};

exports.getById = (orderId) => {
  return new Promise((resolve, reject) => {
    hasPaymentMethodColumn()
      .then((hasPaymentMethod) => {
        const sql = hasPaymentMethod
          ? `
            SELECT o.order_id, o.user_id, IFNULL(u.name, 'Guest') AS user_name, u.email AS user_email,
                   u.contact_number AS user_contact, u.address AS user_address, o.subtotal_amount,
                   o.discount_amount, o.total_amount, o.status, o.created_at, o.payment_method
            FROM orders o
            LEFT JOIN users u ON u.user_id = o.user_id
            WHERE o.order_id = ? LIMIT 1
          `
          : `
            SELECT o.order_id, o.user_id, IFNULL(u.name, 'Guest') AS user_name, u.email AS user_email,
                   u.contact_number AS user_contact, u.address AS user_address, o.subtotal_amount,
                   o.discount_amount, o.total_amount, o.status, o.created_at
            FROM orders o
            LEFT JOIN users u ON u.user_id = o.user_id
            WHERE o.order_id = ? LIMIT 1
          `;
        db.query(sql, [orderId], (err, rows) => {
          if (err) return reject(err);
          resolve(rows && rows[0] ? rows[0] : null);
        });
      })
      .catch(reject);
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

exports.statusOptions = () => STATUS_OPTIONS.slice();

exports.restockItems = (orderId) => {
  return new Promise((resolve, reject) => {
    const sql = 'SELECT product_id, quantity FROM order_item WHERE order_id = ?';
    db.query(sql, [orderId], (err, rows) => {
      if (err) return reject(err);
      if (!rows || !rows.length) return resolve(0);
      const tasks = rows.map((row) => {
        return Product.incrementStock(row.product_id, row.quantity);
      });
      Promise.all(tasks)
        .then(() => resolve(rows.length))
        .catch(reject);
    });
  });
};

exports.updateOrderItemQuantity = (orderItemId, quantity, unitPrice) => {
  return new Promise((resolve, reject) => {
    const qty = Number(quantity || 0);
    if (qty <= 0) {
      return db.query('DELETE FROM order_item WHERE order_item_id = ?', [orderItemId], (err, result) => {
        if (err) return reject(err);
        resolve({ deleted: true, affected: result.affectedRows });
      });
    }
    const lineTotal = Number(qty) * Number(unitPrice || 0);
    db.query('UPDATE order_item SET quantity = ?, line_total = ? WHERE order_item_id = ?', [qty, lineTotal, orderItemId], (err, result) => {
      if (err) return reject(err);
      resolve({ deleted: false, affected: result.affectedRows });
    });
  });
};

exports.updateTotals = (orderId, subtotal, discount, total) => {
  return new Promise((resolve, reject) => {
    db.query('UPDATE orders SET subtotal_amount = ?, discount_amount = ?, total_amount = ? WHERE order_id = ?', [subtotal, discount, total, orderId], (err, result) => {
      if (err) return reject(err);
      resolve(result.affectedRows > 0);
    });
  });
};
