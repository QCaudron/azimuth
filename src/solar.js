import { geoCircle } from 'd3-geo';
import { normalizeLatLon } from './geo.js';

const DEG2RAD = Math.PI / 180;
const RAD2DEG = 180 / Math.PI;

/**
 * Compute the subsolar point (lat, lon) and antisolar point for a given Date (UTC).
 * Uses high-accuracy NOAA/Meeus solar coordinates.
 */
export function getSubsolarPoint(date = new Date()) {
  const jd = date.getTime() / 86400000 + 2440587.5;
  const n = jd - 2451545.0; // Days since J2000.0
  const T = n / 36525.0;

  // Mean longitude of the Sun (deg)
  const L0 = ((280.46646 + T * (36000.76983 + T * 0.0003032)) % 360 + 360) % 360;
  // Mean anomaly of the Sun (deg)
  const M = ((357.52911 + T * (35999.05029 - 0.0001537 * T)) % 360 + 360) % 360;
  const Mrad = M * DEG2RAD;

  // Equation of center
  const C =
    (1.914602 - T * (0.004817 + 0.000014 * T)) * Math.sin(Mrad) +
    (0.019993 - 0.000101 * T) * Math.sin(2 * Mrad) +
    0.000289 * Math.sin(3 * Mrad);

  // Sun true longitude & apparent longitude
  const trueLon = L0 + C;
  const omega = 125.04 - 1934.136 * T;
  const lambda = trueLon - 0.00569 - 0.00478 * Math.sin(omega * DEG2RAD);

  // Obliquity of the ecliptic
  const epsilon0 =
    23 +
    (26 + (21.448 - T * (46.815 + T * (0.00059 - T * 0.001813))) / 60) / 60;
  const epsilon = epsilon0 + 0.00256 * Math.cos(omega * DEG2RAD);

  // Solar declination (subsolar latitude)
  const sinDec = Math.sin(epsilon * DEG2RAD) * Math.sin(lambda * DEG2RAD);
  const subsolarLat = Math.asin(Math.max(-1, Math.min(1, sinDec))) * RAD2DEG;

  // Equation of time (minutes)
  const y = Math.pow(Math.tan((epsilon * DEG2RAD) / 2), 2);
  const L0rad = L0 * DEG2RAD;
  const e = 0.016708634 - T * (0.000042037 + 0.0000001267 * T);
  const eqTimeMin =
    4 *
    RAD2DEG *
    (y * Math.sin(2 * L0rad) -
      2 * e * Math.sin(Mrad) +
      4 * e * y * Math.sin(Mrad) * Math.cos(2 * L0rad) -
      0.5 * y * y * Math.sin(4 * L0rad) -
      1.25 * e * e * Math.sin(2 * Mrad));

  // UTC minutes since 00:00 UTC
  const utcMinutes =
    date.getUTCHours() * 60 +
    date.getUTCMinutes() +
    date.getUTCSeconds() / 60 +
    date.getUTCMilliseconds() / 60000;

  // Subsolar longitude: at solar noon (720 min true solar time), lon = 0
  const rawSubsolarLon = -((utcMinutes + eqTimeMin - 720) / 4);
  const { lat: sLat, lon: sLon } = normalizeLatLon(subsolarLat, rawSubsolarLon);
  const { lat: antiLat, lon: antiLon } = normalizeLatLon(-sLat, sLon + 180);

  return {
    subsolarLat: sLat,
    subsolarLon: sLon,
    antisolarLat: antiLat,
    antisolarLon: antiLon,
  };
}

/**
 * Compute solar elevation angle (in degrees) at (lat, lon) for a given subsolar point.
 */
export function getSolarElevation(lat, lon, subsolar) {
  const phi = lat * DEG2RAD;
  const dec = subsolar.subsolarLat * DEG2RAD;
  const dLon = (lon - subsolar.subsolarLon) * DEG2RAD;
  const sinEl =
    Math.sin(phi) * Math.sin(dec) +
    Math.cos(phi) * Math.cos(dec) * Math.cos(dLon);
  return Math.asin(Math.max(-1, Math.min(1, sinEl))) * RAD2DEG;
}

/**
 * Generate GeoJSON features for the solar terminator (90°), civil twilight (84°),
 * nautical twilight (78°), and the greyline band (87°..93° from subsolar point).
 */
export function buildGreylineGeometry(date = new Date()) {
  const subsolar = getSubsolarPoint(date);
  const antiCenter = [subsolar.antisolarLon, subsolar.antisolarLat];

  const circleGen = geoCircle().center(antiCenter).precision(1.5);

  return {
    subsolar,
    nightCircle: circleGen.radius(90)(), // Solar elevation < 0°
    civilNightCircle: circleGen.radius(84)(), // Solar elevation < -6°
    nauticalNightCircle: circleGen.radius(78)(), // Solar elevation < -12°
    greylineOuter: circleGen.radius(92.5)(), // -2.5° to +2.5° greyline zone
    greylineInner: circleGen.radius(87.5)(),
  };
}
