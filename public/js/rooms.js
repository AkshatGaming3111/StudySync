// StudySync Multiplayer Focus Rooms Module
(function () {
  let activeRoom = null;
  let heartbeatTimer = null;

  async function loadRooms() {
    const listContainer = document.getElementById('study-rooms-list');
    if (!listContainer) return;

    try {
      const res = await ApiClient.get('/rooms');
      if (res && res.success) {
        renderRooms(res.rooms || []);
      }
    } catch (err) {
      console.warn('Rooms load error:', err.message);
    }
  }

  function renderRooms(rooms) {
    const listContainer = document.getElementById('study-rooms-list');
    if (!listContainer) return;

    if (!rooms || rooms.length === 0) {
      listContainer.innerHTML = '<p class="text-muted">No active study rooms available.</p>';
      return;
    }

    listContainer.innerHTML = rooms.map(r => `
      <div class="room-card glassmorphic-subcard ${activeRoom && activeRoom.id === r.id ? 'active-room' : ''}">
        <div class="room-header-row">
          <div class="room-title-block">
            <span class="room-icon-box"><i data-lucide="${r.icon || 'book-open'}"></i></span>
            <div>
              <h4 class="room-name">${r.name}</h4>
              <span class="room-category-pill">${r.category}</span>
            </div>
          </div>
          <div class="room-active-pill">
            <span class="pulse-green-dot"></span>
            <span>${r.activeMembersCount || 0} studying</span>
          </div>
        </div>

        <p class="room-desc">${r.description || 'Silent peer co-working room.'}</p>

        <div class="room-action-row">
          ${activeRoom && activeRoom.id === r.id ? `
            <button class="btn btn-secondary btn-sm leave-room-btn" data-id="${r.id}">
              <i data-lucide="log-out" style="width: 13px; height: 13px;"></i> Leave Room
            </button>
            <span class="in-room-status"><i data-lucide="check" style="width: 12px; height: 12px; color: #10b981;"></i> Currently Connected</span>
          ` : `
            <button class="btn btn-primary btn-sm join-room-btn" data-id="${r.id}">
              <i data-lucide="user-plus" style="width: 13px; height: 13px;"></i> Join Silent Hall
            </button>
          `}
        </div>
      </div>
    `).join('');

    if (window.lucide) window.lucide.createIcons();

    // Attach listeners
    listContainer.querySelectorAll('.join-room-btn').forEach(btn => {
      btn.addEventListener('click', async () => {
        const id = btn.getAttribute('data-id');
        await joinRoom(id);
      });
    });

    listContainer.querySelectorAll('.leave-room-btn').forEach(btn => {
      btn.addEventListener('click', async () => {
        const id = btn.getAttribute('data-id');
        await leaveRoom(id);
      });
    });
  }

  async function joinRoom(roomId) {
    try {
      const currentTask = document.getElementById('focus-task-select')?.selectedOptions?.[0]?.text || 'Deep Work Session';
      const timerMode = document.getElementById('mode-indicator')?.textContent || 'Pomodoro';

      const res = await ApiClient.post(`/rooms/${roomId}/join`, {
        currentTask,
        timerMode,
        remainingSeconds: 1500
      });

      if (res && res.success) {
        activeRoom = res.room;
        if (window.Toast) {
          Toast.success('Connected to Study Room! 👥', `You are now co-working in ${res.room.name}.`);
        }
        startHeartbeat(roomId);
        loadRooms();
      }
    } catch (err) {
      if (window.Toast) Toast.error('Room Error', err.message);
    }
  }

  async function leaveRoom(roomId) {
    try {
      await ApiClient.post(`/rooms/${roomId}/leave`, {});
      activeRoom = null;
      clearInterval(heartbeatTimer);
      if (window.Toast) Toast.info('Left Room', 'Disconnected from multiplayer study hall.');
      loadRooms();
    } catch (err) {}
  }

  function startHeartbeat(roomId) {
    clearInterval(heartbeatTimer);
    heartbeatTimer = setInterval(async () => {
      if (!activeRoom) return;
      try {
        await ApiClient.post(`/rooms/${roomId}/heartbeat`, {});
      } catch (e) {}
    }, 60000); // 1-min heartbeat
  }

  document.addEventListener('DOMContentLoaded', () => {
    const focusTab = document.getElementById('tab-nav-focus');
    if (focusTab) {
      focusTab.addEventListener('click', loadRooms);
    }
    loadRooms();
  });

  window.RoomsModule = {
    load: loadRooms,
    getActiveRoom: () => activeRoom
  };
})();
