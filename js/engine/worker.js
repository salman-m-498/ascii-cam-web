/**
 * worker.js
 * Web Worker entry point.
 * Receives a frame message, runs the full ASCII pipeline off the main thread,
 * and posts back the character grid (+ per-cell colors for COLOR mode).
 *
 * Uses ES module syntax — loaded with { type: 'module' } in app.js.
 */

import { CHAR_SETS, buildLUT } from './char-sets.js';
import { rgbaToGray, pixelsToAsciiBasic, pixelsToAsciiEdge, getLUT } from './ascii-engine.js';
import { detect, nonMaxSuppression } from './edge-detector.js';
import { getAverageColors, enhanceSaturation } from './color-extractor.js';

/**
 * Expected message payload:
 * {
 *   rgba        : Uint8ClampedArray  (ImageData.data — transferred)
 *   width       : number             (grid width in chars)
 *   height      : number             (grid height in chars)
 *   mode        : 'BASIC' | 'EDGE' | 'EDGE_REFINED' | 'COLOR'
 *   charSetName : 'STANDARD' | 'BLOCKS' | 'MINIMAL' | 'DETAILED'
 *   threshold   : number             (edge threshold)
 *   saturation  : number             (saturation factor, COLOR mode)
 * }
 *
 * Posted response:
 * {
 *   chars  : string[]                (flat, length = width * height)
 *   colors : Array<[R,G,B]> | null   (only COLOR mode)
 *   width  : number
 *   height : number
 * }
 */

self.onmessage = function (e) {
  const { rgba, width, height, mode, charSetName, threshold, saturation } = e.data;

  const charSet = CHAR_SETS[charSetName] || CHAR_SETS.STANDARD;
  const lut     = getLUT(charSetName, charSet);
  const pixelCount = width * height;

  // Extract grayscale
  const gray = rgbaToGray(rgba, pixelCount);

  let chars  = null;
  let colors = null;

  switch (mode) {
    case 'BASIC': {
      chars = pixelsToAsciiBasic(gray, lut);
      break;
    }

    case 'EDGE': {
      const { magnitude, direction } = detect(gray, width, height);
      chars = pixelsToAsciiEdge(gray, magnitude, direction, threshold, lut);
      break;
    }

    case 'EDGE_REFINED': {
      const { magnitude, direction } = detect(gray, width, height);
      const thinned = nonMaxSuppression(magnitude, direction, width, height);
      chars = pixelsToAsciiEdge(gray, thinned, direction, threshold, lut);
      break;
    }

    case 'COLOR': {
      // Enhance saturation on a copy so original is preserved
      const rgbaCopy = new Uint8ClampedArray(rgba);
      enhanceSaturation(rgbaCopy, saturation);

      const { magnitude, direction } = detect(gray, width, height);
      chars  = pixelsToAsciiEdge(gray, magnitude, direction, threshold, lut);
      colors = getAverageColors(rgbaCopy, width, height, width, height);
      break;
    }

    default:
      chars = pixelsToAsciiBasic(gray, lut);
  }

  self.postMessage({ chars, colors, width, height });
};
