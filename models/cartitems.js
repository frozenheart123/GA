const db = require('../db');

const cartitems = {
    // Return cart rows with productId alias and price/total
    getByUserId(userId, callback) {
        if (userId == null) return callback(null, []);
        const sql = `
            SELECT uci.cart_item_id AS id,
                   uci.user_id AS userid,
                   uci.product_id AS productId,
                   uci.quantity,
                   p.price AS price
            FROM user_cart_items uci
            LEFT JOIN product p ON p.product_id = uci.product_id
            WHERE uci.user_id = ?
        `;
        db.query(sql, [userId], callback);
    },

    // Get a single cart item for a user and product
    getItem(userId, productId, callback) {
        if (userId == null || productId == null) return callback(null, null);
        const sql = `
            SELECT uci.cart_item_id AS id,
                   uci.user_id AS userid,
                   uci.product_id AS productId,
                   uci.quantity,
                   p.price AS price
            FROM user_cart_items uci
            LEFT JOIN product p ON p.product_id = uci.product_id
            WHERE uci.user_id = ? AND uci.product_id = ? LIMIT 1
        `;
        db.query(sql, [userId, productId], function(err, rows) {
            if (err) return callback(err);
            return callback(null, rows && rows.length ? rows[0] : null);
        });
    },

    // Add quantity (or insert). Accept `price` per unit so we can compute `total`.
    addToCart(userId, productId, quantity, price, callback) {
        if (userId == null) return callback(new Error('Missing userId for cart add'));
        if (productId == null) return callback(new Error('Missing productId for cart add'));
        const qty = Number(quantity || 0);
        const selectSql = 'SELECT cart_item_id AS id, quantity FROM user_cart_items WHERE user_id = ? AND product_id = ?';
        db.query(selectSql, [userId, productId], (err, rows) => {
            if (err) return callback(err);
            if (rows && rows.length) {
                const existing = rows[0];
                const newQty = Number(existing.quantity || 0) + qty;
                db.query('UPDATE user_cart_items SET quantity = ? WHERE cart_item_id = ?', [newQty, existing.id], callback);
            } else {
                db.query('INSERT INTO user_cart_items (user_id, product_id, quantity) VALUES (?, ?, ?)', [userId, productId, qty], callback);
            }
        });
    },

    // Backwards-compatible alias: some controllers call `add`
    add(userId, productId, quantity, price, callback) {
        return this.addToCart(userId, productId, quantity, price, callback);
    },

    // Remove the row entirely
    remove(userId, productId, callback) {
        if (userId == null) return callback(new Error('Missing userId for cart remove'));
        if (productId == null) return callback(new Error('Missing productId for cart remove'));
        db.query('DELETE FROM user_cart_items WHERE user_id = ? AND product_id = ?', [userId, productId], callback);
    },

    // Remove multiple productids for a user
    removeBulk(userId, productIds, callback) {
        if (userId == null) return callback(new Error('Missing userId for cart bulk remove'));
        if (!productIds || !productIds.length) return callback(null);
        const placeholders = productIds.map(() => '?').join(',');
        const sql = `DELETE FROM user_cart_items WHERE user_id = ? AND product_id IN (${placeholders})`;
        db.query(sql, [userId, ...productIds], callback);
    },

    // Decrement quantity by `amount`. Read current qty first, delete when <= 0.
    decrement(userId, productId, amount, callback) {
        if (userId == null) return callback(new Error('Missing userId for cart decrement'));
        if (productId == null) return callback(new Error('Missing productId for cart decrement'));
        const amt = Number(amount || 1);
        const sel = 'SELECT cart_item_id AS id, quantity FROM user_cart_items WHERE user_id = ? AND product_id = ? LIMIT 1';
        db.query(sel, [userId, productId], (sErr, rows) => {
            if (sErr) return callback(sErr);
            if (!rows || !rows.length) return callback(null);
            const row = rows[0];
            const current = Number(row.quantity || 0);
            const newQty = Math.max(0, current - amt);
            if (newQty <= 0) {
                // delete the row rather than updating to zero (some DBs disallow zero by CHECK constraints)
                return db.query('DELETE FROM user_cart_items WHERE cart_item_id = ?', [row.id], callback);
            }
            const upd = 'UPDATE user_cart_items SET quantity = ? WHERE cart_item_id = ?';
            db.query(upd, [newQty, row.id], callback);
        });
    },

    // Update quantity explicitly (and total). If newQty <= 0, the row will be deleted.
    updateQuantity(userId, productId, newQty, unitPrice, callback) {
        if (userId == null) return callback(new Error('Missing userId for cart updateQuantity'));
        if (productId == null) return callback(new Error('Missing productId for cart updateQuantity'));
        const qty = Number(newQty || 0);
        if (qty <= 0) {
            return this.remove(userId, productId, callback);
        }
        const sql = 'UPDATE user_cart_items SET quantity = ? WHERE user_id = ? AND product_id = ?';
        db.query(sql, [qty, userId, productId], callback);
    },

    // Clear user's cart
    clear(userId, callback) {
        if (userId == null) return callback(new Error('Missing userId for cart clear'));
        db.query('DELETE FROM user_cart_items WHERE user_id = ?', [userId], callback);
    }
};

module.exports = cartitems;


