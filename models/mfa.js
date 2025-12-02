const db = require('../db');
const bcrypt = require('bcryptjs');

function randomCode(len = 10) {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let out = '';
  for (let i = 0; i < len; i++) out += alphabet[Math.floor(Math.random() * alphabet.length)];
  return out;
}

exports.generatePlainCodes = (count = 8, len = 10) => {
  const set = new Set();
  while (set.size < count) set.add(randomCode(len));
  return Array.from(set);
};

exports.getRemainingCount = (user_id) => {
  return new Promise((resolve) => {
    const sql = 'SELECT COUNT(*) AS c FROM mfa_backup_code WHERE user_id = ? AND used_at IS NULL';
    db.query(sql, [user_id], (err, rows) => {
      if (err) { console.error('getRemainingCount error:', err.code || err); return resolve(0); }
      resolve(rows && rows[0] ? Number(rows[0].c) : 0);
    });
  });
};

exports.setCodes = async (user_id, codesPlain) => {
  return new Promise((resolve, reject) => {
    db.query('DELETE FROM mfa_backup_code WHERE user_id = ?', [user_id], async (e1) => {
      if (e1) return reject(e1);
      const rows = [];
      for (const c of codesPlain) {
        const hash = await bcrypt.hash(c, 10);
        rows.push([user_id, hash]);
      }
      const sql = 'INSERT INTO mfa_backup_code (user_id, code_hash) VALUES ?';
      db.query(sql, [rows], (e2) => {
        if (e2) return reject(e2);
        resolve(true);
      });
    });
  });
};

exports.consumeIfValid = async (user_id, code) => {
  if (!code) return false;
  return new Promise((resolve) => {
    const sql = 'SELECT id, code_hash FROM mfa_backup_code WHERE user_id = ? AND used_at IS NULL';
    db.query(sql, [user_id], async (err, rows) => {
      if (err) { console.error('consumeIfValid query error:', err.code || err); return resolve(false); }
      for (const row of rows || []) {
        try {
          const ok = await bcrypt.compare(code, row.code_hash);
          if (ok) {
            db.query('UPDATE mfa_backup_code SET used_at = NOW() WHERE id = ?', [row.id], () => resolve(true));
            return;
          }
        } catch (_) { /* ignore */ }
      }
      resolve(false);
    });
  });
};

