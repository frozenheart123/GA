const db = require('../db');

// Fallback sample data if DB is empty or unavailable
const FALLBACK = [
  { name: 'Beef Slices', product_type: 'Meat', price: 6.9, image: null },
  { name: 'Golden Enoki', product_type: 'Veg', price: 2.0, image: null },
  { name: 'Lotus Root', product_type: 'Veg', price: 2.2, image: null },
];

// Latest 3 products as a simple "popular" proxy
exports.getPopularProducts = () => {
  return new Promise((resolve) => {
    const sql = `
      SELECT product_id, product_type, name, price, image, quantity
      FROM product
      ORDER BY product_id DESC
      LIMIT 3
    `;

    db.query(sql, (err, rows) => {
      if (err) {
        console.error('getPopularProducts query error:', err && err.code ? err.code : err);
        return resolve(FALLBACK);
      }
      if (!rows || rows.length === 0) {
        return resolve(FALLBACK);
      }
      return resolve(rows);
    });
  });
};

// Slider picks (return empty since schema doesn't support is_slider)
exports.getSliderProducts = () => {
  return new Promise((resolve) => {
    const sql = `
      SELECT product_id, product_type, name, price, image, quantity
      FROM product
      ORDER BY product_id DESC
      LIMIT 6
    `;
    db.query(sql, (err, rows) => {
      if (err) {
        console.error('getSliderProducts query error:', err && err.code ? err.code : err);
        return resolve([]);
      }
      return resolve(rows || []);
    });
  });
};

// Browse products with optional filters
exports.getAll = ({ type, minPrice, maxPrice } = {}) => {
  return new Promise((resolve, reject) => {
    const where = [];
    const params = [];
    if (type) { where.push('product_type = ?'); params.push(type); }
    if (minPrice != null) { where.push('price >= ?'); params.push(minPrice); }
    if (maxPrice != null) { where.push('price <= ?'); params.push(maxPrice); }
    const sql = `
      SELECT product_id, product_type, name, information, quantity, price, image
      FROM product
      ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
      ORDER BY name ASC
    `;
    db.query(sql, params, (err, rows) => {
      if (err) return reject(err);
      resolve(rows);
    });
  });
};

exports.toggleAvailability = (id) => {
  return new Promise((resolve, reject) => {
    db.query('SELECT quantity FROM product WHERE product_id = ? LIMIT 1', [id], (err, rows) => {
      if (err) return reject(err);
      if (!rows || !rows[0]) return resolve(false);
      const q = Number(rows[0].quantity || 0);
      const newQ = q > 0 ? 0 : 1; // minimal toggle; adjust via edit later
      db.query('UPDATE product SET quantity = ? WHERE product_id = ?', [newQ, id], (e2, r2) => {
        if (e2) return reject(e2);
        resolve(r2.affectedRows > 0);
      });
    });
  });
};

exports.getById = (id) => {
  return new Promise((resolve, reject) => {
    const sql = `SELECT product_id, product_type, name, information, quantity, price, image FROM product WHERE product_id = ? LIMIT 1`;
    db.query(sql, [id], (err, rows) => {
      if (err) return reject(err);
      resolve(rows && rows[0] ? rows[0] : null);
    });
  });
};

exports.adminList = ({ q, category } = {}) => {
  return new Promise((resolve, reject) => {
    const where = [];
    const params = [];
    if (q) { where.push('name LIKE ?'); params.push(`%${q}%`); }
    if (category && category !== 'All') {
      where.push('product_type = ?');
      params.push(String(category).trim().toLowerCase());
    }
    const sql = `SELECT product_id, name, product_type, price, quantity, image
                 FROM product
                 ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
                 ORDER BY product_id DESC`;
    db.query(sql, params, (err, rows) => {
      if (err) return reject(err);
      resolve(rows || []);
    });
  });
};

exports.counts = () => {
  return new Promise((resolve) => {
    const result = { total: 0, active: 0, low: 0 };
    db.query('SELECT COUNT(*) AS c FROM product', (e, r) => {
      result.total = r && r[0] ? r[0].c : 0;
      db.query('SELECT COUNT(*) AS c FROM product WHERE quantity > 0', (e2, r2) => {
        result.active = r2 && r2[0] ? r2[0].c : 0;
        db.query('SELECT COUNT(*) AS c FROM product WHERE quantity < 20', (e3, r3) => {
          result.low = r3 && r3[0] ? r3[0].c : 0;
          resolve(result);
        });
      });
    });
  });
};

exports.setSlider = (id, enabled) => {
  return new Promise((resolve, reject) => {
    // is_slider column does not exist in schema, return error
    resolve({ ok: false, reason: 'unsupported' });
  });
};

exports.create = ({ name, product_type, price, quantity, information, image }) => {
  return new Promise((resolve, reject) => {
    const normalizedType = product_type ? String(product_type).trim().toLowerCase() : null;
    const sql = `INSERT INTO product (name, product_type, price, quantity, information, image)
                 VALUES (?,?,?,?,?,?)`;
    db.query(sql, [name, normalizedType, price, quantity, information || null, image || null], (err, result) => {
      if (err) return reject(err);
      resolve(result.insertId);
    });
  });
};

exports.seedDemo = () => {
  return new Promise((resolve, reject) => {
    const rows = [
      ['Beef Slices','Meat',6.90,50,'Thinly sliced beef',null],
      ['Golden Enoki','Veg',2.00,120,'Golden enoki mushrooms',null],
      ['Lotus Root','Veg',2.20,80,'Crisp lotus root slices',null],
      ['Udon Noodles','Noodles',1.50,200,'Chewy udon noodles',null]
    ];
    const sql = 'INSERT INTO product (name, product_type, price, quantity, information, image) VALUES ?';
    db.query(sql, [rows], (err) => {
      if (err) return reject(err);
      resolve();
    });
  });
};

exports.update = (id, { name, product_type, price, quantity, information, image }) => {
  return new Promise((resolve, reject) => {
    const normalizedType = product_type ? String(product_type).trim().toLowerCase() : null;
    const sql = `UPDATE product SET name=?, product_type=?, price=?, quantity=?, information=?, image=? WHERE product_id=?`;
    db.query(sql, [name, normalizedType, price, quantity, information || null, image || null, id], (err, result) => {
      if (err) return reject(err);
      resolve(result.affectedRows > 0);
    });
  });
};

exports.remove = (id) => {
  return new Promise((resolve, reject) => {
    db.query('DELETE FROM product WHERE product_id = ?', [id], (err, result) => {
      if (err) return reject(err);
      resolve(result.affectedRows > 0);
    });
  });
};
