const express = require('express');
const router = express.Router();
const billingController = require('../controllers/billingController');
const authMiddleware = require('../middleware/authMiddleware');

// Get current billing and tier status
router.get('/status', authMiddleware, billingController.getBillingStatus);

// Create Stripe Checkout Session (or simulated sandbox upgrade)
router.post('/checkout', authMiddleware, billingController.createCheckoutSession);

// Cancel renewal
router.post('/cancel', authMiddleware, billingController.cancelSubscription);

// Stripe Webhook (Raw body handling handled in index.js for signature check)
router.post('/webhook', express.raw({ type: 'application/json' }), billingController.handleWebhook);

module.exports = router;
