const Order = require('../models/order');
const Product = require('../models/product');
const Transaction = require('../models/transaction');
const paypal = require('../services/paypal');
const RefundRequest = require('../models/refundRequest');
const { resolvePaymentMethod } = require('../utils/paymentMethod');

const STATUSES = Order.statusOptions();

exports.dashboard = async (req, res) => {
  try {
    const { q, status } = req.query;
    const orders = await Order.adminList({ q, status });
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
    const orderItems = await Order.getItemsForOrders(ids);
    const refundRequests = await RefundRequest.getByOrderIds(ids);
    const refundByOrder = {};
    for (const rr of refundRequests) {
      refundByOrder[rr.order_id] = rr;
    }
    const itemsByOrder = {};
    for (const item of orderItems) {
      if (!itemsByOrder[item.order_id]) itemsByOrder[item.order_id] = [];
      itemsByOrder[item.order_id].push(item);
    }
    res.render('admin_orders', {
      orders,
      itemsByOrder,
      refundByOrder,
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

    let refundRequest = null;
    try {
      refundRequest = await RefundRequest.getByOrderId(orderId);
      // Allow admin refund even if request record is missing (do not block)
      if (refundRequest && String(refundRequest.status) !== 'requested') {
        return res.redirect('/admin/orders?refund=missing_request');
      }
    } catch (e) {
      console.error('refundRequest lookup failed:', e);
      refundRequest = null;
    }

    let transaction = null;
    try {
      transaction = await Transaction.getByOrderId(orderId);
    } catch (e) {
      console.error('transaction lookup failed:', e);
      transaction = null;
    }
    const resolvedMethod = resolvePaymentMethod({ order, transaction });
    let paymentMethod = String(resolvedMethod || '').toLowerCase();
    if (paymentMethod && paymentMethod !== 'paypal') {
      return res.redirect('/admin/orders?refund=unsupported');
    }
    const allowLocalRefund = true;
    if (paymentMethod === 'paypal') {
      if (!transaction || !transaction.captureId) {
        if (!allowLocalRefund) {
          return res.redirect('/admin/orders?refund=missing_tx');
        }
      }
    }

    const normalizeRefundQtyMap = (body) => {
      if (body && typeof body.refund_qty === 'object' && body.refund_qty !== null) {
        return body.refund_qty;
      }
      const map = {};
      Object.keys(body || {}).forEach((key) => {
        if (!key.startsWith('refund_qty[')) return;
        const id = key.slice('refund_qty['.length, key.length - 1);
        if (id) map[id] = body[key];
      });
      return map;
    };
    const refundQtyMap = normalizeRefundQtyMap(req.body);
    let items = [];
    try {
      items = await Order.getItemsWithIdsByOrderId(orderId);
    } catch (e) {
      console.error('getItemsWithIdsByOrderId failed:', e);
      items = [];
    }
    if (!items.length) {
      // Fallback: attempt to use basic items list (if available)
      try {
        const fallback = await Order.getItemsForOrders([orderId]);
        items = Array.isArray(fallback) ? fallback : [];
      } catch (e) {
        console.error('getItemsForOrders fallback failed:', e);
      }
    }

    const refundKeys = Object.keys(refundQtyMap || {});
    const useFullRefund = refundKeys.length === 0;
    const hasPositiveRequested = refundKeys.some((key) => Number(refundQtyMap[key] || 0) > 0);

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
    if (result.refundedUnits === 0 && (!refundKeys.length || !hasPositiveRequested)) {
      // Default to full refund if no quantities were provided or all were zero
      result = buildPlan(true);
    }

    if (result.refundedUnits === 0) {
      // Last-resort fallback: treat as full refund of order total
      result = {
        refundedUnits: 1,
        totalUnits: 1,
        matchedKeys: 0,
        refundSubtotal: Number(order.subtotal_amount || order.total_amount || 0),
        plan: []
      };
    }

    const oldSubtotal = Number(order.subtotal_amount || 0);
    const oldDiscount = Number(order.discount_amount || 0);
    const ratio = oldSubtotal > 0 ? (oldDiscount / oldSubtotal) : 0;
    const refundDiscount = Number((result.refundSubtotal * ratio).toFixed(2));
    let refundAmount = Number((result.refundSubtotal - refundDiscount).toFixed(2));
    const capturedAmount = Number(transaction && transaction.amount ? transaction.amount : order.total_amount || 0);
    if (capturedAmount > 0 && refundAmount > capturedAmount) {
      refundAmount = Number(capturedAmount.toFixed(2));
    }
    if (!refundAmount || refundAmount <= 0) {
      refundAmount = Number(order.total_amount || 0);
      if (!refundAmount || refundAmount <= 0) {
        return res.redirect('/admin/orders?refund=pending');
      }
    }

    let refundAlert = 'ok';
    if (paymentMethod === 'paypal') {
      if (transaction && transaction.captureId) {
        try {
          const refundResponse = await paypal.refundPayment(transaction.captureId, refundAmount.toFixed(2));
          const status = String(refundResponse && refundResponse.status ? refundResponse.status : '').toUpperCase();
          if (status !== 'COMPLETED' && status !== 'PENDING') {
            refundAlert = 'pending';
          }
          const txStatus = status === 'COMPLETED' ? 'REFUNDED' : 'REFUND_PENDING';
          try {
            await Transaction.updateStatusByOrderId(orderId, txStatus, 'Admin refund');
          } catch (e) {
            console.error('Transaction status update failed:', e);
            refundAlert = 'pending';
          }
          if (status === 'PENDING') {
            refundAlert = 'pending';
          }
        } catch (err) {
          console.error('PayPal refund error (continuing with local refund):', err);
          refundAlert = 'pending';
          try {
            await Transaction.updateStatusByOrderId(orderId, 'REFUND_PENDING', 'Admin refund pending');
          } catch (e) {
            console.error('Transaction status update failed:', e);
          }
        }
      } else {
        refundAlert = 'pending';
      }
    }

    // Apply DB updates after refund is accepted
    const restockFlag = String(req.body.restock || '').toLowerCase();
    const shouldRestock = restockFlag === '1' || restockFlag === 'true' || restockFlag === 'on' || restockFlag === 'yes';
    for (const entry of result.plan) {
      try {
        await Order.updateOrderItemQuantity(entry.orderItemId, entry.maxQty - entry.requested, entry.unitPrice);
      } catch (e) {
        console.error('updateOrderItemQuantity failed:', e);
        refundAlert = 'pending';
      }
      if (shouldRestock) {
        try {
          await Product.incrementStock(entry.productId, entry.requested);
        } catch (e) {
          console.error('incrementStock failed:', e);
          refundAlert = 'pending';
        }
      }
    }

    let remainingItems = [];
    try {
      remainingItems = await Order.getItemsWithIdsByOrderId(orderId);
    } catch (e) {
      console.error('getItemsWithIdsByOrderId failed:', e);
      refundAlert = 'pending';
    }
    const newSubtotal = remainingItems.reduce((sum, it) => sum + Number(it.line_total || 0), 0);
    const newDiscount = Number((newSubtotal * ratio).toFixed(2));
    const newTotal = Number((newSubtotal - newDiscount).toFixed(2));
    try {
      await Order.updateTotals(orderId, newSubtotal.toFixed(2), newDiscount.toFixed(2), newTotal.toFixed(2));
    } catch (e) {
      console.error('updateTotals failed:', e);
      refundAlert = 'pending';
    }

    const isFullyRefunded = result.refundedUnits >= result.totalUnits;
    if (isFullyRefunded) {
      try {
        await Order.updateStatus(orderId, 'refunded');
      } catch (e) {
        console.error('updateStatus failed:', e);
        refundAlert = 'pending';
      }
    }
    const adminId = req.session?.user?.user_id || req.session?.user?.userId || req.session?.user?.id || null;
    if (isFullyRefunded && refundRequest) {
      try {
        await RefundRequest.markApproved(orderId, adminId, 'Refund processed');
      } catch (e) {
        console.error('markApproved failed:', e);
        refundAlert = 'pending';
      }
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
