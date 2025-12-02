const db = require('../db');

exports.getActivePlans = () => {
  return new Promise((resolve, reject) => {
    // Try new schema first (discount_value), then fallback to legacy (discount_price)
    const sqlNew = `SELECT plan_id, name, discount_value AS discount_price,
                           COALESCE(min_spent, 0.00) AS min_spent,
                           COALESCE(active, 1) AS active
                    FROM membership_plan
                    WHERE active = 1
                    ORDER BY discount_value ASC`;
    db.query(sqlNew, (err, rows) => {
      if (!err) return resolve(rows || []);
      // Fallback for legacy schema
      const sqlOld = `SELECT plan_id, name, discount_price, min_spent, active
                      FROM membership_plan
                      WHERE active = 1
                      ORDER BY discount_price ASC`;
      db.query(sqlOld, (err2, rows2) => {
        if (err2) return reject(err2);
        return resolve(rows2 || []);
      });
    });
  });
};
