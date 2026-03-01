/**
 * edge-detector.js
 * Sobel edge detection + non-maximum suppression.
 * Ported from Python EdgeDetector class in main.py.
 *
 * All operations on typed arrays — safe to run inside a Web Worker.
 */

'use strict';

/**
 * Compute Sobel gradients on a grayscale image.
 * Equivalent to cv2.Sobel(gray, CV_64F, 1, 0, ksize=3) and the y variant.
 *
 * @param {Uint8ClampedArray} gray - one byte per pixel
 * @param {number}            w    - image width  (pixels)
 * @param {number}            h    - image height (pixels)
 * @returns {{ magnitude: Float32Array, direction: Float32Array }}
 */
export function detect(gray, w, h) {
  const len = w * h;
  const sobelX = new Float32Array(len);
  const sobelY = new Float32Array(len);

  // 3×3 Sobel kernels
  // Kx = [[-1,0,1],[-2,0,2],[-1,0,1]]
  // Ky = [[-1,-2,-1],[0,0,0],[1,2,1]]

  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const tl = gray[(y - 1) * w + (x - 1)];
      const tc = gray[(y - 1) * w + x];
      const tr = gray[(y - 1) * w + (x + 1)];
      const ml = gray[y * w + (x - 1)];
      const mr = gray[y * w + (x + 1)];
      const bl = gray[(y + 1) * w + (x - 1)];
      const bc = gray[(y + 1) * w + x];
      const br = gray[(y + 1) * w + (x + 1)];

      const gx = -tl + tr - 2 * ml + 2 * mr - bl + br;
      const gy = -tl - 2 * tc - tr + bl + 2 * bc + br;

      const idx = y * w + x;
      sobelX[idx] = gx;
      sobelY[idx] = gy;
    }
  }

  // magnitude = hypot(sobelX, sobelY), normalised to [0, 255]
  const magnitude  = new Float32Array(len);
  const direction  = new Float32Array(len);
  let maxMag = 0;

  for (let i = 0; i < len; i++) {
    const mag = Math.hypot(sobelX[i], sobelY[i]);
    magnitude[i] = mag;
    direction[i] = Math.atan2(sobelY[i], sobelX[i]);
    if (mag > maxMag) maxMag = mag;
  }

  // Normalise magnitude to [0, 255] so it's comparable to Python output
  if (maxMag > 0) {
    const scale = 255 / maxMag;
    for (let i = 0; i < len; i++) {
      magnitude[i] *= scale;
    }
  }

  return { magnitude, direction };
}

/**
 * Non-maximum suppression — thin edges to single-pixel width.
 * Ported from Python EdgeDetector.non_max_suppression().
 *
 * @param {Float32Array} magnitude - normalised Sobel magnitude
 * @param {Float32Array} direction - Sobel direction in radians
 * @param {number}       w
 * @param {number}       h
 * @returns {Float32Array} thinned magnitude
 */
export function nonMaxSuppression(magnitude, direction, w, h) {
  const len = w * h;
  const result = new Float32Array(len);

  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const idx = y * w + x;
      const mag = magnitude[idx];

      // Convert radians to degrees [0, 180]
      let angle = (direction[idx] * 180) / Math.PI;
      if (angle < 0) angle += 180;

      let q, r;

      if ((angle >= 0 && angle < 22.5) || (angle >= 157.5 && angle <= 180)) {
        // 0°  — compare left and right
        q = magnitude[y * w + (x + 1)];
        r = magnitude[y * w + (x - 1)];
      } else if (angle >= 22.5 && angle < 67.5) {
        // 45° — compare top-right and bottom-left
        q = magnitude[(y + 1) * w + (x - 1)];
        r = magnitude[(y - 1) * w + (x + 1)];
      } else if (angle >= 67.5 && angle < 112.5) {
        // 90° — compare top and bottom
        q = magnitude[(y - 1) * w + x];
        r = magnitude[(y + 1) * w + x];
      } else {
        // 135° — compare top-left and bottom-right
        q = magnitude[(y - 1) * w + (x - 1)];
        r = magnitude[(y + 1) * w + (x + 1)];
      }

      result[idx] = mag >= q && mag >= r ? mag : 0;
    }
  }

  return result;
}
