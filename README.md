# ascii-cam-web

A browser-based port of [asciicam](https://github.com/salman-m-498/asciicam) — a real-time ASCII art webcam application originally written in Python with OpenCV, Pillow, and NumPy.

This version runs entirely in the browser with no dependencies, no build step, and no server-side code. All pixel processing runs inside a Web Worker so the main thread is never blocked.

The project also serves as a portfolio page documenting the original Python implementation, the algorithm, the tech stack, and links to both repositories.

---

## Live Demo

Open `index.html` via a local HTTP server (required for ES modules and Web Workers):

```bash
python3 -m http.server 8765
# then open http://localhost:8765
```

Or enable GitHub Pages on this repository for a zero-config public URL.

---

## Features

- Four render modes ported directly from the Python original:
  - **Basic ASCII** — brightness-to-character mapping using a configurable character set
  - **Edge Detection** — Sobel convolution with directional edge characters (`| - / \`)
  - **Refined Edge** — Sobel followed by non-maximum suppression for single-pixel-wide outlines
  - **Colored ASCII** — edge detection with per-character RGB colour sampling and saturation boost
- All settings adjustable in real time: grid width, font size, edge threshold, saturation, frame skip, foreground and background colour, character set
- Four character sets: Standard (10), Blocks (Unicode), Minimal (4), Detailed (70)
- PNG snapshot download of the current frame
- WebM video recording via `MediaRecorder` — downloads automatically on stop
- Static image upload and ASCII conversion (pause webcam, convert any JPEG/PNG)
- Shareable URLs — all settings are encoded in the query string via the History API; pasting the URL in a new tab restores the exact session
- Fully responsive layout; settings panel collapses on mobile

---

## Architecture

```
ascii-cam-web/
├── index.html                  Single-page portfolio and live demo
├── css/
│   └── style.css               Retro terminal aesthetic (VT323, Share Tech Mono)
└── js/
    ├── app.js                  Main controller: getUserMedia, rAF loop, UI bindings
    ├── recorder.js             MediaRecorder wrapper, WebM blob download
    ├── share.js                Encode/decode settings to/from URL query string
    └── engine/
        ├── char-sets.js        Character set constants and 256-entry LUT builder
        ├── ascii-engine.js     Brightness LUT mapping, edge character selection
        ├── edge-detector.js    3x3 Sobel convolution, non-maximum suppression
        ├── color-extractor.js  Grid cell RGB averaging, RGB/HSL saturation boost
        └── worker.js           ES module Web Worker — runs the full pipeline off-thread
```

### Pipeline

1. Each animation frame, the live `<video>` element is drawn onto a small offscreen `<canvas>` scaled to exactly the character grid dimensions (one pixel per cell).
2. `ImageData` is transferred to the Web Worker via `postMessage` as a `Transferable`.
3. Inside the worker, the RGBA data is converted to grayscale using the BT.601 luminance formula.
4. A 256-entry lookup table maps each brightness value to a character in O(1) per pixel.
5. For Edge and Refined Edge modes, a hand-written 3x3 Sobel kernel computes gradient magnitude and direction. Pixels above the threshold are replaced with a directional character. Refined Edge additionally runs non-maximum suppression to thin edges to a single pixel.
6. For Color mode, a copy of the RGBA data has its saturation boosted (RGB to HSL and back), then the mean RGB of each character cell is computed as the per-character colour.
7. The worker posts `{ chars, colors, width, height }` back to the main thread.
8. The main thread renders the grid onto the visible `<canvas>` using `fillText()` with per-character `fillStyle` in Color mode.

---

## Original Python Version

The Python implementation lives at [github.com/salman-m-498/asciicam](https://github.com/salman-m-498/asciicam).

It uses the same four render modes and the same algorithm, implemented with:

| Library | Role |
|---|---|
| OpenCV (`cv2`) | Webcam capture, `cv2.Sobel()` edge detection, `imshow()` display, AVI recording |
| Pillow (`PIL`) | Bitmap rendering of the ASCII grid with `ImageDraw.text()`, saturation via `ImageEnhance.Color` |
| NumPy | Vectorised pixel operations, per-cell colour averaging with `np.mean()` |

---

## Browser Requirements

| Feature | Minimum |
|---|---|
| ES modules | Chrome 61, Firefox 60, Safari 10.1 |
| Web Workers (module type) | Chrome 80, Firefox 114, Safari 15 |
| `getUserMedia` | All modern browsers over HTTPS or localhost |
| `MediaRecorder` | Chrome 47, Firefox 25, Safari 14.1 |
| `OffscreenCanvas` | Not required — standard canvas used in worker |

---

## Running Locally

No installation required.

```bash
git clone https://github.com/salman-m-498/ascii-cam-web.git
cd ascii-cam-web
python3 -m http.server 8765
```

Open `http://localhost:8765` in a browser and grant camera permission.

---

## License

MIT — see [LICENSE](LICENSE) if present, otherwise standard MIT terms apply.

---

**Salman Moosa** — [github.com/salman-m-498](https://github.com/salman-m-498)
