const Order = require('../models/order');

exports.getMyOrders = async (req, res) => {
  try {
    const user = req.session.user;
    const orders = await Order.getOrdersByUser(user.user_id);
    if (!orders.length) {
      return res.render('orders', { orders: [], itemsByOrder: {} });
    }
    const ids = orders.map(o => o.order_id);
    const items = await Order.getItemsForOrders(ids);
    const itemsByOrder = {};
    for (const it of items) {
      if (!itemsByOrder[it.order_id]) itemsByOrder[it.order_id] = [];
      itemsByOrder[it.order_id].push(it);
    }
    return res.render('orders', { orders, itemsByOrder });
  } catch (err) {
    console.error('Error loading user orders:', err);
    return res.status(500).send('Internal Server Error');
  }
};

