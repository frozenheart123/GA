const Order = require('../models/order');

const STATUSES = Order.statusOptions();

exports.dashboard = async (req, res) => {
  try {
    const { q, status } = req.query;
    const orders = await Order.adminList({ q, status });
    const ids = orders.map(o => o.order_id);
    const orderItems = await Order.getItemsForOrders(ids);
    const itemsByOrder = {};
    for (const item of orderItems) {
      if (!itemsByOrder[item.order_id]) itemsByOrder[item.order_id] = [];
      itemsByOrder[item.order_id].push(item);
    }
    res.render('admin_orders', {
      orders,
      itemsByOrder,
      statuses: ['All', ...STATUSES],
      q: q || '',
      status: status || 'All',
      orderStatuses: STATUSES,
    });
  } catch (e) {
    console.error('admin orders error:', e);
    res.status(500).send('Internal Server Error');
  }
};

exports.postStatus = async (req, res) => {
  try {
    const status = (req.body.status && req.body.status.trim()) || 'Pending';
    await Order.updateStatus(req.params.id, status);
  } catch (e) {
    console.error('update order status error:', e);
  }
  res.redirect('/admin/orders');
};
