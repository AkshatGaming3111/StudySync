// StudySync Course & Syllabus Marketplace Module
(function () {
  let marketplaceContainer = null;
  let syllabiList = [];
  let currentCategory = 'All';

  async function loadMarketplaceSyllabi(category = 'All') {
    currentCategory = category;
    const grid = document.getElementById('marketplace-cards-grid');
    if (!grid) return;

    grid.innerHTML = `
      <div class="marketplace-loading">
        <i data-lucide="loader-2" class="spin" style="width: 24px; height: 24px; color: var(--primary);"></i>
        <p>Loading curated academic roadmaps...</p>
      </div>
    `;
    if (window.lucide) window.lucide.createIcons();

    try {
      const url = category && category !== 'All' ? `/marketplace?category=${encodeURIComponent(category)}` : '/marketplace';
      const res = await ApiClient.get(url);
      if (res && res.success) {
        syllabiList = res.syllabi || [];
        renderMarketplaceCards(syllabiList);
      }
    } catch (err) {
      grid.innerHTML = `<p class="marketplace-error">Failed to load marketplace: ${err.message}</p>`;
    }
  }

  function renderMarketplaceCards(cards) {
    const grid = document.getElementById('marketplace-cards-grid');
    if (!grid) return;

    if (!cards || cards.length === 0) {
      grid.innerHTML = `
        <div class="empty-marketplace">
          <i data-lucide="compass" style="width: 36px; height: 36px; color: var(--text-muted);"></i>
          <p>No study roadmaps found in this category.</p>
        </div>
      `;
      if (window.lucide) window.lucide.createIcons();
      return;
    }

    grid.innerHTML = cards.map(c => `
      <div class="marketplace-card glassmorphic-subcard">
        <div class="m-card-top">
          <span class="m-category-badge">${c.category || 'General'}</span>
          <span class="m-difficulty-badge diff-${c.difficulty_level}">
            Difficulty ${c.difficulty_level}/5
          </span>
        </div>
        
        <h4 class="m-title">${c.title}</h4>
        <p class="m-desc">${c.description || 'Structured academic study roadmap with difficulty-weighted milestones.'}</p>
        
        <div class="m-meta-row">
          <span><i data-lucide="calendar" style="width: 12px; height: 12px;"></i> ${c.duration_days} Days</span>
          <span><i data-lucide="download" style="width: 12px; height: 12px;"></i> ${c.downloads_count} Clones</span>
          <span><i data-lucide="heart" style="width: 12px; height: 12px; color: #ef4444;"></i> ${c.likes_count}</span>
        </div>

        <div class="m-author">Curated by <strong>${c.author_name}</strong></div>

        <div class="m-action-row">
          <button class="btn btn-secondary btn-sm preview-syllabus-btn" data-id="${c.id}">
            <i data-lucide="eye" style="width: 13px; height: 13px;"></i> Preview
          </button>
          <button class="btn btn-primary btn-sm clone-syllabus-btn" data-id="${c.id}">
            <i data-lucide="copy-plus" style="width: 13px; height: 13px;"></i> Clone to Planner
          </button>
        </div>
      </div>
    `).join('');

    if (window.lucide) window.lucide.createIcons();

    // Attach listeners
    grid.querySelectorAll('.clone-syllabus-btn').forEach(btn => {
      btn.addEventListener('click', async () => {
        const id = btn.getAttribute('data-id');
        btn.disabled = true;
        btn.innerHTML = `<i data-lucide="loader-2" class="spin" style="width: 13px; height: 13px;"></i> Importing...`;
        if (window.lucide) window.lucide.createIcons();

        try {
          const res = await ApiClient.post(`/marketplace/${id}/clone`, {});
          if (res.success) {
            if (window.Toast) {
              Toast.success('Roadmap Imported! 📚', res.message);
            }
            // Trigger refresh of tasks board
            if (window.PlannerModule && window.PlannerModule.fetchTasks) {
              window.PlannerModule.fetchTasks();
            }
          }
        } catch (err) {
          if (window.Toast) Toast.error('Import Failed', err.message);
        } finally {
          btn.disabled = false;
          btn.innerHTML = `<i data-lucide="check" style="width: 13px; height: 13px; color: #10b981;"></i> Imported`;
          if (window.lucide) window.lucide.createIcons();
          setTimeout(() => {
            btn.innerHTML = `<i data-lucide="copy-plus" style="width: 13px; height: 13px;"></i> Clone to Planner`;
            if (window.lucide) window.lucide.createIcons();
          }, 2500);
        }
      });
    });

    grid.querySelectorAll('.preview-syllabus-btn').forEach(btn => {
      btn.addEventListener('click', async () => {
        const id = btn.getAttribute('data-id');
        openPreviewModal(id);
      });
    });
  }

  async function openPreviewModal(id) {
    try {
      const res = await ApiClient.get(`/marketplace/${id}`);
      if (!res.success) return;

      const s = res.syllabus;
      const tasks = s.tasks || [];

      let modal = document.getElementById('marketplace-preview-modal');
      if (!modal) {
        modal = document.createElement('div');
        modal.id = 'marketplace-preview-modal';
        modal.className = 'custom-modal';
        document.body.appendChild(modal);
      }

      modal.innerHTML = `
        <div class="custom-modal-card glassmorphic-card" style="max-width: 620px;">
          <div class="modal-header">
            <h3>${s.title}</h3>
            <button class="modal-close-btn" id="close-m-preview">&times;</button>
          </div>
          <p style="font-size: 0.88rem; color: var(--text-muted); margin-bottom: 1rem;">${s.description}</p>
          <div style="max-height: 320px; overflow-y: auto; padding-right: 6px;">
            <div class="preview-task-list">
              ${tasks.map((t, idx) => `
                <div class="preview-task-item">
                  <span class="preview-num">${idx + 1}</span>
                  <div class="preview-info">
                    <span class="preview-title">${t.title}</span>
                    <span class="preview-sub">${t.subject} • ${t.duration || 45} mins • ${t.priority || 'Medium'} Priority</span>
                  </div>
                </div>
              `).join('')}
            </div>
          </div>
          <div style="display: flex; justify-content: flex-end; margin-top: 1.5rem; gap: 8px;">
            <button class="btn btn-secondary" id="close-m-preview-bottom">Close</button>
            <button class="btn btn-primary" id="m-preview-clone-btn">Clone This Plan</button>
          </div>
        </div>
      `;

      modal.classList.add('active');
      document.getElementById('close-m-preview').onclick = () => modal.classList.remove('active');
      document.getElementById('close-m-preview-bottom').onclick = () => modal.classList.remove('active');
      document.getElementById('m-preview-clone-btn').onclick = async () => {
        modal.classList.remove('active');
        const cloneRes = await ApiClient.post(`/marketplace/${id}/clone`, {});
        if (cloneRes.success && window.Toast) {
          Toast.success('Roadmap Imported! 📚', cloneRes.message);
          if (window.PlannerModule && window.PlannerModule.fetchTasks) {
            window.PlannerModule.fetchTasks();
          }
        }
      };
    } catch (err) {
      if (window.Toast) Toast.error('Preview Error', err.message);
    }
  }

  document.addEventListener('DOMContentLoaded', () => {
    const marketTab = document.getElementById('tab-nav-marketplace');
    if (marketTab) {
      marketTab.addEventListener('click', () => loadMarketplaceSyllabi('All'));
    }

    const categoryPills = document.querySelectorAll('.marketplace-cat-pill');
    categoryPills.forEach(pill => {
      pill.addEventListener('click', () => {
        categoryPills.forEach(p => p.classList.remove('active'));
        pill.classList.add('active');
        const cat = pill.getAttribute('data-cat') || 'All';
        loadMarketplaceSyllabi(cat);
      });
    });
  });

  window.MarketplaceModule = {
    load: loadMarketplaceSyllabi
  };
})();
