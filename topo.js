// topo.js — proper topographic contours using d3-contour
// Renders smooth polygon contours from a noise field, with edge fade and slow drift

(function () {
  const svg = document.getElementById('topo-svg');
  const group = document.getElementById('topo-paths');

  // Grid resolution — higher = smoother contours, slower computation
  // d3-contour handles this in pure C-speed style, so we can afford high res
  const GW = 80;
  const GH = 50;

  let t = 0;
  let W = window.innerWidth;
  let H = window.innerHeight;

  function resize() {
    W = window.innerWidth;
    H = window.innerHeight;
    svg.setAttribute('viewBox', `0 0 ${GW} ${GH}`);
    svg.style.width = W + 'px';
    svg.style.height = H + 'px';
  }
  resize();
  window.addEventListener('resize', resize);

  // Smooth low-frequency noise field — generates the "elevation" data
  // The mix of sines at different frequencies gives organic flowing curves
  function generateField(t) {
    const values = new Float64Array(GW * GH);
    for (let y = 0; y < GH; y++) {
      for (let x = 0; x < GW; x++) {
        const nx = x / GW;
        const ny = y / GH;
        // More layers and higher frequencies for more organic bending curves
        const a = Math.sin(nx * 5.2 + ny * 2.8 + t * 0.38);
        const b = Math.cos(nx * 3.1 - ny * 5.0 + t * 0.29);
        const c = Math.sin(nx * 7.4 + ny * 1.8 - t * 0.22);
        const d = Math.cos(nx * 2.1 + ny * 7.2 + t * 0.33);
        const e = Math.sin(nx * 4.3 - ny * 3.6 - t * 0.26);
        const f = Math.cos(nx * 1.6 + ny * 4.9 + t * 0.19);
        values[y * GW + x] = (a + b * 0.7 + c * 0.5 + d * 0.4 + e * 0.45 + f * 0.35) / 3.4;
      }
    }
    return values;
  }

  // d3 generates contour paths at given thresholds
  // We pick thresholds across the field's range for evenly-spaced "elevation" lines
  const THRESHOLDS = [];
  for (let i = -1.2; i <= 1.2; i += 0.18) THRESHOLDS.push(i);

  const contoursGenerator = d3.contours()
    .size([GW, GH])
    .thresholds(THRESHOLDS);

  // Convert a d3-contour GeoJSON MultiPolygon to an SVG path string
  function contourToPath(contour) {
    let path = '';
    for (const poly of contour.coordinates) {
      for (const ring of poly) {
        for (let i = 0; i < ring.length; i++) {
          const [x, y] = ring[i];
          path += (i === 0 ? 'M' : 'L') + x.toFixed(2) + ',' + y.toFixed(2);
        }
        path += 'Z';
      }
    }
    return path;
  }

  function render() {
    const values = generateField(t);
    const contours = contoursGenerator(values);

    // Build all paths in one DOM update
    let svgContent = '';
    for (const contour of contours) {
      const d = contourToPath(contour);
      if (!d) continue;
      svgContent += `<path d="${d}" fill="none" stroke="rgba(26,26,24,0.11)" stroke-width="0.1" stroke-linejoin="round"/>`;
    }
    group.innerHTML = svgContent;

    // Very slow drift — full cycle takes minutes
    t += 0.004;
    requestAnimationFrame(render);
  }

  // Wait for d3 to load (full d3 bundle includes contours + array)
  let attempts = 0;
  function start() {
    if (typeof d3 !== 'undefined' && d3.contours) {
      console.log('[topo] d3 loaded, starting animation');
      render();
      return;
    }
    attempts++;
    if (attempts > 100) {
      // Give up — d3 isn't loading. Leave background blank.
      console.warn('[topo] d3 failed to load, skipping background animation');
      return;
    }
    setTimeout(start, 50);
  }
  start();
})();
