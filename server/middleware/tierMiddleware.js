const { dbGet } = require('../config/db');

// Check if user has an active Pro subscription
async function getUserSubscriptionStatus(userId) {
  try {
    const user = await dbGet(
      'SELECT id, is_pro, pro_tier, subscription_status, pro_expires_at FROM users WHERE id = ?',
      [userId]
    );

    if (!user) return { isPro: false, tier: 'free' };

    let isPro = Boolean(user.is_pro);

    // If subscription has expiration date, check if still valid
    if (user.pro_expires_at) {
      const expiresAt = new Date(user.pro_expires_at).getTime();
      if (Date.now() > expiresAt) {
        isPro = false;
      }
    }

    return {
      isPro,
      tier: isPro ? (user.pro_tier || 'pro') : 'free',
      status: user.subscription_status || 'inactive',
      expiresAt: user.pro_expires_at
    };
  } catch (err) {
    console.error('Tier Check Error:', err);
    return { isPro: false, tier: 'free' };
  }
}

// Middleware that attaches tier to req.userTier
const attachUserTier = async (req, res, next) => {
  if (!req.user || !req.user.userId) {
    req.userTier = { isPro: false, tier: 'free' };
    return next();
  }

  req.userTier = await getUserSubscriptionStatus(req.user.userId);
  next();
};

// Guard middleware: strictly requires Pro tier
const requireProTier = (featureName = 'This feature') => {
  return async (req, res, next) => {
    if (!req.user || !req.user.userId) {
      return res.status(401).json({ success: false, message: 'Authentication required.' });
    }

    const tierInfo = await getUserSubscriptionStatus(req.user.userId);
    if (!tierInfo.isPro) {
      return res.status(403).json({
        success: false,
        upgradeRequired: true,
        message: `${featureName} is an exclusive StudySync Pro feature. Upgrade to unlock unlimited access.`,
        tier: tierInfo.tier
      });
    }

    req.userTier = tierInfo;
    next();
  };
};

module.exports = {
  getUserSubscriptionStatus,
  attachUserTier,
  requireProTier
};
