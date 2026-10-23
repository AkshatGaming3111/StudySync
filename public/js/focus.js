// Focus Room Module - Timer, Fullscreen Lock, Strict Tab Switch Restriction & Web Audio Synthesizer

document.addEventListener('DOMContentLoaded', () => {
  let timerInterval = null;
  let totalSeconds = 25 * 60;
  let remainingSeconds = totalSeconds;
  let isRunning = false;
  let currentMode = 'Pomodoro';
  let selectedSound = 'none';

  // Elements
  const timerClock = document.getElementById('timer-clock');
  const timerStatusText = document.getElementById('timer-status-text');
  const startBtn = document.getElementById('timer-start-btn');
  const btnText = document.getElementById('timer-btn-text');
  const playIcon = document.getElementById('timer-play-icon');
  const resetBtn = document.getElementById('timer-reset-btn');
  const fullscreenBtn = document.getElementById('fullscreen-btn');
  const volumeSlider = document.getElementById('sound-volume-slider');

  // Custom Time Limit Elements
  const customMinsInput = document.getElementById('custom-minutes-input');
  const applyCustomBtn = document.getElementById('apply-custom-mode-btn');

  // Focus Lock Guard Modal & Badge Elements
  const focusGuardModal = document.getElementById('focus-guard-modal');
  const guardTimerDisplay = document.getElementById('guard-timer-display');
  const guardReturnBtn = document.getElementById('guard-return-btn');
  const guardPauseBtn = document.getElementById('guard-pause-btn');
  const focusBadgeContainer = document.getElementById('distraction-badge-container');
  const focusLockStatusText = document.getElementById('focus-lock-status-text');

  // Companion Extension Integration Elements
  const extensionStatusDot = document.getElementById('extension-status-dot');
  const extensionStatusText = document.getElementById('extension-status-text');
  const extensionGuideBtn = document.getElementById('extension-guide-btn');
  const extensionGuideModal = document.getElementById('extension-guide-modal');
  const closeExtensionGuideBtn = document.getElementById('close-extension-guide-btn');
  const closeExtensionGuideBtn2 = document.getElementById('close-extension-guide-btn2');

  let isExtensionConnected = false;

  function notifyExtension(type, payload = {}) {
    window.postMessage({
      source: 'studysync-web',
      type,
      payload
    }, '*');
  }

  function updateExtensionUI(connected) {
    isExtensionConnected = connected;
    if (!extensionStatusDot || !extensionStatusText) return;
    if (connected) {
      extensionStatusDot.style.background = '#10b981';
      extensionStatusDot.style.boxShadow = '0 0 8px rgba(16, 185, 129, 0.6)';
      extensionStatusText.innerHTML = '<strong style="color: #6ee7b7;">StudySync Focus Companion: Connected & Armed</strong> <span style="color: var(--text-muted); font-size: 0.78rem;">(Hard tab auto-return enabled)</span>';
    } else {
      extensionStatusDot.style.background = '#f59e0b';
      extensionStatusDot.style.boxShadow = 'none';
      extensionStatusText.innerHTML = '<span style="color: #fbbf24;">Companion Extension: Not Connected</span> <span style="color: var(--text-muted); font-size: 0.78rem;">(Load unpacked extension for hard tab lock)</span>';
    }
  }

  // Extension Guide Modal Controls
  if (extensionGuideBtn && extensionGuideModal) {
    extensionGuideBtn.addEventListener('click', () => {
      extensionGuideModal.style.display = 'flex';
    });
  }
  if (closeExtensionGuideBtn && extensionGuideModal) {
    closeExtensionGuideBtn.addEventListener('click', () => {
      extensionGuideModal.style.display = 'none';
    });
  }
  if (closeExtensionGuideBtn2 && extensionGuideModal) {
    closeExtensionGuideBtn2.addEventListener('click', () => {
      extensionGuideModal.style.display = 'none';
    });
  }

  // Listen for Extension Communication
  window.addEventListener('message', (event) => {
    if (event.source !== window || !event.data || event.data.source !== 'studysync-extension') {
      return;
    }

    if (event.data.type === 'EXTENSION_AVAILABLE' || event.data.type === 'PING_RESPONSE') {
      updateExtensionUI(true);
    }

    if (event.data.type === 'DISTRACTION_INTERCEPTED') {
      showFocusGuardModal();
      const count = event.data.count || 1;
      if (focusLockStatusText) {
        focusLockStatusText.innerText = `🔒 Tab Switch Intercepted! Companion auto-switched you back (#${count}).`;
      }
    }

    if (event.data.type === 'REMOTE_PAUSE') {
      pauseTimer();
    }
  });

  // Check extension availability
  if (document.documentElement.hasAttribute('data-studysync-extension-installed')) {
    updateExtensionUI(true);
  } else {
    updateExtensionUI(false);
  }
  notifyExtension('PING');

  // Standard Mode Preset Buttons
  const modeBtns = document.querySelectorAll('.timer-mode-btn');
  modeBtns.forEach(btn => {
    btn.addEventListener('click', async () => {
      if (isRunning) {
        const confirmed = window.Toast
          ? await Toast.confirm({
              title: 'Switch Focus Mode?',
              message: 'A focus session is currently active. Switching mode will reset your current timer.',
              confirmText: 'Reset & Switch',
              cancelText: 'Keep Session',
              danger: true
            })
          : confirm('Focus mode is active. Switch mode and reset timer?');
        if (!confirmed) return;
      }
      
      modeBtns.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');

      const minutes = Number(btn.getAttribute('data-minutes')) || 25;
      currentMode = btn.getAttribute('data-mode') || 'Pomodoro';
      setTimerDuration(minutes);
    });
  });

  // Custom Time Limit Setter
  if (applyCustomBtn && customMinsInput) {
    applyCustomBtn.addEventListener('click', async () => {
      const customMins = Math.max(1, Math.min(300, Number(customMinsInput.value) || 30));
      if (isRunning) {
        const confirmed = window.Toast
          ? await Toast.confirm({
              title: 'Apply Custom Duration?',
              message: 'A focus session is currently active. Applying a new duration will reset your timer.',
              confirmText: 'Reset & Apply',
              cancelText: 'Keep Session',
              danger: true
            })
          : confirm('Focus mode is active. Apply custom duration and reset timer?');
        if (!confirmed) return;
      }

      modeBtns.forEach(b => b.classList.remove('active'));
      currentMode = `Custom (${customMins}m)`;
      setTimerDuration(customMins);
    });
  }

  function setTimerDuration(minutes) {
    pauseTimer();
    totalSeconds = minutes * 60;
    remainingSeconds = totalSeconds;
    updateClockDisplay();
    if (timerStatusText) {
      timerStatusText.innerText = `${currentMode} session ready (${minutes} mins). Tab switching will be restricted upon start.`;
    }
  }

  function updateClockDisplay() {
    const mins = Math.floor(remainingSeconds / 60);
    const secs = remainingSeconds % 60;
    const formatted = `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
    
    if (timerClock) timerClock.innerText = formatted;
    if (guardTimerDisplay) guardTimerDisplay.innerText = formatted;
    
    if (isRunning) {
      document.title = `(${formatted}) 🔒 ${currentMode} - StudySync`;
    } else {
      document.title = 'Student Portal - StudySync AI Planner';
    }
  }

  // Timer Controls
  if (startBtn) {
    startBtn.addEventListener('click', () => {
      if (isRunning) {
        pauseTimer();
      } else {
        startTimer();
      }
    });
  }

  if (resetBtn) {
    resetBtn.addEventListener('click', () => {
      pauseTimer();
      notifyExtension('FOCUS_STOP');
      remainingSeconds = totalSeconds;
      updateClockDisplay();
      if (timerStatusText) timerStatusText.innerText = 'Timer reset.';
    });
  }

  function startTimer() {
    if (remainingSeconds <= 0) remainingSeconds = totalSeconds;
    isRunning = true;
    if (btnText) btnText.innerText = 'Pause Focus';
    if (playIcon) playIcon.setAttribute('data-lucide', 'pause');
    lucide.createIcons();

    if (timerStatusText) {
      timerStatusText.innerText = `🔒 Strict Focus Mode Active! Tab & window switching restricted. Stay in the zone!`;
    }

    // Update status badge
    if (focusLockStatusText) {
      focusLockStatusText.innerText = '🔒 Focus Lock ACTIVE: Tab & Window switching restricted until session ends or is paused.';
    }
    if (focusBadgeContainer) {
      focusBadgeContainer.classList.add('focus-active');
    }

    // Auto-request Fullscreen for strict focus zone
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().catch(() => {});
    }

    document.querySelector('.focus-container')?.classList.add('timer-running');

    // Prevent page unload / tab closing
    window.onbeforeunload = (e) => {
      e.preventDefault();
      e.returnValue = 'Focus session active! Tab & window switching restricted.';
      return e.returnValue;
    };

    // Start soundscape if selected
    startSoundscape(selectedSound);

    // Register active session on server for verification
    const durationMins = Math.round(totalSeconds / 60);
    ApiClient.post('/focus/start', {
      durationMinutes: durationMins,
      mode: currentMode,
      soundTrack: selectedSound
    }).catch(err => console.warn('Focus server register exception:', err));

    // Notify StudySync Companion Chrome Extension to arm hard tab lock
    notifyExtension('FOCUS_START', {
      durationMinutes: durationMins,
      remainingSeconds,
      mode: currentMode
    });

    let sessionElapsedSeconds = 0;
    timerInterval = setInterval(() => {
      remainingSeconds--;
      sessionElapsedSeconds++;
      updateClockDisplay();

      // Synchronize extension countdown every 2 seconds
      if (remainingSeconds % 2 === 0) {
        notifyExtension('FOCUS_TICK', { remainingSeconds });
      }

      // 20-20-20 Eye-Rest Rule Reminder (every 20 minutes)
      if (sessionElapsedSeconds > 0 && sessionElapsedSeconds % 1200 === 0) {
        showEyeRestToast();
      }

      if (remainingSeconds <= 0) {
        completeFocusSession();
      }
    }, 1000);
  }

  function pauseTimer() {
    isRunning = false;
    clearInterval(timerInterval);
    if (btnText) btnText.innerText = 'Start Focus';
    if (playIcon) playIcon.setAttribute('data-lucide', 'play');
    lucide.createIcons();

    if (timerStatusText) timerStatusText.innerText = 'Session paused.';
    
    document.querySelector('.focus-container')?.classList.remove('timer-running');

    // Clear page unload restriction
    window.onbeforeunload = null;

    // Disarm Companion Extension hard lock
    notifyExtension('FOCUS_STOP');

    // Hide restriction guard modal if open
    hideFocusGuardModal();

    // Reset status badge
    if (focusLockStatusText) {
      focusLockStatusText.innerText = 'Focus Lock Standby: Tab & Window switching will be restricted when timer starts.';
    }
    if (focusBadgeContainer) {
      focusBadgeContainer.classList.remove('focus-active');
    }

    stopSoundscape();
  }

  async function completeFocusSession() {
    pauseTimer();
    playCompletionChime();

    if (window.confetti) {
      window.confetti({ particleCount: 120, spread: 100, origin: { y: 0.5 } });
    }

    const durationMins = Math.round(totalSeconds / 60);

    try {
      const res = await ApiClient.post('/focus/session', {
        durationMinutes: durationMins,
        distractionsCount: 0,
        mode: currentMode,
        soundTrack: selectedSound
      });

      if (res.success) {
        if (window.Toast) {
          Toast.xp(
            'Focus Session Complete! 🏆',
            `Earned +${res.stats.xpEarned} XP • Streak: ${res.stats.streak} Days 🔥 • Companion Growth: +${res.companion?.growthEarned || 15} GP 🪴`,
            6000
          );
        } else {
          alert(`🎉 Focus Session Complete!\nYou earned ${res.stats.xpEarned} XP!\nCurrent Streak: ${res.stats.streak} Days 🔥\nCompanion Growth: +${res.companion?.growthEarned || 15} GP 🪴`);
        }
        if (window.loadUserProfile) window.loadUserProfile();
        loadCompanion();
        loadWellnessRadar();
      }
    } catch (err) {
      console.error('Failed to log session:', err);
    }
  }

  // Fullscreen API Integration
  if (fullscreenBtn) {
    fullscreenBtn.addEventListener('click', () => {
      if (!document.fullscreenElement) {
        document.documentElement.requestFullscreen().catch(err => {
          console.warn('Fullscreen error:', err);
        });
      } else {
        if (document.exitFullscreen) document.exitFullscreen();
      }
    });
  }

  // ==========================================
  // STRICT TAB / WINDOW SWITCH RESTRICTION GUARD
  // ==========================================
  function showFocusGuardModal() {
    if (focusGuardModal) {
      focusGuardModal.style.display = 'flex';
      updateClockDisplay();
      playWarningBeep();
    }
  }

  function hideFocusGuardModal() {
    if (focusGuardModal) {
      focusGuardModal.style.display = 'none';
    }
  }

  // Intercept Page Visibility API & Window Blur (Tab & Window Switching)
  document.addEventListener('visibilitychange', () => {
    if (document.hidden && isRunning) {
      showFocusGuardModal();
    }
  });

  window.addEventListener('blur', () => {
    if (isRunning) {
      showFocusGuardModal();
    }
  });

  document.addEventListener('fullscreenchange', () => {
    if (!document.fullscreenElement && isRunning) {
      showFocusGuardModal();
    }
  });

  // Focus Guard Modal Action Buttons
  if (guardReturnBtn) {
    guardReturnBtn.addEventListener('click', () => {
      hideFocusGuardModal();
      if (!document.fullscreenElement) {
        document.documentElement.requestFullscreen().catch(() => {});
      }
    });
  }

  if (guardPauseBtn) {
    guardPauseBtn.addEventListener('click', () => {
      pauseTimer();
      if (document.fullscreenElement) {
        document.exitFullscreen().catch(() => {});
      }
    });
  }

  // ==========================================
  // WEB AUDIO API AMBIENT SOUND SYNTHESIZER
  // ==========================================
  let audioCtx = null;
  let masterGain = null;
  let activeAudioNodes = [];
  let soundIntervals = [];

  function initAudioContext() {
    if (!audioCtx) {
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      audioCtx = new AudioContext();
      masterGain = audioCtx.createGain();
      masterGain.gain.value = Number(volumeSlider?.value || 0.5);
      masterGain.connect(audioCtx.destination);
    }
    if (audioCtx.state === 'suspended') {
      audioCtx.resume();
    }
  }

  if (volumeSlider) {
    volumeSlider.addEventListener('input', (e) => {
      const val = Number(e.target.value);
      if (masterGain && audioCtx) {
        masterGain.gain.setValueAtTime(val, audioCtx.currentTime);
      }
    });
  }

  // Sound Buttons
  const soundBtns = document.querySelectorAll('.sound-btn');
  soundBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      soundBtns.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');

      selectedSound = btn.getAttribute('data-sound');
      if (isRunning) {
        startSoundscape(selectedSound);
      }
    });
  });

  function stopSoundscape() {
    soundIntervals.forEach(id => clearInterval(id));
    soundIntervals = [];
    activeAudioNodes.forEach(node => {
      try {
        if (node.stop) node.stop();
        node.disconnect();
      } catch (e) {}
    });
    activeAudioNodes = [];
  }

  function startSoundscape(soundType) {
    stopSoundscape();
    if (soundType === 'none') return;

    initAudioContext();

    if (soundType === 'whitenoise' || soundType === 'rain') {
      const bufferSize = audioCtx.sampleRate * 2;
      const buffer = audioCtx.createBuffer(1, bufferSize, audioCtx.sampleRate);
      const output = buffer.getChannelData(0);
      for (let i = 0; i < bufferSize; i++) {
        output[i] = Math.random() * 2 - 1;
      }

      const whiteNoise = audioCtx.createBufferSource();
      whiteNoise.buffer = buffer;
      whiteNoise.loop = true;

      if (soundType === 'rain') {
        const filter = audioCtx.createBiquadFilter();
        filter.type = 'lowpass';
        filter.frequency.value = 800;
        whiteNoise.connect(filter);
        filter.connect(masterGain);
      } else {
        const gainNode = audioCtx.createGain();
        gainNode.gain.value = 0.2;
        whiteNoise.connect(gainNode);
        gainNode.connect(masterGain);
      }

      whiteNoise.start();
      activeAudioNodes.push(whiteNoise);

    } else if (soundType === 'binaural') {
      const oscL = audioCtx.createOscillator();
      const oscR = audioCtx.createOscillator();
      
      oscL.type = 'sine';
      oscL.frequency.value = 200;
      
      oscR.type = 'sine';
      oscR.frequency.value = 210;

      const merger = audioCtx.createChannelMerger(2);
      oscL.connect(merger, 0, 0);
      oscR.connect(merger, 0, 1);

      merger.connect(masterGain);

      oscL.start();
      oscR.start();
      activeAudioNodes.push(oscL, oscR);

    } else if (soundType === 'chime') {
      playChimeNote();

    } else if (soundType === 'cafe') {
      // Pink/filtered noise + gentle LFO simulating bustling coffeehouse murmur
      const bufferSize = audioCtx.sampleRate * 2;
      const buffer = audioCtx.createBuffer(1, bufferSize, audioCtx.sampleRate);
      const data = buffer.getChannelData(0);
      let b0 = 0, b1 = 0, b2 = 0;
      for (let i = 0; i < bufferSize; i++) {
        const white = Math.random() * 2 - 1;
        b0 = 0.99886 * b0 + white * 0.0555179;
        b1 = 0.99332 * b1 + white * 0.0750759;
        b2 = 0.96900 * b2 + white * 0.1538520;
        data[i] = (b0 + b1 + b2) * 0.25;
      }
      const noise = audioCtx.createBufferSource();
      noise.buffer = buffer;
      noise.loop = true;

      const bandpass = audioCtx.createBiquadFilter();
      bandpass.type = 'bandpass';
      bandpass.frequency.value = 950;
      bandpass.Q.value = 0.8;

      const cafeGain = audioCtx.createGain();
      cafeGain.gain.value = 0.35;

      const lfo = audioCtx.createOscillator();
      lfo.frequency.value = 0.25;
      const lfoGain = audioCtx.createGain();
      lfoGain.gain.value = 0.06;
      lfo.connect(lfoGain);
      lfoGain.connect(cafeGain.gain);

      noise.connect(bandpass);
      bandpass.connect(cafeGain);
      cafeGain.connect(masterGain);

      noise.start();
      lfo.start();
      activeAudioNodes.push(noise, lfo);

      // Subtle occasional cup/plate tinkles
      const clinkInterval = setInterval(() => {
        if (selectedSound !== 'cafe' || !isRunning || !audioCtx) return;
        if (Math.random() > 0.45) {
          const osc = audioCtx.createOscillator();
          const g = audioCtx.createGain();
          osc.type = 'sine';
          osc.frequency.setValueAtTime(2400 + Math.random() * 700, audioCtx.currentTime);
          g.gain.setValueAtTime(0.035, audioCtx.currentTime);
          g.gain.exponentialRampToValueAtTime(0.0001, audioCtx.currentTime + 0.3);
          osc.connect(g);
          g.connect(masterGain);
          osc.start();
          osc.stop(audioCtx.currentTime + 0.3);
        }
      }, 3200);
      soundIntervals.push(clinkInterval);

    } else if (soundType === 'campfire') {
      // Brown noise for warm rumble + periodic crackle pops
      const bufferSize = audioCtx.sampleRate * 2;
      const buffer = audioCtx.createBuffer(1, bufferSize, audioCtx.sampleRate);
      const data = buffer.getChannelData(0);
      let lastOut = 0.0;
      for (let i = 0; i < bufferSize; i++) {
        const white = Math.random() * 2 - 1;
        lastOut = (lastOut + 0.02 * white) / 1.02;
        data[i] = lastOut * 3.2;
      }
      const noise = audioCtx.createBufferSource();
      noise.buffer = buffer;
      noise.loop = true;

      const filter = audioCtx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.value = 420;

      const fireGain = audioCtx.createGain();
      fireGain.gain.value = 0.4;

      noise.connect(filter);
      filter.connect(fireGain);
      fireGain.connect(masterGain);

      noise.start();
      activeAudioNodes.push(noise);

      const crackleInterval = setInterval(() => {
        if (selectedSound !== 'campfire' || !isRunning || !audioCtx) return;
        const now = audioCtx.currentTime;
        const count = Math.floor(Math.random() * 3) + 1;
        for (let k = 0; k < count; k++) {
          const offset = Math.random() * 0.12;
          const osc = audioCtx.createOscillator();
          const g = audioCtx.createGain();
          osc.type = 'triangle';
          osc.frequency.setValueAtTime(900 + Math.random() * 2200, now + offset);
          g.gain.setValueAtTime(0.07, now + offset);
          g.gain.exponentialRampToValueAtTime(0.0001, now + offset + 0.035);
          osc.connect(g);
          g.connect(masterGain);
          osc.start(now + offset);
          osc.stop(now + offset + 0.035);
        }
      }, 250);
      soundIntervals.push(crackleInterval);

    } else if (soundType === 'keyboard') {
      // Mechanical typing ASMR generator with natural variations
      const playKeystroke = () => {
        if (selectedSound !== 'keyboard' || !isRunning || !audioCtx) return;
        const now = audioCtx.currentTime;

        const clickOsc = audioCtx.createOscillator();
        const clickGain = audioCtx.createGain();
        clickOsc.type = 'triangle';
        clickOsc.frequency.setValueAtTime(2200 + Math.random() * 800, now);
        clickGain.gain.setValueAtTime(0.18, now);
        clickGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.025);
        clickOsc.connect(clickGain);
        clickGain.connect(masterGain);
        clickOsc.start(now);
        clickOsc.stop(now + 0.025);

        const thudOsc = audioCtx.createOscillator();
        const thudGain = audioCtx.createGain();
        thudOsc.type = 'sine';
        thudOsc.frequency.setValueAtTime(145 + Math.random() * 45, now);
        thudGain.gain.setValueAtTime(0.12, now);
        thudGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.045);
        thudOsc.connect(thudGain);
        thudGain.connect(masterGain);
        thudOsc.start(now);
        thudOsc.stop(now + 0.045);
      };

      const keyInterval = setInterval(() => {
        if (selectedSound !== 'keyboard' || !isRunning) return;
        playKeystroke();
        if (Math.random() > 0.55) {
          setTimeout(playKeystroke, 85 + Math.random() * 65);
        }
      }, 340);
      soundIntervals.push(keyInterval);

    } else if (soundType === 'lofi') {
      // Warm nostalgic jazz/lofi chord progressions + subtle vinyl dust
      const chords = [
        [146.83, 174.61, 220.00, 261.63], // Dm7
        [196.00, 246.94, 293.66, 349.23], // G7
        [130.81, 164.81, 196.00, 246.94], // Cmaj7
        [110.00, 130.81, 164.81, 196.00]  // Am7
      ];

      let chordIndex = 0;
      const playLofiChord = () => {
        if (selectedSound !== 'lofi' || !isRunning || !audioCtx) return;
        const now = audioCtx.currentTime;
        const currentChord = chords[chordIndex % chords.length];
        chordIndex++;

        currentChord.forEach(freq => {
          const osc = audioCtx.createOscillator();
          const gain = audioCtx.createGain();
          const filter = audioCtx.createBiquadFilter();

          osc.type = 'triangle';
          osc.frequency.setValueAtTime(freq, now);

          filter.type = 'lowpass';
          filter.frequency.setValueAtTime(580, now);

          gain.gain.setValueAtTime(0.001, now);
          gain.gain.linearRampToValueAtTime(0.055, now + 1.2);
          gain.gain.exponentialRampToValueAtTime(0.0001, now + 4.8);

          osc.connect(filter);
          filter.connect(gain);
          gain.connect(masterGain);

          osc.start(now);
          osc.stop(now + 4.9);
        });
      };

      playLofiChord();
      const lofiInterval = setInterval(playLofiChord, 4600);
      soundIntervals.push(lofiInterval);

      // Vinyl dust crackle layer
      const bufferSize = audioCtx.sampleRate * 2;
      const buffer = audioCtx.createBuffer(1, bufferSize, audioCtx.sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < bufferSize; i++) {
        data[i] = Math.random() > 0.99 ? (Math.random() * 2 - 1) * 0.12 : 0;
      }
      const vinyl = audioCtx.createBufferSource();
      vinyl.buffer = buffer;
      vinyl.loop = true;
      const vinylGain = audioCtx.createGain();
      vinylGain.gain.value = 0.2;
      vinyl.connect(vinylGain);
      vinylGain.connect(masterGain);
      vinyl.start();
      activeAudioNodes.push(vinyl);
    }
  }

  function playChimeNote() {
    if (!audioCtx) return;

    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();

    osc.type = 'sine';
    osc.frequency.value = 528;

    gain.gain.setValueAtTime(0.3, audioCtx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.0001, audioCtx.currentTime + 4.5);

    osc.connect(gain);
    gain.connect(masterGain);

    osc.start();
    osc.stop(audioCtx.currentTime + 4.5);

    if (selectedSound === 'chime' && isRunning) {
      setTimeout(() => {
        if (selectedSound === 'chime' && isRunning) {
          playChimeNote();
        }
      }, 8000);
    }
  }

  function playWarningBeep() {
    try {
      initAudioContext();
      const now = audioCtx.currentTime;
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();

      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(440, now);
      osc.frequency.setValueAtTime(330, now + 0.15);

      gain.gain.setValueAtTime(0.3, now);
      gain.gain.exponentialRampToValueAtTime(0.01, now + 0.35);

      osc.connect(gain);
      gain.connect(masterGain);

      osc.start(now);
      osc.stop(now + 0.35);
    } catch (e) {}
  }

  function playCompletionChime() {
    initAudioContext();
    const now = audioCtx.currentTime;

    [523.25, 659.25, 783.99, 1046.50].forEach((freq, i) => {
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();

      osc.type = 'triangle';
      osc.frequency.value = freq;

      gain.gain.setValueAtTime(0.3, now + i * 0.15);
      gain.gain.exponentialRampToValueAtTime(0.001, now + i * 0.15 + 1.2);

      osc.connect(gain);
      gain.connect(masterGain);

      osc.start(now + i * 0.15);
      osc.stop(now + i * 0.15 + 1.2);
    });
  }

  // ========================================================
  // 20-20-20 EYE-REST RULE REMINDER
  // ========================================================
  const eyeRestToast = document.getElementById('eye-rest-toast');
  const closeEyeToastBtn = document.getElementById('close-eye-toast-btn');
  let eyeToastTimeout = null;

  function showEyeRestToast() {
    if (!eyeRestToast) return;
    eyeRestToast.style.display = 'flex';
    playChimeNote();
    if (eyeToastTimeout) clearTimeout(eyeToastTimeout);
    eyeToastTimeout = setTimeout(() => {
      eyeRestToast.style.display = 'none';
    }, 20000);
  }

  if (closeEyeToastBtn && eyeRestToast) {
    closeEyeToastBtn.addEventListener('click', () => {
      eyeRestToast.style.display = 'none';
      if (eyeToastTimeout) clearTimeout(eyeToastTimeout);
    });
  }

  // ========================================================
  // VIRTUAL DESK COMPANION / STUDY GARDEN (RPG MECHANIC)
  // ========================================================
  const companionAvatar = document.getElementById('companion-avatar-emoji');
  const companionStageName = document.getElementById('companion-stage-name');
  const companionVitalityText = document.getElementById('companion-vitality-text');
  const companionVitalityBar = document.getElementById('companion-vitality-bar');
  const vitalityStatusLabel = document.getElementById('vitality-status-label');
  const companionGrowthText = document.getElementById('companion-growth-text');
  const companionGrowthBar = document.getElementById('companion-growth-bar');
  const equippedDecorContainer = document.getElementById('equipped-decor-container');
  const switchCompanionTypeBtn = document.getElementById('switch-companion-type-btn');
  const companionTypeLabel = document.getElementById('companion-type-label');
  const waterCompanionBtn = document.getElementById('water-companion-btn');
  const openDecorModalBtn = document.getElementById('open-decor-modal-btn');
  const decorModal = document.getElementById('decor-modal');
  const closeDecorModalBtn = document.getElementById('close-decor-modal-btn');
  const closeDecorModalBtn2 = document.getElementById('close-decor-modal-btn2');
  const decorCatalogGrid = document.getElementById('decor-catalog-grid');

  let currentCompanion = null;
  let currentDecorCatalog = [];

  const COMPANION_STAGES = {
    bonsai: [
      { min: 0, max: 49, stage: 1, name: 'Sprout (Stage 1)', emoji: '🌱' },
      { min: 50, max: 149, stage: 2, name: 'Seedling (Stage 2)', emoji: '🌿' },
      { min: 150, max: 299, stage: 3, name: 'Zen Terrarium (Stage 3)', emoji: '🌿' },
      { min: 300, max: 499, stage: 4, name: 'Blooming Sakura (Stage 4)', emoji: '🌸' },
      { min: 500, max: Infinity, stage: 5, name: 'Ancient Tree of Wisdom (Stage 5)', emoji: '🌳' }
    ],
    pet: [
      { min: 0, max: 49, stage: 1, name: 'Mystic Egg (Stage 1)', emoji: '🥚' },
      { min: 50, max: 149, stage: 2, name: 'Hatchling (Stage 2)', emoji: '🐣' },
      { min: 150, max: 299, stage: 3, name: 'Forest Kitsune (Stage 3)', emoji: '🦊' },
      { min: 300, max: 499, stage: 4, name: 'Wise Calico (Stage 4)', emoji: '🐱' },
      { min: 500, max: Infinity, stage: 5, name: 'Astral Guardian Dragon (Stage 5)', emoji: '🐉' }
    ]
  };

  let decorPositions = {};
  let savePositionsTimer = null;

  function debouncedSavePositions() {
    clearTimeout(savePositionsTimer);
    savePositionsTimer = setTimeout(async () => {
      try {
        await ApiClient.post('/focus/companion/interact', {
          action: 'save_positions',
          positions: decorPositions
        });
      } catch (e) {
        console.warn('Failed to save decor positions to server:', e);
      }
    }, 600);
  }

  async function loadCompanion() {
    try {
      const res = await ApiClient.get('/focus/companion');
      if (!res.success) return;

      currentCompanion = res.companion;
      currentDecorCatalog = res.decorCatalog || [];

      // Read positions from server, fallback to localStorage
      let localPos = {};
      try {
        localPos = JSON.parse(localStorage.getItem('studysync_decor_positions') || '{}');
      } catch (e) {
        localPos = {};
      }

      decorPositions = currentCompanion.decorPositions && Object.keys(currentCompanion.decorPositions).length > 0
        ? currentCompanion.decorPositions
        : localPos;

      renderCompanionUI();
    } catch (err) {
      console.warn('Could not load companion data:', err);
    }
  }

  function renderCompanionUI() {
    if (!currentCompanion) return;

    const type = currentCompanion.companionType === 'pet' ? 'pet' : 'bonsai';
    if (companionTypeLabel) {
      companionTypeLabel.innerText = type === 'pet' ? 'Pet 🦊' : 'Plant 🌿';
    }

    const stageList = COMPANION_STAGES[type];
    const points = currentCompanion.growthPoints || 0;
    const stageInfo = stageList.find(s => points >= s.min && points <= s.max) || stageList[0];

    if (companionStageName) companionStageName.innerText = stageInfo.name;

    const vitality = Math.max(0, Math.min(100, currentCompanion.vitality || 100));
    if (companionVitalityText) companionVitalityText.innerText = `${vitality}%`;
    if (companionVitalityBar) {
      companionVitalityBar.style.width = `${vitality}%`;
      if (vitality < 30) {
        companionVitalityBar.classList.add('low');
      } else {
        companionVitalityBar.classList.remove('low');
      }
    }

    if (vitalityStatusLabel) {
      if (vitality >= 70) {
        vitalityStatusLabel.innerText = 'Flourishing ✨';
        vitalityStatusLabel.style.color = '#34d399';
      } else if (vitality >= 40) {
        vitalityStatusLabel.innerText = 'Needs Care 💧';
        vitalityStatusLabel.style.color = '#fbbf24';
      } else {
        vitalityStatusLabel.innerText = 'Withered 🥀';
        vitalityStatusLabel.style.color = '#f87171';
      }
    }

    if (companionAvatar) {
      if (vitality < 25) {
        companionAvatar.innerText = type === 'pet' ? '💤' : '🥀';
        companionAvatar.classList.add('withered');
      } else {
        companionAvatar.innerText = stageInfo.emoji;
        companionAvatar.classList.remove('withered');
      }
    }

    // Growth progression calculation
    let progressPct = 0;
    if (stageInfo.max === Infinity) {
      progressPct = 100;
      if (companionGrowthText) companionGrowthText.innerText = `${points} GP (Max Stage ⭐)`;
    } else {
      const range = stageInfo.max - stageInfo.min + 1;
      const current = points - stageInfo.min;
      progressPct = Math.min(100, Math.max(0, Math.round((current / range) * 100)));
      if (companionGrowthText) companionGrowthText.innerText = `${points} / ${stageInfo.max + 1} GP`;
    }
    if (companionGrowthBar) companionGrowthBar.style.width = `${progressPct}%`;

    // 1. Render Spatial Non-Congested 3D Desk Decor inside the Terrarium Stage (Strictly unlocked only)
    const spatialContainer = document.getElementById('spatial-decor-container');
    const equippedIds = (currentCompanion.equippedDecor || []).filter(id => {
      const item = currentDecorCatalog.find(d => d.id === id);
      return item && item.isUnlocked;
    });

    if (spatialContainer) {
      spatialContainer.innerHTML = '';
      equippedIds.forEach(id => {
        const item = currentDecorCatalog.find(d => d.id === id);
        if (item && item.isUnlocked) {
          const div = document.createElement('div');
          div.className = `desk-decor-item ${item.slot || 'slot-pot'}`;
          div.setAttribute('data-decor-id', item.id);
          div.setAttribute('title', `${item.name} (${item.rankTag || `Lvl ${item.unlockLevel}`}) • Hold & drag to arrange`);
          div.innerHTML = `
            <span class="decor-icon">${item.emoji}</span>
            <span class="decor-tooltip">${item.name} • ${item.rankTag || `Lvl ${item.unlockLevel}`}</span>
          `;

          // Apply saved custom coordinates if available
          const customPos = decorPositions[item.id];
          if (customPos && typeof customPos.x === 'number' && typeof customPos.y === 'number') {
            div.classList.add('has-custom-pos');
            div.style.left = `${customPos.x}%`;
            div.style.top = `${customPos.y}%`;
          }

          setupHoldAndDrag(div, item, spatialContainer);
          spatialContainer.appendChild(div);
        }
      });
    }

    // 2. Render Sleek Equipped Showcase Dock beneath the Stage (Strictly unlocked only)
    const shelfSlotsRow = document.getElementById('shelf-slots-row');
    if (shelfSlotsRow) {
      shelfSlotsRow.innerHTML = '';
      if (equippedIds.length === 0) {
        shelfSlotsRow.innerHTML = '<span style="color: var(--text-dim); font-size: 0.72rem;">Desk is tidy & clean. Open "Desk Decor" to place unlocked items.</span>';
      } else {
        equippedIds.forEach(id => {
          const item = currentDecorCatalog.find(d => d.id === id);
          if (item && item.isUnlocked) {
            const token = document.createElement('span');
            token.className = 'shelf-token';
            token.setAttribute('title', `${item.name} (${item.rankTag || `Lvl ${item.unlockLevel}`}) - Click to manage`);
            token.innerText = item.emoji;
            token.addEventListener('click', () => {
              if (decorModal) decorModal.classList.add('active');
            });
            shelfSlotsRow.appendChild(token);
          }
        });
      }
    }

    renderDecorCatalog();
  }

  function setupHoldAndDrag(div, item, container) {
    let isDragging = false;
    let startX = 0;
    let startY = 0;
    let initialLeftPx = 0;
    let initialTopPx = 0;
    let pointerDownId = null;

    const onPointerDown = (e) => {
      // Only respond to main mouse button or touch/pen
      if (e.pointerType === 'mouse' && e.button !== 0) return;

      pointerDownId = e.pointerId;
      try {
        div.setPointerCapture(e.pointerId);
      } catch (err) {}

      const stageBox = container.closest('.companion-stage-box') || container;
      const stageRect = stageBox.getBoundingClientRect();
      const itemRect = div.getBoundingClientRect();

      startX = e.clientX;
      startY = e.clientY;
      initialLeftPx = itemRect.left - stageRect.left;
      initialTopPx = itemRect.top - stageRect.top;
      isDragging = false;
    };

    const onPointerMove = (e) => {
      if (pointerDownId === null || e.pointerId !== pointerDownId) return;

      const deltaX = e.clientX - startX;
      const deltaY = e.clientY - startY;

      if (!isDragging && Math.hypot(deltaX, deltaY) > 4) {
        isDragging = true;
        div.classList.add('is-dragging');
      }

      if (isDragging) {
        const stageBox = container.closest('.companion-stage-box') || container;
        const stageRect = stageBox.getBoundingClientRect();
        const itemWidth = div.offsetWidth || 36;
        const itemHeight = div.offsetHeight || 36;

        let curX = initialLeftPx + deltaX;
        let curY = initialTopPx + deltaY;

        // Keep decor strictly within the stage container
        const maxX = Math.max(0, stageRect.width - itemWidth);
        const maxY = Math.max(0, stageRect.height - itemHeight);
        curX = Math.max(0, Math.min(maxX, curX));
        curY = Math.max(0, Math.min(maxY, curY));

        // Proportional percentages for responsive scaling
        const xPct = Number(((curX / stageRect.width) * 100).toFixed(1));
        const yPct = Number(((curY / stageRect.height) * 100).toFixed(1));

        div.classList.add('has-custom-pos');
        div.style.left = `${xPct}%`;
        div.style.top = `${yPct}%`;

        // Update in-memory state
        decorPositions[item.id] = { x: xPct, y: yPct };
      }
    };

    const onPointerUp = (e) => {
      if (pointerDownId === null || e.pointerId !== pointerDownId) return;

      try {
        div.releasePointerCapture(e.pointerId);
      } catch (err) {}

      pointerDownId = null;
      div.classList.remove('is-dragging');

      if (isDragging) {
        isDragging = false;
        // Save to localStorage immediately and trigger debounced sync to database
        localStorage.setItem('studysync_decor_positions', JSON.stringify(decorPositions));
        debouncedSavePositions();
      } else {
        // Quick click/tap: open the decor management modal
        if (decorModal) decorModal.classList.add('active');
      }
    };

    div.addEventListener('pointerdown', onPointerDown);
    div.addEventListener('pointermove', onPointerMove);
    div.addEventListener('pointerup', onPointerUp);
    div.addEventListener('pointercancel', onPointerUp);
  }

  function renderDecorCatalog() {
    if (!decorCatalogGrid) return;
    decorCatalogGrid.innerHTML = '';

    currentDecorCatalog.forEach(item => {
      const card = document.createElement('div');
      card.className = `decor-item-card ${item.isEquipped ? 'equipped' : ''} ${!item.isUnlocked ? 'locked' : ''}`;
      
      card.innerHTML = `
        <div style="font-size: 2.3rem; line-height: 1;">${item.emoji}</div>
        <div style="text-align: center; width: 100%;">
          <strong style="font-size: 0.85rem; color: #fff; display: block; margin-bottom: 0.15rem;">${item.name}</strong>
          ${item.rankTag ? `<div style="font-size: 0.72rem; font-weight: 700; color: var(--accent); margin-bottom: 0.2rem;">${item.rankTag}</div>` : ''}
          <span class="badge" style="font-size: 0.68rem; background: ${item.isUnlocked ? 'rgba(16, 185, 129, 0.15)' : 'rgba(148, 163, 184, 0.12)'}; color: ${item.isUnlocked ? '#6ee7b7' : '#94a3b8'}; border: 1px solid ${item.isUnlocked ? 'rgba(16, 185, 129, 0.3)' : 'rgba(255,255,255,0.08)'};">
            ${item.isUnlocked ? '✓ Unlocked' : `🔒 Requires Level ${item.unlockLevel}`}
          </span>
        </div>
        ${
          item.isUnlocked
            ? `<button class="btn btn-sm ${item.isEquipped ? 'btn-primary' : 'btn-glass'}" style="width: 100%; font-size: 0.75rem; padding: 0.35rem 0.6rem;" data-decor-id="${item.id}">
                ${item.isEquipped ? 'Equipped ✓' : 'Place on Desk'}
               </button>`
            : `<div style="font-size: 0.72rem; color: var(--text-dim); text-align: center; padding: 0.25rem 0;">
                Reach Level ${item.unlockLevel} to Unlock
               </div>`
        }
      `;

      if (item.isUnlocked) {
        const btn = card.querySelector('button');
        if (btn) {
          btn.addEventListener('click', async () => {
            try {
              const res = await ApiClient.post('/focus/companion/interact', {
                action: 'decor',
                decorId: item.id
              });
              if (res.success) {
                if (window.Toast) Toast.success('Decor Updated', 'Companion item visibility updated.');
                loadCompanion();
              }
            } catch (err) {
              if (window.Toast) Toast.error('Decor Notice', err.message || 'Failed to toggle decor.');
              else alert(err.message || 'Failed to toggle decor.');
            }
          });
        }
      }

      decorCatalogGrid.appendChild(card);
    });
  }

  if (waterCompanionBtn) {
    waterCompanionBtn.addEventListener('click', async () => {
      try {
        const res = await ApiClient.post('/focus/companion/interact', { action: 'water' });
        if (res.success) {
          playChimeNote();
          if (window.Toast) {
            Toast.success('Companion Nurtured! 💧', '+15 GP Growth Points earned.');
          }
          loadCompanion();
          loadWellnessRadar();
          if (window.confetti) {
            window.confetti({ particleCount: 30, spread: 60, origin: { y: 0.6 } });
          }
        }
      } catch (err) {
        if (window.Toast) Toast.error('Nurture Notice', 'Could not water companion: ' + err.message);
        else alert('Could not water companion: ' + err.message);
      }
    });
  }

  if (switchCompanionTypeBtn) {
    switchCompanionTypeBtn.addEventListener('click', async () => {
      const nextType = currentCompanion?.companionType === 'pet' ? 'bonsai' : 'pet';
      try {
        const res = await ApiClient.post('/focus/companion/interact', {
          action: 'switch_type',
          companionType: nextType
        });
        if (res.success) {
          if (window.Toast) {
            Toast.info('Companion Switched', `Active study companion changed to ${nextType === 'pet' ? 'Study Puppy 🐶' : 'Zen Bonsai 🪴'}.`);
          }
          loadCompanion();
        }
      } catch (err) {
        if (window.Toast) Toast.error('Switch Failed', 'Failed to switch companion: ' + err.message);
        else alert('Failed to switch companion: ' + err.message);
      }
    });
  }

  if (openDecorModalBtn && decorModal) {
    openDecorModalBtn.addEventListener('click', () => {
      decorModal.classList.add('active');
    });
  }
  if (closeDecorModalBtn && decorModal) {
    closeDecorModalBtn.addEventListener('click', () => {
      decorModal.classList.remove('active');
    });
  }
  if (closeDecorModalBtn2 && decorModal) {
    closeDecorModalBtn2.addEventListener('click', () => {
      decorModal.classList.remove('active');
    });
  }

  const resetDecorPositionsBtn = document.getElementById('reset-decor-positions-btn');
  if (resetDecorPositionsBtn) {
    resetDecorPositionsBtn.addEventListener('click', async () => {
      decorPositions = {};
      localStorage.removeItem('studysync_decor_positions');
      try {
        await ApiClient.post('/focus/companion/interact', {
          action: 'reset_positions'
        });
      } catch (err) {
        console.warn('Reset decor positions server notice:', err);
      }
      renderCompanionUI();
    });
  }

  // ========================================================
  // SMART BURNOUT DETECTION & WELLNESS RADAR
  // ========================================================
  const wellnessScoreDisplay = document.getElementById('wellness-score-display');
  const wellnessScoreDial = document.getElementById('wellness-score-dial');
  const wellnessRiskPill = document.getElementById('wellness-risk-pill');
  const wellnessPaceTitle = document.getElementById('wellness-pace-title');
  const wellnessSummaryText = document.getElementById('wellness-summary-text');
  const hydrationCountText = document.getElementById('hydration-count-text');
  const hydrationGlassesGrid = document.getElementById('hydration-glasses-grid');
  const logWaterGlassBtn = document.getElementById('log-water-glass-btn');
  const wellnessRecsContainer = document.getElementById('wellness-recs-container');

  async function loadWellnessRadar() {
    try {
      const res = await ApiClient.get('/focus/wellness');
      if (!res.success) return;

      const score = res.wellnessScore || 100;
      if (wellnessScoreDisplay) wellnessScoreDisplay.innerText = score;

      if (wellnessScoreDial) {
        wellnessScoreDial.classList.remove('risk-moderate', 'risk-burnout');
        if (score < 60) wellnessScoreDial.classList.add('risk-burnout');
        else if (score < 85) wellnessScoreDial.classList.add('risk-moderate');
      }

      if (wellnessRiskPill) {
        wellnessRiskPill.className = 'risk-tag';
        if (score < 60) {
          wellnessRiskPill.classList.add('burnout');
          wellnessRiskPill.innerText = 'Burnout Risk 🚨';
        } else if (score < 85) {
          wellnessRiskPill.classList.add('moderate');
          wellnessRiskPill.innerText = 'Moderate Fatigue ⚠️';
        } else {
          wellnessRiskPill.classList.add('optimal');
          wellnessRiskPill.innerText = 'Optimal Pace 🌿';
        }
      }

      if (wellnessPaceTitle && wellnessSummaryText) {
        const focusMins = res.focusMinutesToday || 0;
        if (score < 60) {
          wellnessPaceTitle.innerText = 'High Fatigue Detected';
          wellnessSummaryText.innerText = `You've completed ${focusMins} mins of study today. Take a break to prevent burnout.`;
        } else if (score < 85) {
          wellnessPaceTitle.innerText = 'Steady Study Pace';
          wellnessSummaryText.innerText = `Active for ${focusMins} mins today. Stay hydrated and rest your eyes periodically.`;
        } else {
          wellnessPaceTitle.innerText = 'Peak Cognitive Rhythm';
          wellnessSummaryText.innerText = `Studied ${focusMins} mins today. Great balance between focus blocks and recovery!`;
        }
      }

      const hydCount = res.hydrationCount || 0;
      if (hydrationCountText) hydrationCountText.innerText = hydCount;

      if (hydrationGlassesGrid) {
        hydrationGlassesGrid.innerHTML = '';
        for (let i = 0; i < 8; i++) {
          const slot = document.createElement('div');
          slot.className = `glass-slot ${i < hydCount ? 'filled' : ''}`;
          slot.title = `Glass ${i + 1} of 8 (${i < hydCount ? 'Drank' : 'Pending'})`;
          hydrationGlassesGrid.appendChild(slot);
        }
      }

      if (wellnessRecsContainer) {
        wellnessRecsContainer.innerHTML = '';
        const recs = res.recommendations || [];
        recs.forEach(rec => {
          const item = document.createElement('div');
          item.className = 'wellness-rec-item';
          const iconName = rec.icon || 'info';
          item.innerHTML = `
            <i data-lucide="${iconName}" style="width: 16px; height: 16px; color: var(--primary); flex-shrink: 0; margin-top: 2px;"></i>
            <span>${rec.text}</span>
          `;
          wellnessRecsContainer.appendChild(item);
        });
        lucide.createIcons();
      }
    } catch (err) {
      console.warn('Could not load wellness radar data:', err);
    }
  }

  if (logWaterGlassBtn) {
    logWaterGlassBtn.addEventListener('click', async () => {
      try {
        const res = await ApiClient.post('/focus/wellness/hydrate', {});
        if (res.success) {
          if (window.Toast) {
            Toast.success('Hydration Logged! 🥤', '1 glass recorded towards your daily goal.');
          }
          loadWellnessRadar();
          loadCompanion();
          if (window.confetti) {
            window.confetti({ particleCount: 25, spread: 50, origin: { y: 0.8 } });
          }
        }
      } catch (err) {
        if (window.Toast) Toast.error('Hydration Error', 'Could not log hydration: ' + err.message);
        else alert('Could not log hydration: ' + err.message);
      }
    });
  }

  // Export module for cross-tab refreshing
  window.FocusRoomModule = {
    refresh: () => {
      loadCompanion();
      loadWellnessRadar();
    }
  };

  // Initial load
  loadCompanion();
  loadWellnessRadar();
});
