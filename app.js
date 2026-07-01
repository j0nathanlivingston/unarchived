// app.js — Unarchived main application

const App = (() => {

  const MAX_BUFFER = 200;

  const state = {
    buffer: [],
    feedCursor: 0,   // index of currently visible feed item
    fetching: false,
    settings: {
      mediaType: 'image',
      dateFrom: 1900,
      dateTo: 2024,
      bufferSize: 50,
      viewMode: 'feed'
    }
  };

  const $ = id => document.getElementById(id);
  const el = {
    feedView:         $('feed-view'),
    feedSentinel:     $('feed-sentinel'),
    gridView:         $('grid-view'),
    masonry:          $('masonry'),
    gridSentinel:     $('grid-sentinel'),
    arrowLeft:        $('arrow-left'),
    arrowRight:       $('arrow-right'),
    bufferTrack:      $('buffer-track'),
    bufferCount:      $('buffer-count'),
    settingsBtn:      $('settings-btn'),
    settingsOverlay:  $('settings-overlay'),
    closeSettings:    $('close-settings'),
    menuBtn:          $('menu-btn'),
    menuOverlay:      $('menu-overlay'),
    closeMenu:        $('close-menu'),
    aboutBtn:         $('about-btn'),
    aboutOverlay:     $('about-overlay'),
    closeAbout:       $('close-about'),
    disclaimerPopup:  $('disclaimer-popup'),
    disclaimerClose:  $('disclaimer-close'),
    applyBtn:         $('apply-btn'),
    bufferSizeSlider: $('buffer-size'),
    bufferSizeVal:    $('buffer-size-val'),
    dateFrom:         $('date-from'),
    dateTo:           $('date-to'),
  };

  // ── Buffer UI ──
  function updateBufferUI() {
    const total = state.settings.bufferSize;
    const loaded = state.buffer.length;
    const pct = Math.min(100, Math.round((loaded / total) * 100));
    let fill = el.bufferTrack.querySelector('.buffer-fill');
    if (!fill) {
      fill = document.createElement('div');
      fill.className = 'buffer-fill';
      el.bufferTrack.appendChild(fill);
    }
    fill.style.width = pct + '%';
    el.bufferCount.textContent = `${loaded} / ${Math.max(loaded, total)}`;
  }

  // ── Feed: append one item card ──
  function appendFeedItem(item, index) {
    // Remove initial loading placeholder on first item
    const placeholder = $('feed-loading-placeholder');
    if (placeholder) placeholder.remove();

    const div = document.createElement('div');
    div.className = 'feed-item';
    div.id = `feed-item-${index}`;
    div.dataset.index = String(index);

    if (item.type === 'image') {
      const imgArea = document.createElement('div');
      imgArea.className = 'feed-img-area';

      const skeleton = document.createElement('div');
      skeleton.className = 'feed-skeleton';
      skeleton.innerHTML = '<div class="spinner"></div>';

      const img = document.createElement('img');
      img.className = 'feed-img';
      img.alt = item.meta.title;
      img.loading = 'lazy';
      img.onload = () => {
        img.classList.add('loaded');
        skeleton.classList.add('gone');
      };
      img.onerror = () => {
        skeleton.innerHTML = '<span class="placeholder-text">unavailable</span>';
      };
      img.src = item.url;

      imgArea.appendChild(skeleton);
      imgArea.appendChild(img);
      div.appendChild(imgArea);

    } else if (item.type === 'video') {
      const imgArea = document.createElement('div');
      imgArea.className = 'feed-img-area';
      const video = document.createElement('video');
      video.controls = true;
      video.src = item.url;
      video.style.cssText = 'max-width:100%;max-height:100%;display:block;';
      imgArea.appendChild(video);
      div.appendChild(imgArea);

    } else if (item.type === 'audio') {
      const imgArea = document.createElement('div');
      imgArea.className = 'feed-img-area feed-audio-area';
      const label = document.createElement('span');
      label.style.cssText = 'font-size:10px;letter-spacing:0.15em;color:var(--ink-faint)';
      label.textContent = 'audio';
      const audio = document.createElement('audio');
      audio.controls = true;
      audio.src = item.url;
      audio.style.width = '280px';
      imgArea.appendChild(label);
      imgArea.appendChild(audio);
      div.appendChild(imgArea);
    }

    // Meta bar
    const meta = document.createElement('div');
    meta.className = 'feed-meta';
    const sub = [
      item.meta.creator || null,
      item.meta.mediatype,
      item.meta.date !== '—' ? item.meta.date : null
    ].filter(Boolean).join(' · ');
    meta.innerHTML = `
      <div class="feed-meta-left">
        <span class="feed-meta-title">${item.meta.title}</span>
        <span class="feed-meta-sub">${sub}</span>
      </div>
      <a class="feed-source-link" href="${item.meta.sourceUrl}" target="_blank" rel="noopener">source ↗</a>`;
    div.appendChild(meta);

    // Track which item is currently visible
    feedVisibilityObserver.observe(div);

    // Insert before sentinel (keeps sentinel at the end)
    el.feedView.insertBefore(div, el.feedSentinel);
    updateArrows();
  }

  // ── Feed: observe which item is in view ──
  let feedVisibilityObserver;

  function setupFeedObserver() {
    if (feedVisibilityObserver) feedVisibilityObserver.disconnect();
    feedVisibilityObserver = new IntersectionObserver(entries => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          const idx = parseInt(entry.target.dataset.index);
          if (!isNaN(idx)) {
            state.feedCursor = idx;
            updateArrows();
          }
        }
      });
    }, { root: el.feedView, threshold: 0.5 });
  }

  // ── Feed: load more when sentinel is visible ──
  let sentinelObserver = null;
  function setupSentinelObserver() {
    if (sentinelObserver) sentinelObserver.disconnect();
    sentinelObserver = new IntersectionObserver(entries => {
      if (entries[0].isIntersecting && !state.fetching && state.buffer.length < MAX_BUFFER) {
        fillBuffer(false);
      }
    }, { root: el.feedView, threshold: 0.1 });
    sentinelObserver.observe(el.feedSentinel);
  }

  // ── Navigate feed ──
  function navigate(dir) {
    const items = el.feedView.querySelectorAll('.feed-item');
    const next = state.feedCursor + dir;
    if (next < 0 || next >= items.length) return;
    items[next].scrollIntoView({ behavior: 'smooth' });
  }

  function updateArrows() {
    const items = el.feedView.querySelectorAll('.feed-item');
    el.arrowLeft.disabled = state.feedCursor <= 0;
    el.arrowRight.disabled = state.feedCursor >= items.length - 1;
  }

  // ── Fetch batch ──
  async function fillBuffer(replace = false) {
    if (state.fetching) return;
    if (!replace && state.buffer.length >= MAX_BUFFER) return;
    state.fetching = true;

    try {
      const docs = await Archive.fetchRandom({
        mediaType: state.settings.mediaType,
        dateFrom: state.settings.dateFrom,
        dateTo: state.settings.dateTo,
        count: state.settings.bufferSize
      });

      if (replace) {
        state.buffer = [];
        state.feedCursor = 0;
        // Clear feed items (keep sentinel)
        el.feedView.querySelectorAll('.feed-item').forEach(n => n.remove());
        // Restore loading placeholder
        const ph = document.createElement('div');
        ph.className = 'feed-loading-placeholder';
        ph.id = 'feed-loading-placeholder';
        ph.innerHTML = '<span class="placeholder-text">loading from the archive</span>';
        el.feedView.insertBefore(ph, el.feedSentinel);
        // Clear grid
        el.masonry.innerHTML = '';
        setupFeedObserver();
      }

      updateBufferUI();

      for (let i = 0; i < docs.length; i++) {
        if (state.buffer.length >= MAX_BUFFER) break;
        try {
          const item = await Archive.resolveItem(docs[i]);
          const index = state.buffer.length;
          state.buffer.push(item);
          appendFeedItem(item, index);
          if (state.settings.viewMode === 'grid') {
            appendGridItem(item, index);
          }
          updateBufferUI();
        } catch (e) {
          // skip silently
        }
      }
    } catch (e) {
      console.error('[archive] fetch error:', e);
    } finally {
      state.fetching = false;
    }
  }

  // ── Grid mode ──
  function appendGridItem(item, index) {
    if (item.type !== 'image') return;
    const div = document.createElement('div');
    div.className = 'grid-item';
    const img = document.createElement('img');
    img.src = item.url;
    img.alt = item.meta.title;
    img.loading = 'lazy';
    const overlay = document.createElement('div');
    overlay.className = 'grid-overlay';
    overlay.innerHTML = `
      <div class="grid-overlay-title">${item.meta.title}</div>
      <div class="grid-overlay-sub">${item.meta.date} · ${item.meta.mediatype}</div>`;
    div.appendChild(img);
    div.appendChild(overlay);
    div.addEventListener('click', () => goToFeedItem(index));
    el.masonry.appendChild(div);
  }

  function buildGrid() {
    el.masonry.innerHTML = '';
    state.buffer.forEach((item, i) => appendGridItem(item, i));
  }

  function goToFeedItem(index) {
    setViewMode('feed');
    const itemEl = $(`feed-item-${index}`);
    if (itemEl) itemEl.scrollIntoView({ behavior: 'instant' });
    state.feedCursor = index;
    updateArrows();
  }

  // ── Grid infinite scroll ──
  let gridScrollObserver = null;
  function setupGridScrollObserver() {
    if (gridScrollObserver) gridScrollObserver.disconnect();
    gridScrollObserver = new IntersectionObserver(entries => {
      if (entries[0].isIntersecting && !state.fetching && state.buffer.length < MAX_BUFFER) {
        fillBuffer(false);
      }
    }, { root: el.gridView, threshold: 0.1 });
    gridScrollObserver.observe(el.gridSentinel);
  }

  // ── View mode ──
  function setViewMode(mode) {
    state.settings.viewMode = mode;
    if (mode === 'feed') {
      el.feedView.classList.remove('hidden');
      el.gridView.classList.add('hidden');
      el.arrowLeft.classList.remove('hidden');
      el.arrowRight.classList.remove('hidden');
    } else {
      el.feedView.classList.add('hidden');
      el.gridView.classList.remove('hidden');
      el.arrowLeft.classList.add('hidden');
      el.arrowRight.classList.add('hidden');
      buildGrid();
      setupGridScrollObserver();
    }
    document.querySelectorAll('#view-mode-group .pill').forEach(p => {
      p.classList.toggle('active', p.dataset.value === mode);
    });
  }

  // ── Overlays ──
  const openSettings  = () => el.settingsOverlay.classList.remove('hidden');
  const closeSettings = () => el.settingsOverlay.classList.add('hidden');
  const openMenu      = () => el.menuOverlay.classList.remove('hidden');
  const closeMenu     = () => el.menuOverlay.classList.add('hidden');
  const openAbout     = () => { closeMenu(); el.aboutOverlay.classList.remove('hidden'); };
  const closeAbout    = () => el.aboutOverlay.classList.add('hidden');

  function applySettings() {
    const fromVal = parseInt(el.dateFrom.value);
    const toVal   = parseInt(el.dateTo.value);
    state.settings.dateFrom  = Math.min(fromVal, toVal);
    state.settings.dateTo    = Math.max(fromVal, toVal);
    state.settings.bufferSize = parseInt(el.bufferSizeSlider.value);
    closeSettings();
    fillBuffer(true);
  }

  function initPillGroup(groupId, onSelect) {
    const group = $(groupId);
    group.querySelectorAll('.pill').forEach(pill => {
      pill.addEventListener('click', () => {
        group.querySelectorAll('.pill').forEach(p => p.classList.remove('active'));
        pill.classList.add('active');
        onSelect(pill.dataset.value);
      });
    });
  }

  // ── Keyboard ──
  document.addEventListener('keydown', e => {
    const overlayOpen = !el.settingsOverlay.classList.contains('hidden') ||
                        !el.menuOverlay.classList.contains('hidden');
    if (!overlayOpen) {
      if (e.key === 'ArrowLeft'  || e.key === 'ArrowUp')   navigate(-1);
      if (e.key === 'ArrowRight' || e.key === 'ArrowDown')  navigate(1);
    }
    if (e.key === 'Escape') { closeSettings(); closeMenu(); closeAbout(); }
  });

  el.settingsOverlay.addEventListener('click', e => { if (e.target === el.settingsOverlay) closeSettings(); });
  el.menuOverlay.addEventListener('click',     e => { if (e.target === el.menuOverlay)     closeMenu(); });
  el.aboutOverlay.addEventListener('click',    e => { if (e.target === el.aboutOverlay)    closeAbout(); });

  // ── Init ──
  function init() {
    setupFeedObserver();
    setupSentinelObserver();

    el.arrowLeft.addEventListener('click',   () => navigate(-1));
    el.arrowRight.addEventListener('click',  () => navigate(1));
    el.settingsBtn.addEventListener('click', openSettings);
    el.closeSettings.addEventListener('click', closeSettings);
    el.menuBtn.addEventListener('click',     openMenu);
    el.closeMenu.addEventListener('click',   closeMenu);
    el.aboutBtn.addEventListener('click',    openAbout);
    el.closeAbout.addEventListener('click',  closeAbout);
    el.disclaimerClose.addEventListener('click', () => el.disclaimerPopup.classList.add('hidden'));
    el.applyBtn.addEventListener('click',    applySettings);

    el.bufferSizeSlider.addEventListener('input', () => {
      el.bufferSizeVal.textContent = el.bufferSizeSlider.value;
    });

    initPillGroup('media-type-group', val => { state.settings.mediaType = val; });
    initPillGroup('view-mode-group',  val => { setViewMode(val); });

    updateArrows();
    updateBufferUI();
    fillBuffer(true);
  }

  init();

})();
