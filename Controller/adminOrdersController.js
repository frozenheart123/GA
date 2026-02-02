const Order = require('../models/order');
const Product = require('../models/product');
const Transaction = require('../models/transaction');
const paypal = require('../services/paypal');

const STATUSES = Order.statusOptions();

exports.dashboard = async (req, res) => {
  try {
    const { q, status } = req.query;
    const orders = await Order.adminList({ q, status });
    for (const order of orders) {
      if (!order.payment_method) {
        const tx = await Transaction.getByOrderId(order.order_id);
        if (tx) {
          if (tx.payerId === 'NETS') order.payment_method = 'NETS';
          else if (tx.payerId === 'PAYNOW') order.payment_method = 'PayNow';
          else order.payment_method = 'PayPal';
        }
      }
      if (!order.payment_method && (order.status === 'paid' || order.status === 'refunded')) {
        order.payment_method = 'PayPal';
      }
    }
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
      refundAlert: req.query.refund || '',
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

exports.postRefund = async (req, res) => {
  try {
    const orderId = req.params.id;
    const order = await Order.getById(orderId);
    if (!order) {
      return res.redirect('/admin/orders?refund=error');
    }

    let transaction = null;
    transaction = await Transaction.getByOrderId(orderId);
    let paymentMethod = String(order.payment_method || '').toLowerCase();
    if (!paymentMethod && transaction) {
      if (transaction.payerId === 'NETS') paymentMethod = 'nets';
      else if (transaction.payerId === 'PAYNOW') paymentMethod = 'paynow';
      else paymentMethod = 'paypal';
    }
    if (paymentMethod && paymentMethod !== 'paypal') {
      return res.redirect('/admin/orders?refund=unsupported');
    }
    if (paymentMethod === 'paypal') {
      if (!transaction || !transaction.captureId) {
        return res.redirect('/admin/orders?refund=missing_tx');
      }
    }

    const refundQtyMap = req.body.refund_qty || {};
    const items = await Order.getItemsWithIdsByOrderId(orderId);
    if (!items.length) {
      return res.redirect('/admin/orders?refund=error');
    }

    const refundKeys = Object.keys(refundQtyMap || {});
    const useFullRefund = refundKeys.length === 0;

    const buildPlan = (forceFull) => {
      let refundedUnits = 0;
      let totalUnits = 0;
      let matchedKeys = 0;
      let refundSubtotal = 0;
      const plan = [];

      for (const item of items) {
        const maxQty = Number(item.quantity || 0);
        totalUnits += maxQty;
        let requestedRaw = null;
        if (forceFull) {
          requestedRaw = maxQty;
        } else if (refundQtyMap && Object.prototype.hasOwnProperty.call(refundQtyMap, item.order_item_id)) {
          matchedKeys += 1;
          requestedRaw = refundQtyMap[item.order_item_id];
        } else {
          requestedRaw = useFullRefund ? maxQty : 0;
        }
        const requested = Math.max(0, Math.min(maxQty, Number(requestedRaw || 0)));
        if (!requested) continue;
        refundedUnits += requested;
        refundSubtotal += Number(item.unit_price || 0) * requested;
        plan.push({
          orderItemId: item.order_item_id,
          productId: item.product_id,
          unitPrice: item.unit_price,
          maxQty,
          requested
        });
      }

      return { refundedUnits, totalUnits, matchedKeys, refundSubtotal, plan };
    };

    let result = buildPlan(false);
    if (result.refundedUnits === 0 && refundKeys.length === 0) {
      // Only default to full refund if the form did not send any refund_qty at all
      result = buildPlan(true);
    }

    if (result.refundedUnits === 0) {
      return res.redirect('/admin/orders?refund=error');
    }

    const oldSubtotal = Number(order.subtotal_amount || 0);
    const oldDiscount = Number(order.discount_amount || 0);
    const ratio = oldSubtotal > 0 ? (oldDiscount / oldSubtotal) : 0;
    const refundDiscount = Number((result.refundSubtotal * ratio).toFixed(2));
    const refundAmount = Number((result.refundSubtotal - refundDiscount).toFixed(2));
    if (!refundAmount || refundAmount <= 0) {
      return res.redirect('/admin/orders?refund=error');
    }

    let refundAlert = 'ok';
    if (paymentMethod === 'paypal') {
      const refundResponse = await paypal.refundPayment(transaction.captureId, refundAmount.toFixed(2));
      const status = String(refundResponse && refundResponse.status ? refundResponse.status : '').toUpperCase();
      if (status !== 'COMPLETED' && status !== 'PENDING') {
        return res.redirect('/admin/orders?refund=error');
      }
      const txStatus = status === 'COMPLETED' ? 'REFUNDED' : 'REFUND_PENDING';
      await Transaction.updateStatusByOrderId(orderId, txStatus, 'Admin refund');
      if (status === 'PENDING') {
        refundAlert = 'pending';
      }
    }

    // Apply DB updates after refund is accepted
    for (const entry of result.plan) {
      await Order.updateOrderItemQuantity(entry.orderItemId, entry.maxQty - entry.requested, entry.unitPrice);
      await Product.incrementStock(entry.productId, entry.requested);
    }

    const remainingItems = await Order.getItemsWithIdsByOrderId(orderId);
    const newSubtotal = remainingItems.reduce((sum, it) => sum + Number(it.line_total || 0), 0);
    const newDiscount = Number((newSubtotal * ratio).toFixed(2));
    const newTotal = Number((newSubtotal - newDiscount).toFixed(2));
    await Order.updateTotals(orderId, newSubtotal.toFixed(2), newDiscount.toFixed(2), newTotal.toFixed(2));

    if (result.refundedUnits >= result.totalUnits) {
      await Order.updateStatus(orderId, 'refunded');
    }
    return res.redirect('/admin/orders?refund=' + refundAlert);
  } catch (e) {
    console.error('refund order error:', e);
    return res.redirect('/admin/orders?refund=error');
  }
};

exports.printReceipt = async (req, res) => {
  try {
    const orderId = parseInt(req.params.orderId, 10);
    if (!orderId || isNaN(orderId)) {
      return res.status(400).send('Invalid order ID');
    }
    const order = await Order.getById(orderId);
    if (!order) {
      return res.status(404).send('Order not found');
    }
    const items = await Order.getItemsForOrders([orderId]);
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
    console.error('admin print receipt error:', err);
    return res.status(500).send('Internal Server Error');
  }
};
