const cartitems = require('../models/cartitems');
const { computeCartTotals, ensureCart } = require('./cartController');
const Transaction = require("../models/transaction");
const CartItems = require('../models/cartitems');
const Orders = require('../models/order');
const OrderDetails = require('../models/order');
const productModel = require('../models/product');
const paypal = require('../services/paypal');
const RefundRequest = require('../models/refundRequest');

exports.generateCheckout = async (req, res, next) => {
  try {
    const isMember = !!(req.session?.user && req.session.user.is_member);
    const userId = req.session?.user
      ? (req.session.user.user_id || req.session.user.userId || req.session.user.id)
      : null;
    let cart = [];

    if (userId) {
      const rows = await new Promise((resolve, reject) => {
        cartitems.getByUserId(userId, (err, result) => {
          if (err) reject(err);
          else resolve(result);
        });
      });
      cart = (rows || []).map((r) => ({
        productId: r.productId || r.product_id,
        price: Number(r.price || 0),
        qty: Number(r.quantity || 0),
      }));
    } else {
      cart = ensureCart(req);
    }

    if (!cart || !cart.length) {
      req.session.checkoutAmount = 0;
      return res.redirect('/cart');
    }

    const totals = computeCartTotals(cart, isMember);
    const amount = Number(totals.total || 0);
    if (!Number.isFinite(amount) || amount <= 0) {
      req.session.checkoutAmount = 0;
      return res.redirect('/cart');
    }

    req.session.checkoutAmount = amount;
    res.render('checkout', {
      amount: amount.toFixed(2),
      totals,
      isMember,
      cart,
      user: req.session?.user || null,
      paypalClientId: process.env.PAYPAL_CLIENT_ID || '',
      paynowQr: null, // PayNow QR not generated yet
      reference: null, // Reference not generated yet
    });
  } catch (err) {
    next(err);
  }
};

// Helper function to promisify CartItems.getByUserId
function getCartItemsByUserId(userId) {
  return new Promise((resolve, reject) => {
    CartItems.getByUserId(userId, (err, items) => {
      if (err) reject(err);
      else resolve(items || []);
    });
  });
}

// Get all cart items for the current user
exports.getCartItems = async (req, res) => {
  try {
    if (!req.session.user) {
      return res.status(401).json({ error: "User not logged in" });
    }
    
    const userId = req.session.user.userId || req.session.user.user_id || req.session.user.id;
    if (!userId) {
      return res.status(401).json({ error: "User ID not found in session" });
    }
    
    const items = await getCartItemsByUserId(userId);
    res.json({ success: true, items });
  } catch (err) {
    console.error("Get cart items error:", err);
    res.status(500).json({ error: "Failed to fetch cart items", message: err.message });
  }
};

// Get cart details with total amount
exports.getCartDetails = async (req, res) => {
  try {
    if (!req.session.user) {
      return res.status(401).json({ error: "User not logged in" });
    }
    
    const userId = req.session.user.userId || req.session.user.user_id || req.session.user.id;
    if (!userId) {
      return res.status(401).json({ error: "User ID not found in session" });
    }
    
    const items = await getCartItemsByUserId(userId);

    const totalAmount = items.reduce((sum, item) => sum + Number(item.total || 0), 0);
    
    res.json({ 
      success: true, 
      items,
      totalAmount: totalAmount.toFixed(2),
      itemCount: items.length
    });
  } catch (err) {
    console.error("Get cart details error:", err);
    res.status(500).json({ error: "Failed to fetch cart details", message: err.message });
  }
};

// Create PayPal order
exports.createOrder = async (req, res) => {
  try {
    if (!req.session.user) {
      console.warn('createOrder: user not logged in');
      return res.status(401).json({ error: "User not logged in", message: "Please log in to continue" });
    }

    const userId = req.session.user.userId || req.session.user.user_id || req.session.user.id;
    
    if (!userId) {
      console.warn('createOrder: userId not found in session');
      return res.status(401).json({ error: "User ID not found in session", message: "Session error" });
    }

    console.log('createOrder: session user', req.session.user);
    console.log('createOrder: using userId', userId);

    const items = await getCartItemsByUserId(userId);

    console.log('createOrder: retrieved items from database', { count: items.length, items });

    if (!items || items.length === 0) {
      console.warn('createOrder: cart empty for userId', userId);
      return res.status(400).json({ error: "Cart is empty", message: "No items in cart" });
    }

    // Apply membership discount before sending amount to PayPal
    const isMember = !!(req.session?.user && req.session.user.is_member);
    const totals = computeCartTotals(items, isMember);
    const payableAmount = Number((totals.total || 0).toFixed(2));

    console.log('createOrder: calculated totals with membership', { isMember, totals, payableAmount });

    if (!payableAmount || payableAmount <= 0) {
      console.error('createOrder: refusing to create PayPal order because payableAmount is not positive', {
        payableAmount,
        itemsCount: items.length
      });
      return res.status(400).json({ error: 'Cart total must be greater than zero', message: 'Invalid cart total' });
    }

    console.log('createOrder: Creating PayPal order for amount:', payableAmount);

    // Create PayPal order
    const order = await paypal.createOrder(payableAmount.toFixed(2));

    if (!order || !order.id) {
      console.error('createOrder: PayPal createOrder returned unexpected payload:', order);
      return res.status(502).json({ error: 'Failed to create PayPal order', details: order });
    }

    console.log('createOrder: PayPal order created:', order.id);

    res.json({ success: true, orderId: order.id });
  } catch (err) {
    console.error("createOrder error:", err);
    res.status(500).json({ error: "Failed to create order", message: err.message, details: err.toString() });
  }
};

// Helper to promisify removeBulk
function removeCartBulk(userId, productIds) {
  return new Promise((resolve, reject) => {
    CartItems.removeBulk(userId, productIds, (err, result) => {
      if (err) reject(err);
      else resolve(result);
    });
  });
}

// Helper to promisify Transaction.create
function createTransaction(transaction) {
  return new Promise((resolve, reject) => {
    Transaction.create(transaction, (err, result) => {
      if (err) reject(err);
      else resolve(result);
    });
  });
}

// Helper function to decrement product stock
async function decrementProductStock(productId, quantity) {
  try {
    const product = await productModel.getById(productId);
    if (!product) {
      throw new Error(`Product ${productId} not found`);
    }
    
    const currentQty = Number(product.quantity || 0);
    const newQty = Math.max(0, currentQty - Number(quantity || 0));
    
    console.log(`Decrementing stock for productId ${productId}: ${currentQty} - ${quantity} = ${newQty}`);
    
    const updated = await productModel.update(productId, {
      ...product,
      quantity: newQty
    });
    
    return { success: !!updated, affectedRows: updated ? 1 : 0 };
  } catch (err) {
    console.error(`Error decrementing stock for productId ${productId}:`, err);
    throw err;
  }
}

// Process payment and mark cart items as paid
exports.pay = async (req, res) => {
  console.log("=== PAY ENDPOINT CALLED ===");
  console.log("pay called with body:", req.body);
  console.log("Session user:", req.session?.user);
  
  try {
    let transaction = null;
    // Validate user is logged in
    if (!req.session.user) {
      console.warn('pay: user not logged in');
      return res.status(401).json({ error: "User not logged in" });
    }

    const userId = req.session.user.userId || req.session.user.user_id || req.session.user.id;
    if (!userId) {
      console.warn('pay: userId not found in session');
      return res.status(401).json({ error: "User ID not found in session" });
    }
    
    // Get the PayPal order ID from request
    const { orderId } = req.body;
    
    if (!orderId) {
      console.warn('pay: orderId not provided in request body');
      return res.status(400).json({ error: "Order ID is required" });
    }

    console.log('pay: Capturing PayPal order:', orderId, 'for userId:', userId);

    // Capture the PayPal payment
    const capture = await paypal.captureOrder(orderId);
    
    console.log('pay: PayPal capture response status:', capture.status);

    if (!capture || capture.status !== 'COMPLETED') {
      console.error('pay: Payment not completed, status:', capture?.status);
      return res.status(400).json({ error: "Payment was not completed", status: capture?.status });
    }

    // Extract transaction details from PayPal response with safe access
    const captureData = capture.purchase_units?.[0]?.payments?.captures?.[0];
    
    if (!captureData) {
      console.error('pay: Invalid PayPal capture response structure:', capture);
      return res.status(502).json({ 
        error: "Invalid PayPal response", 
        message: "PayPal did not return expected capture data" 
      });
    }
    
    const isoString = captureData.create_time || new Date().toISOString();
    const mysqlDatetime = isoString.replace("T", " ").replace("Z", "");

    const transactionBase = {
      orderId: capture.id || orderId,
      payerId: capture.payer?.payer_id || 'UNKNOWN',
      payerEmail: capture.payer?.email_address || 'no-email@paypal.com',
      amount: captureData.amount?.value || '0.00',
      currency: captureData.amount?.currency_code || 'SGD',
      status: capture.status || 'UNKNOWN',
      time: mysqlDatetime,
      captureId: captureData.id || orderId,
    };

    // Get cart items for this user
    const items = await getCartItemsByUserId(userId);

    if (!items || items.length === 0) {
      console.warn('pay: No items in cart for userId:', userId);
      return res.status(400).json({ error: "No items in cart to process" });
    }

    console.log('pay: Found', items.length, 'cart items for userId:', userId);

    // Apply membership discount to totals so DB and PayPal stay in sync
    const isMember = !!(req.session?.user && req.session.user.is_member);
    const totals = computeCartTotals(items, isMember);
    const subtotalAmount = Number((totals.subtotal || 0).toFixed(2));
    const discountAmount = Number((totals.cashback || 0).toFixed(2));
    const payableAmount = Number((totals.total || 0).toFixed(2));

    console.log('pay: Totals with membership applied', { isMember, subtotalAmount, discountAmount, payableAmount });

    if (!payableAmount || payableAmount <= 0) {
      console.error('pay: Computed payableAmount is not positive', { payableAmount });
      return res.status(400).json({ error: 'Cart total must be greater than zero', message: 'Invalid cart total' });
    }

    // Warn if captured amount does not match what we computed (should not happen if createOrder used same totals)
    const capturedAmount = Number(captureData.amount?.value || 0);
    if (Math.abs(capturedAmount - payableAmount) > 0.01) {
      console.warn('pay: Captured amount differs from computed payable', { capturedAmount, payableAmount });
    }

    // Order creation in database
    let dbOrderId = null;

    // Prepare order items once for DB insert and stock updates
    const orderItems = items.map(item => ({
      productId: item.productId || item.product_id,
      quantity: item.quantity,
      price: item.price,
      total: item.total || (item.price * item.quantity)
    }));

    // Check if Orders methods exist
    console.log('pay: Checking if Orders.createOrder exists:', typeof Orders.createOrder);
    if (Orders && Orders.createOrder && typeof Orders.createOrder === 'function') {
      try {
        console.log('pay: Creating order in database for userId:', userId);
        // Detect payment method
        let paymentMethod = 'PayPal';
        if (req.body.netsTxnId) {
          paymentMethod = 'Nets';
        } else if (req.body.paynowTxnId) {
          paymentMethod = 'PayNow';
        }
        dbOrderId = await Orders.createOrder(userId, subtotalAmount, discountAmount, payableAmount, orderItems, paymentMethod);
        console.log('pay: Order created in database with ID:', dbOrderId);
        if (req.session) {
          req.session.lastOrderId = dbOrderId;
        }
      } catch (orderErr) {
        console.warn('pay: Error creating order in database (continuing anyway):', orderErr.message);
        // Don't fail - we'll just clear the cart
      }
    } else {
      console.warn('pay: Orders.createOrder method not found - skipping order creation');
    }

    transaction = {
      ...transactionBase,
      orderId: dbOrderId || transactionBase.orderId
    };

    console.log('pay: Saving transaction to database:', transaction);

    // Save transaction to DB
    await createTransaction(transaction);

    // Decrement stock for each product ordered
    console.log('pay: Order items prepared. Now decrementing stock for', orderItems.length, 'items');
    const failedDecrements = [];
    for (let item of orderItems) {
      try {
        console.log(`[pay] Decrementing productId ${item.productId || item.product_id} by ${item.quantity}`);
        const result = await decrementProductStock(item.productId || item.product_id, item.quantity);
        if (!result || !result.affectedRows || result.affectedRows === 0) {
          console.error(`[pay] Stock decrement failed for productId ${item.productId || item.product_id}`);
          failedDecrements.push({ productId: item.productId || item.product_id, quantity: item.quantity });
        } else {
          console.log(`[pay] ✓ Stock decremented for productId ${item.productId || item.product_id}`);
        }
      } catch (decrementErr) {
        console.error(`[pay] Error decrementing stock for productId ${item.productId || item.product_id}:`, decrementErr);
        failedDecrements.push({ productId: item.productId || item.product_id, quantity: item.quantity, error: decrementErr.message });
      }
    }

    if (failedDecrements.length > 0) {
      console.warn(`[pay] ${failedDecrements.length} stock decrements failed:`, failedDecrements);
    }

    // Get cart item IDs to remove
    const cartItemIds = items.map(item => item.productId || item.product_id);

    console.log('pay: Removing cart items:', cartItemIds);

    // Remove cart items after successful payment
    await removeCartBulk(userId, cartItemIds);

    console.log("pay: Payment completed successfully");
    console.log("Transaction:", transaction);
    console.log("User ID:", userId);
    console.log("Cart items removed:", cartItemIds.length);

    // Respond with success
    res.json({ 
      success: true, 
      transaction,
      orderId: dbOrderId || null,
      message: "Payment successful" + (dbOrderId ? " and order created" : "")
    });

  } catch (err) {
    console.error("=== PAY ENDPOINT ERROR ===");
    console.error("pay error:", err);
    console.error("pay error message:", err.message);
    console.error("pay error stack:", err.stack);
    console.error("pay error name:", err.name);
    
    // Try to respond if headers haven't been sent
    if (!res.headersSent) {
      res.status(500).json({ 
        error: "Failed to process payment", 
        message: err.message,
        details: err.toString()
      });
    }
  }
};

// Get all paid orders for the current user
exports.getOrders = async (req, res) => {
  try {
    const userId = req.session.user.userId;
    const orders = await new Promise((resolve, reject) => {
      Orders.getOrdersByUser(userId, (err, orders) => {
        if (err) reject(err);
        else resolve(orders);
      });
    });

    // Attach paymentInfo for each order
    for (const order of orders) {
      const transactions = await Transaction.getByOrderId(order.id || order.orderId);
      const transaction = Array.isArray(transactions) ? transactions[0] : transactions;
      let paymentInfo = { method: 'Unknown', reference: '' };
      if (transaction) {
        if (transaction.payerId === 'NETS') {
          paymentInfo.method = 'NETS QR';
          paymentInfo.reference = transaction.captureId || transaction.payerId;
        } else if (transaction.payerId === 'PAYNOW') {
          paymentInfo.method = 'PayNow';
          paymentInfo.reference = transaction.captureId || transaction.payerId;
        } else if (transaction.payerEmail && transaction.captureId) {
          paymentInfo.method = 'PayPal';
          paymentInfo.reference = transaction.captureId;
        } else if (transaction.payerEmail) {
          paymentInfo.method = 'PayPal';
          paymentInfo.reference = transaction.payerEmail;
        } else if (transaction.payerId) {
          paymentInfo.method = 'PayPal';
          paymentInfo.reference = transaction.payerId;
        }
      }
      order.paymentInfo = paymentInfo;
    }

    res.json({ success: true, orders });
  } catch (err) {
    console.error('Get orders error:', err);
    res.status(500).json({ error: 'Failed to fetch orders', message: err.message });
  }
};

// Submit a refund request (admin will approve and process)
exports.refund = async (req, res) => {
  try {
    const { orderId, reason, details } = req.body;
    if (!req.session.user) {
      return res.render('refund', { error: 'Please log in to submit a refund request.', orderId, reason });
    }
    const userId = req.session.user.userId || req.session.user.user_id || req.session.user.id;
    if (!orderId) return res.render('refund', { error: 'Order ID required', orderId, reason });

    const order = await Orders.getById(orderId);
    if (!order || String(order.user_id) !== String(userId)) {
      return res.render('refund', { error: 'Invalid order or not allowed.', orderId, reason });
    }

    const reasonLabels = {
      rotten_goods: 'Rotten goods',
      not_fresh: 'Items not fresh',
      wrong_items: 'Wrong items delivered',
      damaged: 'Items damaged',
      late_delivery: 'Late delivery',
      other: 'Other'
    };
    const baseReason = reasonLabels[reason] || reason || 'Other';
    const fullReason = details ? `${baseReason} - ${details}` : baseReason;

    await new Promise((resolve, reject) => {
      RefundRequest.upsert(orderId, userId, fullReason, (err, result) => {
        if (err) return reject(err);
        resolve(result);
      });
    });

    return res.render('refund', {
      message: 'Refund request submitted. Admin will review your reason.',
      orderId,
      reason
    });
  } catch (err) {
    console.error('PayPal refund error:', err);
    return res.render('refund', { error: 'Refund request failed', message: err.message, orderId: req.body.orderId, reason: req.body.reason });
  }
};

// ...existing code...
