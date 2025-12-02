const db = require('../db');

const cartitems = {
    // Return cart rows with productId alias and price/total
    getByUserId(userId, callback) {
        const sql = 'SELECT cart_item_id AS id, user_id AS userid, product_id AS productId, quantity, price, (price * quantity) AS total FROM cart_items WHERE user_id = ?';
        db.query(sql, [userId], callback);
    },

    // Get a single cart item for a user and product
    getItem(userId, productId, callback) {
        const sql = 'SELECT cart_item_id AS id, user_id AS userid, product_id AS productId, quantity, price, (price * quantity) AS total FROM cart_items WHERE user_id = ? AND product_id = ? LIMIT 1';
        db.query(sql, [userId, productId], function(err, rows) {
            if (err) return callback(err);
            return callback(null, rows && rows.length ? rows[0] : null);
        });
    },

    // Add quantity (or insert). Accept `price` per unit so we can compute `total`.
    add(userId, productId, quantity, price, callback) {
        const qty = Number(quantity || 0);
        const unitPrice = Number(price || 0);
        const selectSql = 'SELECT cart_item_id AS id, quantity FROM cart_items WHERE user_id = ? AND product_id = ?';
        db.query(selectSql, [userId, productId], (err, rows) => {
            if (err) return callback(err);
            if (rows && rows.length) {
                const existing = rows[0];
                const newQty = Number(existing.quantity || 0) + qty;
                const newTotal = newQty * unitPrice;
                db.query('UPDATE cart_items SET quantity = ?, price = ?, total = ? WHERE cart_item_id = ?', [newQty, unitPrice, newTotal, existing.id], callback);
            } else {
                const total = qty * unitPrice;
                db.query('INSERT INTO cart_items (user_id, product_id, quantity, price, total) VALUES (?, ?, ?, ?, ?)', [userId, productId, qty, unitPrice, total], callback);
            }
        });
    },

    // Remove the row entirely
    remove(userId, productId, callback) {
        db.query('DELETE FROM cart_items WHERE user_id = ? AND product_id = ?', [userId, productId], callback);
    },

    // Remove multiple productids for a user
    removeBulk(userId, productIds, callback) {
        if (!productIds || !productIds.length) return callback(null);
        const placeholders = productIds.map(() => '?').join(',');
        const sql = `DELETE FROM cart_items WHERE user_id = ? AND product_id IN (${placeholders})`;
        db.query(sql, [userId, ...productIds], callback);
    },

    // Decrement quantity by `amount`. Update total accordingly and remove row if quantity <= 0.
    decrement(userId, productId, amount, callback) {
        const amt = Number(amount || 1);
        const upd = 'UPDATE cart_items SET quantity = GREATEST(quantity - ?, 0), total = GREATEST(quantity - ?, 0) * price WHERE user_id = ? AND product_id = ?';
        db.query(upd, [amt, amt, userId, productId], (err) => {
            if (err) return callback(err);
            const del = 'DELETE FROM cart_items WHERE user_id = ? AND product_id = ? AND quantity <= 0';
            db.query(del, [userId, productId], callback);
        });
    },

    // Update quantity explicitly (and total). If newQty <= 0, the row will be deleted.
    updateQuantity(userId, productId, newQty, unitPrice, callback) {
        const qty = Number(newQty || 0);
        const price = Number(unitPrice || 0);
        if (qty <= 0) {
            return this.remove(userId, productId, callback);
        }
        const total = qty * price;
        const sql = 'UPDATE cart_items SET quantity = ?, price = ?, total = ? WHERE user_id = ? AND product_id = ?';
        db.query(sql, [qty, price, total, userId, productId], callback);
    },

    // Clear user's cart
    clear(userId, callback) {
        db.query('DELETE FROM cart_items WHERE user_id = ?', [userId], callback);
    }
};

module.exports = cartitems;