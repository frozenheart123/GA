const axios = require("axios");
const cartitems = require("../models/cartitems");
const productModel = require("../models/product");
const Orders = require("../models/order");
const Transaction = require("../models/transaction");
const NetsTransaction = require("../models/netsTransaction");
const CartController = require("../Controller/cartController");

const computeCartTotals = CartController.computeCartTotals;

const getCartItemsByUserId = (userId) => {
  return new Promise((resolve, reject) => {
    cartitems.getByUserId(userId, (err, items) => {
      if (err) return reject(err);
      resolve(items || []);
    });
  });
};

const removeCartBulk = (userId, productIds) => {
  return new Promise((resolve, reject) => {
    cartitems.removeBulk(userId, productIds, (err, result) => {
      if (err) return reject(err);
      resolve(result);
    });
  });
};

const decrementProductStock = async (productId, quantity) => {
  try {
    const product = await productModel.getById(productId);
    if (!product) {
      throw new Error(`Product ${productId} not found`);
    }
    const currentQty = Number(product.quantity || 0);
    const newQty = Math.max(0, currentQty - Number(quantity || 0));
    const updated = await productModel.update(productId, {
      ...product,
      quantity: newQty,
    });
    return { success: !!updated, affectedRows: updated ? 1 : 0 };
  } catch (err) {
    console.error(`Error decrementing stock for productId ${productId}:`, err);
    throw err;
  }
};

const saveTransaction = (data) => {
  return new Promise((resolve, reject) => {
    Transaction.create(data, (err, result) => {
      if (err) return reject(err);
      resolve(result);
    });
  });
};

const formatMysqlDatetime = (value) => {
  const date = value ? new Date(value) : new Date();
  const iso = date.toISOString();
  return iso.replace("T", " ").split(".")[0];
};

const getUserIdFromSession = (req) => {
  if (!req || !req.session || !req.session.user) return null;
  return (
    req.session.user.user_id ||
    req.session.user.userId ||
    req.session.user.id ||
    null
  );
};

const parsePayload = (input) => {
  if (!input) return null;
  if (typeof input === "string") {
    try {
      return JSON.parse(input);
    } catch (error) {
      return null;
    }
  }
  return input;
};

exports.generateQrCode = async (req, res) => {
  const { cartTotal } = req.body;
  const numericTotal = Number(cartTotal || 0).toFixed(2);
  const userId = getUserIdFromSession(req);
  console.log("Generating NETS QR with cartTotal:", numericTotal, "userId:", userId);

  try {
    const requestBody = {
      txn_id: "sandbox_nets|m|8ff8e5b6-d43e-4786-8ac5-7accf8c5bd9b",
      amt_in_dollars: numericTotal,
      notify_mobile: 0,
    };

    const response = await axios.post(
      `https://sandbox.nets.openapipaas.com/api/v1/common/payments/nets-qr/request`,
      requestBody,
      {
        headers: {
          "api-key": process.env.API_KEY,
          "project-id": process.env.PROJECT_ID,
        },
      }
    );

    const getCourseInitIdParam = () => {
      try {
        require.resolve("./../course_init_id");
        const { courseInitId } = require("../course_init_id");
        console.log("Loaded courseInitId:", courseInitId);
        return courseInitId ? `${courseInitId}` : "";
      } catch (error) {
        return "";
      }
    };

    const qrData = response?.data?.result?.data;
    if (
      qrData &&
      qrData.response_code === "00" &&
      qrData.txn_status === 1 &&
      qrData.qr_code
    ) {
      console.log("QR code generated successfully");
      const txnRetrievalRef = qrData.txn_retrieval_ref;
      const courseInitId = getCourseInitIdParam();
      const webhookUrl = `https://sandbox.nets.openapipaas.com/api/v1/common/payments/nets/webhook?txn_retrieval_ref=${txnRetrievalRef}&course_init_id=${courseInitId}`;

      try {
        await NetsTransaction.create({
          userId,
          amount: numericTotal,
          txnRetrievalRef,
          courseInitId,
          status: "pending",
          responseCode: qrData.response_code,
          networkStatus: qrData.network_status,
          payload: response?.data || null,
        });
      } catch (innerErr) {
        console.warn("Failed to persist NETS transaction:", innerErr);
      }

      res.render("netsQr", {
        total: numericTotal,
        title: "Scan to Pay",
        qrCodeUrl: `data:image/png;base64,${qrData.qr_code}`,
        txnRetrievalRef,
        courseInitId,
        networkCode: qrData.network_status,
        timer: 300,
        webhookUrl,
        fullNetsResponse: response.data,
        apiKey: process.env.API_KEY,
        projectId: process.env.PROJECT_ID,
      });
    } else {
      let errorMsg = "An error occurred while generating the QR code.";
      if (qrData && qrData.network_status !== 0) {
        errorMsg =
          qrData.error_message || "Transaction failed. Please try again.";
      }
      res.render("netsTxnFailStatus", {
        message: errorMsg,
      });
    }
  } catch (error) {
    console.error("Error in generateQrCode:", error.message);
    res.redirect("/nets-qr/fail");
  }
};

exports.completeOrder = async (req, res) => {
  try {
    const userId = getUserIdFromSession(req);
    if (!userId) {
      return res.status(401).json({ error: "Please log in to complete payment." });
    }

    const { txnRetrievalRef, payload: rawPayload, netTransactionId, courseInitId } =
      req.body;
    if (!txnRetrievalRef) {
      return res.status(400).json({ error: "Missing txnRetrievalRef" });
    }

    const netsPayload = parsePayload(rawPayload);
    const netsEntry = await NetsTransaction.getByTxnRetrievalRef(txnRetrievalRef);
    if (!netsEntry) {
      return res.status(404).json({ error: "NETS transaction not found" });
    }
    if (netsEntry.order_id) {
      return res.json({ success: true, orderId: netsEntry.order_id });
    }

    const items = await getCartItemsByUserId(userId);
    if (!items || !items.length) {
      return res.status(400).json({ error: "Cart is empty" });
    }

    const isMember = !!(req.session.user && req.session.user.is_member);
    const totals = computeCartTotals(items, isMember);
    const subtotal = Number(totals.subtotal || 0);
    const cashback = Number(totals.cashback || 0);
    const total = Number(totals.total || 0);
    if (total <= 0) {
      return res
        .status(400)
        .json({ error: "Invalid cart total; cannot create order." });
    }

    const orderItems = items.map((item) => ({
      productId: item.productId,
      quantity: item.quantity,
      price: Number(item.price || 0),
      total: Number(item.price || 0) * Number(item.quantity || 0),
    }));

    const orderId = await Orders.createOrder(
      userId,
      subtotal,
      cashback,
      total,
      orderItems,
      "NETS"
    );

    await NetsTransaction.updateByTxnRetrievalRef(txnRetrievalRef, {
      orderId,
      netTransactionId: netTransactionId || netsPayload?.net_transaction_id,
      courseInitId: courseInitId || netsEntry.course_init_id,
      status: "success",
      amount: total,
      responseCode: netsPayload?.response_code || netsEntry.response_code,
      networkStatus:
        netsPayload?.network_status || netsEntry.network_status || null,
      payload: netsPayload || netsEntry.payload,
    });

    await saveTransaction({
      orderId,
      payerId: "NETS",
      payerEmail: null,
      amount: total,
      currency: "SGD",
      status: "captured",
      time: formatMysqlDatetime(new Date()),
      captureId: netTransactionId || txnRetrievalRef,
    });

    const failedDecrements = [];
    for (const item of orderItems) {
      try {
        const updated = await decrementProductStock(item.productId, item.quantity);
        if (!updated || !updated.affectedRows) {
          failedDecrements.push(item.productId);
        }
      } catch (err) {
        failedDecrements.push(item.productId);
      }
    }

    const productIds = orderItems.map((item) => item.productId);
    await removeCartBulk(userId, productIds);
    if (req.session) {
      req.session.cart = [];
    }

    return res.json({ success: true, orderId, failedDecrements });
  } catch (error) {
    console.error("NETS completeOrder error:", error);
    return res
      .status(500)
      .json({ error: "Unable to finalize NETS payment at this time." });
  }
};
