# Payment Processing Troubleshooting Guide

## Common 500 Error Causes and Fixes

### 1. **Missing or Invalid PayPal Credentials** ✅ FIXED
**Symptom:** 500 error immediately when clicking PayPal button

**Cause:** `.env` file missing or has invalid `PAYPAL_CLIENT_ID` / `PAYPAL_CLIENT_SECRET`

**Fix:**
- Ensure `.env` file exists with valid credentials
- Check console logs for "PayPal authentication error"
- The code now provides clear error messages

---

### 2. **PayPal API Returns Unexpected Structure** ✅ FIXED
**Symptom:** 500 error after PayPal approval, during payment capture

**Cause:** Code tried to access nested properties like `capture.purchase_units[0].payments.captures[0]` without checking if they exist

**Fix Applied:**
- Added safe property access with optional chaining (`?.`)
- Validates PayPal response structure before accessing nested data
- Returns clear error if PayPal response is malformed

---

### 3. **PayPal API HTTP Errors** ✅ FIXED
**Symptom:** 500 error with no clear message

**Cause:** PayPal API returned 4xx or 5xx status but code didn't check `response.ok`

**Fix Applied:**
- All PayPal API calls now check `response.ok`
- Logs HTTP status codes and error messages
- Throws descriptive errors for authentication failures

---

### 4. **Empty Cart** ⚠️ User Error
**Symptom:** 400 or 500 error when trying to pay

**Cause:** User's cart is empty or items were removed

**How to Check:**
- Look for console log: `"pay: No items in cart for userId"`
- Frontend should disable PayPal button if cart is empty

---

### 5. **User Not Logged In** ⚠️ User Error
**Symptom:** 401 error when creating order or paying

**Cause:** Session expired or user not logged in

**How to Check:**
- Look for: `"createOrder: user not logged in"`
- Frontend should redirect to login page

---

### 6. **Database Connection Issues** 
**Symptom:** 500 error after successful PayPal capture

**Cause:** MySQL database is down or credentials are wrong

**How to Check:**
- Check console for database errors
- Verify `DB_HOST`, `DB_USER`, `DB_PASSWORD`, `DB_NAME` in `.env`
- Ensure MySQL server is running

---

### 7. **Invalid Product Stock Updates**
**Symptom:** Payment succeeds but console shows stock decrement failures

**Cause:** Product IDs don't exist or product model has issues

**How to Check:**
- Look for: `"Stock decrement failed for productId"`
- Non-critical - payment still completes
- Check product table in database

---

## Testing Checklist

Before testing PayPal payments:

- [ ] `.env` file exists with valid credentials
- [ ] MySQL server is running
- [ ] Database `ga_malamart` exists
- [ ] User is logged in
- [ ] Cart has at least one item
- [ ] Server logs show "Server started" message
- [ ] PayPal sandbox account is ready (for buyer testing)

---

## Viewing Errors in Console

**Server logs to watch:**
```bash
node app.js
```

**Key log messages:**
- ✅ `"createOrder: Creating PayPal order for amount: X"` - Order creation started
- ✅ `"createOrder: PayPal order created: ORDER-ID"` - Order created successfully
- ✅ `"pay: Capturing PayPal order: ORDER-ID"` - Payment capture started
- ✅ `"pay: PayPal capture response status: COMPLETED"` - Payment successful
- ❌ `"PayPal authentication error"` - Invalid credentials
- ❌ `"PayPal API error: 401"` - Authentication failed
- ❌ `"Invalid PayPal response"` - Malformed API response
- ❌ `"pay error:"` - Generic payment processing error

---

## Frontend Error Messages

Users might see these alerts:

| Error Message | Meaning | Solution |
|---------------|---------|----------|
| "Failed to create order" | Server couldn't create PayPal order | Check server logs, verify credentials |
| "Payment not completed" | PayPal capture didn't complete | User may have cancelled, check PayPal status |
| "Payment processing failed" | Server error during capture | Check server logs for details |
| "Cart is empty" | No items to pay for | Add items to cart first |
| "User not logged in" | Session expired | Log in again |

---

## Common Sandbox Testing Issues

### Issue: "Buyer can't log into PayPal"
**Solution:** Create a sandbox buyer account at https://developer.paypal.com/dashboard/accounts

### Issue: "Payment declined"
**Solution:** Sandbox accounts have unlimited fake money - ensure you're using a personal (buyer) account, not business

### Issue: "PayPal button doesn't load"
**Solution:** Check browser console - likely `PAYPAL_CLIENT_ID` is not set in `.env`

---

## Production Deployment Checklist

When going live with real payments:

- [ ] Create **LIVE** PayPal app credentials
- [ ] Update `.env` with live credentials
- [ ] Change `PAYPAL_ENVIRONMENT=PRODUCTION`
- [ ] Change `PAYPAL_API=https://api.paypal.com` (remove "sandbox")
- [ ] Test with small real transaction
- [ ] Set up PayPal webhook listeners for payment notifications
- [ ] Enable HTTPS/SSL on your server
- [ ] Review PayPal's terms and policies
