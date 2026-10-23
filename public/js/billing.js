// StudySync Pro Billing & Stripe Integration Module
(function () {
  let billingModal = null;
  let currentBillingData = null;

  async function fetchBillingStatus() {
    try {
      const res = await ApiClient.get('/billing/status');
      if (res && res.success) {
        currentBillingData = res;
        updateProStatusBadge(res.isPro, res.tier, res.billingCycle);
      }
    } catch (err) {
      console.warn('Billing status load notice:', err.message);
    }
  }

  function updateProStatusBadge(isPro, tier, billingCycle) {
    const badgeContainer = document.getElementById('user-tier-badge-container');
    if (!badgeContainer) return;

    if (isPro) {
      badgeContainer.innerHTML = `
        <span class="pro-pill-badge" title="Active StudySync Pro Member">
          <i data-lucide="crown" style="width: 13px; height: 13px; color: #f59e0b;"></i>
          <span>PRO</span>
        </span>
      `;
    } else {
      badgeContainer.innerHTML = `
        <button id="upgrade-to-pro-nav-btn" class="upgrade-nav-btn" title="Unlock Unlimited AI & Audio Features">
          <i data-lucide="sparkles" style="width: 12px; height: 12px; color: #818cf8;"></i>
          <span>Upgrade</span>
        </button>
      `;
      const btn = document.getElementById('upgrade-to-pro-nav-btn');
      if (btn) btn.addEventListener('click', openUpgradeModal);
    }
    if (window.lucide) window.lucide.createIcons();
  }

  function createPricingModal() {
    if (document.getElementById('studysync-pricing-modal')) return;

    const modal = document.createElement('div');
    modal.id = 'studysync-pricing-modal';
    modal.className = 'custom-modal pricing-modal-overlay';
    modal.innerHTML = `
      <div class="pricing-modal-card glassmorphic-card">
        <button class="pricing-modal-close" id="close-pricing-modal">&times;</button>
        
        <div class="pricing-header">
          <div class="pricing-badge-pill">
            <i data-lucide="sparkles" style="width: 14px; height: 14px; color: #818cf8;"></i>
            <span>StudySync Pro Pass</span>
          </div>
          <h2>Supercharge Your Academic Performance</h2>
          <p class="pricing-subtitle">Eliminate exam stress with unlimited Gemini AI scheduling, 40Hz audio neuro-entrainment, and distraction-proof focus shield.</p>

          <div class="billing-toggle-wrapper">
            <span class="toggle-label" id="label-monthly">Monthly</span>
            <label class="switch">
              <input type="checkbox" id="pricing-billing-toggle" checked>
              <span class="slider round"></span>
            </label>
            <span class="toggle-label active" id="label-yearly">Annual <span class="savings-tag">Save 42%</span></span>
          </div>
        </div>

        <div class="pricing-cards-grid">
          <!-- Free Plan -->
          <div class="plan-card plan-free">
            <div class="plan-header">
              <h3>Free Explorer</h3>
              <p class="plan-desc">Essential planning for occasional study sessions.</p>
              <div class="plan-price">
                <span class="currency">$</span><span class="amount">0</span>
                <span class="period">/forever</span>
              </div>
            </div>
            <ul class="plan-features">
              <li><i data-lucide="check" class="icon-check"></i> 1 AI Syllabus Upload / mo</li>
              <li><i data-lucide="check" class="icon-check"></i> Standard Pomodoro Timer</li>
              <li><i data-lucide="check" class="icon-check"></i> Rain & White Noise audio</li>
              <li><i data-lucide="check" class="icon-check"></i> Today's screen-time stats</li>
              <li class="disabled"><i data-lucide="x" class="icon-cross"></i> 1-Click AI Dynamic Rebalance</li>
              <li class="disabled"><i data-lucide="x" class="icon-cross"></i> 40Hz Gamma & Binaural Audio</li>
              <li class="disabled"><i data-lucide="x" class="icon-cross"></i> Companion Tab Shield Lock</li>
            </ul>
            <button class="btn btn-secondary plan-btn" disabled>Current Base Plan</button>
          </div>

          <!-- Pro Plan -->
          <div class="plan-card plan-pro popular">
            <div class="popular-ribbon">MOST POPULAR • 7-DAY FREE TRIAL</div>
            <div class="plan-header">
              <h3>StudySync Pro</h3>
              <p class="plan-desc">For high-performing students aiming for top percentiles.</p>
              <div class="plan-price" id="pro-price-display">
                <span class="currency">$</span><span class="amount" id="pro-amount-val">4.08</span>
                <span class="period" id="pro-period-val">/mo (billed $49/yr)</span>
              </div>
            </div>
            <ul class="plan-features">
              <li><i data-lucide="check-circle-2" class="icon-check-pro"></i> <strong>Unlimited</strong> AI Syllabus Uploads</li>
              <li><i data-lucide="check-circle-2" class="icon-check-pro"></i> <strong>1-Click AI Rebalancing</strong> (never fall behind)</li>
              <li><i data-lucide="check-circle-2" class="icon-check-pro"></i> <strong>40Hz Gamma & Binaural Beats</strong> focus engine</li>
              <li><i data-lucide="check-circle-2" class="icon-check-pro"></i> <strong>Hard Tab Lock</strong> with Nuclear website blocker</li>
              <li><i data-lucide="check-circle-2" class="icon-check-pro"></i> <strong>30-Day Behavioral Analytics</strong> & audit reports</li>
              <li><i data-lucide="check-circle-2" class="icon-check-pro"></i> <strong>Unlimited Gemini Tutor</strong> with syllabus context</li>
            </ul>
            <button class="btn btn-primary plan-btn glow-btn" id="start-pro-checkout-btn">
              <i data-lucide="zap" style="width: 16px; height: 16px;"></i>
              <span id="checkout-btn-text">Start 7-Day Free Trial</span>
            </button>
            <div class="secure-badge">
              <i data-lucide="shield-check" style="width: 12px; height: 12px; color: #10b981;"></i>
              <span>Secured by Stripe • Cancel anytime in 1-click</span>
            </div>
          </div>
        </div>
      </div>
    `;

    document.body.appendChild(modal);
    billingModal = modal;

    // Listeners
    document.getElementById('close-pricing-modal').addEventListener('click', closeUpgradeModal);
    modal.addEventListener('click', (e) => {
      if (e.target === modal) closeUpgradeModal();
    });

    const toggle = document.getElementById('pricing-billing-toggle');
    const labelMonthly = document.getElementById('label-monthly');
    const labelYearly = document.getElementById('label-yearly');
    const proAmount = document.getElementById('pro-amount-val');
    const proPeriod = document.getElementById('pro-period-val');

    toggle.addEventListener('change', () => {
      if (toggle.checked) {
        // Yearly
        labelYearly.classList.add('active');
        labelMonthly.classList.remove('active');
        proAmount.textContent = '4.08';
        proPeriod.textContent = '/mo (billed $49/yr)';
      } else {
        // Monthly
        labelMonthly.classList.add('active');
        labelYearly.classList.remove('active');
        proAmount.textContent = '6.99';
        proPeriod.textContent = '/month';
      }
    });

    document.getElementById('start-pro-checkout-btn').addEventListener('click', async () => {
      const plan = toggle.checked ? 'yearly' : 'monthly';
      const btn = document.getElementById('start-pro-checkout-btn');
      btn.disabled = true;
      btn.innerHTML = `<i data-lucide="loader-2" class="spin" style="width: 16px; height: 16px;"></i> <span>Connecting Checkout...</span>`;
      if (window.lucide) window.lucide.createIcons();

      try {
        const res = await ApiClient.post('/billing/checkout', {
          plan,
          successUrl: `${window.location.origin}/dashboard.html?billing=success`,
          cancelUrl: `${window.location.origin}/dashboard.html?billing=cancelled`
        });

        if (res.isLiveStripe && res.checkoutUrl) {
          window.location.href = res.checkoutUrl;
        } else if (res.sandboxActivated) {
          closeUpgradeModal();
          if (window.Toast) {
            Toast.success('Pro Activated! 👑', res.message || 'Welcome to StudySync Pro!');
          }
          await fetchBillingStatus();
        }
      } catch (err) {
        if (window.Toast) Toast.error('Checkout Notice', err.message);
        btn.disabled = false;
        btn.innerHTML = `<i data-lucide="zap" style="width: 16px; height: 16px;"></i> <span>Start 7-Day Free Trial</span>`;
        if (window.lucide) window.lucide.createIcons();
      }
    });

    if (window.lucide) window.lucide.createIcons();
  }

  function openUpgradeModal() {
    createPricingModal();
    if (billingModal) {
      billingModal.classList.add('active');
    }
  }

  function closeUpgradeModal() {
    if (billingModal) {
      billingModal.classList.remove('active');
    }
  }

  // Handle URL billing redirect query params
  function checkUrlBillingStatus() {
    const urlParams = new URLSearchParams(window.location.search);
    if (urlParams.get('billing') === 'success') {
      setTimeout(() => {
        if (window.Toast) {
          Toast.success('Welcome to Pro! 👑', 'Your subscription is now active with full academic workstation capabilities.');
        }
        window.history.replaceState({}, document.title, window.location.pathname);
        fetchBillingStatus();
      }, 500);
    }
  }

  document.addEventListener('DOMContentLoaded', () => {
    fetchBillingStatus();
    checkUrlBillingStatus();
  });

  window.BillingModule = {
    openModal: openUpgradeModal,
    closeModal: closeUpgradeModal,
    refreshStatus: fetchBillingStatus,
    getStatus: () => currentBillingData
  };
})();
