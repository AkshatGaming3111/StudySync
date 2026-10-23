// Authentication Page Handler

document.addEventListener('DOMContentLoaded', () => {
  lucide.createIcons();

  const authForm = document.getElementById('auth-form');
  const authTitle = document.getElementById('auth-title');
  const authSubtitle = document.getElementById('auth-subtitle');
  const nameGroup = document.getElementById('name-group');
  const nameInput = document.getElementById('auth-name');
  const emailInput = document.getElementById('auth-email');
  const passwordInput = document.getElementById('auth-password');
  const submitBtn = document.getElementById('auth-submit-btn');
  const submitText = document.getElementById('submit-text');
  const submitIcon = document.getElementById('submit-icon');
  const alertBox = document.getElementById('auth-alert');
  const toggleLink = document.getElementById('auth-toggle-link');
  const toggleText = document.getElementById('auth-toggle-text');
  const togglePasswordBtn = document.getElementById('toggle-password-btn');
  const eyeIcon = document.getElementById('eye-icon');

  const passwordGroup = document.getElementById('password-group');
  const resetTokenGroup = document.getElementById('reset-token-group');
  const resetTokenInput = document.getElementById('auth-reset-token');
  const forgotPasswordLink = document.getElementById('forgot-password-link');

  let currentMode = 'login'; // 'login' | 'register' | 'forgot' | 'reset'

  // Check URL params for mode
  const urlParams = new URLSearchParams(window.location.search);
  if (urlParams.get('mode') === 'register') {
    setMode('register');
  }

  function setMode(mode) {
    currentMode = mode;
    showAlert('');

    if (currentMode === 'register') {
      authTitle.innerText = 'Create an Account';
      authSubtitle.innerText = 'Join StudySync to generate your AI study schedules.';
      nameGroup.style.display = 'flex';
      nameInput.required = true;
      if (passwordGroup) passwordGroup.style.display = 'block';
      if (resetTokenGroup) resetTokenGroup.style.display = 'none';
      if (forgotPasswordLink) forgotPasswordLink.style.display = 'none';
      passwordInput.required = true;
      passwordInput.placeholder = '••••••••';
      submitText.innerText = 'Create Account';
      toggleText.innerText = 'Already have an account?';
      toggleLink.innerText = 'Sign In';
      if (submitIcon) submitIcon.setAttribute('data-lucide', 'user-plus');
    } else if (currentMode === 'forgot') {
      authTitle.innerText = 'Reset Password';
      authSubtitle.innerText = 'Enter your email address to generate a password reset code.';
      nameGroup.style.display = 'none';
      nameInput.required = false;
      if (passwordGroup) passwordGroup.style.display = 'none';
      if (resetTokenGroup) resetTokenGroup.style.display = 'none';
      if (forgotPasswordLink) forgotPasswordLink.style.display = 'none';
      passwordInput.required = false;
      submitText.innerText = 'Send Reset Code';
      toggleText.innerText = 'Remembered your password?';
      toggleLink.innerText = 'Back to Sign In';
      if (submitIcon) submitIcon.setAttribute('data-lucide', 'key-round');
    } else if (currentMode === 'reset') {
      authTitle.innerText = 'Set New Password';
      authSubtitle.innerText = 'Enter your reset code and your new password below.';
      nameGroup.style.display = 'none';
      nameInput.required = false;
      if (passwordGroup) passwordGroup.style.display = 'block';
      if (resetTokenGroup) resetTokenGroup.style.display = 'block';
      if (forgotPasswordLink) forgotPasswordLink.style.display = 'none';
      passwordInput.required = true;
      passwordInput.placeholder = 'New Password (min 6 chars)';
      submitText.innerText = 'Save New Password';
      toggleText.innerText = 'Remembered your password?';
      toggleLink.innerText = 'Back to Sign In';
      if (submitIcon) submitIcon.setAttribute('data-lucide', 'check-circle');
    } else {
      // Login mode
      authTitle.innerText = 'Welcome Back';
      authSubtitle.innerText = 'Sign in to access your AI study planner and focus tools.';
      nameGroup.style.display = 'none';
      nameInput.required = false;
      if (passwordGroup) passwordGroup.style.display = 'block';
      if (resetTokenGroup) resetTokenGroup.style.display = 'none';
      if (forgotPasswordLink) forgotPasswordLink.style.display = 'inline';
      passwordInput.required = true;
      passwordInput.placeholder = '••••••••';
      submitText.innerText = 'Sign In';
      toggleText.innerText = "Don't have an account?";
      toggleLink.innerText = 'Create Account';
      if (submitIcon) submitIcon.setAttribute('data-lucide', 'log-in');
    }

    lucide.createIcons();
  }

  // Toggle link click
  toggleLink.addEventListener('click', (e) => {
    e.preventDefault();
    if (currentMode === 'register' || currentMode === 'forgot' || currentMode === 'reset') {
      setMode('login');
    } else {
      setMode('register');
    }
  });

  // Forgot Password click
  if (forgotPasswordLink) {
    forgotPasswordLink.addEventListener('click', (e) => {
      e.preventDefault();
      setMode('forgot');
    });
  }

  // Toggle Password Visibility
  let isPasswordShown = false;
  if (togglePasswordBtn) {
    togglePasswordBtn.addEventListener('click', () => {
      isPasswordShown = !isPasswordShown;
      passwordInput.type = isPasswordShown ? 'text' : 'password';
      eyeIcon.setAttribute('data-lucide', isPasswordShown ? 'eye-off' : 'eye');
      lucide.createIcons();
    });
  }

  // Helper to show alert banner
  function showAlert(message, type = 'error') {
    if (!message) {
      alertBox.style.display = 'none';
      return;
    }
    alertBox.style.display = 'block';
    alertBox.innerHTML = message;

    const plainText = message.replace(/<[^>]*>?/gm, '').trim();

    if (type === 'error') {
      alertBox.style.background = 'rgba(239, 68, 68, 0.2)';
      alertBox.style.border = '1px solid rgba(239, 68, 68, 0.4)';
      alertBox.style.color = '#fca5a5';
      if (window.Toast && plainText) {
        window.Toast.error('Auth Notice', plainText);
      }
    } else {
      alertBox.style.background = 'rgba(16, 185, 129, 0.2)';
      alertBox.style.border = '1px solid rgba(16, 185, 129, 0.4)';
      alertBox.style.color = '#6ee7b7';
      if (window.Toast && plainText) {
        window.Toast.success('Success', plainText);
      }
    }
  }

  // Form Submit Handler
  authForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    showAlert('');

    const email = emailInput.value.trim();
    const password = passwordInput.value;
    const name = nameInput.value.trim();
    const token = resetTokenInput ? resetTokenInput.value.trim() : '';

    if (currentMode === 'register' && !name) {
      return showAlert('Please enter your full name.');
    }
    if ((currentMode === 'login' || currentMode === 'forgot' || currentMode === 'register') && !email) {
      return showAlert('Please enter your email address.');
    }

    submitBtn.disabled = true;

    try {
      if (currentMode === 'forgot') {
        submitText.innerText = 'Dispatching OTP...';
        const response = await ApiClient.post('/auth/forgot-password', { email });

        if (response.success) {
          showAlert(`📧 <strong>OTP Code Dispatched!</strong><br>A 6-digit OTP code has been sent to your email address (<strong>${email}</strong>). Please check your inbox and enter the 6-digit code below to set your new password.`, 'success');
          if (resetTokenInput) {
            resetTokenInput.value = '';
            resetTokenInput.focus();
          }
          setMode('reset');
        } else {
          showAlert(response.message || 'Could not send OTP code.');
        }
      } else if (currentMode === 'reset') {
        if (!token || !password) {
          submitBtn.disabled = false;
          return showAlert('Please enter your 6-digit OTP code and your new password.');
        }

        submitText.innerText = 'Verifying OTP...';
        const response = await ApiClient.post('/auth/reset-password', { email, otp: token, token, newPassword: password });

        if (response.success) {
          showAlert('🎉 Password reset successfully! You can now sign in with your new password.', 'success');
          setTimeout(() => setMode('login'), 1200);
        } else {
          showAlert(response.message || 'Failed to reset password.');
        }
      } else {
        submitText.innerText = currentMode === 'register' ? 'Creating Account...' : 'Signing In...';
        let response;
        if (currentMode === 'register') {
          response = await ApiClient.post('/auth/register', { name, email, password });
        } else {
          response = await ApiClient.post('/auth/login', { email, password });
        }

        if (response.success && response.token) {
          ApiClient.setToken(response.token);
          showAlert(response.message || 'Success! Redirecting...', 'success');
          
          setTimeout(() => {
            window.location.href = 'dashboard.html';
          }, 800);
        } else {
          showAlert(response.message || 'Authentication failed.');
        }
      }
    } catch (err) {
      showAlert(err.message || 'An error occurred during authentication.');
    } finally {
      submitBtn.disabled = false;
      if (currentMode === 'login') submitText.innerText = 'Sign In';
      else if (currentMode === 'register') submitText.innerText = 'Create Account';
      else if (currentMode === 'forgot') submitText.innerText = 'Send Reset Code';
      else if (currentMode === 'reset') submitText.innerText = 'Save New Password';
    }
  });
});
