const { dbGet, dbRun } = require('../config/db');

// Lazy-load Stripe if key exists
let stripe = null;
if (process.env.STRIPE_SECRET_KEY) {
  try {
    stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
  } catch (e) {
    console.warn('Stripe initialization notice:', e.message);
  }
}

const PLANS = {
  monthly: {
    name: 'StudySync Pro (Monthly)',
    priceCents: 699, // $6.99
    interval: 'month',
    priceId: process.env.STRIPE_PRICE_MONTHLY || null
  },
  yearly: {
    name: 'StudySync Pro (Annual)',
    priceCents: 4900, // $49.00
    interval: 'year',
    priceId: process.env.STRIPE_PRICE_YEARLY || null
  }
};

// 1. Create Checkout Session
exports.createCheckoutSession = async (req, res) => {
  try {
    const userId = req.user.userId;
    const { plan = 'monthly', successUrl, cancelUrl } = req.body;

    const user = await dbGet('SELECT id, name, email, stripe_customer_id, is_pro FROM users WHERE id = ?', [userId]);
    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found.' });
    }

    const selectedPlan = PLANS[plan] || PLANS.monthly;
    const origin = req.headers.origin || 'http://localhost:5000';
    const redirectSuccess = successUrl || `${origin}/dashboard.html?billing=success`;
    const redirectCancel = cancelUrl || `${origin}/dashboard.html?billing=cancelled`;

    // Production Stripe Checkout Flow
    if (stripe && process.env.STRIPE_SECRET_KEY) {
      let customerId = user.stripe_customer_id;

      if (!customerId) {
        const customer = await stripe.customers.create({
          email: user.email,
          name: user.name,
          metadata: { userId: String(user.id) }
        });
        customerId = customer.id;
        await dbRun('UPDATE users SET stripe_customer_id = ? WHERE id = ?', [customerId, user.id]);
      }

      const session = await stripe.checkout.sessions.create({
        customer: customerId,
        payment_method_types: ['card'],
        mode: 'subscription',
        line_items: [
          selectedPlan.priceId ? {
            price: selectedPlan.priceId,
            quantity: 1
          } : {
            price_data: {
              currency: 'usd',
              product_data: {
                name: selectedPlan.name,
                description: 'Full Academic Workstation: Unlimited Gemini AI Syllabi, 40Hz Audio Focus, & Screen-Time Guardrails.'
              },
              unit_amount: selectedPlan.priceCents,
              recurring: { interval: selectedPlan.interval }
            },
            quantity: 1
          }
        ],
        metadata: {
          userId: String(user.id),
          plan
        },
        subscription_data: {
          trial_period_days: 7 // 7-day free trial
        },
        success_url: `${redirectSuccess}&session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: redirectCancel
      });

      return res.status(200).json({
        success: true,
        checkoutUrl: session.url,
        sessionId: session.id,
        isLiveStripe: true
      });
    }

    // Development / Sandbox Test Mode Flow (When Stripe Secret Key is not yet populated)
    const simulatedExpires = new Date();
    if (plan === 'yearly') {
      simulatedExpires.setFullYear(simulatedExpires.getFullYear() + 1);
    } else {
      simulatedExpires.setMonth(simulatedExpires.getMonth() + 1);
    }

    const expiresStr = simulatedExpires.toISOString();
    await dbRun(
      `UPDATE users 
       SET is_pro = 1, pro_tier = 'pro', subscription_status = 'active', 
           pro_expires_at = ?, billing_cycle = ?, subscription_id = ? 
       WHERE id = ?`,
      [expiresStr, plan, `sub_sandbox_${Date.now()}`, user.id]
    );

    return res.status(200).json({
      success: true,
      sandboxActivated: true,
      message: `🎉 Simulated Sandbox Checkout Activated: You are now upgraded to StudySync Pro (${plan})!`,
      plan,
      expiresAt: expiresStr
    });
  } catch (err) {
    console.error('Create Checkout Session Error:', err);
    res.status(500).json({ success: false, message: 'Failed to initiate checkout.' });
  }
};

// 2. Fetch Subscription & Billing Status
exports.getBillingStatus = async (req, res) => {
  try {
    const userId = req.user.userId;
    const user = await dbGet(
      `SELECT id, email, is_pro, pro_tier, subscription_status, pro_expires_at, billing_cycle, stripe_customer_id 
       FROM users WHERE id = ?`,
      [userId]
    );

    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found.' });
    }

    let isPro = Boolean(user.is_pro);
    if (user.pro_expires_at && new Date(user.pro_expires_at).getTime() < Date.now()) {
      isPro = false;
    }

    res.status(200).json({
      success: true,
      isPro,
      tier: isPro ? (user.pro_tier || 'pro') : 'free',
      status: user.subscription_status || 'inactive',
      expiresAt: user.pro_expires_at,
      billingCycle: user.billing_cycle || 'monthly',
      plans: PLANS
    });
  } catch (err) {
    console.error('Get Billing Status Error:', err);
    res.status(500).json({ success: false, message: 'Failed to retrieve billing status.' });
  }
};

// 3. Webhook Listener for Stripe Events
exports.handleWebhook = async (req, res) => {
  if (!stripe || !process.env.STRIPE_WEBHOOK_SECRET) {
    return res.status(400).send('Stripe webhook not configured.');
  }

  const sig = req.headers['stripe-signature'];
  let event;

  try {
    event = stripe.webhooks.constructEvent(req.body, sig, process.env.STRIPE_WEBHOOK_SECRET);
  } catch (err) {
    console.error('Stripe Webhook Signature Verification Failed:', err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  try {
    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object;
        const userId = session.metadata?.userId;
        const plan = session.metadata?.plan || 'monthly';
        const subscriptionId = session.subscription;

        if (userId) {
          const expiresDate = new Date();
          expiresDate.setDate(expiresDate.getDate() + (plan === 'yearly' ? 370 : 33));

          await dbRun(
            `UPDATE users 
             SET is_pro = 1, pro_tier = 'pro', subscription_status = 'active', 
                 subscription_id = ?, billing_cycle = ?, pro_expires_at = ? 
             WHERE id = ?`,
            [subscriptionId, plan, expiresDate.toISOString(), userId]
          );
          console.log(`Stripe: Activated Pro subscription for user ${userId}`);
        }
        break;
      }

      case 'customer.subscription.deleted': {
        const subscription = event.data.object;
        const customerId = subscription.customer;

        await dbRun(
          `UPDATE users 
           SET is_pro = 0, pro_tier = 'free', subscription_status = 'cancelled' 
           WHERE stripe_customer_id = ?`,
          [customerId]
        );
        console.log(`Stripe: Cancelled subscription for customer ${customerId}`);
        break;
      }

      case 'customer.subscription.updated': {
        const sub = event.data.object;
        const status = sub.status === 'active' ? 'active' : sub.status;
        const isPro = status === 'active' ? 1 : 0;

        await dbRun(
          `UPDATE users SET is_pro = ?, subscription_status = ? WHERE stripe_customer_id = ?`,
          [isPro, status, sub.customer]
        );
        break;
      }
    }

    res.status(200).json({ received: true });
  } catch (err) {
    console.error('Error processing Stripe event:', err);
    res.status(500).json({ error: 'Webhook processing failed.' });
  }
};

// 4. Cancel Subscription (Downgrade to Free)
exports.cancelSubscription = async (req, res) => {
  try {
    const userId = req.user.userId;
    const user = await dbGet('SELECT stripe_customer_id, subscription_id FROM users WHERE id = ?', [userId]);

    if (stripe && user?.subscription_id) {
      try {
        await stripe.subscriptions.update(user.subscription_id, { cancel_at_period_end: true });
      } catch (stErr) {
        console.warn('Stripe cancel notice:', stErr.message);
      }
    }

    await dbRun(
      `UPDATE users SET subscription_status = 'cancelling_at_period_end' WHERE id = ?`,
      [userId]
    );

    res.status(200).json({
      success: true,
      message: 'Subscription will remain active until the end of your current billing period.'
    });
  } catch (err) {
    console.error('Cancel Subscription Error:', err);
    res.status(500).json({ success: false, message: 'Failed to cancel subscription.' });
  }
};
