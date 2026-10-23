// Main Dashboard Navigation & Global State Manager

document.addEventListener('DOMContentLoaded', () => {
  lucide.createIcons();

  // Navigation Tabs Switching
  const navItems = document.querySelectorAll('.nav-item[data-tab]');
  const tabContents = document.querySelectorAll('.tab-content');

  navItems.forEach(item => {
    item.addEventListener('click', () => {
      const targetTabId = item.getAttribute('data-tab');

      navItems.forEach(n => n.classList.remove('active'));
      tabContents.forEach(c => c.classList.remove('active'));

      item.classList.add('active');
      const targetContent = document.getElementById(targetTabId);
      if (targetContent) {
        targetContent.classList.add('active');
      }

      // Populate Settings Tab inputs if switching to settings-tab
      if (targetTabId === 'settings-tab') {
        populatePageSettings();
      }

      // Refresh Chart.js layout if switching to screentime tab
      if (targetTabId === 'screentime-tab' && window.ScreentimeModule) {
        window.ScreentimeModule.refresh();
      }

      // Refresh Focus Room & Companion if switching to focus-tab
      if (targetTabId === 'focus-tab' && window.FocusRoomModule) {
        window.FocusRoomModule.refresh();
      }

      // Load Marketplace roadmaps if switching to marketplace-tab
      if (targetTabId === 'marketplace-tab' && window.MarketplaceModule) {
        window.MarketplaceModule.load();
      }
    });
  });

  // ==========================================
  // THEME MANAGEMENT (Glassmorphism Skins)
  // ==========================================
  const themeBtn = document.getElementById('theme-dropdown-btn');
  const themeMenu = document.getElementById('theme-dropdown-menu');
  const currentThemeLabel = document.getElementById('current-theme-label');
  const themeOptions = document.querySelectorAll('.theme-option-item');

  const THEME_NAMES = {
    'default': 'Modern Indigo',
    'cyberpunk': 'Cyberpunk Neon',
    'cozy-cafe': 'Cozy Coffee Shop',
    'midnight-oled': 'Midnight OLED',
    'studio-ghibli': 'Studio Ghibli'
  };

  function applyTheme(themeKey) {
    const validTheme = THEME_NAMES[themeKey] ? themeKey : 'default';
    document.documentElement.setAttribute('data-theme', validTheme);
    localStorage.setItem('studysync_theme', validTheme);

    if (currentThemeLabel) {
      currentThemeLabel.innerText = THEME_NAMES[validTheme] || 'Modern Indigo';
    }

    themeOptions.forEach(opt => {
      if (opt.getAttribute('data-theme') === validTheme) {
        opt.classList.add('active');
      } else {
        opt.classList.remove('active');
      }
    });
  }

  // Load saved theme on boot
  const initialTheme = localStorage.getItem('studysync_theme') || 'default';
  applyTheme(initialTheme);

  if (themeBtn && themeMenu) {
    themeBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      themeMenu.classList.toggle('active');
      if (profileMenu) profileMenu.classList.remove('active');
    });

    themeOptions.forEach(opt => {
      opt.addEventListener('click', () => {
        const selected = opt.getAttribute('data-theme');
        applyTheme(selected);
        themeMenu.classList.remove('active');
      });
    });

    document.addEventListener('click', (e) => {
      if (!themeMenu.contains(e.target) && !themeBtn.contains(e.target)) {
        themeMenu.classList.remove('active');
      }
    });
  }

  // Profile Dropdown Menu Handlers
  const profileToggle = document.getElementById('user-profile-toggle');
  const profileMenu = document.getElementById('profile-dropdown-menu');

  if (profileToggle && profileMenu) {
    profileToggle.addEventListener('click', (e) => {
      e.stopPropagation();
      profileMenu.classList.toggle('active');
    });

    document.addEventListener('click', (e) => {
      if (!profileMenu.contains(e.target) && !profileToggle.contains(e.target)) {
        profileMenu.classList.remove('active');
      }
    });
  }

  // Logout Handler
  const logoutBtn = document.getElementById('logout-btn');
  if (logoutBtn) {
    logoutBtn.addEventListener('click', async () => {
      try {
        await ApiClient.post('/auth/logout', {});
      } catch (err) {
        console.warn('Logout error:', err);
      } finally {
        ApiClient.setToken(null);
        window.location.href = 'index.html';
      }
    });
  }

  // Account Settings Modal Elements
  const settingsBtn = document.getElementById('profile-settings-btn');
  const userProfileBadge = document.getElementById('user-profile-badge');
  const navSettingsItem = document.getElementById('nav-settings-item');
  const settingsModal = document.getElementById('user-settings-modal');
  const closeSettingsBtn = document.getElementById('close-settings-modal-btn');
  const cancelSettingsBtn = document.getElementById('cancel-settings-modal-btn');
  const userProfileForm = document.getElementById('user-profile-form');
  const settingsNameInput = document.getElementById('settings-name-input');
  const settingsEmailInput = document.getElementById('settings-email-input');
  const settingsPasswordInput = document.getElementById('settings-password-input');
  const settingsKeyInput = document.getElementById('settings-key-input');
  const deleteAccountBtn = document.getElementById('delete-account-btn');

  async function openSettingsModal(e) {
    if (e) {
      e.preventDefault();
      e.stopPropagation();
    }
    if (profileMenu) profileMenu.classList.remove('active');
    const settingsTab = document.querySelector('.nav-item[data-tab="settings-tab"]');
    if (settingsTab) settingsTab.click();
    try {
      const res = await ApiClient.get('/auth/me');
      if (res.success && res.user) {
        window.currentUser = res.user;
        if (settingsNameInput) settingsNameInput.value = res.user.name || '';
        if (settingsEmailInput) settingsEmailInput.value = res.user.email || '';
      }
    } catch (err) {
      console.warn('Could not refresh profile for settings modal:', err);
      if (window.currentUser) {
        if (settingsNameInput) settingsNameInput.value = window.currentUser.name || '';
        if (settingsEmailInput) settingsEmailInput.value = window.currentUser.email || '';
      }
    }
    if (settingsPasswordInput) settingsPasswordInput.value = '';
    if (settingsKeyInput) settingsKeyInput.value = '';
    if (settingsModal) settingsModal.classList.add('active');
  }

  if (settingsBtn) settingsBtn.addEventListener('click', openSettingsModal);
  if (userProfileBadge) {
    userProfileBadge.addEventListener('click', (e) => {
      // Don't trigger if clicked explicitly on logout button
      if (e.target.closest('#logout-btn')) return;
      openSettingsModal(e);
    });
  }
  if (navSettingsItem) navSettingsItem.addEventListener('click', openSettingsModal);

  const closeSettingsModal = () => { if (settingsModal) settingsModal.classList.remove('active'); };
  if (closeSettingsBtn) closeSettingsBtn.addEventListener('click', closeSettingsModal);
  if (cancelSettingsBtn) cancelSettingsBtn.addEventListener('click', closeSettingsModal);
  if (settingsModal) {
    settingsModal.addEventListener('click', (e) => {
      if (e.target === settingsModal) closeSettingsModal();
    });
  }

  // Profile Update Form Handler
  if (userProfileForm) {
    userProfileForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const name = settingsNameInput.value.trim();
      const email = settingsEmailInput.value.trim();
      const newPassword = settingsPasswordInput.value;
      const apiKey = settingsKeyInput ? settingsKeyInput.value.trim() : '';

      try {
        const payload = { name, email };
        if (newPassword) payload.newPassword = newPassword;

        const res = await ApiClient.put('/auth/profile', payload);

        // Update Gemini API key if provided
        if (apiKey) {
          await ApiClient.post('/chat/set-key', { apiKey });
        }

        if (res.success) {
          if (res.token) ApiClient.setToken(res.token);
          if (window.Toast) Toast.success('Profile Saved! 👤', 'Your profile and settings have been updated.');
          else alert('Profile and Account Settings saved successfully!');
          closeSettingsModal();
          loadUserProfile();
        }
      } catch (err) {
        if (window.Toast) Toast.error('Profile Error', err.message);
        else alert('Failed to update profile: ' + err.message);
      }
    });
  }

  // Page Settings Tab Elements & Populator
  const pageSettingsForm = document.getElementById('settings-tab-profile-form');
  const pageSettingsName = document.getElementById('page-settings-name');
  const pageSettingsEmail = document.getElementById('page-settings-email');
  const pageSettingsPassword = document.getElementById('page-settings-password');
  const pageSettingsKey = document.getElementById('page-settings-key');
  const pageDeleteAccountBtn = document.getElementById('page-delete-account-btn');

  async function populatePageSettings() {
    try {
      const res = await ApiClient.get('/auth/me');
      if (res.success && res.user) {
        window.currentUser = res.user;
        if (pageSettingsName) pageSettingsName.value = res.user.name || '';
        if (pageSettingsEmail) pageSettingsEmail.value = res.user.email || '';
      }
    } catch (err) {
      if (window.currentUser) {
        if (pageSettingsName) pageSettingsName.value = window.currentUser.name || '';
        if (pageSettingsEmail) pageSettingsEmail.value = window.currentUser.email || '';
      }
    }
    if (pageSettingsPassword) pageSettingsPassword.value = '';
    if (pageSettingsKey) pageSettingsKey.value = '';
  }

  if (pageSettingsForm) {
    pageSettingsForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const name = pageSettingsName.value.trim();
      const email = pageSettingsEmail.value.trim();
      const newPassword = pageSettingsPassword.value;
      const apiKey = pageSettingsKey ? pageSettingsKey.value.trim() : '';

      try {
        const payload = { name, email };
        if (newPassword) payload.newPassword = newPassword;

        const res = await ApiClient.put('/auth/profile', payload);

        if (apiKey) {
          await ApiClient.post('/chat/set-key', { apiKey });
        }

        if (res.success) {
          if (res.token) ApiClient.setToken(res.token);
          if (window.Toast) Toast.success('Settings Saved! ⚙️', 'Account settings updated successfully.');
          else alert('🎉 Account Settings saved successfully!');
          loadUserProfile();
        }
      } catch (err) {
        if (window.Toast) Toast.error('Settings Error', err.message);
        else alert('Failed to update account settings: ' + err.message);
      }
    });
  }

  const handleDeleteAccount = async () => {
    const confirmDelete = window.Toast ? await Toast.confirm({
      title: 'Delete Account Permanently?',
      message: 'This will permanently erase your profile, study tasks, streak records, focus sessions, and screen time logs. This action CANNOT be undone.',
      confirmText: 'Delete Permanently',
      cancelText: 'Keep My Account',
      danger: true,
      icon: 'trash-2'
    }) : confirm('⚠️ ARE YOU SURE YOU WANT TO DELETE YOUR ACCOUNT?\n\nThis will permanently delete your account, study tasks, streak records, focus sessions, and screen time logs. This action CANNOT be undone.');

    if (!confirmDelete) return;

    try {
      const res = await ApiClient.delete('/auth/account');
      if (res.success) {
        if (window.Toast) Toast.info('Account Deleted', 'Your account has been deleted permanently.');
        ApiClient.setToken(null);
        setTimeout(() => {
          window.location.href = 'index.html';
        }, 800);
      }
    } catch (err) {
      if (window.Toast) Toast.error('Delete Failed', err.message);
      else alert('Failed to delete account: ' + err.message);
    }
  };

  // Delete Account Handlers
  if (deleteAccountBtn) deleteAccountBtn.addEventListener('click', handleDeleteAccount);
  if (pageDeleteAccountBtn) pageDeleteAccountBtn.addEventListener('click', handleDeleteAccount);

  // Load User Profile Data
  async function loadUserProfile() {
    try {
      const data = await ApiClient.get('/auth/me');
      if (data.success && data.user) {
        window.currentUser = data.user;
        updateHeaderUserStats(data.user);
      }
    } catch (err) {
      console.error('Failed to load user profile:', err);
    }
  }

  function calculateStudentProgress(totalXP) {
    let xp = Math.max(0, Number(totalXP) || 0);
    let level = 1;
    let reqForNextLevel = 100;

    while (xp >= reqForNextLevel) {
      xp -= reqForNextLevel;
      level++;
      reqForNextLevel += 50;
    }

    const currentLevelXP = xp;
    const nextLevelXP = reqForNextLevel;
    const progressPercent = Math.min(100, Math.round((currentLevelXP / nextLevelXP) * 100));

    let title = 'Backbencher 🛋️';
    let badgeColor = '#a855f7';

    if (level >= 100) {
      title = 'Topper 👑';
      badgeColor = '#f59e0b';
    } else if (level >= 75) {
      title = 'Academic Master 🧠';
      badgeColor = '#c084fc';
    } else if (level >= 50) {
      title = 'Frontbencher 🌟';
      badgeColor = '#10b981';
    } else if (level >= 35) {
      title = 'Researcher 🔬';
      badgeColor = '#06b6d4';
    } else if (level >= 20) {
      title = 'Intermediate ⚡';
      badgeColor = '#6366f1';
    } else if (level >= 10) {
      title = 'Novice Scholar 📘';
      badgeColor = '#3b82f6';
    } else {
      title = 'Backbencher 🛋️';
      badgeColor = '#a855f7';
    }

    return {
      level,
      title,
      badgeColor,
      currentLevelXP,
      nextLevelXP,
      progressPercent,
      totalXP: Number(totalXP) || 0
    };
  }

  function updateHeaderUserStats(user) {
    const nameDisplay = document.getElementById('user-name-display');
    const avatarInitials = document.getElementById('user-avatar-initials');
    const streakCount = document.getElementById('header-streak-count');
    const levelDisplay = document.getElementById('header-user-level');
    const titleBadge = document.getElementById('header-student-title-badge');
    const xpDisplay = document.getElementById('header-user-xp');
    const xpProgress = document.getElementById('header-xp-progress');

    if (nameDisplay) nameDisplay.innerText = user.name || 'Student';
    if (avatarInitials) {
      const parts = (user.name || 'Student').trim().split(' ');
      const initials = parts.length > 1 ? (parts[0][0] + parts[1][0]).toUpperCase() : parts[0][0].toUpperCase();
      avatarInitials.innerText = initials;
    }

    const g = user.gamification || calculateStudentProgress(user.xp || 0);

    if (streakCount) {
      const currentStreak = user.streak !== undefined ? user.streak : 0;
      streakCount.innerText = currentStreak;
      const pill = streakCount.closest('.streak-pill');
      if (pill) {
        if (currentStreak > 0) pill.classList.add('streak-active');
        else pill.classList.remove('streak-active');
      }
    }
    if (levelDisplay) levelDisplay.innerText = g.level;
    
    if (titleBadge) {
      titleBadge.innerText = g.title;
      titleBadge.style.backgroundColor = `${g.badgeColor}25`;
      titleBadge.style.color = g.badgeColor;
      titleBadge.style.borderColor = `${g.badgeColor}50`;
    }

    if (xpDisplay) xpDisplay.innerText = `${g.currentLevelXP} / ${g.nextLevelXP} XP`;
    if (xpProgress) xpProgress.style.width = `${g.progressPercent}%`;
  }

  window.calculateStudentProgress = calculateStudentProgress;

  window.updateHeaderUserStats = updateHeaderUserStats;
  window.loadUserProfile = loadUserProfile;

  // Initial Load
  loadUserProfile();
});
