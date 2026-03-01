/**
 * ascii-engine.js
 * Core ASCII conversion logic, ported from ASCIIConverter in main.py.
 *
 * All functions operate on raw pixel data (Uint8ClampedArray from ImageData)
 * so they can run inside a Web Worker without DOM access.
 */

'use strict';

import { EDGE_CHARS, buildLUT } from './char-sets.js';

/**
 * Map a Sobel direction (radians) to a directional edge character.
 * Direct port of Python _get_edge_char().
 *
 * @param {number} dir - gradient direction in radians (arctan2 result)
 * @returns {string}
 */
export function getEdgeChar(dir) {
  const PI   = Math.PI;
  const PI4  = PI / 4;
  const PI34 = (3 * PI) / 4;

  if (dir >= -PI4 && dir < PI4) return EDGE_CHARS.vertical;
  if ((dir >= PI4 && dir < PI34) || (dir >= -PI34 && dir < -PI4)) return EDGE_CHARS.horizontal;
  if (dir >= PI34 || dir < -PI34) return EDGE_CHARS.vertical;
  return EDGE_CHARS.diagonal_up;
}

/**
 * BASIC mode — brightness only.
 * Converts a grayscale typed array to an array of ASCII characters using a LUT.
 *
 * @param {Uint8ClampedArray} grayData - one byte per pixel (pre-extracted gray channel)
 * @param {string[]} lut - 256-entry lookup table from buildLUT()
 * @returns {string[]} flat char array, length = grayData.length
 */
export function pixelsToAsciiBasic(grayData, lut) {
  const len = grayData.length;
  const out = new Array(len);
  for (let i = 0; i < len; i++) {
    out[i] = lut[grayData[i]];
  }
  return out;
}

/**
 * EDGE / EDGE_REFINED mode — brightness base + directional edge characters
 * for pixels whose Sobel magnitude exceeds the threshold.
 *
 * Direct port of Python pixels_to_ascii_edge().
 *
 * @param {Uint8ClampedArray} grayData
 * @param {Float32Array}      magnitude   - Sobel magnitude, same length as grayData
 * @param {Float32Array}      direction   - Sobel direction (radians), same length
 * @param {number}            threshold   - edge_threshold setting
 * @param {string[]}          lut
 * @returns {string[]}
 */
export function pixelsToAsciiEdge(grayData, magnitude, direction, threshold, lut) {
  const len = grayData.length;
  const out = new Array(len);
  for (let i = 0; i < len; i++) {
    if (magnitude[i] > threshold) {
      out[i] = getEdgeChar(direction[i]);
    } else {
      out[i] = lut[grayData[i]];
    }
  }
  return out;
}

/**
 * Extract a grayscale channel from RGBA ImageData.
 * Uses the standard luminance formula:  Y = 0.299R + 0.587G + 0.114B
 *
 * @param {Uint8ClampedArray} rgba - raw ImageData.data (4 bytes per pixel)
 * @param {number}            len  - number of pixels (rgba.length / 4)
 * @returns {Uint8ClampedArray}
 */
export function rgbaToGray(rgba, len) {
  const gray = new Uint8ClampedArray(len);
  for (let i = 0; i < len; i++) {
    const off = i * 4;
    gray[i] = (0.299 * rgba[off] + 0.587 * rgba[off + 1] + 0.114 * rgba[off + 2]) | 0;
  }
  return gray;
}

/**
 * Cache for LUT tables keyed by charSet name.
 * Call getLUT(charSetName, charSet) to avoid rebuilding every frame.
 */
const _lutCache = new Map();

/**
 * Get or build a cached LUT for the given char set.
 *
 * @param {string}   name    - key (e.g. "STANDARD")
 * @param {string[]} charSet - the actual character array
 * @returns {string[]} 256-entry LUT
 */
export function getLUT(name, charSet) {
  if (!_lutCache.has(name)) {
    _lutCache.set(name, buildLUT(charSet));
  }
  return _lutCache.get(name);
}
