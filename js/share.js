/**
 * share.js
 * Encode / decode all settings to and from the URL query string,
 * enabling shareable links that restore the exact session.
 */

'use strict';

/** Settings keys that are persisted in the URL. */
const PARAM_MAP = {
  mode:       'm',
  charSet:    'cs',
  width:      'w',
  fontSize:   'fs',
  threshold:  'et',
  saturation: 'sat',
  frameSkip:  'sk',
  bgColor:    'bg',
  fgColor:    'fg',
};

/** Default settings — mirrors the Python Settings dataclass. */
export const DEFAULT_SETTINGS = {
  mode:       'BASIC',
  charSet:    'STANDARD',
  width:      100,
  fontSize:   10,
  threshold:  50,
  saturation: 1.5,
  frameSkip:  1,
  bgColor:    '#000000',
  fgColor:    '#00ff41',
};

/**
 * Encode a settings object into the current browser URL without reloading.
 * @param {Object} settings
 */
export function encodeSettings(settings) {
  const params = new URLSearchParams();

  for (const [key, param] of Object.entries(PARAM_MAP)) {
    const val = settings[key];
    if (val !== undefined && val !== DEFAULT_SETTINGS[key]) {
      params.set(param, String(val));
    }
  }

  const newUrl = params.toString()
    ? `${location.pathname}?${params.toString()}`
    : location.pathname;

  history.replaceState(null, '', newUrl);
}

/**
 * Decode URL query params back into a partial settings object.
 * Returns only the keys that are present in the URL; merge with DEFAULT_SETTINGS.
 * @returns {Object}
 */
export function decodeSettings() {
  const params   = new URLSearchParams(location.search);
  const settings = { ...DEFAULT_SETTINGS };

  const reverseMap = Object.fromEntries(
    Object.entries(PARAM_MAP).map(([k, v]) => [v, k]),
  );

  for (const [param, value] of params.entries()) {
    const key = reverseMap[param];
    if (!key) continue;

    switch (key) {
      case 'mode':
        if (['BASIC','EDGE','EDGE_REFINED','COLOR'].includes(value)) {
          settings[key] = value;
        }
        break;
      case 'charSet':
        if (['STANDARD','BLOCKS','MINIMAL','DETAILED'].includes(value)) {
          settings[key] = value;
        }
        break;
      case 'bgColor':
      case 'fgColor':
        if (/^#[0-9a-fA-F]{6}$/.test(value)) settings[key] = value;
        break;
      case 'width':
        settings[key] = Math.max(40, Math.min(200, parseInt(value, 10) || DEFAULT_SETTINGS[key]));
        break;
      case 'fontSize':
        settings[key] = Math.max(6, Math.min(20, parseInt(value, 10) || DEFAULT_SETTINGS[key]));
        break;
      case 'threshold':
        settings[key] = Math.max(10, Math.min(200, parseInt(value, 10) || DEFAULT_SETTINGS[key]));
        break;
      case 'saturation':
        settings[key] = Math.max(0, Math.min(4, parseFloat(value) || DEFAULT_SETTINGS[key]));
        break;
      case 'frameSkip':
        settings[key] = Math.max(1, Math.min(8, parseInt(value, 10) || DEFAULT_SETTINGS[key]));
        break;
      default:
        settings[key] = value;
    }
  }

  return settings;
}

/**
 * Copy the current URL to the clipboard and return a Promise<void>.
 * @returns {Promise<void>}
 */
export async function copyShareLink() {
  await navigator.clipboard.writeText(location.href);
}
