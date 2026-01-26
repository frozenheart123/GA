const db = require('../db');

exports.summary = ({ from, to }) => {
  return new Promise((resolve) => {
    const out = { gross: 0, orders: 0, avg: 0 };
    const sqlRange = 'WHERE created_at BETWEEN ? AND ?';
    const sql = `SELECT IFNULL(SUM(total_amount),0) AS gross, COUNT(*) AS c FROM orders ${sqlRange}`;
    console.log('adminReports.summary query:', sql, 'params:', [from, to]);
    db.query(sql, [from, to], (e, r) => {
      if (e) console.error('adminReports.summary error:', e);
      console.log('adminReports.summary result:', r);
      const gross = r && r[0] ? Number(r[0].gross) : 0;
      const c = r && r[0] ? Number(r[0].c) : 0;
      out.gross = gross; out.orders = c; out.avg = c ? (gross / c) : 0;
      resolve(out);
    });
  });
};

exports.salesByDay = ({ from, to }) => {
  return new Promise((resolve) => {
    const sql = `SELECT DATE(created_at) as d, IFNULL(SUM(total_amount),0) AS sales, COUNT(*) AS orders
                 FROM orders WHERE created_at BETWEEN ? AND ?
                 GROUP BY DATE(created_at) ORDER BY DATE(created_at)`;
    db.query(sql, [from, to], (e, r) => resolve(r || []));
  });
};

exports.salesByStatus = ({ from, to }) => {
  return new Promise((resolve) => {
    const sql = `SELECT status, COUNT(*) AS orders, IFNULL(SUM(total_amount),0) AS sales
                 FROM orders WHERE created_at BETWEEN ? AND ? GROUP BY status`;
    db.query(sql, [from, to], (e, r) => resolve(r || []));
  });
};

exports.topProducts = ({ from, to }) => {
  return new Promise((resolve) => {
    const sql = `SELECT p.name, SUM(oi.quantity) AS qty, SUM(oi.line_total) AS sales
                 FROM order_item oi
                 JOIN orders o ON o.order_id = oi.order_id
                 JOIN product p ON p.product_id = oi.product_id
                 WHERE o.created_at BETWEEN ? AND ?
                 GROUP BY p.product_id
                 ORDER BY sales DESC LIMIT 10`;
    db.query(sql, [from, to], (e, r) => resolve(r || []));
  });
};

exports.membershipSummary = ({ from, to }) => {
  return new Promise((resolve) => {
    const out = { active: 0, expiring14: 0, byPlan: [] };
    db.query('SELECT COUNT(*) AS c FROM users WHERE is_member = 1', (e, r) => {
      out.active = r && r[0] ? r[0].c : 0;
      db.query('SELECT COUNT(*) AS c FROM users WHERE is_member = 1 AND member_expires BETWEEN CURDATE() AND DATE_ADD(CURDATE(), INTERVAL 14 DAY)', (e2, r2) => {
        out.expiring14 = r2 && r2[0] ? r2[0].c : 0;
        db.query('SELECT mp.name, COUNT(*) AS c FROM users u JOIN membership_plan mp ON mp.plan_id = u.plan_id GROUP BY mp.plan_id', (e3, r3) => {
          out.byPlan = r3 || [];
          resolve(out);
        });
      });
    });
  });
};

