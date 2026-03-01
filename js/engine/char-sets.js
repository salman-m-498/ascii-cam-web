/**
 * char-sets.js
 * Character sets and directional edge characters, ported 1-to-1 from
 * Python CharacterSets class in main.py.
 *
 * All sets are ordered dense → sparse (dark → light), matching the
 * original Python ordering so the same brightness-mapping formula works.
 */

'use strict';

export const CHAR_SETS = {
  STANDARD: ['@', '&', '#', '+', '^', '=', ';', ':', '.', ' '],

  BLOCKS: ['█', '▓', '▒', '░', ' '],

  MINIMAL: ['#', '+', '.', ' '],

  DETAILED: [
    '$','@','B','%','8','&','W','M','#','*','o','a','h','k','b','d','p','q',
    'w','m','Z','O','0','Q','L','C','J','U','Y','X','z','c','v','u','n','x',
    'r','j','f','t','/','\\','|','(',')','{','}','[',']','?','-','_','+',
    '~','<','>','i','!','l','I',';',':',',','"','^','`',"'",'.',' ',
  ],
};

/** Directional edge characters — same mapping as Python EDGES dict */
export const EDGE_CHARS = {
  vertical:      '|',
  horizontal:    '-',
  diagonal_up:   '/',
  diagonal_down: '\\',
};

/** Human-readable labels for UI */
export const CHAR_SET_LABELS = {
  STANDARD: 'Standard',
  BLOCKS:   'Blocks',
  MINIMAL:  'Minimal',
  DETAILED: 'Detailed',
};

/** Pre-build a 256-entry lookup table for a given char set.
 *  index 0 = dark (pixel 0), index 255 = light (pixel 255).
 *  Returns a string[] of length 256.
 */
export function buildLUT(charSet) {
  const n = charSet.length;
  const lut = new Array(256);
  for (let p = 0; p < 256; p++) {
    const idx = Math.min(Math.floor(p / (255 / (n - 1))), n - 1);
    lut[p] = charSet[idx];
  }
  return lut;
}
