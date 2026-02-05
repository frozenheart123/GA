const Reports = require('../models/adminReports');

const normalizeDateTime = (value, fallback, isEnd) => {
  if (!value) return fallback;
  const raw = String(value).trim();
  if (!raw) return fallback;
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
    return raw + (isEnd ? ' 23:59:59' : ' 00:00:00');
  }
  if (raw.includes('T')) {
    const v = raw.replace('T', ' ');
    return v.length === 16 ? v + ':00' : v;
  }
  return raw;
};

const buildCsv = ({ range, summary, byDay, byStatus, top, membership }) => {
  const lines = [];
  lines.push('Report Range,From,To');
  lines.push(`,${range.from},${range.to}`);
  lines.push('');
  lines.push('Summary,Net Sales,Orders,Avg Order Value');
  lines.push(`,${Number(summary.gross || 0).toFixed(2)},${summary.orders || 0},${Number(summary.avg || 0).toFixed(2)}`);
  lines.push('');
  lines.push('Sales By Day,Date,Orders,Sales');
  (byDay || []).forEach((r) => {
    const d = r.d && r.d.toISOString ? r.d.toISOString().slice(0, 10) : r.d;
    lines.push(`,${d},${r.orders || 0},${Number(r.sales || 0).toFixed(2)}`);
  });
  lines.push('');
  lines.push('Sales By Status,Status,Orders,Sales');
  (byStatus || []).forEach((r) => {
    lines.push(`,${r.status || ''},${r.orders || 0},${Number(r.sales || 0).toFixed(2)}`);
  });
  lines.push('');
  lines.push('Top Products,Product,Qty,Sales');
  (top || []).forEach((r) => {
    lines.push(`,${r.name || ''},${r.qty || 0},${Number(r.sales || 0).toFixed(2)}`);
  });
  lines.push('');
  lines.push('Membership Summary,Active Members,Expiring in 14 days');
  lines.push(`,${membership.active || 0},${membership.expiring14 || 0}`);
  lines.push('Membership By Plan,Plan,Members');
  (membership.byPlan || []).forEach((r) => {
    lines.push(`,${r.name || ''},${r.c || 0}`);
  });
  lines.push('Membership Over Time,Date,New Members');
  (membership.series || []).forEach((r) => {
    const d = r.d && r.d.toISOString ? r.d.toISOString().slice(0, 10) : r.d;
    lines.push(`,${d},${r.c || 0}`);
  });
  return lines.join('\n');
};

exports.dashboard = async (req, res) => {
  try {
    const today = new Date();
    const to = today.toISOString().slice(0,10) + ' 23:59:59';
    const fromDate = new Date(); fromDate.setDate(today.getDate()-30);
    const from = fromDate.toISOString().slice(0,10) + ' 00:00:00';
    const range = {
      from: normalizeDateTime(req.query.from, from, false),
      to: normalizeDateTime(req.query.to, to, true)
    };
    const [summary, byDay, byStatus, top, membership] = await Promise.all([
      Reports.summary(range),
      Reports.salesByDay(range),
      Reports.salesByStatus(range),
      Reports.topProducts(range),
      Reports.membershipSummary(range)
    ]);
    if (String(req.query.csv || '') === '1') {
      const csv = buildCsv({ range, summary, byDay, byStatus, top, membership });
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', 'attachment; filename="reports.csv"');
      return res.send(csv);
    }
    res.render('admin_reports', { range, summary, byDay, byStatus, top, membership });
  } catch (e) {
    console.error('admin reports error:', e);
    res.status(500).send('Internal Server Error');
  }
};
