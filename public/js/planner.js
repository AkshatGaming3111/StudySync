// AI Planner & Task Manager Module

document.addEventListener('DOMContentLoaded', () => {
  let allTasks = [];
  let currentFilter = 'all';

  const taskListEl = document.getElementById('task-list');
  const emptyStateEl = document.getElementById('tasks-empty-state');
  const taskProgressRatioEl = document.getElementById('task-progress-ratio');
  const countdownDaysEl = document.getElementById('countdown-days');
  const examTitleEl = document.getElementById('planner-exam-title');

  // AI Modal Elements
  const aiModal = document.getElementById('ai-modal');
  const openAiModalBtn = document.getElementById('open-ai-modal-btn');
  const closeAiModalBtn = document.getElementById('close-ai-modal-btn');
  const cancelAiModalBtn = document.getElementById('cancel-ai-modal-btn');
  const aiForm = document.getElementById('ai-generator-form');
  const aiExamDateInput = document.getElementById('ai-exam-date-input');
  const aiSyllabusInput = document.getElementById('ai-syllabus-input');
  const aiDailyHoursInput = document.getElementById('ai-daily-hours-input');
  const generateAiSubmitBtn = document.getElementById('generate-ai-submit-btn');
  const aiBtnText = document.getElementById('ai-btn-text');

  // Custom Task Form Elements
  const customTaskForm = document.getElementById('custom-task-form');
  const taskTitleInput = document.getElementById('task-title-input');
  const taskSubjectInput = document.getElementById('task-subject-input');
  const taskDateInput = document.getElementById('task-date-input');
  const taskPriorityInput = document.getElementById('task-priority-input');

  // Set default dates
  const todayStr = new Date().toISOString().split('T')[0];
  if (taskDateInput) taskDateInput.value = todayStr;
  
  const futureExamDate = new Date();
  futureExamDate.setDate(futureExamDate.getDate() + 14);
  if (aiExamDateInput) aiExamDateInput.value = futureExamDate.toISOString().split('T')[0];

  const aiFileUpload = document.getElementById('ai-file-upload');
  const uploadFileBtnText = document.getElementById('upload-file-btn-text');

  // Syllabus PDF/TXT File Upload Listener
  if (aiFileUpload) {
    aiFileUpload.addEventListener('change', async (e) => {
      const file = e.target.files[0];
      if (!file) return;

      if (uploadFileBtnText) uploadFileBtnText.innerText = 'Extracting PDF...';

      const formData = new FormData();
      formData.append('file', file);

      try {
        const token = ApiClient.getToken();
        const response = await fetch('/api/planner/upload-syllabus', {
          method: 'POST',
          headers: token ? { 'Authorization': `Bearer ${token}` } : {},
          body: formData
        });

        const data = await response.json();
        if (data.success && data.syllabusText) {
          aiSyllabusInput.value = data.syllabusText;
          aiSyllabusInput.dispatchEvent(new Event('input'));
          if (uploadFileBtnText) uploadFileBtnText.innerText = `✓ ${file.name.substring(0, 15)}...`;
          
          // Flash textarea to indicate success
          aiSyllabusInput.style.borderColor = 'var(--success)';
          setTimeout(() => { aiSyllabusInput.style.borderColor = ''; }, 2500);
          if (window.Toast) Toast.success('Syllabus Extracted! 📄', `Extracted text from ${file.name}`);
        } else {
          if (window.Toast) Toast.error('Upload Error', data.message || 'Failed to extract text from syllabus document.');
          if (uploadFileBtnText) uploadFileBtnText.innerText = 'Upload PDF/TXT';
        }
      } catch (err) {
        if (window.Toast) Toast.error('File Upload Error', err.message);
        if (uploadFileBtnText) uploadFileBtnText.innerText = 'Upload PDF/TXT';
      }
    });
  }

  // AI Modal Handlers
  if (openAiModalBtn) {
    openAiModalBtn.addEventListener('click', () => aiModal.classList.add('active'));
  }
  if (closeAiModalBtn) {
    closeAiModalBtn.addEventListener('click', () => aiModal.classList.remove('active'));
  }
  if (cancelAiModalBtn) {
    cancelAiModalBtn.addEventListener('click', () => aiModal.classList.remove('active'));
  }

  // Task Shimmer Skeleton Loader
  function renderTaskSkeletons(count = 4) {
    if (!taskListEl) return;
    if (emptyStateEl) emptyStateEl.style.display = 'none';
    let html = '';
    for (let i = 0; i < count; i++) {
      html += `
        <div class="skeleton-task-card">
          <div class="skeleton-task-content">
            <div class="skeleton skeleton-checkbox"></div>
            <div class="skeleton-task-lines">
              <div style="display: flex; gap: 0.5rem; align-items: center;">
                <div class="skeleton skeleton-pill" style="width: ${55 + (i % 3) * 15}px;"></div>
                <div class="skeleton skeleton-title-line" style="width: ${50 + (i % 2) * 20}%;"></div>
              </div>
              <div class="skeleton skeleton-date-line"></div>
            </div>
          </div>
          <div class="skeleton-actions">
            <div class="skeleton skeleton-btn"></div>
          </div>
        </div>
      `;
    }
    taskListEl.innerHTML = html;
  }

  // Load Tasks
  async function fetchTasks() {
    renderTaskSkeletons();
    try {
      const data = await ApiClient.get('/planner/tasks');
      if (data.success) {
        allTasks = data.tasks || [];
        renderTasks();
        updateCountdownWidget();
        checkRebalanceStatus();
      }
    } catch (err) {
      console.error('Failed to load tasks:', err);
      if (window.Toast) Toast.error('Tasks Error', 'Failed to load study tasks.');
    }
  }

  const recentCompletedTimeouts = new Map();

  // Render Tasks according to filter
  function renderTasks() {
    taskListEl.innerHTML = '';

    const filtered = allTasks.filter(task => {
      if (currentFilter === 'completed') return task.completed;
      if (currentFilter === 'pending') return !task.completed;
      if (currentFilter === 'High' || currentFilter === 'Medium' || currentFilter === 'Low') {
        if (task.priority !== currentFilter) return false;
        if (task.completed && !recentCompletedTimeouts.has(Number(task.id)) && !recentCompletedTimeouts.has(String(task.id))) return false;
        return true;
      }
      // 'all' filter: show pending tasks, and show completed tasks only during the 3s auto-remove window
      if (task.completed && !recentCompletedTimeouts.has(Number(task.id)) && !recentCompletedTimeouts.has(String(task.id))) return false;
      return true;
    });

    if (filtered.length === 0) {
      emptyStateEl.style.display = 'block';
    } else {
      emptyStateEl.style.display = 'none';
    }

    filtered.forEach(task => {
      const item = document.createElement('div');
      item.className = `task-item ${task.completed ? 'completed' : ''}`;
      item.setAttribute('data-id', task.id);
      
      const badgeClass = task.priority === 'High' ? 'badge-high' : (task.priority === 'Medium' ? 'badge-medium' : 'badge-low');

      item.innerHTML = `
        <div style="display: flex; align-items: center; gap: 0.85rem; flex: 1;">
          <input type="checkbox" class="task-checkbox" ${task.completed ? 'checked' : ''} data-id="${task.id}" title="Toggle Task Completion">
          <div>
            <div class="task-title-text" style="font-weight: 600; font-size: 0.98rem;">${escapeHtml(task.title)}</div>
            <div style="display: flex; align-items: center; gap: 0.5rem; font-size: 0.82rem; color: var(--text-muted); margin-top: 0.2rem; flex-wrap: wrap;">
              <span style="color: var(--primary); font-weight: 500;">${escapeHtml(task.subject)}</span>
              <span>•</span>
              <span>${task.date}</span>
              <span>•</span>
              <span>${task.duration_minutes} mins</span>
              ${task.ai_generated ? '<span class="badge badge-ai"><i data-lucide="sparkles" style="width:10px; height:10px;"></i> AI</span>' : ''}
              ${(!task.completed && task.date < todayStr) ? '<span class="badge" style="background: rgba(239, 68, 68, 0.2); color: #f87171; border: 1px solid rgba(239, 68, 68, 0.4);"><i data-lucide="alert-circle" style="width:10px; height:10px;"></i> Overdue</span>' : ''}
              ${task.is_rebalanced ? `<span class="badge" style="background: rgba(245, 158, 11, 0.2); color: #fbbf24; border: 1px solid rgba(245, 158, 11, 0.4); font-size: 0.72rem;" title="Rescheduled from ${escapeHtml(task.original_date || '')}"><i data-lucide="scale" style="width:10px; height:10px;"></i> Rescheduled</span>` : ''}
            </div>
          </div>
        </div>
        <div style="display: flex; align-items: center; gap: 0.5rem; flex-wrap: wrap;">
          <span class="badge ${badgeClass}">${task.priority}</span>
          ${!task.completed ? `
            ${(!task.completed && task.date < todayStr) ? `
              <button class="btn btn-sm btn-glass task-today-btn" data-id="${task.id}" title="Reschedule overdue task to today" style="color: #60a5fa; border-color: rgba(96, 165, 250, 0.35); padding: 0.35rem 0.65rem;">
                <i data-lucide="calendar-plus" style="width:13px; height:13px;"></i> Today
              </button>
            ` : `
              <button class="btn btn-sm btn-glass task-reschedule-btn" data-id="${task.id}" data-push="1" title="Push task to tomorrow (+1 day)" style="padding: 0.35rem 0.65rem;">
                <i data-lucide="calendar-arrow-up" style="width:13px; height:13px;"></i> +1d
              </button>
            `}
            <button class="btn btn-sm btn-glass task-extend-btn" data-id="${task.id}" data-extend="15" title="Extend duration by 15 mins" style="padding: 0.35rem 0.65rem;">
              <i data-lucide="clock" style="width:13px; height:13px;"></i> +15m
            </button>
          ` : ''}
          <button class="btn btn-sm ${task.completed ? 'btn-glass' : 'btn-success'} complete-task-btn" data-id="${task.id}" data-completed="${task.completed ? 1 : 0}">
            ${task.completed ? '<i data-lucide="rotate-ccw" style="width:14px; height:14px;"></i> Undo' : '<i data-lucide="check-circle" style="width:14px; height:14px;"></i> Done'}
          </button>
          <button class="delete-task-btn" data-id="${task.id}" title="Delete Task" style="background: none; border: none; color: var(--text-dim); cursor: pointer; padding: 0.25rem;">
            <i data-lucide="trash-2" style="width:16px; height:16px;"></i>
          </button>
        </div>
      `;

      taskListEl.appendChild(item);
    });

    lucide.createIcons();
    attachTaskEventListeners();

    // Update ratio in header
    const completedCount = allTasks.filter(t => t.completed).length;
    if (taskProgressRatioEl) {
      taskProgressRatioEl.innerText = `${completedCount} / ${allTasks.length}`;
    }
  }

  // Reschedule or Extend Study Task Helper
  async function handleRescheduleOrExtend(taskId, payload, actionName) {
    try {
      const res = await ApiClient.post(`/planner/tasks/${taskId}/reschedule`, payload);
      if (res.success && res.task) {
        const idx = allTasks.findIndex(t => t.id == taskId);
        if (idx !== -1) allTasks[idx] = res.task;
        renderTasks();
        updateCountdownWidget();
        fetchTimetable();
        checkRebalanceStatus();
        if (window.Toast) Toast.success(actionName || 'Task Updated! 📅', res.message || 'Task schedule updated successfully.');
      } else {
        if (window.Toast) Toast.error('Update Failed', res.message || 'Could not update task schedule.');
      }
    } catch (err) {
      console.error('Failed to reschedule/extend task:', err);
      if (window.Toast) Toast.error('Update Error', err.message);
    }
  }

  // Toggle completion status for a task
  async function toggleTaskCompletion(taskId, shouldComplete) {
    try {
      const res = await ApiClient.put(`/planner/tasks/${taskId}`, { completed: shouldComplete });
      if (res.success) {
        const target = allTasks.find(t => t.id == taskId);
        if (target) target.completed = shouldComplete ? 1 : 0;

        // Reactive streak update directly in navbar
        if (res.streak !== undefined) {
          const streakEl = document.getElementById('header-streak-count');
          if (streakEl) {
            streakEl.innerText = res.streak;
            const streakPill = streakEl.closest('.streak-pill');
            if (streakPill) {
              if (res.streak > 0) streakPill.classList.add('streak-active');
              else streakPill.classList.remove('streak-active');
            }
          }
        }

        if (shouldComplete) {
          // Clear any existing timer for this task
          if (recentCompletedTimeouts.has(taskId)) {
            clearTimeout(recentCompletedTimeouts.get(taskId));
          }

          // Register 3-second auto-removal window
          const timer = setTimeout(() => {
            const el = document.querySelector(`.task-item[data-id="${taskId}"]`);
            if (el) {
              el.classList.add('task-item-fading');
              setTimeout(() => {
                recentCompletedTimeouts.delete(taskId);
                renderTasks();
              }, 450);
            } else {
              recentCompletedTimeouts.delete(taskId);
              renderTasks();
            }
          }, 3000);

          recentCompletedTimeouts.set(taskId, timer);

          renderTasks();

          if (window.confetti) {
            window.confetti({
              particleCount: 80,
              spread: 70,
              origin: { y: 0.6 }
            });
          }

          if (window.Toast) {
            Toast.xp(res.xpGained || 100, `Task Completed! Streak: ${res.streak || 1} Days 🔥`);
          }
        } else {
          // Undo completion
          if (recentCompletedTimeouts.has(taskId)) {
            clearTimeout(recentCompletedTimeouts.get(taskId));
            recentCompletedTimeouts.delete(taskId);
          }
          renderTasks();
          if (window.Toast) {
            Toast.info('Task Reopened', 'Task marked incomplete.');
          }
        }

        if (window.loadUserProfile) window.loadUserProfile();
        checkRebalanceStatus();
        fetchTimetable();
      }
    } catch (err) {
      console.error('Failed to update task completion:', err);
    }
  }

  // Attach Checkbox, Complete Button, Quick Actions, and Delete button listeners
  function attachTaskEventListeners() {
    document.querySelectorAll('.task-checkbox').forEach(cb => {
      cb.addEventListener('change', (e) => {
        const taskId = e.target.getAttribute('data-id');
        toggleTaskCompletion(taskId, e.target.checked);
      });
    });

    document.querySelectorAll('.complete-task-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const taskId = btn.getAttribute('data-id');
        const isCurrentlyCompleted = Number(btn.getAttribute('data-completed')) === 1;
        toggleTaskCompletion(taskId, !isCurrentlyCompleted);
      });
    });

    // Quick Action: Reschedule overdue task to today
    document.querySelectorAll('.task-today-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const taskId = btn.getAttribute('data-id');
        if (taskId) {
          handleRescheduleOrExtend(taskId, { newDate: todayStr }, 'Rescheduled to Today! 📅');
        }
      });
    });

    // Quick Action: Push task to tomorrow (+1 day)
    document.querySelectorAll('.task-reschedule-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const taskId = btn.getAttribute('data-id');
        const pushDays = Number(btn.getAttribute('data-push')) || 1;
        if (taskId) {
          handleRescheduleOrExtend(taskId, { pushDays: pushDays }, 'Pushed to Tomorrow! 📅');
        }
      });
    });

    // Quick Action: Extend duration (+15 mins)
    document.querySelectorAll('.task-extend-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const taskId = btn.getAttribute('data-id');
        const extendMins = Number(btn.getAttribute('data-extend')) || 15;
        if (taskId) {
          handleRescheduleOrExtend(taskId, { extendMinutes: extendMins }, 'Duration Extended (+15m)! ⏱️');
        }
      });
    });

    document.querySelectorAll('.delete-task-btn').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        const taskId = btn.getAttribute('data-id');
        const confirmed = window.Toast ? await Toast.confirm({
          title: 'Delete Study Task?',
          message: 'Are you sure you want to delete this study task? This cannot be undone.',
          confirmText: 'Delete Task',
          danger: true,
          icon: 'trash-2'
        }) : confirm('Are you sure you want to delete this study task?');

        if (!confirmed) return;

        try {
          const res = await ApiClient.delete(`/planner/tasks/${taskId}`);
          if (res.success) {
            allTasks = allTasks.filter(t => t.id != taskId);
            renderTasks();
            updateCountdownWidget();
            checkRebalanceStatus();
            fetchTimetable();
            if (window.Toast) Toast.info('Task Removed', 'Study task deleted.');
          }
        } catch (err) {
          console.error('Failed to delete task:', err);
          if (window.Toast) Toast.error('Delete Failed', err.message);
        }
      });
    });
  }

  // Update Countdown Widget
  function updateCountdownWidget() {
    if (allTasks.length === 0) {
      if (countdownDaysEl) countdownDaysEl.innerText = '--';
      if (examTitleEl) examTitleEl.innerText = 'No Target Exam Configured';
      return;
    }

    // Find the latest task date as exam target date
    const dates = allTasks.map(t => new Date(t.date)).filter(d => !isNaN(d));
    if (dates.length === 0) return;

    const maxDate = new Date(Math.max(...dates));
    const today = new Date();
    const diffTime = maxDate - today;
    const daysLeft = Math.max(0, Math.ceil(diffTime / (1000 * 60 * 60 * 24)));

    if (countdownDaysEl) countdownDaysEl.innerText = daysLeft;
    if (examTitleEl) examTitleEl.innerText = `Exam Target: ${maxDate.toISOString().split('T')[0]}`;
  }

  // Filter Buttons
  document.querySelectorAll('.task-filter-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.task-filter-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      currentFilter = btn.getAttribute('data-filter');
      renderTasks();
    });
  });

  // Custom Task Submit
  if (customTaskForm) {
    customTaskForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const title = taskTitleInput.value.trim();
      const subject = taskSubjectInput.value.trim();
      const date = taskDateInput.value;
      const priority = taskPriorityInput.value;

      if (!title || !subject || !date) return;

      try {
        const res = await ApiClient.post('/planner/tasks', {
          title,
          subject,
          date,
          priority,
          duration_minutes: 45
        });

        if (res.success && res.task) {
          allTasks.push(res.task);
          renderTasks();
          updateCountdownWidget();
          fetchTimetable();
          taskTitleInput.value = '';
          taskSubjectInput.value = '';
          if (window.Toast) Toast.success('Task Added! 📌', `"${res.task.title}" added to your study schedule.`);
        }
      } catch (err) {
        if (window.Toast) Toast.error('Task Error', err.message);
      }
    });
  }

  // AI Schedule Generator Submit
  if (aiForm) {
    aiForm.addEventListener('submit', async (e) => {
      e.preventDefault();

      const syllabus = aiSyllabusInput.value.trim();
      const examDate = aiExamDateInput.value;
      const dailyHours = Number(aiDailyHoursInput.value) || 3;

      if (!syllabus || !examDate) return;

      generateAiSubmitBtn.disabled = true;
      aiBtnText.innerText = 'Generating Schedule...';

      try {
        const localKey = localStorage.getItem('studysync_gemini_key') || '';
        const res = await ApiClient.post('/planner/generate', {
          syllabus,
          examDate,
          dailyHours,
          apiKey: localKey
        });

        if (res.success && res.tasks) {
          allTasks = [...allTasks, ...res.tasks];
          renderTasks();
          updateCountdownWidget();
          fetchTimetable();
          aiModal.classList.remove('active');
          aiSyllabusInput.value = '';

          if (window.confetti) {
            window.confetti({ particleCount: 100, spread: 80, origin: { y: 0.5 } });
          }

          if (window.Toast) Toast.success('AI Schedule Generated! 🚀', `Successfully created ${res.tasks.length} optimized daily study tasks.`);
        }
      } catch (err) {
        if (window.Toast) Toast.error('AI Schedule Error', err.message);
      } finally {
        generateAiSubmitBtn.disabled = false;
        aiBtnText.innerText = 'Generate Schedule';
      }
    });
  }

  function escapeHtml(str) {
    return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  // Timetable UI Elements
  const viewTasksBtn = document.getElementById('view-mode-tasks-btn');
  const viewTimetableBtn = document.getElementById('view-mode-timetable-btn');
  const taskFiltersContainer = document.getElementById('task-filters-container');
  const timetableControlsContainer = document.getElementById('timetable-controls-container');
  const taskBoardView = document.getElementById('task-board-view');
  const timetableView = document.getElementById('timetable-view');
  const timetableListEl = document.getElementById('timetable-list');
  const timetableEmptyStateEl = document.getElementById('timetable-empty-state');
  const refreshTimetableBtn = document.getElementById('refresh-timetable-btn');

  // Routine Modal Elements
  const openRoutineConfigBtn = document.getElementById('open-routine-config-btn');
  const closeRoutineModalBtn = document.getElementById('close-routine-modal-btn');
  const cancelRoutineModalBtn = document.getElementById('cancel-routine-modal-btn');
  const routineConfigModal = document.getElementById('routine-config-modal');
  const routineConfigForm = document.getElementById('routine-config-form');

  const routineSchoolStart = document.getElementById('routine-school-start');
  const routineSchoolEnd = document.getElementById('routine-school-end');
  const routineLunchStart = document.getElementById('routine-lunch-start');
  const routineLunchEnd = document.getElementById('routine-lunch-end');
  const routineSnackStart = document.getElementById('routine-snack-start');
  const routineSnackEnd = document.getElementById('routine-snack-end');
  const routineDinnerStart = document.getElementById('routine-dinner-start');
  const routineDinnerEnd = document.getElementById('routine-dinner-end');
  const routineSleepStart = document.getElementById('routine-sleep-start');
  const routineShortBreak = document.getElementById('routine-short-break');
  const routineMaxStudy = document.getElementById('routine-max-study');

  let currentViewMode = 'tasks';

  // View Mode Switcher
  if (viewTasksBtn && viewTimetableBtn) {
    viewTasksBtn.addEventListener('click', () => {
      currentViewMode = 'tasks';
      viewTasksBtn.classList.add('active');
      viewTasksBtn.classList.remove('btn-glass');
      viewTimetableBtn.classList.remove('active');
      viewTimetableBtn.classList.add('btn-glass');

      taskFiltersContainer.style.display = 'flex';
      timetableControlsContainer.style.display = 'none';
      taskBoardView.style.display = 'block';
      timetableView.style.display = 'none';
    });

    viewTimetableBtn.addEventListener('click', () => {
      currentViewMode = 'timetable';
      viewTimetableBtn.classList.add('active');
      viewTimetableBtn.classList.remove('btn-glass');
      viewTasksBtn.classList.remove('active');
      viewTasksBtn.classList.add('btn-glass');

      taskFiltersContainer.style.display = 'none';
      timetableControlsContainer.style.display = 'flex';
      taskBoardView.style.display = 'none';
      timetableView.style.display = 'block';

      fetchTimetable();
    });
  }

  // Timetable Shimmer Skeleton Loader
  function renderTimetableSkeletons(count = 5) {
    if (!timetableListEl) return;
    if (timetableEmptyStateEl) timetableEmptyStateEl.style.display = 'none';
    let html = '';
    for (let i = 0; i < count; i++) {
      html += `
        <div class="skeleton-timetable-slot">
          <div class="skeleton skeleton-time-col"></div>
          <div class="skeleton skeleton-btn" style="border-radius: 12px; width: 40px; height: 40px; flex-shrink: 0;"></div>
          <div class="skeleton-slot-info">
            <div class="skeleton skeleton-slot-title" style="width: ${40 + (i % 3) * 15}%;"></div>
            <div class="skeleton skeleton-slot-subtitle"></div>
          </div>
        </div>
      `;
    }
    timetableListEl.innerHTML = html;
  }

  // Fetch Daily Timetable
  async function fetchTimetable() {
    if (!timetableListEl) return;
    renderTimetableSkeletons();

    try {
      const res = await ApiClient.get('/planner/timetable');
      if (res.success && Array.isArray(res.timetable)) {
        renderTimetable(res.timetable, res.stats);
      } else {
        if (timetableEmptyStateEl) timetableEmptyStateEl.style.display = 'block';
      }
    } catch (err) {
      console.error('Failed to fetch timetable:', err);
      if (timetableListEl) timetableListEl.innerHTML = '<div style="text-align:center; color: var(--danger); padding: 1.5rem;">Failed to load timetable.</div>';
      if (window.Toast) Toast.error('Timetable Error', 'Could not load timetable.');
    }
  }

  // Render Timetable List
  function renderTimetable(timetable, stats) {
    timetableListEl.innerHTML = '';

    if (!timetable || timetable.length === 0) {
      if (timetableEmptyStateEl) timetableEmptyStateEl.style.display = 'block';
      return;
    }

    if (timetableEmptyStateEl) timetableEmptyStateEl.style.display = 'none';

    // 1. Daily Study Stats Banner
    if (stats) {
      const banner = document.createElement('div');
      if (stats.allTodayCompleted) {
        banner.className = 'timetable-summary-banner';
        banner.style.borderColor = 'rgba(16, 185, 129, 0.4)';
        banner.style.background = 'rgba(16, 185, 129, 0.12)';
        banner.innerHTML = `
          <div style="display: flex; align-items: center; gap: 0.6rem; color: #6ee7b7; font-weight: 600; font-size: 0.92rem;">
            <i data-lucide="check-circle-2" style="width:20px; height:20px; color: #10b981;"></i>
            <span>🎉 All planned study tasks for today are completed! Daily streak preserved!</span>
          </div>
          <div class="timetable-summary-pill" style="color: #6ee7b7; border: 1px solid rgba(16, 185, 129, 0.35);">
            <i data-lucide="award" style="width:14px; height:14px;"></i>
            <span>${stats.todayCompletedCount} / ${stats.todayTasksCount} Tasks Done</span>
          </div>
        `;
      } else if (stats.totalStudySlots > 0) {
        banner.className = 'timetable-summary-banner';
        banner.innerHTML = `
          <div style="display: flex; align-items: center; gap: 0.6rem; color: #e2e8f0; font-weight: 600; font-size: 0.92rem;">
            <i data-lucide="calendar" style="width:18px; height:18px; color: var(--primary);"></i>
            <span>Today's Study Schedule</span>
          </div>
          <div style="display: flex; align-items: center; gap: 0.5rem; flex-wrap: wrap;">
            <span class="timetable-summary-pill" style="color: #93c5fd;">
              <i data-lucide="book-open" style="width:13px; height:13px;"></i>
              ${stats.todayTasksCount || stats.totalStudySlots} Planned
            </span>
            <span class="timetable-summary-pill" style="color: #6ee7b7;">
              <i data-lucide="check" style="width:13px; height:13px;"></i>
              ${stats.todayCompletedCount || stats.completedStudySlots} Done
            </span>
            <span class="timetable-summary-pill" style="color: #fde047;">
              <i data-lucide="clock" style="width:13px; height:13px;"></i>
              ${stats.pendingStudySlots} Pending
            </span>
            ${stats.overdueCount > 0 ? `
              <span class="timetable-summary-pill" style="color: #fca5a5; border-color: rgba(239, 68, 68, 0.4);">
                <i data-lucide="alert-circle" style="width:13px; height:13px;"></i>
                ${stats.overdueCount} Overdue
              </span>
            ` : ''}
          </div>
        `;
      }
      if (stats.allTodayCompleted || stats.totalStudySlots > 0) {
        timetableListEl.appendChild(banner);
      }
    }

    const hasStudyTasks = timetable.some(s => s.type === 'study');
    if (!hasStudyTasks) {
      const banner = document.createElement('div');
      banner.style.cssText = 'padding: 0.85rem 1.25rem; background: rgba(99, 102, 241, 0.15); border: 1px solid rgba(99, 102, 241, 0.3); border-radius: var(--radius-md); color: #a5b4fc; font-size: 0.88rem; margin-bottom: 1rem; display: flex; align-items: center; gap: 0.5rem;';
      banner.innerHTML = `<i data-lucide="info" style="width:18px; height:18px; flex-shrink:0;"></i> <span>No active study tasks scheduled. Click <strong>Generate AI Schedule</strong> or <strong>Add Task</strong> to populate your daily study timetable!</span>`;
      timetableListEl.appendChild(banner);
    }

    timetable.forEach(slot => {
      const item = document.createElement('div');
      const isCompletedStudy = slot.type === 'study' && slot.completed;
      const slotClass = `slot-type-${slot.type || 'free'}`;
      const iconClass = `slot-icon-${slot.type || 'free'}`;
      const liveClass = slot.isLive ? 'live-slot' : '';
      const completedClass = isCompletedStudy ? 'slot-completed' : '';

      item.className = `timetable-item ${slotClass} ${liveClass} ${completedClass}`;

      let iconName = 'book-open';
      if (slot.type === 'school') iconName = 'graduation-cap';
      else if (slot.type === 'lunch') iconName = 'utensils';
      else if (slot.type === 'snack') iconName = 'coffee';
      else if (slot.type === 'dinner') iconName = 'sandwich';
      else if (slot.type === 'break') iconName = 'cup-soda';
      else if (slot.type === 'free') iconName = 'smile';
      else if (slot.type === 'study' && slot.completed) iconName = 'check-circle-2';

      let priorityBadge = '';
      if (slot.priority) {
        const badgeClass = slot.priority === 'High' ? 'badge-high' : (slot.priority === 'Medium' ? 'badge-medium' : 'badge-low');
        priorityBadge = `<span class="badge ${badgeClass}" style="margin-left: 0.4rem;">${slot.priority}</span>`;
      }

      let liveBadge = slot.isLive ? `<span class="live-now-badge">● Live Now</span>` : '';
      let statusBadge = '';
      if (isCompletedStudy) {
        statusBadge = `<span class="badge" style="background: rgba(16, 185, 129, 0.2); color: #6ee7b7; border: 1px solid rgba(16, 185, 129, 0.4);"><i data-lucide="check" style="width:11px; height:11px;"></i> Done</span>`;
      } else if (slot.isOverdue) {
        statusBadge = `<span class="badge" style="background: rgba(239, 68, 68, 0.2); color: #f87171; border: 1px solid rgba(239, 68, 68, 0.4);"><i data-lucide="alert-circle" style="width:11px; height:11px;"></i> Overdue</span>`;
      }

      let actionButtons = '';
      if (slot.type === 'study' && slot.taskId) {
        if (slot.completed) {
          actionButtons = `
            <div class="timetable-slot-actions">
              <button class="btn btn-sm btn-glass timetable-undo-btn" data-id="${slot.taskId}" title="Undo completion">
                <i data-lucide="rotate-ccw" style="width:13px; height:13px;"></i> Undo
              </button>
            </div>
          `;
        } else {
          actionButtons = `
            <div class="timetable-slot-actions">
              <button class="btn btn-sm btn-success timetable-done-btn" data-id="${slot.taskId}" title="Mark completed and earn XP">
                <i data-lucide="check-circle" style="width:13px; height:13px;"></i> Done
              </button>
              <button class="btn btn-sm btn-glass timetable-extend-btn" data-id="${slot.taskId}" data-extend="15" title="Extend duration (+15 mins)">
                <i data-lucide="clock" style="width:13px; height:13px;"></i> +15m
              </button>
              <button class="btn btn-sm btn-glass timetable-push-btn" data-id="${slot.taskId}" data-push="1" title="Push to tomorrow (+1 day)">
                <i data-lucide="calendar-arrow-up" style="width:13px; height:13px;"></i> +1d
              </button>
            </div>
          `;
        }
      }

      item.innerHTML = `
        <div class="timetable-time-badge">
          <div>${slot.startTime}</div>
          <div style="font-size: 0.7rem; opacity: 0.7; font-weight: 500;">to ${slot.endTime}</div>
        </div>
        <div class="timetable-icon-badge ${iconClass}">
          <i data-lucide="${iconName}" style="width:20px; height:20px;"></i>
        </div>
        <div style="flex: 1; min-width: 0;">
          <div style="display: flex; align-items: center; justify-content: space-between; gap: 0.5rem; flex-wrap: wrap;">
            <div style="font-weight: 600; font-size: 0.98rem; display: flex; align-items: center; gap: 0.4rem; flex-wrap: wrap;">
              <span class="timetable-slot-title">${escapeHtml(slot.title)}</span>
              ${priorityBadge}
              ${statusBadge}
            </div>
            ${liveBadge}
          </div>
          <div style="display: flex; align-items: center; gap: 0.5rem; font-size: 0.82rem; color: var(--text-muted); margin-top: 0.2rem; flex-wrap: wrap;">
            <span style="color: var(--primary); font-weight: 500;">${escapeHtml(slot.rawSubject || slot.subject)}</span>
            <span>•</span>
            <span>${slot.duration_minutes} Mins Duration</span>
            ${slot.taskDate ? `<span>•</span><span>${slot.taskDate}</span>` : ''}
          </div>
        </div>
        ${actionButtons}
      `;

      timetableListEl.appendChild(item);
    });

    lucide.createIcons();
    attachTimetableEventListeners();
  }

  // Attach Timetable Slot Interactive Listeners
  function attachTimetableEventListeners() {
    document.querySelectorAll('.timetable-done-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const taskId = btn.getAttribute('data-id');
        if (taskId) toggleTaskCompletion(taskId, true);
      });
    });

    document.querySelectorAll('.timetable-undo-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const taskId = btn.getAttribute('data-id');
        if (taskId) toggleTaskCompletion(taskId, false);
      });
    });

    document.querySelectorAll('.timetable-extend-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const taskId = btn.getAttribute('data-id');
        const extendMins = Number(btn.getAttribute('data-extend')) || 15;
        if (taskId) {
          handleRescheduleOrExtend(taskId, { extendMinutes: extendMins }, 'Duration Extended (+15m)! ⏱️');
        }
      });
    });

    document.querySelectorAll('.timetable-push-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const taskId = btn.getAttribute('data-id');
        const pushDays = Number(btn.getAttribute('data-push')) || 1;
        if (taskId) {
          handleRescheduleOrExtend(taskId, { pushDays: pushDays }, 'Rescheduled to Tomorrow! 📅');
        }
      });
    });
  }

  // Refresh Timetable Btn
  if (refreshTimetableBtn) {
    refreshTimetableBtn.addEventListener('click', () => fetchTimetable());
  }

  // Routine Modal Logic
  if (openRoutineConfigBtn && routineConfigModal) {
    openRoutineConfigBtn.addEventListener('click', async () => {
      routineConfigModal.classList.add('active');
      try {
        const res = await ApiClient.get('/planner/timetable/config');
        if (res.success && res.config) {
          const cfg = res.config;
          if (routineSchoolStart) routineSchoolStart.value = cfg.school_start || '08:00';
          if (routineSchoolEnd) routineSchoolEnd.value = cfg.school_end || '14:00';
          if (routineLunchStart) routineLunchStart.value = cfg.lunch_start || '14:00';
          if (routineLunchEnd) routineLunchEnd.value = cfg.lunch_end || '14:30';
          if (routineSnackStart) routineSnackStart.value = cfg.snack_start || '17:00';
          if (routineSnackEnd) routineSnackEnd.value = cfg.snack_end || '17:30';
          if (routineDinnerStart) routineDinnerStart.value = cfg.dinner_start || '20:30';
          if (routineDinnerEnd) routineDinnerEnd.value = cfg.dinner_end || '21:15';
          if (routineSleepStart) routineSleepStart.value = cfg.sleep_start || '22:30';
          if (routineShortBreak) routineShortBreak.value = cfg.short_break_mins || 10;
          if (routineMaxStudy) routineMaxStudy.value = cfg.max_daily_study_hours || 3;
        }
      } catch (err) {
        console.error('Failed to load routine config:', err);
      }
    });
  }

  const closeRoutineModal = () => routineConfigModal.classList.remove('active');
  if (closeRoutineModalBtn) closeRoutineModalBtn.addEventListener('click', closeRoutineModal);
  if (cancelRoutineModalBtn) cancelRoutineModalBtn.addEventListener('click', closeRoutineModal);

  // Submit Routine Settings Form
  if (routineConfigForm) {
    routineConfigForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      try {
        const res = await ApiClient.post('/planner/timetable/config', {
          school_start: routineSchoolStart.value,
          school_end: routineSchoolEnd.value,
          lunch_start: routineLunchStart.value,
          lunch_end: routineLunchEnd.value,
          snack_start: routineSnackStart.value,
          snack_end: routineSnackEnd.value,
          dinner_start: routineDinnerStart.value,
          dinner_end: routineDinnerEnd.value,
          sleep_start: routineSleepStart.value,
          short_break_mins: Number(routineShortBreak.value) || 10,
          max_daily_study_hours: Number(routineMaxStudy ? routineMaxStudy.value : 3) || 3
        });

        if (res.success) {
          closeRoutineModal();
          fetchTimetable();
          if (window.Toast) Toast.success('Routine Saved! ⏰', 'Daily timetable settings updated successfully.');
        }
      } catch (err) {
        if (window.Toast) Toast.error('Routine Error', err.message);
      }
    });
  }

  // ==========================================
  // DYNAMIC AI SYLLABUS REBALANCER MODULE
  // ==========================================
  const rebalanceAlertBanner = document.getElementById('rebalance-alert-banner');
  const rebalanceAlertTitle = document.getElementById('rebalance-alert-title');
  const rebalanceAlertSubtitle = document.getElementById('rebalance-alert-subtitle');
  const bannerRebalanceBtn = document.getElementById('banner-rebalance-btn');
  const bannerSickdayBtn = document.getElementById('banner-sickday-btn');
  const openRebalanceModalBtn = document.getElementById('open-rebalance-modal-btn');
  const closeRebalanceModalBtn = document.getElementById('close-rebalance-modal-btn');
  const cancelRebalanceModalBtn = document.getElementById('cancel-rebalance-modal-btn');
  const rebalanceModal = document.getElementById('rebalance-modal');
  const rebalanceForm = document.getElementById('rebalance-form');
  const modalOverdueCount = document.getElementById('modal-overdue-count');
  const modalOverdueHours = document.getElementById('modal-overdue-hours');
  const modalDaysLeft = document.getElementById('modal-days-left');
  const modalReqHours = document.getElementById('modal-req-hours');
  const rebalanceExamDate = document.getElementById('rebalance-exam-date');
  const rebalanceDailyHours = document.getElementById('rebalance-daily-hours');
  const rebalanceModeSelect = document.getElementById('rebalance-mode-select');
  const sickDayToggle = document.getElementById('sick-day-toggle');
  const sickDayContainer = document.getElementById('sick-day-container');
  const sickDayDateInput = document.getElementById('sick-day-date-input');
  const submitRebalanceBtn = document.getElementById('submit-rebalance-btn');
  const rebalanceBtnText = document.getElementById('rebalance-btn-text');

  async function checkRebalanceStatus() {
    try {
      const res = await ApiClient.get('/planner/rebalance/status');
      if (res.success) {
        if (res.hasDeficit) {
          if (rebalanceAlertBanner) rebalanceAlertBanner.style.display = 'flex';
          if (rebalanceAlertTitle) {
            rebalanceAlertTitle.innerText = `${res.overdueCount} Overdue Study Task${res.overdueCount > 1 ? 's' : ''} (${res.overdueHours} hrs) Detected!`;
          }
          if (rebalanceAlertSubtitle) {
            rebalanceAlertSubtitle.innerText = `You have unfinished tasks from previous days. Let AI redistribute them evenly across your ${res.daysUntilExam} remaining days to avoid cramming.`;
          }
        } else {
          if (rebalanceAlertBanner) rebalanceAlertBanner.style.display = 'none';
        }

        // Update modal stats & inputs
        if (modalOverdueCount) modalOverdueCount.innerText = String(res.overdueCount);
        if (modalOverdueHours) modalOverdueHours.innerText = `${res.overdueHours}h`;
        if (modalDaysLeft) modalDaysLeft.innerText = `${res.daysUntilExam}d`;
        if (modalReqHours) modalReqHours.innerText = `~${res.requiredDailyHours}h/d`;
        if (rebalanceExamDate && !rebalanceExamDate.value) rebalanceExamDate.value = res.targetExamDate;
        if (rebalanceDailyHours) rebalanceDailyHours.value = res.maxDailyHours;
      }
    } catch (err) {
      console.warn('Could not check rebalance status:', err.message);
    }
  }

  function openRebalanceModal(isSickDay = false) {
    if (!rebalanceModal) return;
    rebalanceModal.classList.add('active');
    checkRebalanceStatus();

    if (isSickDay && sickDayToggle && sickDayDateInput) {
      sickDayToggle.checked = true;
      sickDayContainer.style.display = 'block';
      sickDayDateInput.value = todayStr;
    } else if (sickDayToggle && !isSickDay) {
      sickDayToggle.checked = false;
      if (sickDayContainer) sickDayContainer.style.display = 'none';
    }
  }

  function closeRebalanceModal() {
    if (rebalanceModal) rebalanceModal.classList.remove('active');
  }

  if (openRebalanceModalBtn) {
    openRebalanceModalBtn.addEventListener('click', () => openRebalanceModal(false));
  }
  if (bannerRebalanceBtn) {
    bannerRebalanceBtn.addEventListener('click', () => openRebalanceModal(false));
  }
  if (bannerSickdayBtn) {
    bannerSickdayBtn.addEventListener('click', () => openRebalanceModal(true));
  }
  if (closeRebalanceModalBtn) {
    closeRebalanceModalBtn.addEventListener('click', closeRebalanceModal);
  }
  if (cancelRebalanceModalBtn) {
    cancelRebalanceModalBtn.addEventListener('click', closeRebalanceModal);
  }

  if (sickDayToggle && sickDayContainer && sickDayDateInput) {
    sickDayToggle.addEventListener('change', () => {
      if (sickDayToggle.checked) {
        sickDayContainer.style.display = 'block';
        if (!sickDayDateInput.value) sickDayDateInput.value = todayStr;
      } else {
        sickDayContainer.style.display = 'none';
      }
    });
  }

  if (rebalanceForm) {
    rebalanceForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const examDate = rebalanceExamDate.value;
      const dailyHours = Number(rebalanceDailyHours.value) || 3;
      const mode = rebalanceModeSelect.value || 'even';
      const sickDay = (sickDayToggle && sickDayToggle.checked) ? sickDayDateInput.value : null;

      if (!examDate) {
        if (window.Toast) Toast.warning('Missing Date', 'Please specify a target exam date.');
        else alert('Please specify a target exam date.');
        return;
      }

      if (submitRebalanceBtn) submitRebalanceBtn.disabled = true;
      if (rebalanceBtnText) rebalanceBtnText.innerText = 'Rebalancing Schedule...';

      try {
        const res = await ApiClient.post('/planner/rebalance', {
          targetExamDate: examDate,
          dailyHours,
          mode,
          sickDayDate: sickDay
        });

        if (res.success) {
          closeRebalanceModal();
          allTasks = res.tasks || [];
          renderTasks();
          updateCountdownWidget();
          fetchTimetable();
          checkRebalanceStatus();

          if (window.confetti) {
            window.confetti({ particleCount: 100, spread: 80, origin: { y: 0.5 } });
          }

          if (window.Toast) Toast.success('Schedule Rebalanced! ⚖️', res.message);
        } else {
          if (window.Toast) Toast.error('Rebalance Failed', res.message || 'Failed to rebalance schedule.');
        }
      } catch (err) {
        if (window.Toast) Toast.error('Rebalance Error', err.message);
      } finally {
        if (submitRebalanceBtn) submitRebalanceBtn.disabled = false;
        if (rebalanceBtnText) rebalanceBtnText.innerText = 'Confirm & Rebalance Schedule';
      }
    });
  }

  // Initial Fetch
  fetchTasks();
  fetchTimetable();
});
