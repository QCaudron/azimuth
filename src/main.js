import {
  DEFAULT_CENTER,
  MIN_RADIUS_KM,
  MAX_RADIUS_KM,
  normalizeLatLon,
  latLonToMaidenhead,
  parseLocationInput,
  formatDMS,
  computeBearingAndDistance,
  destinationPoint,
} from './geo.js';
import { AzimuthalMapRenderer } from './map-renderer.js';

const state = {
  lat: DEFAULT_CENTER.lat,
  lon: DEFAULT_CENTER.lon,
  radiusKm: DEFAULT_CENTER.radiusKm,
  labelMode: 'name', // 'name' | 'both' | 'dxcc' | 'none'
  showStates: true,
  showGreyline: false,
  showRingLabels: true,
  theme: 'light',
  now: new Date(),
  cursorTarget: null,
  pinnedTarget: null,
  hoveredFeature: null,
  pinnedFeature: null,
};

// Parse optional URL parameters
function loadInitialStateFromUrl() {
  const params = new URLSearchParams(window.location.search);
  const grid = params.get('grid');
  if (grid) {
    const parsed = parseLocationInput(grid);
    if (parsed) {
      state.lat = parsed.lat;
      state.lon = parsed.lon;
    }
  }
  const lat = parseFloat(params.get('lat'));
  const lon = parseFloat(params.get('lon'));
  if (!Number.isNaN(lat) && !Number.isNaN(lon)) {
    const norm = normalizeLatLon(lat, lon);
    state.lat = norm.lat;
    state.lon = norm.lon;
  }
  const r = parseFloat(params.get('r') || params.get('radius'));
  if (!Number.isNaN(r)) {
    state.radiusKm = Math.max(MIN_RADIUS_KM, Math.min(MAX_RADIUS_KM, Math.round(r)));
  }
  const theme = params.get('theme');
  if (theme === 'dark' || theme === 'light') {
    state.theme = theme;
  }
  const labels = params.get('labels');
  if (['name', 'both', 'dxcc', 'none'].includes(labels)) {
    state.labelMode = labels;
  }
  if (params.get('greyline') === '1' || params.get('greyline') === 'true') {
    state.showGreyline = true;
  }
}

loadInitialStateFromUrl();

// DOM references
const canvas = document.getElementById('azimuth-canvas');
const canvasContainer = document.getElementById('canvas-container');
const bannerMeta = document.getElementById('banner-meta');
const centerGridBadge = document.getElementById('center-grid-badge');
const qthForm = document.getElementById('qth-form');
const qthInput = document.getElementById('qth-input');
const qthError = document.getElementById('qth-error');
const latInput = document.getElementById('lat-input');
const lonInput = document.getElementById('lon-input');
const resetQthBtn = document.getElementById('reset-qth-btn');
const gpsQthBtn = document.getElementById('gps-qth-btn');
const radiusInput = document.getElementById('radius-input');
const radiusSlider = document.getElementById('radius-slider');
const radiusPresets = document.getElementById('radius-presets');
const labelModeControl = document.getElementById('label-mode-control');
const toggleStates = document.getElementById('toggle-states');
const toggleGreyline = document.getElementById('toggle-greyline');
const toggleRingLabels = document.getElementById('toggle-ring-labels');
const themeToggleBtn = document.getElementById('theme-toggle-btn');
const themeIcon = document.getElementById('theme-icon');
const utcTimeText = document.getElementById('utc-time-text');

const readoutModeTitle = document.getElementById('readout-mode-title');
const unpinBtn = document.getElementById('unpin-btn');
const readoutEntity = document.getElementById('readout-entity');
const readoutSpBearing = document.getElementById('readout-sp-bearing');
const readoutSpDist = document.getElementById('readout-sp-dist');
const readoutLpBearing = document.getElementById('readout-lp-bearing');
const readoutLpDist = document.getElementById('readout-lp-dist');
const readoutGrid = document.getElementById('readout-grid');
const readoutLatLon = document.getElementById('readout-latlon');

const renderer = new AzimuthalMapRenderer(canvas);
let rafPending = false;

function scheduleRender() {
  if (rafPending) return;
  rafPending = true;
  requestAnimationFrame(() => {
    rafPending = false;
    renderer.render(state);
  });
}

function syncCenterUI(updateTextInput = false) {
  const grid = latLonToMaidenhead(state.lat, state.lon);
  const dms = formatDMS(state.lat, state.lon);
  centerGridBadge.textContent = grid;
  bannerMeta.textContent = `Center: ${dms} (${grid}) · Radius: ${Math.round(
    state.radiusKm
  ).toLocaleString()} km`;

  if (document.activeElement !== latInput) {
    latInput.value = state.lat.toFixed(6);
  }
  if (document.activeElement !== lonInput) {
    lonInput.value = state.lon.toFixed(6);
  }
  if (updateTextInput && document.activeElement !== qthInput) {
    qthInput.value = `${state.lat.toFixed(6)}, ${state.lon.toFixed(6)}`;
  }

  // If a target is pinned, update its bearing/distance relative to the new center
  if (state.pinnedTarget) {
    refreshTargetMetrics(state.pinnedTarget);
    updateReadoutUI(state.pinnedTarget, true);
  }
}

function syncRadiusUI() {
  const r = Math.round(state.radiusKm);
  if (document.activeElement !== radiusInput) {
    radiusInput.value = String(r);
  }
  radiusSlider.value = String(r);

  for (const btn of radiusPresets.querySelectorAll('.pill-btn')) {
    const presetR = Number(btn.dataset.radius);
    btn.classList.toggle('active', Math.abs(presetR - r) <= 25);
  }

  const grid = latLonToMaidenhead(state.lat, state.lon);
  const dms = formatDMS(state.lat, state.lon);
  bannerMeta.textContent = `Center: ${dms} (${grid}) · Radius: ${r.toLocaleString()} km`;

  if (state.pinnedTarget) {
    refreshTargetMetrics(state.pinnedTarget);
  }
}

function refreshTargetMetrics(target) {
  const m = computeBearingAndDistance(
    state.lat,
    state.lon,
    target.lat,
    target.lon
  );
  target.bearingDeg = m.bearingDeg;
  target.longPathBearingDeg = m.longPathBearingDeg;
  target.distanceKm = m.distanceKm;
  target.longPathKm = m.longPathKm;
  target.insideCircle = m.distanceKm <= state.radiusKm * 1.005;
}

function formatEntityLabel(hit) {
  if (!hit || (!hit.country && !hit.state)) {
    return 'Ocean / International Waters';
  }
  const c = hit.country ? hit.country.properties : null;
  const s = hit.state ? hit.state.properties : null;

  if (s && c) {
    return `${c.name} · ${s.name} [${s.dxcc || c.dxcc}]`;
  }
  if (s) {
    return `${s.name} [${s.dxcc}]`;
  }
  return c.dxcc ? `${c.name} [${c.dxcc}]` : c.name;
}

function updateReadoutUI(target, isPinned) {
  readoutModeTitle.textContent = isPinned ? 'Pinned Target' : 'Cursor Readout';
  unpinBtn.classList.toggle('hidden', !isPinned);

  if (!target || !target.insideCircle) {
    readoutEntity.textContent = 'Hover or click anywhere on the map';
    readoutSpBearing.textContent = '---°';
    readoutSpDist.textContent = '--- km';
    readoutLpBearing.textContent = '---°';
    readoutLpDist.textContent = '--- km';
    readoutGrid.textContent = '------';
    readoutLatLon.textContent = '--.----°, --.----°';
    return;
  }

  readoutEntity.textContent = target.entityLabel || 'Ocean / International Waters';
  readoutSpBearing.textContent = `${target.bearingDeg.toFixed(1)}°`;
  const spMiles = Math.round(target.distanceKm * 0.621371);
  readoutSpDist.textContent = `${Math.round(
    target.distanceKm
  ).toLocaleString()} km (${spMiles.toLocaleString()} mi)`;

  readoutLpBearing.textContent = `${target.longPathBearingDeg.toFixed(1)}°`;
  readoutLpDist.textContent = `${Math.round(
    target.longPathKm
  ).toLocaleString()} km`;

  readoutGrid.textContent = latLonToMaidenhead(target.lat, target.lon);
  readoutLatLon.textContent = `${target.lat.toFixed(3)}°, ${target.lon.toFixed(3)}°`;
}

// Resize handling
function handleResize() {
  const rect = canvasContainer.getBoundingClientRect();
  renderer.resize(rect.width, rect.height);
  scheduleRender();
}

const resizeObserver = new ResizeObserver(handleResize);
resizeObserver.observe(canvasContainer);

// Load TopoJSON Atlas
fetch('./data/atlas.topo.json')
  .then((res) => res.json())
  .then((topology) => {
    renderer.setAtlas(topology);
    scheduleRender();
  })
  .catch((err) => {
    console.error('Failed to load atlas data:', err);
  });

// Pointer drag & hover & pinch-zoom interactions on canvas
const activePointers = new Map();
let dragSession = null;
let pinchStartDist = null;
let pinchStartRadius = null;

function getCanvasRelativeCoords(e) {
  const rect = canvas.getBoundingClientRect();
  return {
    x: e.clientX - rect.left,
    y: e.clientY - rect.top,
  };
}

canvasContainer.addEventListener('pointerdown', (e) => {
  canvasContainer.setPointerCapture(e.pointerId);
  const pt = getCanvasRelativeCoords(e);
  activePointers.set(e.pointerId, pt);

  if (activePointers.size === 1) {
    dragSession = {
      pointerId: e.pointerId,
      startX: pt.x,
      startY: pt.y,
      startLat: state.lat,
      startLon: state.lon,
      moved: false,
    };
    canvasContainer.classList.add('dragging');
  } else if (activePointers.size === 2) {
    const pts = [...activePointers.values()];
    pinchStartDist = Math.hypot(pts[1].x - pts[0].x, pts[1].y - pts[0].y);
    pinchStartRadius = state.radiusKm;
    dragSession = null;
  }
});

canvasContainer.addEventListener('pointermove', (e) => {
  const pt = getCanvasRelativeCoords(e);
  if (activePointers.has(e.pointerId)) {
    activePointers.set(e.pointerId, pt);
  }

  // Two-finger pinch zoom
  if (activePointers.size === 2 && pinchStartDist > 10) {
    const pts = [...activePointers.values()];
    const dist = Math.hypot(pts[1].x - pts[0].x, pts[1].y - pts[0].y);
    if (dist > 10) {
      const ratio = pinchStartDist / dist;
      state.radiusKm = Math.max(
        MIN_RADIUS_KM,
        Math.min(MAX_RADIUS_KM, Math.round(pinchStartRadius * ratio))
      );
      syncRadiusUI();
      scheduleRender();
    }
    return;
  }

  // Single-pointer drag to pan center
  if (dragSession && dragSession.pointerId === e.pointerId) {
    const dx = pt.x - dragSession.startX;
    const dy = pt.y - dragSession.startY;
    const distPx = Math.hypot(dx, dy);

    if (distPx > 3) {
      dragSession.moved = true;
    }

    if (dragSession.moved && renderer.mapRadiusPx > 10) {
      // Pulling by (dx, dy) moves the geographic point at (-dx, -dy) to the center
      const dragDistKm = (distPx / renderer.mapRadiusPx) * state.radiusKm;
      const bearingDeg = ((Math.atan2(-dx, dy) * 180) / Math.PI + 360) % 360;
      const nextCenter = destinationPoint(
        dragSession.startLat,
        dragSession.startLon,
        bearingDeg,
        dragDistKm
      );
      state.lat = nextCenter.lat;
      state.lon = nextCenter.lon;

      // Re-anchor smoothly on large drags so user can spin across the globe continuously
      if (dragDistKm > state.radiusKm * 0.55) {
        dragSession.startX = pt.x;
        dragSession.startY = pt.y;
        dragSession.startLat = state.lat;
        dragSession.startLon = state.lon;
      }

      syncCenterUI(true);
      scheduleRender();
    }
    return;
  }

  // Hover readout when not dragging
  const geo = renderer.screenToGeo(pt.x, pt.y, state);
  if (!geo || !geo.insideCircle) {
    state.cursorTarget = null;
    state.hoveredFeature = null;
    if (!state.pinnedTarget) {
      updateReadoutUI(null, false);
    }
    scheduleRender();
    return;
  }

  const hit = renderer.hitTest(geo.lon, geo.lat);
  geo.entityLabel = formatEntityLabel(hit);
  state.cursorTarget = geo;
  state.hoveredFeature = (state.showStates && hit.state) ? hit.state : hit.country;

  if (!state.pinnedTarget) {
    updateReadoutUI(geo, false);
  }
  scheduleRender();
});

function endPointer(e) {
  const pt = getCanvasRelativeCoords(e);
  if (
    dragSession &&
    dragSession.pointerId === e.pointerId &&
    !dragSession.moved
  ) {
    // Clean click: pin or unpin target
    const geo = renderer.screenToGeo(pt.x, pt.y, state);
    if (geo && geo.insideCircle) {
      const hit = renderer.hitTest(geo.lon, geo.lat);
      geo.entityLabel = formatEntityLabel(hit);
      state.pinnedTarget = geo;
      state.pinnedFeature = (state.showStates && hit.state) ? hit.state : hit.country;
      updateReadoutUI(state.pinnedTarget, true);
    } else {
      state.pinnedTarget = null;
      state.pinnedFeature = null;
      updateReadoutUI(state.cursorTarget, false);
    }
    scheduleRender();
  }

  activePointers.delete(e.pointerId);
  if (activePointers.size < 2) {
    pinchStartDist = null;
  }
  if (activePointers.size === 0) {
    dragSession = null;
    canvasContainer.classList.remove('dragging');
  }
}

canvasContainer.addEventListener('pointerup', endPointer);
canvasContainer.addEventListener('pointercancel', endPointer);
canvasContainer.addEventListener('pointerleave', () => {
  if (!dragSession) {
    state.cursorTarget = null;
    state.hoveredFeature = null;
    if (!state.pinnedTarget) {
      updateReadoutUI(null, false);
    }
    scheduleRender();
  }
});

// Wheel zoom (adjusts map radius in km)
canvasContainer.addEventListener(
  'wheel',
  (e) => {
    e.preventDefault();
    const factor = Math.exp(e.deltaY * 0.0011);
    const nextRadius = Math.max(
      MIN_RADIUS_KM,
      Math.min(MAX_RADIUS_KM, Math.round(state.radiusKm * factor))
    );
    if (nextRadius !== state.radiusKm) {
      state.radiusKm = nextRadius;
      syncRadiusUI();
      scheduleRender();
    }
  },
  { passive: false }
);

// Unpin via button or Escape key
unpinBtn.addEventListener('click', () => {
  state.pinnedTarget = null;
  state.pinnedFeature = null;
  updateReadoutUI(state.cursorTarget, false);
  scheduleRender();
});

window.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && state.pinnedTarget) {
    state.pinnedTarget = null;
    state.pinnedFeature = null;
    updateReadoutUI(state.cursorTarget, false);
    scheduleRender();
  }
});

// Form & Input Controls
qthForm.addEventListener('submit', (e) => {
  e.preventDefault();
  const parsed = parseLocationInput(qthInput.value);
  if (!parsed) {
    qthError.textContent =
      'Enter "lat, lon" (e.g. 47.9433, -3.0849) or Maidenhead grid (e.g. IN87kw).';
    return;
  }
  qthError.textContent = '';
  state.lat = parsed.lat;
  state.lon = parsed.lon;
  syncCenterUI(false);
  scheduleRender();
});

function handleCoordNumberChange() {
  const lat = parseFloat(latInput.value);
  const lon = parseFloat(lonInput.value);
  if (!Number.isNaN(lat) && !Number.isNaN(lon)) {
    const norm = normalizeLatLon(lat, lon);
    state.lat = norm.lat;
    state.lon = norm.lon;
    qthError.textContent = '';
    syncCenterUI(true);
    scheduleRender();
  }
}

latInput.addEventListener('change', handleCoordNumberChange);
lonInput.addEventListener('change', handleCoordNumberChange);

resetQthBtn.addEventListener('click', () => {
  state.lat = DEFAULT_CENTER.lat;
  state.lon = DEFAULT_CENTER.lon;
  state.radiusKm = DEFAULT_CENTER.radiusKm;
  qthError.textContent = '';
  syncCenterUI(true);
  syncRadiusUI();
  scheduleRender();
});

gpsQthBtn.addEventListener('click', () => {
  if (!navigator.geolocation) {
    qthError.textContent = 'Geolocation is not supported by this browser.';
    return;
  }
  gpsQthBtn.textContent = 'Locating…';
  navigator.geolocation.getCurrentPosition(
    (pos) => {
      gpsQthBtn.textContent = 'Use My GPS';
      qthError.textContent = '';
      const norm = normalizeLatLon(pos.coords.latitude, pos.coords.longitude);
      state.lat = norm.lat;
      state.lon = norm.lon;
      syncCenterUI(true);
      scheduleRender();
    },
    () => {
      gpsQthBtn.textContent = 'Use My GPS';
      qthError.textContent = 'Unable to retrieve GPS location.';
    },
    { enableHighAccuracy: false, timeout: 8000 }
  );
});

radiusSlider.addEventListener('input', () => {
  state.radiusKm = Math.max(
    MIN_RADIUS_KM,
    Math.min(MAX_RADIUS_KM, Number(radiusSlider.value))
  );
  syncRadiusUI();
  scheduleRender();
});

radiusInput.addEventListener('change', () => {
  const val = parseFloat(radiusInput.value);
  if (!Number.isNaN(val)) {
    state.radiusKm = Math.max(
      MIN_RADIUS_KM,
      Math.min(MAX_RADIUS_KM, Math.round(val))
    );
    syncRadiusUI();
    scheduleRender();
  }
});

radiusPresets.addEventListener('click', (e) => {
  const btn = e.target.closest('.pill-btn');
  if (!btn) return;
  const r = Number(btn.dataset.radius);
  if (r) {
    state.radiusKm = r;
    syncRadiusUI();
    scheduleRender();
  }
});

labelModeControl.addEventListener('click', (e) => {
  const btn = e.target.closest('.seg-btn');
  if (!btn) return;
  state.labelMode = btn.dataset.mode;
  for (const b of labelModeControl.querySelectorAll('.seg-btn')) {
    b.classList.toggle('active', b === btn);
  }
  scheduleRender();
});

toggleStates.addEventListener('change', () => {
  state.showStates = toggleStates.checked;
  scheduleRender();
});

toggleGreyline.addEventListener('change', () => {
  state.showGreyline = toggleGreyline.checked;
  state.now = new Date();
  scheduleRender();
});

toggleRingLabels.addEventListener('change', () => {
  state.showRingLabels = toggleRingLabels.checked;
  scheduleRender();
});

themeToggleBtn.addEventListener('click', () => {
  state.theme = state.theme === 'light' ? 'dark' : 'light';
  document.documentElement.setAttribute('data-theme', state.theme);
  themeIcon.textContent = state.theme === 'light' ? '🌙' : '☀️';
  scheduleRender();
});

// Live UTC Clock & Solar Terminator refresh
function updateUtcClock() {
  const now = new Date();
  state.now = now;
  const iso = now.toISOString();
  utcTimeText.textContent = `UTC ${iso.slice(0, 10)} ${iso.slice(11, 19)}Z`;
  if (state.showGreyline) {
    scheduleRender();
  }
}

updateUtcClock();
setInterval(updateUtcClock, 1000);

// Initial UI sync & render
document.documentElement.setAttribute('data-theme', state.theme);
themeIcon.textContent = state.theme === 'light' ? '🌙' : '☀️';
toggleGreyline.checked = state.showGreyline;
toggleStates.checked = state.showStates;
toggleRingLabels.checked = state.showRingLabels;
for (const b of labelModeControl.querySelectorAll('.seg-btn')) {
  b.classList.toggle('active', b.dataset.mode === state.labelMode);
}
syncCenterUI(true);
syncRadiusUI();
handleResize();
