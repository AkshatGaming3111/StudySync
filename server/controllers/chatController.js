const fs = require('fs');
const path = require('path');
const { dbGet, dbRun, dbAll } = require('../config/db');
const { calculateStudentProgress } = require('../config/gamification');

// Clean and sanitize Gemini API keys
function sanitizeApiKey(key) {
  if (!key || typeof key !== 'string') return '';
  return key.trim().replace(/^["']|["']$/g, '');
}

// Algorithmic Assistant Fallback when NO Gemini API Key is provided
function generateSmartChatResponse(message) {
  const query = message.toLowerCase().trim();

  if (query.includes('planner') || query.includes('schedule') || query.includes('syllabus') || query.includes('exam')) {
    return {
      text: "I can help you build an AI-powered study schedule! 📅\n\nTo generate your plan:\n1. Open the **AI Planner** tab.\n2. Click **Generate AI Schedule**.\n3. Paste your syllabus topics and target exam date.\n\nWould you like me to switch tabs for you?",
      action: { label: 'Open AI Planner Tab', tabId: 'planner-tab' }
    };
  }

  if (query.includes('focus') || query.includes('pomodoro') || query.includes('timer') || query.includes('sound') || query.includes('music')) {
    return {
      text: "The **Focus Room** features Pomodoro timers, Web Audio ambient soundscapes (Rain, White Noise, Binaural Beats, Zen Chimes), and tab-switch distraction tracking! 🎧\n\nClick below to jump into your focus sanctuary.",
      action: { label: 'Go to Focus Room', tabId: 'focus-tab' }
    };
  }

  if (query.includes('screen') || query.includes('time') || query.includes('chart') || query.includes('limit') || query.includes('analytics')) {
    return {
      text: "You can track your daily study vs. distraction ratios and set screen-time category limits in the **Screen Time Analytics** tab! 📊",
      action: { label: 'View Analytics', tabId: 'screentime-tab' }
    };
  }

  if (query.includes('level') || query.includes('xp') || query.includes('streak') || query.includes('rank') || query.includes('title')) {
    return {
      text: "StudySync gamifies your study journey! 🔥\n- **Tasks Completed**: Earn +50 XP\n- **Focus Sessions**: Earn +2 XP/min + 30 XP zero-distraction bonus\n- **Ranks**: Progress from **Lvl 1 (Backbencher)** 🛋️ to **Lvl 100 (Topper)** 👑 as XP requirements increase by 50 per level!"
    };
  }

  if (query.includes('derivative') || query.includes('calculus') || query.includes('integral') || query.includes('math')) {
    return {
      text: "📐 **Math & Calculus Breakdown**:\n- **Derivative**: Represents the rate of change of a function $f'(x) = \\lim_{h \\to 0} \\frac{f(x+h) - f(x)}{h}$.\n- **Integration**: The inverse process of differentiation, representing the area under a curve $\\int f(x) dx$.\n\n🔑 *Tip: Link your Gemini API key using the **Gemini Key** button in the chat header to solve any specific math problem live!*"
    };
  }

  if (query.includes('physics') || query.includes('force') || query.includes('newton') || query.includes('energy')) {
    return {
      text: "⚡ **Physics Core Concepts**:\n- **Newton's 2nd Law**: $F = m \\cdot a$ (Force equals Mass times Acceleration).\n- **Conservation of Energy**: Energy cannot be created or destroyed, only transformed ($E_k + E_p = \\text{Constant}$).\n\n🔑 *Tip: Link your Gemini API key in the header to get step-by-step solutions for any custom physics problem!*"
    };
  }

  return {
    text: `I'm StudySync Tutor AI! 🧠\n\n🔑 **To enable live Gemini AI doubt solving for ANY question**:\n1. Click the **Gemini Key** button in the chat header.\n2. Enter your free API key from Google AI Studio (https://aistudio.google.com).\n\nOnce linked, I will solve any homework or conceptual doubt instantly!`
  };
}

// Call Gemini API with valid modern models
async function queryGeminiAPI(apiKey, systemInstructionText, history, message) {
  const models = [
    'gemini-3-flash-preview',
    'gemini-3.8-flash',
    'gemini-3.5-flash',
    'gemini-3.1-flash-lite',
    'gemini-flash-latest',
    'gemini-2.5-flash',
    'gemini-2.0-flash',
    'gemini-1.5-flash'
  ];

  const rawHistory = Array.isArray(history) ? history : [];
  const contents = [];
  let lastRole = null;

  rawHistory.forEach(item => {
    const text = (item.content || '').trim();
    if (!text) return;
    const role = item.role === 'user' ? 'user' : 'model';

    if (role !== lastRole) {
      contents.push({ role, parts: [{ text }] });
      lastRole = role;
    }
  });

  const currentMessage = message.trim();
  if (lastRole === 'user') {
    contents[contents.length - 1].parts[0].text += `\n\n${currentMessage}`;
  } else {
    contents.push({ role: 'user', parts: [{ text: currentMessage }] });
  }

  const payload = {
    systemInstruction: {
      parts: [{ text: systemInstructionText }]
    },
    contents
  };

  let primaryErrorMsg = '';

  for (const model of models) {
    try {
      const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(10000)
      });

      const data = await response.json();

      if (response.ok) {
        const replyText = data?.candidates?.[0]?.content?.parts?.[0]?.text;
        if (replyText) {
          return { success: true, reply: replyText, modelUsed: model };
        }
      } else {
        const errorDetails = data?.error?.message || `HTTP ${response.status} ${response.statusText}`;
        primaryErrorMsg = errorDetails;

        // If the key is definitively invalid, abort loop immediately
        if (response.status === 403 || data?.error?.status === 'PERMISSION_DENIED' || errorDetails.includes('API_KEY_INVALID') || errorDetails.includes('API key not valid')) {
          return { success: false, error: errorDetails };
        }
        console.warn(`Gemini API Model [${model}] returned HTTP ${response.status}: ${errorDetails}`);
      }
    } catch (err) {
      primaryErrorMsg = err.message;
      console.warn(`Gemini API Model [${model}] Fetch Exception:`, err.message);
    }
  }

  return { success: false, error: primaryErrorMsg || 'Failed to receive response from Gemini API.' };
}

// Save Gemini API key per user securely in SQLite
exports.setApiKey = async (req, res) => {
  try {
    const userId = req.user ? req.user.userId : null;
    const { apiKey } = req.body;
    const cleanKey = sanitizeApiKey(apiKey);

    if (userId) {
      await dbRun('UPDATE users SET gemini_api_key = ? WHERE id = ?', [cleanKey || null, userId]);
    }

    if (cleanKey) {
      process.env.GEMINI_API_KEY = cleanKey;
    }

    res.status(200).json({
      success: true,
      message: 'Gemini API Key successfully linked to your user account!'
    });
  } catch (err) {
    console.error('Set API Key Error:', err);
    res.status(500).json({ success: false, message: 'Failed to save Gemini API key.' });
  }
};

// Handle Chat Messages & Persist to Database
exports.handleChatMessage = async (req, res) => {
  try {
    const userId = req.user ? req.user.userId : null;
    const { message, history, apiKey: userKey } = req.body;

    if (!message || typeof message !== 'string') {
      return res.status(400).json({ success: false, message: 'Message string is required.' });
    }

    // Determine active API key (User DB record -> Payload Key -> Request Header -> Global fallback)
    let apiKey = sanitizeApiKey(userKey || req.headers['x-gemini-key']);
    let userName = 'Student';
    let userContextStr = '';

    if (userId) {
      const dbUser = await dbGet('SELECT name, gemini_api_key FROM users WHERE id = ?', [userId]);
      if (dbUser) {
        if (!apiKey && dbUser.gemini_api_key) {
          apiKey = dbUser.gemini_api_key;
        }
        userName = dbUser.name || 'Student';
      }

      // Fetch user study context
      const stats = await dbGet('SELECT xp_points, current_streak, level FROM user_stats WHERE user_id = ?', [userId]);
      const activeTasks = await dbGet('SELECT COUNT(*) as count FROM tasks WHERE user_id = ? AND completed = 0', [userId]);

      if (stats) {
        const g = calculateStudentProgress(stats.xp_points || 0);
        userContextStr = `\nSTUDENT PROFILE: Name: ${userName}, Level: ${g.level} (${g.title}), Streak: ${stats.current_streak || 0} Days, Pending Study Tasks: ${activeTasks?.count || 0}.`;
      }
    }

    if (!apiKey) {
      apiKey = sanitizeApiKey(process.env.GEMINI_API_KEY);
    }

    let responseData = null;

    if (apiKey) {
      const systemInstruction = `You are StudySync Tutor AI, a brilliant, encouraging, highly intelligent academic tutor embedded in the StudySync application.${userContextStr}
Your roles:
1. ANSWER ANY ACADEMIC DOUBT: Solve math, physics, chemistry, biology, computer science, literature, history, or engineering questions step-by-step.
2. HOMEWORK HELP: Guide students through solving their homework problems with clear step-by-step explanations.
3. SITE NAVIGATION: Assist with StudySync navigation:
   - 'AI Planner' or schedule ➔ Guide to AI Planner tab.
   - 'Focus Room' or timers/sounds ➔ Guide to Focus Room tab.
   - 'Screen Time' or limit alerts ➔ Guide to Screen Time tab.

Format math/code neatly. Be concise, clear, and encouraging!`;

      const aiResult = await queryGeminiAPI(apiKey, systemInstruction, history, message);

      if (aiResult.success) {
        let action = null;
        const lowerReply = aiResult.reply.toLowerCase();
        if (lowerReply.includes('ai planner') || lowerReply.includes('schedule tab')) {
          action = { label: 'Open AI Planner', tabId: 'planner-tab' };
        } else if (lowerReply.includes('focus room') || lowerReply.includes('timer tab')) {
          action = { label: 'Go to Focus Room', tabId: 'focus-tab' };
        } else if (lowerReply.includes('screen time') || lowerReply.includes('analytics tab')) {
          action = { label: 'View Analytics', tabId: 'screentime-tab' };
        }

        responseData = {
          success: true,
          reply: aiResult.reply,
          action,
          isGemini: true,
          model: aiResult.modelUsed
        };
      } else {
        responseData = {
          success: true,
          reply: `⚠️ **Gemini API Error**: ${aiResult.error}\n\nPlease check that your Gemini API key is valid at [Google AI Studio](https://aistudio.google.com). Click the **Gemini Key** button in the chat header to update it.`,
          isGeminiError: true
        };
      }
    } else {
      const fallbackResult = generateSmartChatResponse(message);
      responseData = {
        success: true,
        reply: fallbackResult.text,
        action: fallbackResult.action || null,
        isGemini: false
      };
    }

    // Persist messages to DB for authenticated users
    if (userId && responseData && responseData.reply) {
      await dbRun(
        'INSERT INTO chat_messages (user_id, role, message) VALUES (?, ?, ?)',
        [userId, 'user', message]
      );
      await dbRun(
        'INSERT INTO chat_messages (user_id, role, message, action_json, is_gemini, model_used) VALUES (?, ?, ?, ?, ?, ?)',
        [
          userId,
          'bot',
          responseData.reply,
          responseData.action ? JSON.stringify(responseData.action) : null,
          responseData.isGemini ? 1 : 0,
          responseData.model || null
        ]
      );
    }

    res.status(200).json(responseData);
  } catch (err) {
    console.error('Chatbot Controller Error:', err);
    res.status(500).json({ success: false, message: 'Failed to process chat message.' });
  }
};

// Fetch Chat History for User
exports.getChatHistory = async (req, res) => {
  try {
    const userId = req.user.userId;
    const messages = await dbAll(
      'SELECT id, role, message, action_json, is_gemini, model_used, created_at FROM chat_messages WHERE user_id = ? ORDER BY created_at ASC LIMIT 100',
      [userId]
    );

    const history = messages.map(m => ({
      id: m.id,
      role: m.role,
      content: m.message,
      action: m.action_json ? JSON.parse(m.action_json) : null,
      isGemini: !!m.is_gemini,
      model: m.model_used,
      createdAt: m.created_at
    }));

    res.status(200).json({
      success: true,
      count: history.length,
      history
    });
  } catch (err) {
    console.error('Get Chat History Error:', err);
    res.status(500).json({ success: false, message: 'Failed to fetch chat history.' });
  }
};

// Clear Chat History for User
exports.clearChatHistory = async (req, res) => {
  try {
    const userId = req.user.userId;
    await dbRun('DELETE FROM chat_messages WHERE user_id = ?', [userId]);
    res.status(200).json({ success: true, message: 'Chat history cleared.' });
  } catch (err) {
    console.error('Clear Chat History Error:', err);
    res.status(500).json({ success: false, message: 'Failed to clear chat history.' });
  }
};
