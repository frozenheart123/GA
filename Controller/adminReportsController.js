const Reports = require('../models/adminReports');

exports.dashboard = async (req, res) => {
  try {
    const today = new Date();
    const to = today.toISOString().slice(0,10) + ' 23:59:59';
    const fromDate = new Date(); fromDate.setDate(today.getDate()-30);
    const from = fromDate.toISOString().slice(0,10) + ' 00:00:00';
    const range = { from: req.query.from || from, to: req.query.to || to };
    const [summary, byDay, byStatus, top, membership] = await Promise.all([
      Reports.summary(range),
      Reports.salesByDay(range),
      Reports.salesByStatus(range),
      Reports.topProducts(range),
      Reports.membershipSummary(range)
    ]);
    res.render('admin_reports', { range, summary, byDay, byStatus, top, membership });
  } catch (e) {
    console.error('admin reports error:', e);
    res.status(500).send('Internal Server Error');
  }
};

