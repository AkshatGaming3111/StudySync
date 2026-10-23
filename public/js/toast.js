// StudySync Modern Glassmorphic Toast & Interactive Modal Confirmation System
// Replaces dated native alert() and confirm() dialogs with elegant animated notifications.

(function () {
  let toastContainer = null;

  // Initialize or get the global toast container
  function getContainer() {
    if (!toastContainer || !document.body.contains(toastContainer)) {
      toastContainer = document.getElementById('studysync-toast-container');
      if (!toastContainer) {
        toastContainer = document.createElement('div');
        toastContainer.id = 'studysync-toast-container';
        toastContainer.className = 'toast-container';
        document.body.appendChild(toastContainer);
      }
    }
    return toastContainer;
  }

  const ICONS = {
    success: 'check-circle-2',
    error: 'alert-circle',
    warning: 'alert-triangle',
    info: 'info',
    xp: 'sparkles'
  };

  const DEFAULT_TITLES = {
    success: 'Success',
    error: 'Notice',
    warning: 'Attention',
    info: 'Information',
    xp: 'XP Earned!'
  };

  /**
   * Display a glassmorphic floating toast notification
   * @param {Object} options { title, message, type: 'success'|'error'|'warning'|'info'|'xp', duration: number, icon: string }
   */
  function showToast({ title, message, type = 'info', duration = 4000, icon = null }) {
    const container = getContainer();

    const toast = document.createElement('div');
    toast.className = `glass-toast toast-${type}`;

    const resolvedIcon = icon || ICONS[type] || 'info';
    const resolvedTitle = title || DEFAULT_TITLES[type] || 'Notice';

    toast.innerHTML = `
      <div class="toast-indicator"></div>
      <div class="toast-icon-wrapper">
        <i data-lucide="${resolvedIcon}"></i>
      </div>
      <div class="toast-content">
        <div class="toast-title">${escapeHtml(resolvedTitle)}</div>
        <div class="toast-message">${message}</div>
      </div>
      <button type="button" class="toast-close-btn" title="Dismiss">
        <i data-lucide="x"></i>
      </button>
      <div class="toast-progress">
        <div class="toast-progress-bar"></div>
      </div>
    `;

    container.appendChild(toast);

    if (window.lucide) {
      window.lucide.createIcons({ root: toast });
    }

    // Auto-dismiss countdown logic
    let remainingTime = duration;
    let startTime = Date.now();
    let dismissTimeout = null;
    const progressBar = toast.querySelector('.toast-progress-bar');

    if (progressBar && duration > 0) {
      progressBar.style.transition = `width ${duration}ms linear`;
      // Trigger animation on next frame
      requestAnimationFrame(() => {
        progressBar.style.width = '0%';
      });
    }

    function startTimer() {
      if (duration <= 0) return;
      startTime = Date.now();
      dismissTimeout = setTimeout(() => {
        dismissToast(toast);
      }, remainingTime);
    }

    function pauseTimer() {
      if (dismissTimeout) {
        clearTimeout(dismissTimeout);
        remainingTime -= Date.now() - startTime;
        if (remainingTime < 0) remainingTime = 0;
        if (progressBar) {
          const currentWidth = progressBar.getBoundingClientRect().width;
          const parentWidth = progressBar.parentElement.getBoundingClientRect().width;
          progressBar.style.transition = 'none';
          progressBar.style.width = `${(currentWidth / parentWidth) * 100}%`;
        }
      }
    }

    function resumeTimer() {
      if (duration <= 0) return;
      if (progressBar) {
        progressBar.style.transition = `width ${remainingTime}ms linear`;
        progressBar.style.width = '0%';
      }
      startTimer();
    }

    // Hover-to-pause
    toast.addEventListener('mouseenter', pauseTimer);
    toast.addEventListener('mouseleave', resumeTimer);

    // Close button
    const closeBtn = toast.querySelector('.toast-close-btn');
    if (closeBtn) {
      closeBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        dismissToast(toast);
      });
    }

    startTimer();
    return toast;
  }

  function dismissToast(toast) {
    if (!toast || toast.classList.contains('dismissing')) return;
    toast.classList.add('dismissing');
    toast.style.animation = 'toastSlideOut 0.28s cubic-bezier(0.4, 0, 0.2, 1) forwards';
    setTimeout(() => {
      if (toast.parentElement) {
        toast.parentElement.removeChild(toast);
      }
    }, 280);
  }

  function escapeHtml(str) {
    if (typeof str !== 'string') return str;
    return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  /**
   * Interactive Glassmorphic Confirmation Modal (Asynchronous replacement for window.confirm)
   * @param {Object} options { title, message, confirmText, cancelText, danger: boolean, icon: string }
   * @returns {Promise<boolean>} Resolves true if confirmed, false if cancelled
   */
  function confirmModal({
    title = 'Confirm Action',
    message = 'Are you sure you want to proceed?',
    confirmText = 'Confirm',
    cancelText = 'Cancel',
    danger = false,
    icon = danger ? 'alert-triangle' : 'help-circle'
  }) {
    return new Promise((resolve) => {
      // Remove any existing confirm modals
      const existing = document.getElementById('glass-confirm-modal');
      if (existing) existing.remove();

      const modalOverlay = document.createElement('div');
      modalOverlay.id = 'glass-confirm-modal';
      modalOverlay.className = 'glass-confirm-overlay';

      const iconColor = danger ? '#ef4444' : '#6366f1';
      const iconBg = danger ? 'rgba(239, 68, 68, 0.15)' : 'rgba(99, 102, 241, 0.15)';
      const confirmBtnClass = danger ? 'btn btn-danger' : 'btn btn-primary';

      modalOverlay.innerHTML = `
        <div class="glass-confirm-card glass-card">
          <div class="confirm-header-row">
            <div class="confirm-icon-box" style="background: ${iconBg}; color: ${iconColor};">
              <i data-lucide="${icon}"></i>
            </div>
            <div style="flex: 1;">
              <h3 class="confirm-title">${escapeHtml(title)}</h3>
              <p class="confirm-message">${message}</p>
            </div>
          </div>
          <div class="confirm-actions-row">
            <button type="button" class="btn btn-glass" id="confirm-cancel-btn">${escapeHtml(cancelText)}</button>
            <button type="button" class="${confirmBtnClass}" id="confirm-accept-btn">${escapeHtml(confirmText)}</button>
          </div>
        </div>
      `;

      document.body.appendChild(modalOverlay);

      if (window.lucide) {
        window.lucide.createIcons({ root: modalOverlay });
      }

      function cleanUp(result) {
        window.removeEventListener('keydown', onKeyDown);
        modalOverlay.classList.add('closing');
        setTimeout(() => {
          if (modalOverlay.parentElement) {
            modalOverlay.parentElement.removeChild(modalOverlay);
          }
          resolve(result);
        }, 200);
      }

      const cancelBtn = modalOverlay.querySelector('#confirm-cancel-btn');
      const acceptBtn = modalOverlay.querySelector('#confirm-accept-btn');

      cancelBtn.addEventListener('click', () => cleanUp(false));
      acceptBtn.addEventListener('click', () => cleanUp(true));

      // Click outside
      modalOverlay.addEventListener('click', (e) => {
        if (e.target === modalOverlay) {
          cleanUp(false);
        }
      });

      // ESC & Enter key listener
      function onKeyDown(e) {
        if (e.key === 'Escape') {
          cleanUp(false);
        } else if (e.key === 'Enter') {
          cleanUp(true);
        }
      }
      window.addEventListener('keydown', onKeyDown);
    });
  }

  // Public Global API
  window.Toast = {
    show: showToast,
    success: (title, message, duration = 3500) => {
      // If called with single argument: Toast.success('Saved!')
      if (!message && title) {
        message = title;
        title = 'Success';
      }
      return showToast({ title, message, type: 'success', duration });
    },
    error: (title, message, duration = 4500) => {
      if (!message && title) {
        message = title;
        title = 'Notice';
      }
      return showToast({ title, message, type: 'error', duration });
    },
    warning: (title, message, duration = 4000) => {
      if (!message && title) {
        message = title;
        title = 'Attention';
      }
      return showToast({ title, message, type: 'warning', duration });
    },
    info: (title, message, duration = 3500) => {
      if (!message && title) {
        message = title;
        title = 'Information';
      }
      return showToast({ title, message, type: 'info', duration });
    },
    xp: (title, message, duration = 4500) => {
      return showToast({ title, message, type: 'xp', duration, icon: 'sparkles' });
    },
    confirm: confirmModal
  };

  // Provide global convenience alias
  window.showToast = showToast;
})();
