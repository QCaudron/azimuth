import {
  geoAzimuthalEquidistant,
  geoPath,
  geoDistance,
  geoContains,
  geoBounds,
} from 'd3-geo';
import * as topojson from 'topojson-client';
import {
  EARTH_RADIUS_KM,
  chooseRingStepKm,
  computeBearingAndDistance,
  destinationPoint,
} from './geo.js';
import { buildGreylineGeometry } from './solar.js';

const DEG2RAD = Math.PI / 180;
const RAD2DEG = 180 / Math.PI;

export const THEMES = {
  light: {
    canvasBg: '#ffffff',
    ocean: '#8bcaf0',
    land: '#ffffff',
    lake: '#8bcaf0',
    hoverFill: 'rgba(253, 224, 71, 0.45)',
    pinnedFill: 'rgba(249, 115, 22, 0.25)',
    coastStroke: '#1e293b',
    countryStroke: '#334155',
    stateStroke: '#64748b',
    gridLine: 'rgba(15, 35, 58, 0.34)',
    gridCardinal: 'rgba(15, 35, 58, 0.58)',
    ringLabelText: '#1e3a5f',
    ringLabelHalo: 'rgba(255, 255, 255, 0.85)',
    bezelFill: '#ffffff',
    bezelStroke: '#0f172a',
    tickMinor: '#475569',
    tickMajor: '#0f172a',
    bezelText: '#0f172a',
    countryText: '#0f172a',
    countryHalo: 'rgba(255, 255, 255, 0.92)',
    dxccBadgeText: '#0369a1',
    stateText: '#334155',
    stateHalo: 'rgba(255, 255, 255, 0.9)',
    centerMarker: '#dc2626',
    cursorRay: 'rgba(220, 38, 38, 0.85)',
    cursorLongPathRay: 'rgba(37, 99, 235, 0.55)',
    nightFill: 'rgba(12, 24, 48, 0.22)',
    civilNightFill: 'rgba(12, 24, 48, 0.14)',
    nauticalNightFill: 'rgba(12, 24, 48, 0.12)',
    terminatorStroke: '#d97706',
    sunFill: '#f59e0b',
    sunStroke: '#ffffff',
  },
  dark: {
    canvasBg: '#09111e',
    ocean: '#0c1b2e',
    land: '#1c2e44',
    lake: '#0c1b2e',
    hoverFill: 'rgba(56, 189, 248, 0.26)',
    pinnedFill: 'rgba(251, 146, 60, 0.28)',
    coastStroke: '#7aa2c9',
    countryStroke: '#527396',
    stateStroke: '#3d5a78',
    gridLine: 'rgba(148, 184, 218, 0.22)',
    gridCardinal: 'rgba(148, 184, 218, 0.45)',
    ringLabelText: '#93c5fd',
    ringLabelHalo: 'rgba(9, 17, 30, 0.88)',
    bezelFill: '#0f1929',
    bezelStroke: '#94a3b8',
    tickMinor: '#64748b',
    tickMajor: '#e2e8f0',
    bezelText: '#e2e8f0',
    countryText: '#f1f5f9',
    countryHalo: 'rgba(9, 17, 30, 0.92)',
    dxccBadgeText: '#38bdf8',
    stateText: '#94a3b8',
    stateHalo: 'rgba(9, 17, 30, 0.9)',
    centerMarker: '#f87171',
    cursorRay: 'rgba(248, 113, 113, 0.9)',
    cursorLongPathRay: 'rgba(56, 189, 248, 0.55)',
    nightFill: 'rgba(2, 6, 15, 0.36)',
    civilNightFill: 'rgba(2, 6, 15, 0.22)',
    nauticalNightFill: 'rgba(2, 6, 15, 0.18)',
    terminatorStroke: '#fbbf24',
    sunFill: '#fbbf24',
    sunStroke: '#09111e',
  },
};

function pointInBounds(lon, lat, bounds) {
  const [[minLon, minLat], [maxLon, maxLat]] = bounds;
  if (lat < minLat - 0.5 || lat > maxLat + 0.5) return false;
  if (minLon <= maxLon) {
    return lon >= minLon - 0.5 && lon <= maxLon + 0.5;
  }
  // Crosses antimeridian
  return lon >= minLon - 0.5 || lon <= maxLon + 0.5;
}

export class AzimuthalMapRenderer {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d', { alpha: false });
    this.atlas = null;
    this.projection = geoAzimuthalEquidistant();
    this.dpr = window.devicePixelRatio || 1;
    this.width = 0;
    this.height = 0;
    this.centerX = 0;
    this.centerY = 0;
    this.mapRadiusPx = 0;

    this.cachedGreyline = null;
    this.cachedGreylineMinute = -1;
  }

  setAtlas(topology) {
    const countriesFc = topojson.feature(topology, topology.objects.countries);
    const statesFc = topojson.feature(topology, topology.objects.states);
    const lakesFc = topojson.feature(topology, topology.objects.lakes);

    // Precompute meshes for ultra-fast single-pass Canvas rendering
    const landMerged = topojson.merge(
      topology,
      topology.objects.countries.geometries
    );
    const coastlinesMesh = topojson.mesh(
      topology,
      topology.objects.countries,
      (a, b) => a === b
    );
    const countryBordersMesh = topojson.mesh(
      topology,
      topology.objects.countries,
      (a, b) => a !== b
    );
    const stateBordersMesh = topojson.mesh(
      topology,
      topology.objects.states,
      (a, b) => a !== b
    );

    // Sort countries by priority (larger area and lower rank number first) for label collision
    const sortedCountries = [...countriesFc.features].sort((a, b) => {
      const scoreA = (a.properties.area || 1) / Math.pow(a.properties.rank || 4, 1.4);
      const scoreB = (b.properties.area || 1) / Math.pow(b.properties.rank || 4, 1.4);
      return scoreB - scoreA;
    });

    // Sort states by area descending
    const sortedStates = [...statesFc.features].sort(
      (a, b) => (b.properties.area || 0) - (a.properties.area || 0)
    );

    // Precompute bounding boxes for fast cursor hit-testing
    for (const f of countriesFc.features) {
      f._bounds = geoBounds(f);
    }
    for (const f of statesFc.features) {
      f._bounds = geoBounds(f);
    }

    this.atlas = {
      countries: countriesFc.features,
      sortedCountries,
      states: statesFc.features,
      sortedStates,
      lakes: lakesFc,
      landMerged,
      coastlinesMesh,
      countryBordersMesh,
      stateBordersMesh,
    };
  }

  resize(cssWidth, cssHeight) {
    this.dpr = window.devicePixelRatio || 1;
    this.width = cssWidth;
    this.height = cssHeight;
    this.canvas.width = Math.round(cssWidth * this.dpr);
    this.canvas.height = Math.round(cssHeight * this.dpr);
    this.centerX = cssWidth / 2;
    this.centerY = cssHeight / 2;

    // Leave margin around the circle for the 2-ring degree bezel + degree numbers
    const minDim = Math.min(cssWidth, cssHeight);
    const bezelMargin = Math.max(46, Math.min(68, minDim * 0.085));
    this.mapRadiusPx = Math.max(80, minDim / 2 - bezelMargin);
  }

  /**
   * Convert screen (x, y) in CSS pixels relative to canvas to geographical coordinates,
   * bearing, and distance from current map center.
   */
  screenToGeo(x, y, state) {
    const dx = x - this.centerX;
    const dy = y - this.centerY;
    const rPx = Math.hypot(dx, dy);
    if (rPx > this.mapRadiusPx * 1.08) {
      return null;
    }
    const clampedRPx = Math.min(rPx, this.mapRadiusPx);
    const distanceKm = (clampedRPx / this.mapRadiusPx) * state.radiusKm;
    const bearingDeg =
      rPx < 0.5 ? 0 : ((Math.atan2(dx, -dy) * RAD2DEG) + 360) % 360;
    const { lat, lon } = destinationPoint(
      state.lat,
      state.lon,
      bearingDeg,
      distanceKm
    );
    const longPathBearingDeg = (bearingDeg + 180) % 360;
    const longPathKm = 2 * Math.PI * EARTH_RADIUS_KM - distanceKm;

    return {
      lat,
      lon,
      bearingDeg,
      longPathBearingDeg,
      distanceKm,
      longPathKm,
      insideCircle: rPx <= this.mapRadiusPx,
    };
  }

  /**
   * Find the country and (if in US/Canada) state/province containing (lon, lat).
   */
  hitTest(lon, lat) {
    if (!this.atlas) return { country: null, state: null };
    const pt = [lon, lat];

    let matchedCountry = null;
    for (const f of this.atlas.countries) {
      if (pointInBounds(lon, lat, f._bounds) && geoContains(f, pt)) {
        matchedCountry = f;
        break;
      }
    }

    let matchedState = null;
    if (
      !matchedCountry ||
      matchedCountry.properties.adm0 === 'USA' ||
      matchedCountry.properties.adm0 === 'CAN'
    ) {
      for (const s of this.atlas.states) {
        if (pointInBounds(lon, lat, s._bounds) && geoContains(s, pt)) {
          matchedState = s;
          break;
        }
      }
    }

    return { country: matchedCountry, state: matchedState };
  }

  getGreyline(date) {
    const minuteKey = Math.floor(date.getTime() / 60000);
    if (!this.cachedGreyline || this.cachedGreylineMinute !== minuteKey) {
      this.cachedGreyline = buildGreylineGeometry(date);
      this.cachedGreylineMinute = minuteKey;
    }
    return this.cachedGreyline;
  }

  render(state) {
    const { ctx, width, height, centerX, centerY, mapRadiusPx, dpr } = this;
    if (!width || !height) return;

    const theme = THEMES[state.theme] || THEMES.light;

    ctx.save();
    ctx.scale(dpr, dpr);

    // 1. Clear background
    ctx.fillStyle = theme.canvasBg;
    ctx.fillRect(0, 0, width, height);

    // Configure D3 Azimuthal Equidistant projection
    const maxAngleRad = Math.min(
      Math.PI - 0.002,
      Math.max(0.05, state.radiusKm / EARTH_RADIUS_KM)
    );
    const maxAngleDeg = maxAngleRad * RAD2DEG;
    const scale = mapRadiusPx / maxAngleRad;

    this.projection
      .scale(scale)
      .translate([centerX, centerY])
      .rotate([-state.lon, -state.lat, 0])
      .clipAngle(Math.min(179.85, maxAngleDeg + 0.15))
      .precision(0.5);

    const path = geoPath(this.projection, ctx);

    // 2. Clip to the exact outer map circle and fill ocean
    ctx.save();
    ctx.beginPath();
    ctx.arc(centerX, centerY, mapRadiusPx, 0, Math.PI * 2);
    ctx.fillStyle = theme.ocean;
    ctx.fill();
    ctx.clip();

    if (this.atlas) {
      // 3. Fill all landmasses in one pass
      ctx.beginPath();
      path(this.atlas.landMerged);
      ctx.fillStyle = theme.land;
      ctx.fill();

      // 4. Fill major lakes
      ctx.beginPath();
      path(this.atlas.lakes);
      ctx.fillStyle = theme.lake;
      ctx.fill();
      ctx.strokeStyle = theme.coastStroke;
      ctx.lineWidth = 0.45;
      ctx.stroke();

      // 5. Highlight hovered country/state or pinned target country
      if (state.hoveredFeature) {
        ctx.beginPath();
        path(state.hoveredFeature);
        ctx.fillStyle = theme.hoverFill;
        ctx.fill();
      }
      if (state.pinnedFeature && state.pinnedFeature !== state.hoveredFeature) {
        ctx.beginPath();
        path(state.pinnedFeature);
        ctx.fillStyle = theme.pinnedFill;
        ctx.fill();
      }

      // 6. Optional NA States & Provinces internal borders
      if (state.showStates) {
        ctx.beginPath();
        path(this.atlas.stateBordersMesh);
        ctx.strokeStyle = theme.stateStroke;
        ctx.lineWidth = 0.55;
        ctx.stroke();
      }

      // 7. Country internal borders & coastlines
      ctx.beginPath();
      path(this.atlas.countryBordersMesh);
      ctx.strokeStyle = theme.countryStroke;
      ctx.lineWidth = 0.65;
      ctx.stroke();

      ctx.beginPath();
      path(this.atlas.coastlinesMesh);
      ctx.strokeStyle = theme.coastStroke;
      ctx.lineWidth = 0.75;
      ctx.stroke();
    }

    // 8. Optional Live Greyline / Day-Night Overlay
    if (state.showGreyline) {
      this.renderGreyline(ctx, path, state, theme);
    }

    // 9. Concentric Distance Rings & 10° Radial Bearing Grid
    const ringLabelBoxes = this.renderAzimuthGrid(ctx, state, theme);

    // 10. Country & State Labels (clipped to map circle)
    if (this.atlas) {
      this.renderLabels(ctx, state, theme, ringLabelBoxes);
    }

    // 11. Interactive Cursor / Pinned Target Ray inside circle
    this.renderActiveRays(ctx, state, theme);

    // 12. Center QTH marker
    this.renderCenterMarker(ctx, theme);

    ctx.restore(); // End map circle clip

    // 13. Outer Compass Bezel (1°, 5°, 10° ticks and tangential bearing labels)
    this.renderCompassBezel(ctx, state, theme);

    ctx.restore();
  }

  renderGreyline(ctx, path, state, theme) {
    const grey = this.getGreyline(state.now || new Date());

    // Night hemisphere (< 0° solar elevation)
    ctx.beginPath();
    path(grey.nightCircle);
    ctx.fillStyle = theme.nightFill;
    ctx.fill();

    // Civil night (< -6° solar elevation)
    ctx.beginPath();
    path(grey.civilNightCircle);
    ctx.fillStyle = theme.civilNightFill;
    ctx.fill();

    // Nautical night (< -12° solar elevation)
    ctx.beginPath();
    path(grey.nauticalNightCircle);
    ctx.fillStyle = theme.nauticalNightFill;
    ctx.fill();

    // Solar terminator line (90° from subsolar point)
    ctx.save();
    ctx.beginPath();
    path(grey.nightCircle);
    ctx.strokeStyle = theme.terminatorStroke;
    ctx.lineWidth = 1.4;
    ctx.setLineDash([6, 4]);
    ctx.stroke();
    ctx.restore();

    // Subsolar sun marker if within map radius
    const sunDistKm =
      geoDistance(
        [state.lon, state.lat],
        [grey.subsolar.subsolarLon, grey.subsolar.subsolarLat]
      ) * EARTH_RADIUS_KM;
    if (sunDistKm <= state.radiusKm * 0.98) {
      const sunPt = this.projection([
        grey.subsolar.subsolarLon,
        grey.subsolar.subsolarLat,
      ]);
      if (sunPt) {
        ctx.save();
        ctx.beginPath();
        ctx.arc(sunPt[0], sunPt[1], 5, 0, Math.PI * 2);
        ctx.fillStyle = theme.sunFill;
        ctx.fill();
        ctx.lineWidth = 1.5;
        ctx.strokeStyle = theme.sunStroke;
        ctx.stroke();
        ctx.restore();
      }
    }
  }

  renderAzimuthGrid(ctx, state, theme) {
    const { centerX, centerY, mapRadiusPx } = this;
    const stepKm = chooseRingStepKm(state.radiusKm);
    const firstRingKm = stepKm;
    const innerStopRadiusPx = Math.min(
      mapRadiusPx * 0.25,
      (firstRingKm / state.radiusKm) * mapRadiusPx
    );

    // Concentric distance rings
    ctx.strokeStyle = theme.gridLine;
    ctx.lineWidth = 0.6;
    const ringRadii = [];
    for (let dKm = stepKm; dKm < state.radiusKm - stepKm * 0.15; dKm += stepKm) {
      const rPx = (dKm / state.radiusKm) * mapRadiusPx;
      ringRadii.push({ dKm, rPx });
      ctx.beginPath();
      ctx.arc(centerX, centerY, rPx, 0, Math.PI * 2);
      ctx.stroke();
    }

    // 10° radial lines (matching NS6T: non-cardinal lines stop at the innermost distance ring)
    ctx.beginPath();
    for (let deg = 0; deg < 360; deg += 10) {
      if (deg % 90 === 0) continue; // Cardinal drawn separately to center
      const rad = (deg - 90) * DEG2RAD;
      const cos = Math.cos(rad);
      const sin = Math.sin(rad);
      ctx.moveTo(centerX + cos * innerStopRadiusPx, centerY + sin * innerStopRadiusPx);
      ctx.lineTo(centerX + cos * mapRadiusPx, centerY + sin * mapRadiusPx);
    }
    ctx.strokeStyle = theme.gridLine;
    ctx.lineWidth = 0.55;
    ctx.stroke();

    // 4 Cardinal lines (0°, 90°, 180°, 270°) extend all the way to center
    ctx.beginPath();
    for (let deg = 0; deg < 360; deg += 90) {
      const rad = (deg - 90) * DEG2RAD;
      const cos = Math.cos(rad);
      const sin = Math.sin(rad);
      ctx.moveTo(centerX, centerY);
      ctx.lineTo(centerX + cos * mapRadiusPx, centerY + sin * mapRadiusPx);
    }
    ctx.strokeStyle = theme.gridCardinal;
    ctx.lineWidth = 0.7;
    ctx.stroke();

    // Subtle distance ring labels along the 0° meridian
    const ringLabelBoxes = [];
    if (state.showRingLabels !== false) {
      ctx.save();
      ctx.font = '500 9.5px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.lineJoin = 'round';
      ctx.lineWidth = 2.8;
      ctx.strokeStyle = theme.ringLabelHalo;
      ctx.fillStyle = theme.ringLabelText;

      for (const { dKm, rPx } of ringRadii) {
        if (rPx < 42 || rPx > mapRadiusPx - 22) continue;
        const label = dKm >= 1000 ? `${(dKm / 1000).toFixed(dKm % 1000 === 0 ? 0 : 1)}k km` : `${dKm} km`;
        const w = ctx.measureText(label).width;
        const ly = centerY - rPx;
        ctx.strokeText(label, centerX, ly);
        ctx.fillText(label, centerX, ly);
        ringLabelBoxes.push({
          x1: centerX - w / 2 - 2,
          y1: ly - 6,
          x2: centerX + w / 2 + 2,
          y2: ly + 6,
        });
      }
      ctx.restore();
    }
    return ringLabelBoxes;
  }

  /**
   * Resolve the best screen (x, y) anchor for a feature inside the current azimuthal circle.
   */
  resolveFeatureLabelPoint(props, centerLonLat, maxRadiusKm) {
    const primaryLonLat = [props.lx, props.ly];
    const primaryDistKm = geoDistance(centerLonLat, primaryLonLat) * EARTH_RADIUS_KM;

    if (primaryDistKm <= maxRadiusKm * 0.93) {
      const pt = this.projection(primaryLonLat);
      if (pt) return { x: pt[0], y: pt[1], distKm: primaryDistKm };
    }

    // If primary anchor is near/outside the boundary circle, check interior backup points
    if (props.alt && props.alt.length > 0) {
      let sumX = 0;
      let sumY = 0;
      let count = 0;
      let minDist = Infinity;
      for (const altLonLat of props.alt) {
        const dKm = geoDistance(centerLonLat, altLonLat) * EARTH_RADIUS_KM;
        if (dKm <= maxRadiusKm * 0.91) {
          const pt = this.projection(altLonLat);
          if (pt) {
            sumX += pt[0];
            sumY += pt[1];
            count++;
            if (dKm < minDist) minDist = dKm;
          }
        }
      }
      if (count > 0) {
        return { x: sumX / count, y: sumY / count, distKm: minDist };
      }
    }

    return null;
  }

  renderLabels(ctx, state, theme, ringLabelBoxes = []) {
    if (state.labelMode === 'none' && !state.showStates) return;

    const { centerX, centerY, mapRadiusPx } = this;
    const centerLonLat = [state.lon, state.lat];
    const placedBoxes = [...ringLabelBoxes];

    const collides = (box) => {
      for (let i = 0; i < placedBoxes.length; i++) {
        const b = placedBoxes[i];
        if (
          box.x1 < b.x2 &&
          box.x2 > b.x1 &&
          box.y1 < b.y2 &&
          box.y2 > b.y1
        ) {
          return true;
        }
      }
      return false;
    };

    // Reserve a tiny box around the center crosshair
    placedBoxes.push({
      x1: centerX - 9,
      y1: centerY - 9,
      x2: centerX + 9,
      y2: centerY + 9,
    });

    // Pixels per 1000 km at current zoom
    const pxPer1000Km = (mapRadiusPx / state.radiusKm) * 1000;

    ctx.save();
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.lineJoin = 'round';

    const drawCountryLabel = (feature) => {
      const p = feature.properties;
      const resolved = this.resolveFeatureLabelPoint(p, centerLonLat, state.radiusKm);
      if (!resolved) return;

      const { x, y } = resolved;
      const distFromCenterPx = Math.hypot(x - centerX, y - centerY);
      if (distFromCenterPx > mapRadiusPx - 12) return;

      // Determine projected approximate linear size of the country in pixels
      const approxSideKm = Math.sqrt(Math.max(100, p.area || 1000));
      const approxSidePx = (approxSideKm / 1000) * pxPer1000Km;

      // Skip minuscule islands at wide zoom unless DXCC mode or zoomed in
      const minPxThreshold = state.labelMode === 'dxcc' ? 4.5 : 6.5;
      if (approxSidePx < minPxThreshold && p.rank > 3 && distFromCenterPx > mapRadiusPx * 0.22) {
        return;
      }

      // Build candidate label strings (primary + compact fallback if collision)
      const candidates = [];
      if (state.labelMode === 'name') {
        candidates.push(p.name);
      } else if (state.labelMode === 'both') {
        candidates.push(p.dxcc ? `${p.name} (${p.dxcc})` : p.name);
        candidates.push(p.name);
        if (p.dxcc) candidates.push(p.dxcc);
      } else if (state.labelMode === 'dxcc') {
        if (p.dxcc) candidates.push(p.dxcc);
      }

      if (candidates.length === 0) return;

      // Font size scaled gently by country area
      const fontSize =
        p.area > 2500000
          ? 12
          : p.area > 450000
          ? 10.5
          : p.area > 70000
          ? 9.5
          : 8.8;

      ctx.font = `600 ${fontSize}px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif`;

      for (const text of candidates) {
        const w = ctx.measureText(text).width;
        const h = fontSize + 1.5;
        const pad = 1.2;

        // Try exact anchor first, then small spiral nudges
        const offsets = [
          [0, 0],
          [0, -h * 0.72],
          [0, h * 0.72],
          [-w * 0.32, 0],
          [w * 0.32, 0],
          [-w * 0.24, -h * 0.65],
          [w * 0.24, -h * 0.65],
          [-w * 0.24, h * 0.65],
          [w * 0.24, h * 0.65],
        ];

        for (const [ox, oy] of offsets) {
          const cx = x + ox;
          const cy = y + oy;
          if (Math.hypot(cx - centerX, cy - centerY) + w * 0.42 > mapRadiusPx - 5) {
            continue;
          }
          const box = {
            x1: cx - w / 2 - pad,
            y1: cy - h / 2 - pad,
            x2: cx + w / 2 + pad,
            y2: cy + h / 2 + pad,
          };
          if (!collides(box)) {
            placedBoxes.push(box);
            ctx.lineWidth = 2.8;
            ctx.strokeStyle = theme.countryHalo;
            ctx.strokeText(text, cx, cy);
            ctx.fillStyle =
              state.labelMode === 'dxcc' ? theme.dxccBadgeText : theme.countryText;
            ctx.fillText(text, cx, cy);
            return;
          }
        }
      }
    };

    if (state.labelMode !== 'none') {
      for (const f of this.atlas.sortedCountries) {
        if (state.showStates && f.properties.id === 'USK') {
          // Alaska is already in NA states when showStates is on
          continue;
        }
        drawCountryLabel(f);
      }
    }

    if (state.showStates) {
      for (const s of this.atlas.sortedStates) {
        const p = s.properties;
        const resolved = this.resolveFeatureLabelPoint(p, centerLonLat, state.radiusKm);
        if (!resolved) continue;

        const { x, y } = resolved;
        const distFromCenterPx = Math.hypot(x - centerX, y - centerY);
        if (distFromCenterPx > mapRadiusPx - 14) continue;

        const approxSideKm = Math.sqrt(Math.max(100, p.area || 1000));
        const approxSidePx = (approxSideKm / 1000) * pxPer1000Km;
        if (approxSidePx < 7) continue;

        const candidates = [];
        if (state.labelMode === 'dxcc') {
          candidates.push(`${p.postal} (${p.dxcc})`);
          candidates.push(p.postal);
        } else if (state.labelMode === 'both') {
          if (approxSidePx > 34) candidates.push(`${p.name} (${p.dxcc})`);
          if (approxSidePx > 24) candidates.push(p.name);
          candidates.push(`${p.postal} (${p.dxcc})`);
          candidates.push(p.postal);
        } else {
          if (approxSidePx > 22) candidates.push(p.name);
          candidates.push(p.postal);
        }

        const fontSize = p.area > 400000 ? 10 : 9;
        ctx.font = `500 ${fontSize}px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif`;

        for (const text of candidates) {
          const w = ctx.measureText(text).width;
          const h = fontSize + 1;
          const box = {
            x1: x - w / 2 - 1.5,
            y1: y - h / 2 - 1.5,
            x2: x + w / 2 + 1.5,
            y2: y + h / 2 + 1.5,
          };
          if (
            Math.hypot(x - centerX, y - centerY) + w * 0.45 <= mapRadiusPx - 6 &&
            !collides(box)
          ) {
            placedBoxes.push(box);
            ctx.lineWidth = 2.6;
            ctx.strokeStyle = theme.stateHalo;
            ctx.strokeText(text, x, y);
            ctx.fillStyle = theme.stateText;
            ctx.fillText(text, x, y);
            break;
          }
        }
      }
    }

    ctx.restore();
  }

  renderActiveRays(ctx, state, theme) {
    const { centerX, centerY, mapRadiusPx } = this;
    const target = state.pinnedTarget || state.cursorTarget;
    if (!target || !target.insideCircle) return;

    const rad = (target.bearingDeg - 90) * DEG2RAD;
    const cos = Math.cos(rad);
    const sin = Math.sin(rad);
    const targetRPx = Math.min(
      mapRadiusPx,
      (target.distanceKm / state.radiusKm) * mapRadiusPx
    );
    const tx = centerX + cos * targetRPx;
    const ty = centerY + sin * targetRPx;

    ctx.save();

    // Reciprocal long-path dashed ray (center to opposite edge)
    const lpRad = (target.longPathBearingDeg - 90) * DEG2RAD;
    ctx.beginPath();
    ctx.moveTo(centerX, centerY);
    ctx.lineTo(
      centerX + Math.cos(lpRad) * mapRadiusPx,
      centerY + Math.sin(lpRad) * mapRadiusPx
    );
    ctx.strokeStyle = theme.cursorLongPathRay;
    ctx.lineWidth = 1.1;
    ctx.setLineDash([4, 4]);
    ctx.stroke();

    // Short-path ray from center through target to outer bezel
    ctx.setLineDash([]);
    ctx.beginPath();
    ctx.moveTo(centerX, centerY);
    ctx.lineTo(centerX + cos * mapRadiusPx, centerY + sin * mapRadiusPx);
    ctx.strokeStyle = theme.cursorRay;
    ctx.lineWidth = state.pinnedTarget ? 1.8 : 1.25;
    ctx.stroke();

    // Target dot
    ctx.beginPath();
    ctx.arc(tx, ty, state.pinnedTarget ? 4.5 : 3.5, 0, Math.PI * 2);
    ctx.fillStyle = theme.cursorRay;
    ctx.fill();
    ctx.lineWidth = 1.5;
    ctx.strokeStyle = theme.canvasBg;
    ctx.stroke();

    ctx.restore();
  }

  renderCenterMarker(ctx, theme) {
    const { centerX, centerY } = this;
    ctx.save();
    ctx.strokeStyle = theme.centerMarker;
    ctx.fillStyle = theme.centerMarker;
    ctx.lineWidth = 1.5;

    ctx.beginPath();
    ctx.arc(centerX, centerY, 3, 0, Math.PI * 2);
    ctx.fill();

    ctx.beginPath();
    ctx.arc(centerX, centerY, 7, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }

  /**
   * Render the classic NS6T 2-ring degree bezel with 1° minor ticks, 5° medium ticks,
   * 10° major ticks, and tangential degree labels every 10° around the outside of the circle.
   */
  renderCompassBezel(ctx, state, theme) {
    const { centerX, centerY, mapRadiusPx } = this;
    const r0 = mapRadiusPx;
    const r1 = r0 + 7; // 1° tick ring
    const r2 = r0 + 14; // 5° & 10° tick ring
    const rLabel = r2 + 12;

    ctx.save();

    // Annulus background between r0 and r2
    ctx.beginPath();
    ctx.arc(centerX, centerY, r2, 0, Math.PI * 2);
    ctx.arc(centerX, centerY, r0, 0, Math.PI * 2, true);
    ctx.fillStyle = theme.bezelFill;
    ctx.fill();

    // 1° minor ticks (r0 -> r1)
    ctx.beginPath();
    for (let deg = 0; deg < 360; deg += 1) {
      if (deg % 5 === 0) continue;
      const rad = (deg - 90) * DEG2RAD;
      const cos = Math.cos(rad);
      const sin = Math.sin(rad);
      ctx.moveTo(centerX + cos * r0, centerY + sin * r0);
      ctx.lineTo(centerX + cos * r1, centerY + sin * r1);
    }
    ctx.strokeStyle = theme.tickMinor;
    ctx.lineWidth = 0.6;
    ctx.stroke();

    // 5° and 10° ticks (r0 -> r2)
    ctx.beginPath();
    for (let deg = 0; deg < 360; deg += 5) {
      const rad = (deg - 90) * DEG2RAD;
      const cos = Math.cos(rad);
      const sin = Math.sin(rad);
      ctx.moveTo(centerX + cos * r0, centerY + sin * r0);
      ctx.lineTo(centerX + cos * r2, centerY + sin * r2);
    }
    ctx.strokeStyle = theme.tickMajor;
    ctx.lineWidth = 1.05;
    ctx.stroke();

    // Three concentric bezel circles (r0, r1, r2) matching NS6T
    ctx.strokeStyle = theme.bezelStroke;
    ctx.lineWidth = 1.1;
    for (const r of [r0, r1, r2]) {
      ctx.beginPath();
      ctx.arc(centerX, centerY, r, 0, Math.PI * 2);
      ctx.stroke();
    }

    // Active target bearing marker on bezel
    const target = state.pinnedTarget || state.cursorTarget;
    if (target && target.insideCircle) {
      const drawBezelPip = (bearing, color) => {
        const rad = (bearing - 90) * DEG2RAD;
        ctx.save();
        ctx.translate(centerX + Math.cos(rad) * r2, centerY + Math.sin(rad) * r2);
        ctx.rotate(bearing * DEG2RAD);
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.lineTo(-4.5, -7);
        ctx.lineTo(4.5, -7);
        ctx.closePath();
        ctx.fillStyle = color;
        ctx.fill();
        ctx.restore();
      };
      drawBezelPip(target.bearingDeg, theme.cursorRay);
      drawBezelPip(target.longPathBearingDeg, theme.cursorLongPathRay);
    }

    // Tangential degree labels every 10° outside the bezel ring
    const fontSize = mapRadiusPx < 220 ? 10.5 : 12.5;
    ctx.font = `600 ${fontSize}px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif`;
    ctx.fillStyle = theme.bezelText;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    for (let deg = 0; deg < 360; deg += 10) {
      const rad = (deg - 90) * DEG2RAD;
      const lx = centerX + Math.cos(rad) * rLabel;
      const ly = centerY + Math.sin(rad) * rLabel;

      ctx.save();
      ctx.translate(lx, ly);
      // Keep labels right-side up: top half rotates by deg, bottom half (100°..260°) flips by deg - 180°
      const textRotDeg = deg > 90 && deg < 270 ? deg - 180 : deg;
      ctx.rotate(textRotDeg * DEG2RAD);
      ctx.fillText(`${deg}°`, 0, 0);
      ctx.restore();
    }

    ctx.restore();
  }
}
