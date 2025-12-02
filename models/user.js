const db = require('../db');
const bcrypt = require('bcryptjs');

exports.findByName = (name) => {
  return new Promise((resolve, reject) => {
    db.query('SELECT * FROM users WHERE name = ? LIMIT 1', [name], (err, rows) => {
      if (err) return reject(err);
      resolve(rows && rows[0] ? rows[0] : null);
    });
  });
};

exports.getById = async (id) => {
  const hasPayment = await exports.hasColumn('payment_type').catch(() => false);
  return new Promise((resolve, reject) => {
    const cols = ['user_id','name','role','email','address','contact_number','avatar_url','is_member','member_since','member_expires'];
    if (hasPayment) cols.push('payment_type');
    const sql = `SELECT ${cols.join(', ')} FROM users WHERE user_id = ? LIMIT 1`;
    db.query(sql, [id], (err, rows) => {
      if (err) return reject(err);
      resolve(rows && rows[0] ? rows[0] : null);
    });
  });
};

exports.getAuthById = (id) => {
  return new Promise((resolve, reject) => {
    const sql = 'SELECT user_id, mfa_totp_enabled, mfa_totp_secret_enc FROM users WHERE user_id = ? LIMIT 1';
    db.query(sql, [id], (err, rows) => {
      if (err) return reject(err);
      resolve(rows && rows[0] ? rows[0] : null);
    });
  });
};

exports.getAuthByIdFull = async (id) => {
  const hasIv = await exports.hasColumn('mfa_totp_iv').catch(() => false);
  const hasTag = await exports.hasColumn('mfa_totp_tag').catch(() => false);
  return new Promise((resolve, reject) => {
    const cols = ['user_id','mfa_totp_enabled','mfa_totp_secret_enc'];
    if (hasIv) cols.push('mfa_totp_iv');
    if (hasTag) cols.push('mfa_totp_tag');
    const sql = `SELECT ${cols.join(', ')} FROM users WHERE user_id = ? LIMIT 1`;
    db.query(sql, [id], (err, rows) => {
      if (err) return reject(err);
      resolve(rows && rows[0] ? rows[0] : null);
    });
  });
};

exports.hasColumn = (column) => {
  return new Promise((resolve, reject) => {
    const sql = `SELECT COUNT(*) AS c FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'users' AND column_name = ?`;
    db.query(sql, [column], (err, rows) => {
      if (err) return reject(err);
      resolve(rows && rows[0] && Number(rows[0].c) > 0);
    });
  });
};

let savedCartSupportedCache = null;
const ensureSavedCartColumn = async () => {
  if (savedCartSupportedCache !== null) return savedCartSupportedCache;
  savedCartSupportedCache = await exports.hasColumn('saved_cart').catch(() => false);
  return savedCartSupportedCache;
};

exports.getSavedCart = async (user_id) => {
  const hasSavedCart = await ensureSavedCartColumn();
  if (!hasSavedCart) return null;
  return new Promise((resolve, reject) => {
    db.query('SELECT saved_cart FROM users WHERE user_id = ? LIMIT 1', [user_id], (err, rows) => {
      if (err) return reject(err);
      if (!rows || !rows[0] || rows[0].saved_cart == null) return resolve(null);
      try {
        const parsed = JSON.parse(rows[0].saved_cart);
        resolve(Array.isArray(parsed) ? parsed : []);
      } catch (e) {
        console.error('parse saved_cart error:', e);
        resolve(null);
      }
    });
  });
};

exports.setSavedCart = async (user_id, cart) => {
  const hasSavedCart = await ensureSavedCartColumn();
  if (!hasSavedCart) return false;
  const payload = Array.isArray(cart) && cart.length ? JSON.stringify(cart) : null;
  return new Promise((resolve, reject) => {
    db.query('UPDATE users SET saved_cart = ? WHERE user_id = ?', [payload, user_id], (err, result) => {
      if (err) return reject(err);
      resolve(result.affectedRows > 0);
    });
  });
};

exports.updateProfile = async ({ user_id, name, address, contact_number, email }) => {
  const hasEmailCol = await exports.hasColumn('email').catch(() => false);
  return new Promise((resolve, reject) => {
    const sets = ['name=?','address=?','contact_number=?'];
    const params = [name, address || null, contact_number || null];
    // Only update email if the column exists and a value was provided (empty string allowed for NOT NULL columns)
    if (hasEmailCol && typeof email !== 'undefined') {
      sets.push('email=?');
      params.push(String(email).trim());
    }
    params.push(user_id);
    const sql = `UPDATE users SET ${sets.join(', ')} WHERE user_id=?`;
    db.query(sql, params, (err, result) => {
      if (err) return reject(err);
      resolve(result.affectedRows > 0);
    });
  });
};

exports.updatePassword = async (user_id, new_password) => {
  const hash = await bcrypt.hash(new_password, 10);
  return new Promise((resolve, reject) => {
    db.query('UPDATE users SET password_hash=? WHERE user_id=?', [hash, user_id], (err, result) => {
      if (err) return reject(err);
      resolve(result.affectedRows > 0);
    });
  });
};

exports.enableMfa = (user_id, encSecretBase64) => {
  return new Promise((resolve, reject) => {
    const sql = 'UPDATE users SET mfa_totp_enabled = 1, mfa_totp_secret_enc = ? WHERE user_id = ?';
    db.query(sql, [encSecretBase64, user_id], (err, result) => {
      if (err) return reject(err);
      resolve(result.affectedRows > 0);
    });
  });
};

exports.disableMfa = (user_id) => {
  return new Promise((resolve, reject) => {
    const sql = 'UPDATE users SET mfa_totp_enabled = 0, mfa_totp_secret_enc = NULL WHERE user_id = ?';
    db.query(sql, [user_id], (err, result) => {
      if (err) return reject(err);
      resolve(result.affectedRows > 0);
    });
  });
};

exports.enableMfaParts = (user_id, ciphertext, iv, tag) => {
  return new Promise((resolve, reject) => {
    const sql = 'UPDATE users SET mfa_totp_enabled=1, mfa_totp_secret_enc=?, mfa_totp_iv=?, mfa_totp_tag=? WHERE user_id=?';
    db.query(sql, [ciphertext, iv, tag, user_id], (err, result) => {
      if (err) return reject(err);
      resolve(result.affectedRows > 0);
    });
  });
};

exports.updateColumn = (user_id, column, value) => {
  return new Promise((resolve, reject) => {
    const sql = `UPDATE users SET ${column} = ? WHERE user_id = ?`;
    db.query(sql, [value, user_id], (err, result) => {
      if (err) return reject(err);
      resolve(result.affectedRows > 0);
    });
  });
};

exports.getColumn = (user_id, column) => {
  return new Promise((resolve, reject) => {
    const sql = `SELECT ${column} AS v FROM users WHERE user_id = ? LIMIT 1`;
    db.query(sql, [user_id], (err, rows) => {
      if (err) return reject(err);
      resolve(rows && rows[0] ? rows[0].v : null);
    });
  });
};

exports.createUser = async ({ name, email, address, contact_number, password }) => {
  const password_hash = await bcrypt.hash(password, 10);
  const hasEmail = await exports.hasColumn('email').catch(() => false);
  return new Promise((resolve, reject) => {
    if (hasEmail) {
      const sql = `INSERT INTO users (role, name, email, address, password_hash, contact_number, is_member, member_since) VALUES ('user', ?, ?, ?, ?, ?, 1, CURDATE())`;
      db.query(sql, [name, email || null, address || null, password_hash, contact_number || null], (err, result) => {
        if (err) return reject(err);
        resolve({ user_id: result.insertId, name, address, contact_number, role: 'user', is_member: 1 });
      });
    } else {
      const sql = `INSERT INTO users (role, name, address, password_hash, contact_number, is_member, member_since) VALUES ('user', ?, ?, ?, ?, 1, CURDATE())`;
      db.query(sql, [name, address || null, password_hash, contact_number || null], (err, result) => {
        if (err) return reject(err);
        resolve({ user_id: result.insertId, name, address, contact_number, role: 'user', is_member: 1 });
      });
    }
  });
};

exports.resetMembershipIfExpired = (user_id) => {
  return new Promise((resolve, reject) => {
    const sql = `UPDATE users SET is_member = 0 WHERE user_id = ? AND member_expires IS NOT NULL AND member_expires < CURDATE()`;
    db.query(sql, [user_id], (err) => {
      if (err) return reject(err);
      resolve();
    });
  });
};

exports.setMembershipStatus = ({ user_id, is_member, member_since, member_expires }) => {
  return new Promise((resolve, reject) => {
    const sql = `UPDATE users SET is_member = ?, member_since = ?, member_expires = ? WHERE user_id = ?`;
    const since = member_since || (is_member ? new Date().toISOString().slice(0, 10) : null);
    const expires = member_expires || null;
    db.query(sql, [is_member ? 1 : 0, since, expires, user_id], (err) => {
      if (err) return reject(err);
      resolve();
    });
  });
};

exports.verifyPassword = async (password, password_hash, user_id) => {
  try {
    if (password_hash && password_hash.startsWith('$2')) {
      return await bcrypt.compare(password, password_hash);
    }
    // Fallback for legacy plaintext in DB (dev-only convenience)
    const ok = password === password_hash;
    if (ok && user_id) {
      // Upgrade to bcrypt hash transparently
      const newHash = await bcrypt.hash(password, 10);
      db.query('UPDATE users SET password_hash = ? WHERE user_id = ?', [newHash, user_id], () => {});
    }
    return ok;
  } catch (e) {
    console.error('verifyPassword error:', e);
    return false;
  }
};
