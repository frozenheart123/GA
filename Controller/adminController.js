const db = require('../db');

function q(sql, params = []) {
  return new Promise((resolve) => {
    db.query(sql, params, (err, rows) => {
      if (err) {
        console.error('Admin query error:', err.code || err);
        return resolve(null);
      }
      resolve(rows);
    });
  });
}

exports.getDashboard = async (req, res) => {
  try {
    const [users, products, orders, payments, latestOrders, productsPreview, plans] = await Promise.all([
      q('SELECT COUNT(*) AS c FROM users'),
      q('SELECT COUNT(*) AS c FROM product'),
      q('SELECT COUNT(*) AS c FROM orders'),
      q("SELECT COUNT(*) AS c FROM orders WHERE status IN ('paid','shipped','completed')"),
      q('SELECT o.order_id, o.user_id, IFNULL(u.name, CONCAT("#", o.user_id)) AS user_name, o.total_amount, o.status, o.created_at FROM orders o LEFT JOIN users u ON u.user_id = o.user_id ORDER BY o.created_at DESC LIMIT 5'),
      q('SELECT product_id, name, product_type, price FROM product ORDER BY product_id DESC LIMIT 5'),
      // Try new schema first, fallback silently to legacy
      q('SELECT plan_id, name, discount_value AS discount_price, active FROM membership_plan ORDER BY plan_id DESC LIMIT 5')
        .then(r => r || q('SELECT plan_id, name, discount_price, active FROM membership_plan ORDER BY plan_id DESC LIMIT 5')),
    ]);

    const stats = {
      users: users && users[0] ? users[0].c : 0,
      products: products && products[0] ? products[0].c : 0,
      orders: orders && orders[0] ? orders[0].c : 0,
      payments: payments && payments[0] ? payments[0].c : 0,
    };

    res.render('admin_dashboard', {
      stats,
      latestOrders: latestOrders || [],
      productsPreview: productsPreview || [],
      plans: plans || [],
    });
  } catch (err) {
    console.error('Admin dashboard error:', err);
    res.status(500).send('Internal Server Error');
  }
};
