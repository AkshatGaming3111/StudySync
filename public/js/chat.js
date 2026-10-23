// AI Tutor Chatbot Client Module - Gemini API Linked

document.addEventListener('DOMContentLoaded', () => {
  const conversationHistory = [];

  const launcherBtn = document.getElementById('chat-launcher-btn');
  const closeBtn = document.getElementById('close-chat-btn');
  const clearBtn = document.getElementById('chat-clear-btn');
  const keyBtn = document.getElementById('chat-key-btn');
  const chatWindow = document.getElementById('chat-window');
  const chatMessages = document.getElementById('chat-messages');
  const chatForm = document.getElementById('chat-input-form');
  const chatInput = document.getElementById('chat-input');
  const typingIndicator = document.getElementById('chat-typing');

  if (!launcherBtn || !chatWindow) return;

  // Toggle Chat Window
  launcherBtn.addEventListener('click', () => {
    chatWindow.classList.toggle('active');
    if (chatWindow.classList.contains('active')) {
      if (window.lucide) lucide.createIcons();
      if (chatInput) chatInput.focus();
    }
  });

  if (closeBtn) {
    closeBtn.addEventListener('click', () => chatWindow.classList.remove('active'));
  }

  // Clear Chat History Handler
  if (clearBtn) {
    clearBtn.addEventListener('click', async () => {
      if (conversationHistory.length === 0 && (!chatMessages || chatMessages.children.length <= 1)) {
        return;
      }

      const confirmed = window.Toast ? await Toast.confirm({
        title: 'Clear Chat History?',
        message: 'Are you sure you want to delete your conversation history with StudySync Tutor?',
        confirmText: 'Clear Chat',
        danger: true,
        icon: 'trash-2'
      }) : confirm('Are you sure you want to clear your chat history?');

      if (!confirmed) return;

      const token = ApiClient.getToken();
      if (token) {
        try {
          await ApiClient.delete('/chat/history');
        } catch (err) {
          console.warn('Could not clear server chat history:', err.message);
        }
      }

      // Reset in-memory conversation history
      conversationHistory.length = 0;

      // Reset chat messages to welcome message
      if (chatMessages) {
        chatMessages.innerHTML = `
          <div class="chat-message bot">
            <div class="message-bubble">
              👋 Hi! I'm StudySync Tutor AI. Ask me any homework doubt, conceptual topic, or how to navigate the portal!
            </div>
          </div>
        `;
      }
      if (window.lucide) lucide.createIcons();
      if (window.Toast) Toast.info('Chat Cleared', 'Conversation history has been reset.');
    });
  }

  // Load Persistent Chat History from Server
  async function loadChatHistory() {
    const token = ApiClient.getToken();
    if (!token) return;

    try {
      const res = await ApiClient.get('/chat/history');
      if (res.success && Array.isArray(res.history) && res.history.length > 0) {
        // Clear default welcome message if server history exists
        if (chatMessages) chatMessages.innerHTML = '';
        res.history.forEach(msg => {
          appendMessage(msg.role, msg.content, msg.action, msg.isGemini);
          conversationHistory.push({ role: msg.role === 'user' ? 'user' : 'bot', content: msg.content });
        });
      }
    } catch (err) {
      console.warn('Could not load chat history:', err.message);
    }
  }

  loadChatHistory();

  // Set Gemini API Key Handler
  if (keyBtn) {
    keyBtn.addEventListener('click', async () => {
      const savedKey = localStorage.getItem('studysync_gemini_key') || '';
      const promptText = savedKey
        ? 'Gemini API Key is currently linked.\nEnter a new Gemini API Key to update it (or clear to remove):'
        : 'Enter your Gemini API Key (e.g. AIzaSy...):';
      
      const userKey = prompt(promptText, savedKey);
      if (userKey === null) return;

      const cleanKey = userKey.trim();
      if (cleanKey) {
        try {
          const res = await ApiClient.post('/chat/set-key', { apiKey: cleanKey });
          if (res.success) {
            localStorage.setItem('studysync_gemini_key', cleanKey);
            appendMessage('bot', '🎉 **Gemini API Key Linked!** StudySync Tutor AI is now powered directly by Gemini for any doubt or question.');
            if (window.Toast) Toast.success('API Key Linked! 🔑', 'Gemini AI Tutor is now unlocked.');
          }
        } catch (err) {
          if (window.Toast) Toast.error('API Key Error', err.message);
          else alert('Failed to save API Key: ' + err.message);
        }
      } else {
        localStorage.removeItem('studysync_gemini_key');
        if (window.Toast) Toast.info('API Key Removed', 'Gemini API Key was removed.');
        else alert('Gemini API Key removed.');
      }
    });
  }

  // Quick Suggestion Chips
  document.querySelectorAll('.chat-chip').forEach(chip => {
    chip.addEventListener('click', () => {
      const text = chip.getAttribute('data-query');
      if (text) {
        chatInput.value = text;
        chatForm.dispatchEvent(new Event('submit'));
      }
    });
  });

  // Submit Message
  if (chatForm) {
    chatForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const message = chatInput.value.trim();
      if (!message) return;

      // Render User Message
      appendMessage('user', message);
      conversationHistory.push({ role: 'user', content: message });
      chatInput.value = '';

      // Show typing indicator
      if (typingIndicator) typingIndicator.style.display = 'block';

      const localKey = localStorage.getItem('studysync_gemini_key') || '';

      try {
        const response = await ApiClient.post('/chat', {
          message,
          history: conversationHistory,
          apiKey: localKey
        });

        if (typingIndicator) typingIndicator.style.display = 'none';

        if (response.success && response.reply) {
          appendMessage('bot', response.reply, response.action, response.isGemini);
          conversationHistory.push({ role: 'bot', content: response.reply });
        } else {
          appendMessage('bot', 'Sorry, I ran into an error answering your doubt. Please try again!');
        }
      } catch (err) {
        if (typingIndicator) typingIndicator.style.display = 'none';
        appendMessage('bot', 'Unable to reach StudySync AI Tutor right now. Make sure your server is running.');
      }
    });
  }

  // Append Message Bubble
  function appendMessage(role, text, action = null, isGemini = false) {
    const msgDiv = document.createElement('div');
    msgDiv.className = `chat-message ${role}`;

    const formattedText = formatMessageText(text);

    let badgeHtml = '';
    if (role === 'bot' && isGemini) {
      badgeHtml = `<div style="font-size: 0.68rem; color: #a7f3d0; margin-bottom: 0.25rem; font-weight: 600; display: flex; align-items: center; gap: 0.25rem;"><i data-lucide="sparkles" style="width:10px; height:10px;"></i> Gemini AI Powered</div>`;
    }

    let actionBtnHtml = '';
    if (action && action.tabId) {
      actionBtnHtml = `<br><button class="chat-action-btn" data-tab="${action.tabId}">⚡ ${escapeHtml(action.label || 'Jump to Section')}</button>`;
    }

    msgDiv.innerHTML = `<div class="message-bubble">${badgeHtml}${formattedText}${actionBtnHtml}</div>`;
    chatMessages.appendChild(msgDiv);
    chatMessages.scrollTop = chatMessages.scrollHeight;

    lucide.createIcons();

    // Attach navigation action listener if present
    if (action && action.tabId) {
      const btn = msgDiv.querySelector('.chat-action-btn');
      if (btn) {
        btn.addEventListener('click', () => {
          const navTab = document.querySelector(`.nav-item[data-tab="${action.tabId}"]`);
          if (navTab) navTab.click();
          if (window.innerWidth < 768) chatWindow.classList.remove('active');
        });
      }
    }
  }

  function formatMessageText(str) {
    let text = escapeHtml(str);
    // Bold text **text**
    text = text.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
    // Italics *text*
    text = text.replace(/\*(.*?)\*/g, '<em>$1</em>');
    // Line breaks
    text = text.replace(/\n/g, '<br>');
    return text;
  }

  function escapeHtml(str) {
    return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }
});
