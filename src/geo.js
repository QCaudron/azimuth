export const EARTH_RADIUS_KM = 6371.0088;
export const MAX_RADIUS_KM = Math.floor(Math.PI * EARTH_RADIUS_KM); // 20015 km
export const MIN_RADIUS_KM = 500;

export const DEFAULT_CENTER = {
  lat: 47.943355,
  lon: -3.084990,
  radiusKm: 8000,
};

const DEG2RAD = Math.PI / 180;
const RAD2DEG = 180 / Math.PI;

/**
 * Clamp latitude to [-89.999, 89.999] and wrap longitude to [-180, 180].
 */
export function normalizeLatLon(lat, lon) {
  const clampedLat = Math.max(-89.999, Math.min(89.999, Number(lat) || 0));
  let wrappedLon = ((Number(lon) || 0) + 180) % 360;
  if (wrappedLon < 0) wrappedLon += 360;
  wrappedLon -= 180;
  return { lat: clampedLat, lon: wrappedLon };
}

/**
 * Convert (lat, lon) to a 6-character Maidenhead grid square (e.g. IN87kw).
 */
export function latLonToMaidenhead(lat, lon) {
  const { lat: cLat, lon: cLon } = normalizeLatLon(lat, lon);
  const adjLon = Math.min(359.999999, Math.max(0, cLon + 180));
  const adjLat = Math.min(179.999999, Math.max(0, cLat + 90));

  const fLon = Math.floor(adjLon / 20);
  const fLat = Math.floor(adjLat / 10);

  const remLon1 = adjLon - fLon * 20;
  const remLat1 = adjLat - fLat * 10;

  const sLon = Math.floor(remLon1 / 2);
  const sLat = Math.floor(remLat1 / 1);

  const remLon2 = remLon1 - sLon * 2;
  const remLat2 = remLat1 - sLat * 1;

  const subLon = Math.floor(remLon2 * 12);
  const subLat = Math.floor(remLat2 * 24);

  return (
    String.fromCharCode(65 + fLon) +
    String.fromCharCode(65 + fLat) +
    String(sLon) +
    String(sLat) +
    String.fromCharCode(97 + subLon) +
    String.fromCharCode(97 + subLat)
  );
}

/**
 * Convert a 4-, 6-, or 8-character Maidenhead grid locator to { lat, lon } at the cell center.
 */
export function maidenheadToLatLon(locator) {
  if (typeof locator !== 'string') return null;
  const clean = locator.trim();
  const match = /^([A-Ra-r]{2})([0-9]{2})(?:([A-Xa-x]{2})(?:([0-9]{2}))?)?$/.exec(clean);
  if (!match) return null;

  const f = match[1].toUpperCase();
  const s = match[2];
  const sub = match[3] ? match[3].toLowerCase() : null;
  const ext = match[4] || null;

  let lon = (f.charCodeAt(0) - 65) * 20 - 180;
  let lat = (f.charCodeAt(1) - 65) * 10 - 90;

  lon += parseInt(s[0], 10) * 2;
  lat += parseInt(s[1], 10) * 1;

  if (sub) {
    lon += (sub.charCodeAt(0) - 97) * (2 / 24);
    lat += (sub.charCodeAt(1) - 97) * (1 / 24);
    if (ext) {
      lon += (parseInt(ext[0], 10) + 0.5) * (2 / 240);
      lat += (parseInt(ext[1], 10) + 0.5) * (1 / 240);
    } else {
      lon += 1 / 24;
      lat += 0.5 / 24;
    }
  } else {
    lon += 1.0;
    lat += 0.5;
  }

  return normalizeLatLon(lat, lon);
}

/**
 * Parse a user location string:
 * - Maidenhead grid square (e.g., "IN87kw", "FN31pr", "IO91")
 * - Decimal degrees (e.g., "47.943355, -3.084990", "47.943355N 3.084990W")
 * - DMS (e.g., "47°56'36\"N 3°05'06\"W")
 */
export function parseLocationInput(input) {
  if (!input || typeof input !== 'string') return null;
  const trimmed = input.trim();

  // 1. Check Maidenhead locator
  const mh = maidenheadToLatLon(trimmed);
  if (mh) return mh;

  // 2. Check DMS or Decimal with optional N/S/E/W
  const dmsRegex =
    /([+-]?\d+(?:\.\d+)?)\s*(?:°|d|\s)\s*(\d+(?:\.\d+)?)?\s*(?:'|′|m|\s)?\s*(\d+(?:\.\d+)?)?\s*(?:"|″|s)?\s*([NSns])?[,;\s]+([+-]?\d+(?:\.\d+)?)\s*(?:°|d|\s)\s*(\d+(?:\.\d+)?)?\s*(?:'|′|m|\s)?\s*(\d+(?:\.\d+)?)?\s*(?:"|″|s)?\s*([EWew])?/;

  // Try simple decimal pair first: "47.943355, -3.084990" or "47.943355N, 3.084990W"
  const decRegex =
    /^([+-]?\d+(?:\.\d+)?)\s*°?\s*([NSns])?[\s,;]+([+-]?\d+(?:\.\d+)?)\s*°?\s*([EWew])?$/;
  const decMatch = decRegex.exec(trimmed);
  if (decMatch) {
    let lat = parseFloat(decMatch[1]);
    if (decMatch[2] && decMatch[2].toUpperCase() === 'S') lat = -Math.abs(lat);
    if (decMatch[2] && decMatch[2].toUpperCase() === 'N') lat = Math.abs(lat);

    let lon = parseFloat(decMatch[3]);
    if (decMatch[4] && decMatch[4].toUpperCase() === 'W') lon = -Math.abs(lon);
    if (decMatch[4] && decMatch[4].toUpperCase() === 'E') lon = Math.abs(lon);

    if (Math.abs(lat) <= 90 && Math.abs(lon) <= 180) {
      return normalizeLatLon(lat, lon);
    }
  }

  const m = dmsRegex.exec(trimmed);
  if (m) {
    const d1 = parseFloat(m[1]);
    const m1 = m[2] ? parseFloat(m[2]) : 0;
    const s1 = m[3] ? parseFloat(m[3]) : 0;
    const sign1 = d1 < 0 || (m[4] && m[4].toUpperCase() === 'S') ? -1 : 1;
    const lat = sign1 * (Math.abs(d1) + m1 / 60 + s1 / 3600);

    const d2 = parseFloat(m[5]);
    const m2 = m[6] ? parseFloat(m[6]) : 0;
    const s2 = m[7] ? parseFloat(m[7]) : 0;
    const sign2 = d2 < 0 || (m[8] && m[8].toUpperCase() === 'W') ? -1 : 1;
    const lon = sign2 * (Math.abs(d2) + m2 / 60 + s2 / 3600);

    if (Math.abs(lat) <= 90 && Math.abs(lon) <= 180) {
      return normalizeLatLon(lat, lon);
    }
  }

  return null;
}

/**
 * Format a single coordinate angle into Degrees°Minutes'Seconds" + Hemisphere.
 */
function toDMSString(deg, posHem, negHem) {
  const hem = deg >= 0 ? posHem : negHem;
  const abs = Math.abs(deg);
  let d = Math.floor(abs);
  let mFloat = (abs - d) * 60;
  let m = Math.floor(mFloat);
  let s = Math.round((mFloat - m) * 60);
  if (s === 60) {
    s = 0;
    m += 1;
  }
  if (m === 60) {
    m = 0;
    d += 1;
  }
  return `${d}°${String(m).padStart(2, '0')}'${String(s).padStart(2, '0')}"${hem}`;
}

export function formatDMS(lat, lon) {
  return `${toDMSString(lat, 'N', 'S')} ${toDMSString(lon, 'E', 'W')}`;
}

/**
 * Compute great-circle bearing (short-path & long-path) and distance between two points.
 */
export function computeBearingAndDistance(lat1, lon1, lat2, lon2) {
  const phi1 = lat1 * DEG2RAD;
  const phi2 = lat2 * DEG2RAD;
  const dPhi = (lat2 - lat1) * DEG2RAD;
  const dLam = (lon2 - lon1) * DEG2RAD;

  const sinDPhi2 = Math.sin(dPhi / 2);
  const sinDLam2 = Math.sin(dLam / 2);
  const a =
    sinDPhi2 * sinDPhi2 +
    Math.cos(phi1) * Math.cos(phi2) * sinDLam2 * sinDLam2;
  const c = 2 * Math.atan2(Math.sqrt(Math.min(1, a)), Math.sqrt(Math.max(0, 1 - a)));
  const distanceKm = c * EARTH_RADIUS_KM;
  const longPathKm = 2 * Math.PI * EARTH_RADIUS_KM - distanceKm;

  const y = Math.sin(dLam) * Math.cos(phi2);
  const x =
    Math.cos(phi1) * Math.sin(phi2) -
    Math.sin(phi1) * Math.cos(phi2) * Math.cos(dLam);
  const bearingDeg = c < 1e-7 ? 0 : ((Math.atan2(y, x) * RAD2DEG) + 360) % 360;
  const longPathBearingDeg = (bearingDeg + 180) % 360;

  return {
    bearingDeg,
    longPathBearingDeg,
    distanceKm,
    longPathKm,
    angularDistanceRad: c,
  };
}

/**
 * Compute destination point (lat, lon) from (lat1, lon1) along initial bearing (deg) and distance (km).
 */
export function destinationPoint(lat1, lon1, bearingDeg, distanceKm) {
  const delta = Math.min(Math.PI - 1e-6, Math.max(0, distanceKm / EARTH_RADIUS_KM));
  if (delta < 1e-9) {
    return normalizeLatLon(lat1, lon1);
  }
  const theta = bearingDeg * DEG2RAD;
  const phi1 = lat1 * DEG2RAD;
  const lam1 = lon1 * DEG2RAD;

  const sinPhi1 = Math.sin(phi1);
  const cosPhi1 = Math.cos(phi1);
  const sinDelta = Math.sin(delta);
  const cosDelta = Math.cos(delta);

  const sinPhi2 = sinPhi1 * cosDelta + cosPhi1 * sinDelta * Math.cos(theta);
  const phi2 = Math.asin(Math.max(-1, Math.min(1, sinPhi2)));
  const y = Math.sin(theta) * sinDelta * cosPhi1;
  const x = cosDelta - sinPhi1 * sinPhi2;
  const lam2 = lam1 + Math.atan2(y, x);

  return normalizeLatLon(phi2 * RAD2DEG, lam2 * RAD2DEG);
}

/**
 * Choose a clean distance ring interval (in km) for a given outer radius (in km).
 * Matches NS6T (e.g., 1000 km step for 8000 km radius -> 8 rings).
 */
export function chooseRingStepKm(radiusKm) {
  if (radiusKm <= 1000) return 200;
  if (radiusKm <= 2500) return 500;
  if (radiusKm <= 5000) return 500;
  if (radiusKm <= 10000) return 1000;
  if (radiusKm <= 16000) return 2000;
  return 2500;
}
