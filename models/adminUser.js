const db = require('../db');
const bcrypt = require('bcryptjs');

function hasUsersColumn(column){
  return new Promise((resolve, reject) => {
    const sql = `SELECT COUNT(*) AS c FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'users' AND column_name = ?`;
    db.query(sql, [column], (err, rows) => {
      if (err) return reject(err);
      resolve(rows && rows[0] && Number(rows[0].c) > 0);
    });
  });
}

exports.counts = () => {
  return new Promise((resolve) => {
    const out = { total: 0, admins: 0, activeMembers: 0 };
    db.query('SELECT COUNT(*) AS c FROM users', (e, r) => {
      out.total = r && r[0] ? r[0].c : 0;
      db.query("SELECT COUNT(*) AS c FROM users WHERE role = 'admin'", (e2, r2) => {
        out.admins = r2 && r2[0] ? r2[0].c : 0;
        db.query('SELECT COUNT(*) AS c FROM users WHERE is_member = 1', (e3, r3) => {
          out.activeMembers = r3 && r3[0] ? r3[0].c : 0;
          resolve(out);
        });
      });
    });
  });
};

exports.list = ({ q, role, membership } = {}) => {
  return new Promise((resolve, reject) => {
    const where = [];
    const params = [];
    if (q) { where.push('name LIKE ?'); params.push(`%${q}%`); }
    if (role && role !== 'All') { where.push('role = ?'); params.push(role); }
    if (membership && membership !== 'All') {
      where.push('is_member = ?'); params.push(membership === 'Member' ? 1 : 0);
    }
    const sql = `SELECT user_id, name, role, is_member, member_expires FROM users
                 ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
                 ORDER BY user_id DESC`;
    db.query(sql, params, (err, rows) => {
      if (err) return reject(err);
      resolve(rows || []);
    });
  });
};

exports.getById = (id) => {
  return new Promise((resolve, reject) => {
    db.query('SELECT user_id, name, role, address, contact_number, is_member, member_since, member_expires, plan_id FROM users WHERE user_id = ? LIMIT 1', [id], (err, rows) => {
      if (err) return reject(err);
      resolve(rows && rows[0] ? rows[0] : null);
    });
  });
};

exports.create = async ({ name, address, contact_number, role, password, email }) => {
  const hash = await bcrypt.hash(password, 10);
  const hasEmail = await hasUsersColumn('email').catch(() => false);
  return new Promise((resolve, reject) => {
    if (hasEmail) {
      // Ensure a non-null email to satisfy NOT NULL constraints
      const candidate = (email && String(email).trim()) || `${String(name || 'user').toLowerCase().replace(/\s+/g,'_')}@local`;
      const sql = `INSERT INTO users (role, name, email, address, password_hash, contact_number, is_member) VALUES (?,?,?,?,?,?,0)`;
      db.query(sql, [role || 'user', name, candidate, address || null, hash, contact_number || null], (err, result) => {
        if (err) return reject(err);
        resolve(result.insertId);
      });
    } else {
      const sql = `INSERT INTO users (role, name, address, password_hash, contact_number, is_member) VALUES (?,?,?,?,?,0)`;
      db.query(sql, [role || 'user', name, address || null, hash, contact_number || null], (err, result) => {
        if (err) return reject(err);
        resolve(result.insertId);
      });
    }
  });
};

exports.update = async ({ user_id, name, address, contact_number, role, email }) => {
  const hasEmail = await hasUsersColumn('email').catch(() => false);
  return new Promise((resolve, reject) => {
    const sets = ['name=?','address=?','contact_number=?','role=?'];
    const params = [name, address || null, contact_number || null, role || 'user'];
    if (hasEmail && typeof email !== 'undefined') { sets.push('email=?'); params.push(String(email).trim()); }
    params.push(user_id);
    const sql = `UPDATE users SET ${sets.join(', ')} WHERE user_id=?`;
    db.query(sql, params, (err, result) => {
      if (err) return reject(err);
      resolve(result.affectedRows > 0);
    });
  });
};

exports.resetPassword = async (user_id, password) => {
  const hash = await bcrypt.hash(password, 10);
  return new Promise((resolve, reject) => {
    db.query('UPDATE users SET password_hash = ? WHERE user_id = ?', [hash, user_id], (err, result) => {
      if (err) return reject(err);
      resolve(result.affectedRows > 0);
    });
  });
};

exports.makeMember = ({ user_id, plan_id, days }) => {
  return new Promise((resolve, reject) => {
    const sql = `UPDATE users SET is_member=1, member_since=CURDATE(), member_expires=DATE_ADD(CURDATE(), INTERVAL ? DAY), plan_id=? WHERE user_id=?`;
    db.query(sql, [Number(days || 365), plan_id || null, user_id], (err, result) => {
      if (err) return reject(err);
      resolve(result.affectedRows > 0);
    });
  });
};

exports.clearMember = (user_id) => {
  return new Promise((resolve, reject) => {
    db.query('UPDATE users SET is_member=0, plan_id=NULL, member_since=NULL, member_expires=NULL WHERE user_id=?', [user_id], (err, result) => {
      if (err) return reject(err);
      resolve(result.affectedRows > 0);
    });
  });
};
