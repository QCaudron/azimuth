import fs from 'node:fs';
import path from 'node:path';
import * as d3Geo from 'd3-geo';
import * as topojsonServer from 'topojson-server';
import * as topojsonSimplify from 'topojson-simplify';
import * as topojsonClient from 'topojson-client';

const NE_DIR = '/private/var/folders/b8/c8j04sq121n1r9mx77232m240000gn/T/opencode/ne';
const OUT_DIR = path.resolve('public/data');
fs.mkdirSync(OUT_DIR, { recursive: true });

const countriesGeo = JSON.parse(fs.readFileSync(path.join(NE_DIR, 'countries.geojson'), 'utf8'));
const mapUnitsGeo = JSON.parse(fs.readFileSync(path.join(NE_DIR, 'map_units.geojson'), 'utf8'));
const mapSubunitsGeo = JSON.parse(fs.readFileSync(path.join(NE_DIR, 'map_subunits.geojson'), 'utf8'));
const statesGeo = JSON.parse(fs.readFileSync(path.join(NE_DIR, 'states.geojson'), 'utf8'));
const lakesGeo = JSON.parse(fs.readFileSync(path.join(NE_DIR, 'lakes.geojson'), 'utf8'));

const EARTH_RADIUS_KM = 6371.0088;
const STERADIAN_TO_KM2 = EARTH_RADIUS_KM * EARTH_RADIUS_KM;

// Comprehensive Amateur Radio DXCC Prefix mapping by ADM0_A3 / SU_A3 / GU_A3 code
const DXCC_BY_CODE = {
  AFG: 'YA', ALB: 'ZA', DZA: '7X', AND: 'C3', AGO: 'D2', AIA: 'VP2E', ATA: 'CE9',
  ATG: 'V2', ARG: 'LU', ARM: 'EK', ABW: 'P4', ATC: 'VK', AUS: 'VK', AUT: 'OE',
  AZE: '4J', BHS: 'C6', BHR: 'A9', BGD: 'S2', BRB: '8P', BLR: 'EU', BEL: 'ON',
  BLZ: 'V3', BEN: 'TY', BMU: 'VP9', BTN: 'A5', BOL: 'CP', BIH: 'E7', BWA: 'A2',
  BRA: 'PY', IOT: 'VQ9', VGB: 'VP2V', BRN: 'V8', BGR: 'LZ', BFA: 'XT', BDI: '9U',
  KHM: 'XU', CMR: 'TJ', CAN: 'VE', CPV: 'D4', CYM: 'ZF', CAF: 'TL', TCD: 'TT',
  CHL: 'CE', CHN: 'BY', COL: 'HK', COM: 'D6', COG: 'TN', COD: '9Q', COK: 'E5',
  CRI: 'TI', CIV: 'TU', HRV: '9A', CUB: 'CO', CUW: 'PJ2', CYP: '5B', CYN: '1B',
  CZE: 'OK', DNK: 'OZ', DJI: 'J2', DMA: 'J7', DOM: 'HI', ECU: 'HC', EGY: 'SU',
  SLV: 'YS', GNQ: '3C', ERI: 'E3', EST: 'ES', SWZ: '3DA', ETH: 'ET', FLK: 'VP8',
  FRO: 'OY', FJI: '3D2', FIN: 'OH', ALD: 'OH0', FRA: 'F', ATF: 'FT', PYF: 'FO',
  GAB: 'TR', GMB: 'C5', GEO: '4L', DEU: 'DL', GHA: '9G', GRC: 'SV', GRL: 'OX',
  GRD: 'J3', GUM: 'KH2', GTM: 'TG', GGY: 'GU', GIN: '3X', GNB: 'J5', GUY: '8R',
  HTI: 'HH', HMD: 'VK0H', HND: 'HR', HKG: 'VR', HUN: 'HA', ISL: 'TF', IND: 'VU',
  IDN: 'YB', IRN: 'EP', IRQ: 'YI', IRL: 'EI', IMN: 'GD', ISR: '4X', ITA: 'I',
  JAM: '6Y', JPN: 'JA', JEY: 'GJ', JOR: 'JY', KAZ: 'UN', KEN: '5Z', KIR: 'T3',
  PRK: 'P5', KOR: 'HL', KOS: 'Z6', KWT: '9K', KGZ: 'EX', LAO: 'XW', LVA: 'YL',
  LBN: 'OD', LSO: '7P', LBR: 'EL', LBY: '5A', LIE: 'HB0', LTU: 'LY', LUX: 'LX',
  MAC: 'XX9', MDG: '5R', MWI: '7Q', MYS: '9M', MDV: '8Q', MLI: 'TZ', MLT: '9H',
  MHL: 'V7', MRT: '5T', MUS: '3B8', MEX: 'XE', FSM: 'V6', MDA: 'ER', MCO: '3A',
  MNG: 'JT', MNE: '4O', MSR: 'VP2M', MAR: 'CN', MOZ: 'C9', MMR: 'XZ', NAM: 'V5',
  NRU: 'C2', NPL: '9N', NLD: 'PA', NCL: 'FK', NZL: 'ZL', NIC: 'YN', NER: '5U',
  NGA: '5N', NIU: 'E6', NFK: 'VK9N', MKD: 'Z3', MNP: 'KH0', NOR: 'LA', OMN: 'A4',
  PAK: 'AP', PLW: 'T8', PSX: 'E4', PAN: 'HP', PNG: 'P2', PRY: 'ZP', PER: 'OA',
  PHL: 'DU', PCN: 'VP6', POL: 'SP', PRT: 'CT', PRI: 'KP4', QAT: 'A7', ROU: 'YO',
  RUS: 'UA', RWA: '9X', BLM: 'FJ', SHN: 'ZD7', KNA: 'V4', LCA: 'J6', MAF: 'FS',
  SPM: 'FP', VCT: 'J8', WSM: '5W', SMR: 'T7', STP: 'S9', SAU: 'HZ', SEN: '6W',
  SRB: 'YU', SYC: 'S7', SLE: '9L', SGP: '9V', SXM: 'PJ7', SVK: 'OM', SVN: 'S5',
  SLB: 'H4', SOM: 'T5', SOL: '6O', ZAF: 'ZS', SGS: 'VP8G', SDS: 'Z8', ESP: 'EA',
  LKA: '4S', SDN: 'ST', SUR: 'PZ', SWE: 'SM', CHE: 'HB9', SYR: 'YK', TWN: 'BV',
  TJK: 'EY', TZA: '5H', THA: 'HS', TLS: '4W', TGO: '5V', TON: 'A3', TTO: '9Y',
  TUN: '3V', TUR: 'TA', TKM: 'EZ', TCA: 'VP5', TUV: 'T2', UGA: '5X', UKR: 'UR',
  ARE: 'A6', GBR: 'G', USA: 'K', VIR: 'KP2', URY: 'CX', UZB: 'UK', VUT: 'YJ',
  VAT: 'HV', VEN: 'YV', VNM: '3W', WLF: 'FW', SAH: 'S0', YEM: '7O', ZMB: '9J',
  ZWE: 'Z2', ASM: 'KH8',

  // Subunits & Map Units (Overseas DXCC entities)
  FXX: 'F', FXC: 'TK', GUF: 'FY', GLP: 'FG', MTQ: 'FM', REU: 'FR', MYT: 'FH',
  ESX: 'EA', ESI: 'EA6', ESC: 'EA8', PRX: 'CT', PMD: 'CT3', PAZ: 'CU',
  NSV: 'JW', NJM: 'JX', USB: 'K', USK: 'KL7', USH: 'KH6',
  ECD: 'HC', ECG: 'HC8', CHP: 'CE0Y', CHS: 'CE0Z',
  TKL: 'ZK3', NLY: 'PJ4', CXR: 'VK9X', CCK: 'VK9C',
};

const CLEAN_NAMES = {
  'Bosnia and Herz.': 'Bosnia & Herzegovina',
  'Central African Rep.': 'Central African Rep.',
  'Dem. Rep. Congo': 'D.R. Congo',
  'Dominican Rep.': 'Dominican Rep.',
  'Eq. Guinea': 'Equatorial Guinea',
  'Falkland Is.': 'Falkland Is.',
  'Fr. Polynesia': 'French Polynesia',
  'Fr. S. Antarctic Lands': 'French Southern Lands',
  'N. Cyprus': 'N. Cyprus',
  'N. Mariana Is.': 'N. Mariana Is.',
  'S. Geo. and the Is.': 'South Georgia',
  'S. Sudan': 'South Sudan',
  'Solomon Is.': 'Solomon Is.',
  'St. Kitts and Nevis': 'St. Kitts & Nevis',
  'St. Pierre and Miquelon': 'St. Pierre & Miquelon',
  'St. Vin. and Gren.': 'St. Vincent',
  'São Tomé and Principe': 'São Tomé & Príncipe',
  'Turks and Caicos Is.': 'Turks & Caicos',
  'U.S. Virgin Is.': 'U.S. Virgin Is.',
  'United States of America': 'United States',
  'Wallis and Futuna Is.': 'Wallis & Futuna',
  'W. Sahara': 'Western Sahara',
  'Br. Indian Ocean Ter.': 'Chagos Is.',
  'British Virgin Is.': 'British Virgin Is.',
  'Cayman Is.': 'Cayman Is.',
  'Cook Is.': 'Cook Is.',
  'Faeroe Is.': 'Faroe Is.',
  'Marshall Is.': 'Marshall Is.',
  'Pitcairn Is.': 'Pitcairn Is.',
  'Balearic Is.': 'Balearic Is.',
  'Canary Is.': 'Canary Is.',
  'Svalbard Is.': 'Svalbard',
  'Jan Mayen I.': 'Jan Mayen',
  'Galápagos Is.': 'Galápagos Is.',
  'Easter I.': 'Easter I.',
  'Christmas I.': 'Christmas I.',
  'Cocos Is.': 'Cocos Is.',
  'Caribbean Netherlands': 'Bonaire',
};

function computeAltPoints(feature, areaKm2, lx, ly) {
  if (areaKm2 < 120000) return undefined;
  const [[minLon, minLat], [maxLon, maxLat]] = d3Geo.geoBounds(feature);
  // Skip antimeridian wrapping bounds unless handled
  const spanLon = maxLon >= minLon ? maxLon - minLon : 360 - (minLon - maxLon);
  const spanLat = maxLat - minLat;
  if (spanLon <= 2 || spanLat <= 2) return undefined;

  const pts = [];
  const nx = 5;
  const ny = 5;
  for (let ix = 1; ix <= nx; ix++) {
    for (let iy = 1; iy <= ny; iy++) {
      let lon = minLon + (spanLon * ix) / (nx + 1);
      if (lon > 180) lon -= 360;
      const lat = minLat + (spanLat * iy) / (ny + 1);
      if (Math.hypot(lon - lx, lat - ly) < 2.5) continue;
      if (d3Geo.geoContains(feature, [lon, lat])) {
        pts.push([Number(lon.toFixed(2)), Number(lat.toFixed(2))]);
      }
    }
  }
  return pts.length > 0 ? pts.slice(0, 12) : undefined;
}

const SPLIT_BY_SUBUNITS = new Set(['FRA', 'ESP', 'PRT', 'NOR', 'USA', 'ECU', 'CHL']);
const SPLIT_BY_UNITS = new Set(['NZL', 'NLD', 'IOA']);
const IGNORE_CODES = new Set(['KAS', 'CHS']);

// Inherit sovereign labelrank when Natural Earth leaves subunit labelrank=10
const SOVEREIGN_RANK = {};
for (const f of countriesGeo.features) {
  SOVEREIGN_RANK[f.properties.ADM0_A3] = f.properties.LABELRANK ?? 4;
}

const finalCountries = [];

function makeCountryFeature(f, codeKey, isMainland = true) {
  const p = f.properties;
  const code = p[codeKey] || p.ADM0_A3;
  if (IGNORE_CODES.has(code)) return null;
  const rawName = p.NAME;
  const name = CLEAN_NAMES[rawName] || rawName;
  const dxcc = DXCC_BY_CODE[code] || DXCC_BY_CODE[p.ADM0_A3] || '';
  if (!dxcc) {
    console.warn('Missing DXCC for:', code, rawName);
  }
  const areaKm2 = Math.round(d3Geo.geoArea(f) * STERADIAN_TO_KM2);
  const lx = Number((p.LABEL_X ?? 0).toFixed(3));
  const ly = Number((p.LABEL_Y ?? 0).toFixed(3));
  const baseRank = isMainland ? (SOVEREIGN_RANK[p.ADM0_A3] ?? p.LABELRANK ?? 4) : (p.LABELRANK ?? 5);
  const alt = computeAltPoints(f, areaKm2, lx, ly);

  const props = {
    id: code,
    adm0: p.ADM0_A3,
    name,
    dxcc,
    lx,
    ly,
    area: areaKm2,
    rank: baseRank,
  };
  if (alt) props.alt = alt;

  return {
    type: 'Feature',
    geometry: f.geometry,
    properties: props,
  };
}

const MAINLAND_SUBUNITS = new Set(['FXX', 'ESX', 'PRX', 'NOR', 'USB', 'ECD', 'CHL', 'NZL', 'NLD']);

for (const f of countriesGeo.features) {
  const adm0 = f.properties.ADM0_A3;
  if (IGNORE_CODES.has(adm0)) continue;
  if (SPLIT_BY_SUBUNITS.has(adm0) || SPLIT_BY_UNITS.has(adm0)) continue;
  const feat = makeCountryFeature(f, 'ADM0_A3', true);
  if (feat) finalCountries.push(feat);
}

for (const f of mapSubunitsGeo.features) {
  const adm0 = f.properties.ADM0_A3;
  if (!SPLIT_BY_SUBUNITS.has(adm0)) continue;
  const code = f.properties.SU_A3;
  const feat = makeCountryFeature(f, 'SU_A3', MAINLAND_SUBUNITS.has(code));
  if (feat) finalCountries.push(feat);
}

for (const f of mapUnitsGeo.features) {
  const adm0 = f.properties.ADM0_A3;
  if (!SPLIT_BY_UNITS.has(adm0)) continue;
  const code = f.properties.GU_A3;
  const feat = makeCountryFeature(f, 'GU_A3', MAINLAND_SUBUNITS.has(code));
  if (feat) finalCountries.push(feat);
}

const US_CALL_AREA = {
  CT: 'W1', MA: 'W1', ME: 'W1', NH: 'W1', RI: 'W1', VT: 'W1',
  NJ: 'W2', NY: 'W2',
  DC: 'W3', DE: 'W3', MD: 'W3', PA: 'W3',
  AL: 'W4', FL: 'W4', GA: 'W4', KY: 'W4', NC: 'W4', SC: 'W4', TN: 'W4', VA: 'W4',
  AR: 'W5', LA: 'W5', MS: 'W5', NM: 'W5', OK: 'W5', TX: 'W5',
  CA: 'W6',
  AZ: 'W7', ID: 'W7', MT: 'W7', NV: 'W7', OR: 'W7', UT: 'W7', WA: 'W7', WY: 'W7',
  MI: 'W8', OH: 'W8', WV: 'W8',
  IL: 'W9', IN: 'W9', WI: 'W9',
  CO: 'W0', IA: 'W0', KS: 'W0', MN: 'W0', MO: 'W0', ND: 'W0', NE: 'W0', SD: 'W0',
  AK: 'KL7',
  HI: 'KH6',
};

const CA_CALL_AREA = {
  NL: 'VO1', NS: 'VE1', QC: 'VE2', ON: 'VE3', MB: 'VE4', SK: 'VE5',
  AB: 'VE6', BC: 'VE7', NT: 'VE8', NB: 'VE9', YT: 'VY1', PE: 'VY2', NU: 'VY0',
};

const finalStates = [];
for (const f of statesGeo.features) {
  const p = f.properties;
  if (!['USA', 'CAN'].includes(p.adm0_a3)) continue;
  const postal = p.postal;
  const prefix = p.adm0_a3 === 'USA' ? (US_CALL_AREA[postal] || 'K') : (CA_CALL_AREA[postal] || 'VE');
  let name = p.name;
  if (name === 'Newfoundland and Labrador') name = 'Newfoundland & Labrador';
  const areaKm2 = Math.round(d3Geo.geoArea(f) * STERADIAN_TO_KM2);
  const lx = Number((p.longitude ?? 0).toFixed(3));
  const ly = Number((p.latitude ?? 0).toFixed(3));
  const alt = computeAltPoints(f, areaKm2, lx, ly);
  const props = {
    id: `${p.adm0_a3}-${postal}`,
    adm0: p.adm0_a3,
    name,
    postal,
    dxcc: prefix,
    lx,
    ly,
    area: areaKm2,
    rank: p.scalerank ?? 3,
  };
  if (alt) props.alt = alt;
  finalStates.push({
    type: 'Feature',
    geometry: f.geometry,
    properties: props,
  });
}

// Major lakes (scalerank === 0, the world's major inland seas and Great Lakes)
const finalLakes = lakesGeo.features
  .filter(f => (f.properties.scalerank ?? 99) === 0 && (f.properties.min_zoom ?? 99) <= 4)
  .map(f => ({
    type: 'Feature',
    geometry: f.geometry,
    properties: {
      name: f.properties.name || '',
    },
  }));

const collections = {
  countries: { type: 'FeatureCollection', features: finalCountries },
  states: { type: 'FeatureCollection', features: finalStates },
  lakes: { type: 'FeatureCollection', features: finalLakes },
};

let topology = topojsonServer.topology(collections);
topology = topojsonSimplify.presimplify(topology);
topology = topojsonSimplify.simplify(topology, 0.004);
topology = topojsonClient.quantize(topology, 1e5);

const outFile = path.join(OUT_DIR, 'atlas.topo.json');
fs.writeFileSync(outFile, JSON.stringify(topology));
const stat = fs.statSync(outFile);
const totalPts = topology.arcs.reduce((s, a) => s + a.length, 0);
console.log(`Built ${outFile}: ${(stat.size / 1024).toFixed(1)} KB (${topology.arcs.length} arcs, ${totalPts} vertices)`);
console.log(`Countries: ${finalCountries.length}, States: ${finalStates.length}, Lakes: ${finalLakes.length}`);
