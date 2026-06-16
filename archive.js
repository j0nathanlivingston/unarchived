// archive.js — Internet Archive API interface

const Archive = (() => {

  const BASE = 'https://archive.org';

  async function fetchRandom({ mediaType = 'image', dateFrom = 1900, dateTo = 2024, count = 50 } = {}) {
    const typeQuery = mediaType ? `mediatype:(${mediaType})` : '';
    const dateQuery = `date:[${dateFrom}-01-01 TO ${dateTo}-12-31]`;
    // Exclude web screenshot archives — these contain captured webpage images
    // not real photographs, illustrations, or archival media
    const excludeQuery = 'NOT collection:(pastpages) NOT collection:(webpagescreenshots) NOT creator:(pastpages.org)';
    const query = [typeQuery, dateQuery, excludeQuery].filter(Boolean).join(' AND ');

    const randomPage = Math.floor(Math.random() * 200) + 1;

    const url = new URL(`${BASE}/advancedsearch.php`);
    url.searchParams.set('q', query);
    url.searchParams.set('fl[]', 'identifier,title,mediatype,date,creator,subject,description');
    url.searchParams.set('sort[]', 'random');
    url.searchParams.set('rows', String(count));
    url.searchParams.set('page', String(randomPage));
    url.searchParams.set('output', 'json');

    const res = await fetch(url.toString());
    if (!res.ok) throw new Error(`Archive search failed: ${res.status}`);
    const data = await res.json();
    return data.response?.docs || [];
  }

  async function fetchItemFiles(identifier) {
    const res = await fetch(`${BASE}/metadata/${identifier}`);
    if (!res.ok) throw new Error(`Metadata fetch failed: ${res.status}`);
    const data = await res.json();
    return {
      metadata: data.metadata || {},
      files: data.files || []
    };
  }

  // Pick a RANDOM real image file from an item's file list
  // Excludes thumbnails, metadata files, and derived files
  function pickRandomImageFile(files, identifier) {
    const imageExts = ['.jpg', '.jpeg', '.png', '.gif', '.webp'];

    // Patterns that indicate non-original/derived/thumbnail files to skip
    const skipPatterns = [
      '_thumb', '__ia_thumb', 'itemimage', '_small', '_medium',
      '_large', 'page_', '_page', '__ia_', '.xml', '.json',
      '_orig', 'thumbs/', 'derivatives/'
    ];

    const candidates = files.filter(f => {
      const name = (f.name || '').toLowerCase();
      const isImage = imageExts.some(ext => name.endsWith(ext));
      const isSkipped = skipPatterns.some(p => name.includes(p));
      // Also skip very small files (likely thumbnails) — under 10KB
      const tooSmall = f.size && parseInt(f.size) < 10000;
      return isImage && !isSkipped && !tooSmall;
    });

    if (candidates.length === 0) return null;

    // Pick randomly from all candidates
    const chosen = candidates[Math.floor(Math.random() * candidates.length)];
    return `${BASE}/download/${identifier}/${encodeURIComponent(chosen.name)}`;
  }

  function pickRandomVideoFile(files, identifier) {
    const videoExts = ['.mp4', '.ogv', '.webm'];
    const candidates = files.filter(f => {
      const name = (f.name || '').toLowerCase();
      return videoExts.some(ext => name.endsWith(ext));
    });
    if (candidates.length === 0) return null;
    const chosen = candidates[Math.floor(Math.random() * candidates.length)];
    return `${BASE}/download/${identifier}/${encodeURIComponent(chosen.name)}`;
  }

  function pickRandomAudioFile(files, identifier) {
    const audioExts = ['.mp3', '.ogg', '.flac', '.wav'];
    const candidates = files.filter(f => {
      const name = (f.name || '').toLowerCase();
      return audioExts.some(ext => name.endsWith(ext));
    });
    if (candidates.length === 0) return null;
    const chosen = candidates[Math.floor(Math.random() * candidates.length)];
    return `${BASE}/download/${identifier}/${encodeURIComponent(chosen.name)}`;
  }

  function thumbUrl(identifier) {
    return `${BASE}/services/img/${identifier}`;
  }

  async function resolveItem(doc) {
    const { identifier, title, mediatype, date, creator } = doc;

    const meta = {
      identifier,
      title: title || 'untitled',
      mediatype: mediatype || 'image',
      date: date ? String(date).slice(0, 4) : '—',
      creator: creator || null,
      sourceUrl: `${BASE}/details/${identifier}`
    };

    if (mediatype === 'image' || mediatype === 'texts') {
      // Fetch real files and pick a random actual image — not the thumbnail
      try {
        const { files } = await fetchItemFiles(identifier);
        const url = pickRandomImageFile(files, identifier);
        if (url) return { url, type: 'image', meta };
      } catch (e) {
        console.warn('[archive] metadata fetch failed for', identifier, e.message);
      }
      // Fall back to thumbnail if metadata fetch fails
      return { url: thumbUrl(identifier), type: 'image', meta };
    }

    if (mediatype === 'movies') {
      try {
        const { files } = await fetchItemFiles(identifier);
        const url = pickRandomVideoFile(files, identifier);
        if (url) return { url, type: 'video', meta };
      } catch (e) {}
      return { url: thumbUrl(identifier), type: 'image', meta };
    }

    if (mediatype === 'audio') {
      try {
        const { files } = await fetchItemFiles(identifier);
        const url = pickRandomAudioFile(files, identifier);
        if (url) return { url, type: 'audio', meta };
      } catch (e) {}
      return { url: thumbUrl(identifier), type: 'image', meta };
    }

    return { url: thumbUrl(identifier), type: 'image', meta };
  }

  return { fetchRandom, resolveItem, thumbUrl };
})();
