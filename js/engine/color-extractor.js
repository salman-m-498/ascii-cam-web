/**
 * color-extractor.js
 * Per-character color averaging and saturation enhancement.
 * Ported from Python ColorExtractor class in main.py.
 *
 * All functions work on raw RGBA typed arrays — Web Worker safe.
 */

'use strict';

/**
 * Divide a full-resolution RGBA frame into a grid of (gridW × gridH) cells
 * and compute the mean RGB of each cell.
 * Equivalent to Python ColorExtractor.get_average_colors().
 *
 * @param {Uint8ClampedArray} rgba    - source ImageData.data at full resolution
 * @param {number}            imgW    - source image width  (must match rgba)
 * @param {number}            imgH    - source image height
 * @param {number}            gridW   - number of character columns
 * @param {number}            gridH   - number of character rows
 * @returns {Array<[number,number,number]>} flat array of [R,G,B] tuples, length = gridW*gridH
 */
export function getAverageColors(rgba, imgW, imgH, gridW, gridH) {
  const colors = new Array(gridW * gridH);
  const cellW  = imgW / gridW;
  const cellH  = imgH / gridH;

  for (let gy = 0; gy < gridH; gy++) {
    for (let gx = 0; gx < gridW; gx++) {
      const x0 = Math.floor(gx * cellW);
      const y0 = Math.floor(gy * cellH);
      const x1 = Math.min(Math.floor((gx + 1) * cellW), imgW);
      const y1 = Math.min(Math.floor((gy + 1) * cellH), imgH);

      let rSum = 0, gSum = 0, bSum = 0, count = 0;

      for (let py = y0; py < y1; py++) {
        for (let px = x0; px < x1; px++) {
          const off = (py * imgW + px) * 4;
          rSum += rgba[off];
          gSum += rgba[off + 1];
          bSum += rgba[off + 2];
          count++;
        }
      }

      if (count > 0) {
        colors[gy * gridW + gx] = [
          (rSum / count) | 0,
          (gSum / count) | 0,
          (bSum / count) | 0,
        ];
      } else {
        colors[gy * gridW + gx] = [0, 0, 0];
      }
    }
  }

  return colors;
}

/**
 * Boost colour saturation of an RGBA frame in-place.
 * Equivalent to PIL.ImageEnhance.Color(image).enhance(factor).
 * Converts each pixel from RGB → HSL, scales S, converts back.
 *
 * @param {Uint8ClampedArray} rgba   - modified in-place
 * @param {number}            factor - saturation multiplier (1.0 = no change)
 */
export function enhanceSaturation(rgba, factor) {
  const len = rgba.length;
  for (let i = 0; i < len; i += 4) {
    const r = rgba[i]     / 255;
    const g = rgba[i + 1] / 255;
    const b = rgba[i + 2] / 255;

    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    const delta = max - min;
    const l = (max + min) / 2;

    if (delta === 0) continue; // achromatic — no saturation to boost

    const s = l > 0.5 ? delta / (2 - max - min) : delta / (max + min);
    const newS = Math.min(s * factor, 1);

    const sFactor2 = newS * (l > 0.5 ? (2 - max - min) : (max + min));
    const _p = l - sFactor2 / 2;
    const _q = l + sFactor2 / 2;
    const _t = delta === 0 ? 0 : 1;

    // Compute hue
    let hue;
    if (max === r) {
      hue = ((g - b) / delta) % 6;
    } else if (max === g) {
      hue = (b - r) / delta + 2;
    } else {
      hue = (r - g) / delta + 4;
    }
    hue = ((hue * 60) + 360) % 360;

    // HSL → RGB with new saturation
    const [nr, ng, nb] = hslToRgb(hue / 360, newS, l);
    rgba[i]     = (nr * 255) | 0;
    rgba[i + 1] = (ng * 255) | 0;
    rgba[i + 2] = (nb * 255) | 0;
  }
}

/**
 * Convert normalised HSL [0..1] to normalised RGB [0..1].
 * @param {number} h - hue [0,1]
 * @param {number} s - saturation [0,1]
 * @param {number} l - lightness [0,1]
 * @returns {[number, number, number]}
 */
function hslToRgb(h, s, l) {
  if (s === 0) return [l, l, l];

  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;

  return [hue2rgb(p, q, h + 1 / 3), hue2rgb(p, q, h), hue2rgb(p, q, h - 1 / 3)];
}

function hue2rgb(p, q, t) {
  if (t < 0) t += 1;
  if (t > 1) t -= 1;
  if (t < 1 / 6) return p + (q - p) * 6 * t;
  if (t < 1 / 2) return q;
  if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
  return p;
}
