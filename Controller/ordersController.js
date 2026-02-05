const Order = require('../models/order');
const Transaction = require('../models/transaction');
const { resolvePaymentMethod } = require('../utils/paymentMethod');

exports.getMyOrders = async (req, res) => {
  try {
    const user = req.session.user;
    if (!user) {
      return res.redirect('/login');
    }
    const userId = user.user_id || user.userId || user.id;
    const orders = await Order.getOrdersByUser(userId);
    if (!orders.length) {
      return res.render('orders', { orders: [], itemsByOrder: {} });
    }
    const ids = orders.map(o => o.order_id);
    const transactions = await Transaction.getByOrderIds(ids);
    const txByOrder = {};
    for (const tx of transactions) {
      txByOrder[tx.orderId] = tx;
    }
    for (const order of orders) {
      const method = resolvePaymentMethod({ order, transaction: txByOrder[order.order_id] });
      if (method) order.payment_method = method;
    }
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

exports.getOrderReceipt = async (req, res) => {
  try {
    const user = req.session.user;
    if (!user) {
      return res.redirect('/login');
    }

    const userId = user.user_id || user.userId || user.id;
    const orderId = parseInt(req.params.orderId);
    if (!orderId || isNaN(orderId)) {
      return res.status(400).send('Invalid order ID');
    }

    // Get the order and verify it belongs to the current user
    const order = await Order.getById(orderId);
    if (!order || order.user_id !== userId) {
      return res.status(404).send('Order not found');
    }

    const tx = await Transaction.getByOrderId(orderId);
    const method = resolvePaymentMethod({ order, transaction: tx });
    if (method) order.payment_method = method;

    // Get order items
    const items = await Order.getItemsForOrders([orderId]);

    // Calculate totals
    const subtotal = items.reduce((sum, item) => sum + parseFloat(item.line_total), 0);
    const discount = parseFloat(order.discount_amount) || 0;
    const total = parseFloat(order.total_amount);

    return res.render('order_receipt', {
      order,
      items,
      subtotal: subtotal.toFixed(2),
      discount: discount.toFixed(2),
      total: total.toFixed(2)
    });
  } catch (err) {
    console.error('Error loading order receipt:', err);
    return res.status(500).send('Internal Server Error');
  }
};
