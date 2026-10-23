# Chrome Web Store Listing & Technical Documentation

**Extension Name**: StudySync Focus Lock Companion  
**Version**: 1.0.0  
**Manifest Version**: 3  
**Category**: Productivity  
**Last Updated**: September 13, 2026  

---

## 1. Store Listing Metadata

### Short Description (max 132 chars)
Strict Focus Enforcement for StudySync: automatically refocuses your study session when you switch tabs or windows during active timers.

### Detailed Description
Take your study discipline to the next level with the official **StudySync Focus Lock Companion**. 

When studying for critical exams or working through dense course syllabi, wandering off to distracting social media or video tabs ruins focus. StudySync Companion pairs directly with your StudySync AI Study Planner to enforce uncompromising study sessions.

#### Key Features:
- 🔒 **Active Focus Tab Guard**: While a focus timer is running on StudySync, any accidental or deliberate switch to another tab or browser window is intercepted, and your browser is immediately switched back to your StudySync Focus Room.
- ⚡ **Zero Setup Handshake**: Works seamlessly with your StudySync dashboard with automatic detection.
- ⏱️ **Timer Synchronized**: The lock only applies while your study clock is actively ticking; once your Pomodoro or Deep Work session completes or is paused, your browsing is instantly released.
- 🚨 **Gentle Distraction Notifications**: Displays an alert banner detailing how many tab switch attempts were prevented during your session.
- 🎛️ **Quick Controls Popup**: Live countdown timer, standby status, emergency release override, and auto-return preference toggles right from your Chrome toolbar.

---

## 2. Permissions Justification

| Permission | Justification |
| :--- | :--- |
| `tabs` | Required to query the active tab, identify when the user has navigated away from their StudySync session, and call `chrome.tabs.update()` to return focus to StudySync during an active study timer. |
| `storage` | Required to persist user preferences (such as auto-return toggles and notification preferences) and maintain study session state across service worker lifecycles. |
| `notifications` | Required to alert the user with an OS-level notification when an unauthorized tab switch is intercepted, prompting them to maintain focus. |
| `alarms` | Required to safely disarm the hard lock when the study timer duration expires, even if the browser service worker becomes inactive. |

### Host Permissions Justification

| Host Pattern | Justification |
| :--- | :--- |
| `http://localhost/*`, `http://127.0.0.1/*` | Required for the extension content script to communicate with the local StudySync web application instance (`http://localhost:5000`) and establish the focus session bridge. |

---

## 3. Privacy & Data Use Disclosure

- **Does this extension collect personal data?**  
  **No.** The extension collects zero personal data, analytics, or browsing history.
- **Data Transmission**:  
  All state (timer status, tab IDs) remains strictly local on the user's device in `chrome.storage.local`. No information is sent to third-party servers.
- **Single Purpose**:  
  The extension serves the single purpose of enforcing focus timers started on the StudySync platform by preventing tab-switching distractions.

---

## 4. How to Load Unpacked (Development & Testing)

1. Open Google Chrome, Brave, or Microsoft Edge.
2. Navigate to `chrome://extensions`.
3. In the top-right corner, toggle **Developer mode** to ON.
4. Click the **Load unpacked** button in the top-left toolbar.
5. In the file picker, select the `extension` directory inside the StudySync project:
   ```
   c:\Users\AKSHAT\OneDrive\Desktop\StudySync - AI Smart Study Planner\extension
   ```
6. The extension is now active! Pin it to your Chrome toolbar.
7. Open `http://localhost:5000/dashboard.html`, go to the **Focus Room** tab, and see the **"StudySync Focus Companion: Connected & Armed"** green badge.
