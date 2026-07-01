// app.js — Unarchived main application

const App = (() => {

  const MAX_BUFFER = 200;

  const state = {
    buffer: [],
    cursor: -1,
    fetching: false,
    gridRenderedCount: 0,
    settings: {
      mediaType: 'image',
      dateFrom: 1900,
      dateTo: 2024,
      bufferSize: 50,
      viewMode: 'focus'
    }
  };

  const $ = id => document.getElementById(id);
  const el = {
    focusView:        $('focus-view'),
    gridView:         $('grid-view'),
    masonry:          $('masonry'),
    gridSentinel:     $('grid-sentinel'),
    mediaWrap:        $('media-wrap'),
    mediaPlaceholder: $('media-placeholder'),
    mainImage:        $('main-image'),
    mainVideo:        $('main-video'),
    metaTitle:        $('meta-title'),
    metaSub:          $('meta-sub'),
    metaLink:         $('meta-link'),
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

  // ── Preloader ──
  const preloadCache = new Set();
  function preload(url) {
    if (!url || preloadCache.has(url)) return;
    preloadCache.add(url);
    const img = new Image();
    img.src = url;
  }

  function preloadAhead(fromIndex) {
    for (let i = 1; i <= 3; i++) {
      const item = state.buffer[fromIndex + i];
      if (item && item.type === 'image') preload(item.url);
    }
  }

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

  // ── Show item in focus view ──
  function showItem(item) {
    if (!item) return;

    // Clear previous state
    el.mediaPlaceholder.classList.add('hidden');
    el.mainImage.classList.add('hidden');
    el.mainVideo.classList.add('hidden');
    el.mediaWrap.querySelectorAll('.img-loading').forEach(n => n.remove());

    if (item.type === 'image') {
      // Show spinner first — image stays hidden until loaded (fixes layout shift)
      const spinner = document.createElement('div');
      spinner.className = 'img-loading';
      spinner.innerHTML = '<div class="spinner"></div>';
      el.mediaWrap.appendChild(spinner);

      el.mainImage.onload = () => {
        spinner.remove();
        el.mainImage.classList.remove('hidden');
        const ratio = el.mainImage.naturalHeight / el.mainImage.naturalWidth;
        el.mainImage.style.objectFit = ratio > 2 ? 'cover' : 'contain';
        el.mainImage.style.objectPosition = ratio > 2 ? 'center top' : 'center';
      };
      el.mainImage.onerror = () => {
        spinner.remove();
        el.mediaPlaceholder.classList.remove('hidden');
        el.mediaPlaceholder.querySelector('.placeholder-text').textContent = 'image unavailable';
      };
      el.mainImage.src = item.url;
      el.mainImage.alt = item.meta.title;

    } else if (item.type === 'video') {
      el.mainVideo.classList.remove('hidden');
      el.mainVideo.src = item.url;

    } else if (item.type === 'audio') {
      el.mediaPlaceholder.classList.remove('hidden');
      el.mediaPlaceholder.innerHTML = `
        <div style="display:flex;flex-direction:column;align-items:center;gap:16px;">
          <span style="font-size:10px;letter-spacing:0.15em;color:var(--ink-faint)">audio</span>
          <audio controls style="width:280px;" src="${item.url}"></audio>
        </div>`;
    }

    const m = item.meta;
    el.metaTitle.textContent = m.title;
    el.metaSub.textContent = [
      m.creator || null,
      m.mediatype,
      m.date !== '—' ? m.date : null
    ].filter(Boolean).join(' · ');
    el.metaLink.href = m.sourceUrl;
  }

  // ── Navigation ──
  function navigate(dir) {
    const next = state.cursor + dir;
    if (next < 0) return;

    if (next >= state.buffer.length) {
      if (!state.fetching) fillBuffer(false);
      return;
    }

    state.cursor = next;
    showItem(state.buffer[state.cursor]);
    updateArrows();
    preloadAhead(state.cursor);

    if (state.buffer.length - state.cursor < 8 && !state.fetching) {
      fillBuffer(false);
    }
  }

  function updateArrows() {
    el.arrowLeft.disabled = state.cursor <= 0;
    el.arrowRight.disabled = false;
  }

  // ── Grid mode ──
  function appendGridItem(item, index) {
    if (item.type !== 'image') return;

    const div = document.createElement('div');
    div.className = 'grid-item';

    // Reserve space before image loads — prevents layout jumps
    const ratios = ['4/3', '1/1', '3/4', '4/5', '3/2'];
    div.style.aspectRatio = ratios[Math.floor(Math.random() * ratios.length)];

    const img = document.createElement('img');
    img.src = item.url;
    img.alt = item.meta.title;
    img.loading = 'lazy';
    img.onload = () => img.classList.add('loaded');

    const overlay = document.createElement('div');
    overlay.className = 'grid-overlay';
    overlay.innerHTML = `
      <div class="grid-overlay-title">${item.meta.title}</div>
      <div class="grid-overlay-sub">${item.meta.date} · ${item.meta.mediatype}</div>`;

    div.appendChild(img);
    div.appendChild(overlay);

    div.addEventListener('click', () => {
      state.cursor = index;
      setViewMode('focus');
      showItem(item);
      updateArrows();
      preloadAhead(index);
    });

    el.masonry.appendChild(div);
    state.gridRenderedCount++;
  }

  function buildGrid() {
    el.masonry.innerHTML = '';
    state.gridRenderedCount = 0;
    state.buffer.forEach((item, i) => appendGridItem(item, i));
  }

  // ── Infinite scroll ──
  let scrollObserver = null;
  function setupScrollObserver() {
    if (scrollObserver) scrollObserver.disconnect();
    scrollObserver = new IntersectionObserver(entries => {
      if (entries[0].isIntersecting && !state.fetching && state.buffer.length < MAX_BUFFER) {
        fillBuffer(false);
      }
    }, { root: el.gridView, threshold: 0.1 });
    scrollObserver.observe(el.gridSentinel);
  }

  // ── View mode ──
  function setViewMode(mode) {
    state.settings.viewMode = mode;
    if (mode === 'focus') {
      el.focusView.classList.remove('hidden');
      el.gridView.classList.add('hidden');
    } else {
      el.focusView.classList.add('hidden');
      el.gridView.classList.remove('hidden');
      buildGrid();
      setupScrollObserver();
    }
    document.querySelectorAll('#view-mode-group .pill').forEach(p => {
      p.classList.toggle('active', p.dataset.value === mode);
    });
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
        state.cursor = -1;
        state.gridRenderedCount = 0;
        el.masonry.innerHTML = '';
        el.mainImage.classList.add('hidden');
        el.mainVideo.classList.add('hidden');
        el.mediaWrap.querySelectorAll('.img-loading').forEach(n => n.remove());
        el.mediaPlaceholder.classList.remove('hidden');
        el.mediaPlaceholder.innerHTML = '<span class="placeholder-text">loading from the archive</span>';
      }

      updateBufferUI();

      // Fire all metadata requests in parallel — much faster than sequential
      await Promise.allSettled(
        docs.map(doc =>
          Archive.resolveItem(doc).then(item => {
            if (state.buffer.length >= MAX_BUFFER) return;
            state.buffer.push(item);

            if (state.cursor === -1) {
              state.cursor = 0;
              showItem(state.buffer[0]);
              updateArrows();
              preloadAhead(0);
            }

            if (state.settings.viewMode === 'grid') {
              appendGridItem(item, state.buffer.length - 1);
            }

            updateBufferUI();
          })
        )
      );
    } catch (e) {
      console.error('[archive] fetch error:', e);
      if (state.buffer.length === 0) {
        el.mediaPlaceholder.classList.remove('hidden');
        el.mediaPlaceholder.innerHTML = '<span class="placeholder-text">could not reach the archive</span>';
      }
    } finally {
      state.fetching = false;
    }
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
    state.settings.dateFrom   = Math.min(fromVal, toVal);
    state.settings.dateTo     = Math.max(fromVal, toVal);
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
      if (e.key === 'ArrowLeft')  navigate(-1);
      if (e.key === 'ArrowRight') navigate(1);
    }
    if (e.key === 'Escape') { closeSettings(); closeMenu(); closeAbout(); }
  });

  el.settingsOverlay.addEventListener('click', e => { if (e.target === el.settingsOverlay) closeSettings(); });
  el.menuOverlay.addEventListener('click',     e => { if (e.target === el.menuOverlay)     closeMenu(); });
  el.aboutOverlay.addEventListener('click',    e => { if (e.target === el.aboutOverlay)    closeAbout(); });

  // ── Init ──
  function init() {
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
