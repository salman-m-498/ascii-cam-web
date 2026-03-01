/**
 * app.js
 * Main controller for the ASCII Cam web demo.
 * Wires up the UI, webcam, Web Worker pipeline, recorder, and share utilities.
 */

import { Recorder }          from './recorder.js';
import { encodeSettings, decodeSettings, copyShareLink, DEFAULT_SETTINGS } from './share.js';
import { CHAR_SET_LABELS }   from './engine/char-sets.js';

// ─────────────────────────────────────────────────────────────────────────────
// State
// ─────────────────────────────────────────────────────────────────────────────

let settings = { ...DEFAULT_SETTINGS };

const state = {
  running:       false,
  workerBusy:    false,
  frameCount:    0,
  fps:           0,
  fpsHistory:    [],          // last 30 frame deltas
  lastFrameTime: performance.now(),
  worker:        null,
  recorder:      null,
  stream:        null,
  staticImage:   false,       // true when showing uploaded image
  staticImgEl:   null,        // stores the last uploaded Image element
  offCanvas:     null,        // offscreen canvas for frame extraction
  offCtx:        null,
};

// ─────────────────────────────────────────────────────────────────────────────
// DOM references — populated after DOMContentLoaded
// ─────────────────────────────────────────────────────────────────────────────

const $ = (id) => document.getElementById(id);

let videoEl, asciiCanvas, asciiCtx, statusEl, fpsEl, modeLabel;

// ─────────────────────────────────────────────────────────────────────────────
// Init
// ─────────────────────────────────────────────────────────────────────────────

document.addEventListener('DOMContentLoaded', () => {
  // Recover persisted settings from URL
  settings = decodeSettings();

  // DOM refs
  videoEl     = $('feed-video');
  asciiCanvas = $('ascii-canvas');
  asciiCtx    = asciiCanvas.getContext('2d');
  statusEl    = $('status-bar');
  fpsEl       = $('fps-display');
  modeLabel   = $('mode-label');

  // Offscreen canvas for frame extraction
  state.offCanvas = document.createElement('canvas');
  state.offCtx    = state.offCanvas.getContext('2d', { willReadFrequently: true });

  // Recorder
  state.recorder = new Recorder(asciiCanvas);

  // Web Worker
  _initWorker();

  // Apply settings to all controls then bind them
  _applySettingsToUI();
  _bindUI();

  // Start webcam
  _startWebcam();
});

// ─────────────────────────────────────────────────────────────────────────────
// Web Worker
// ─────────────────────────────────────────────────────────────────────────────

function _initWorker() {
  state.worker = new Worker('./js/engine/worker.js', { type: 'module' });

  state.worker.onmessage = (e) => {
    state.workerBusy = false;
    const { chars, colors, width, height } = e.data;
    _renderAsciiFrame(chars, colors, width, height);
  };

  state.worker.onerror = (err) => {
    console.error('Worker error:', err);
    state.workerBusy = false;
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Webcam
// ─────────────────────────────────────────────────────────────────────────────

async function _startWebcam() {
  const permEl = $('cam-permission');
  try {
    state.stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: 'user', width: { ideal: 1280 }, height: { ideal: 720 } },
      audio: false,
    });
    videoEl.srcObject = state.stream;
    await videoEl.play();

    if (permEl) permEl.style.display = 'none';
    state.running   = true;
    state.staticImage = false;
    requestAnimationFrame(_renderLoop);
  } catch (err) {
    console.warn('Webcam unavailable:', err.message);
    if (permEl) {
      permEl.textContent = `[ CAMERA UNAVAILABLE: ${err.message} ]`;
      permEl.style.display = 'flex';
    }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Render loop
// ─────────────────────────────────────────────────────────────────────────────

function _renderLoop(now) {
  if (!state.running) return;
  requestAnimationFrame(_renderLoop);

  if (state.staticImage) return; // still frame — worker already dispatched

  // Frame skip
  if (state.frameCount % settings.frameSkip !== 0) {
    state.frameCount++;
    return;
  }
  state.frameCount++;

  if (state.workerBusy) return;
  if (videoEl.readyState < videoEl.HAVE_ENOUGH_DATA) return;

  // FPS calculation
  const dt = now - state.lastFrameTime;
  state.lastFrameTime = now;
  if (dt > 0) {
    state.fpsHistory.push(1000 / dt);
    if (state.fpsHistory.length > 30) state.fpsHistory.shift();
    const avg = state.fpsHistory.reduce((a, b) => a + b, 0) / state.fpsHistory.length;
    state.fps = avg.toFixed(1);
    if (fpsEl) fpsEl.textContent = `${state.fps} FPS`;
  }

  _dispatchFrame();
}

function _dispatchFrame() {
  const vidW = videoEl.videoWidth  || 640;
  const vidH = videoEl.videoHeight || 480;

  const gridW = settings.width;
  const gridH = Math.round((vidH * gridW) / vidW);

  state.offCanvas.width  = gridW;
  state.offCanvas.height = gridH;

  // Mirror horizontally (selfie mode)
  const ctx = state.offCtx;
  ctx.save();
  ctx.translate(gridW, 0);
  ctx.scale(-1, 1);
  ctx.drawImage(videoEl, 0, 0, gridW, gridH);
  ctx.restore();

  const imageData = ctx.getImageData(0, 0, gridW, gridH);
  const rgba      = new Uint8ClampedArray(imageData.data.buffer.slice());

  state.workerBusy = true;

  state.worker.postMessage({
    rgba,
    width:      gridW,
    height:     gridH,
    mode:       settings.mode,
    charSetName: settings.charSet,
    threshold:  settings.threshold,
    saturation: settings.saturation,
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// ASCII canvas rendering
// ─────────────────────────────────────────────────────────────────────────────

function _renderAsciiFrame(chars, colors, gridW, gridH) {
  const fontSize = settings.fontSize;
  const ctx       = asciiCtx;
  const cw        = asciiCanvas.width;
  const ch        = asciiCanvas.height;

  // Cell dimensions — keep square(ish) to avoid squash/stretch artifacts
  const cellW = cw / gridW;
  const cellH = ch / gridH;
  const charSize = Math.min(fontSize, Math.floor(cellW));

  ctx.font        = `${charSize}px 'Share Tech Mono', 'Courier New', monospace`;
  ctx.textBaseline = 'top';

  // Background fill
  ctx.fillStyle = settings.bgColor;
  ctx.fillRect(0, 0, cw, ch);

  const isColor = settings.mode === 'COLOR' && colors;
  if (!isColor) ctx.fillStyle = settings.fgColor;

  for (let gy = 0; gy < gridH; gy++) {
    for (let gx = 0; gx < gridW; gx++) {
      const idx = gy * gridW + gx;
      const ch_ = chars[idx];
      if (ch_ === ' ') continue;

      const px = gx * cellW;
      const py = gy * cellH;

      if (isColor) {
        const [r, g, b] = colors[idx];
        ctx.fillStyle = `rgb(${r},${g},${b})`;
      }

      ctx.fillText(ch_, px, py);
    }
  }

  // Update mode label
  const modeNames = {
    BASIC:        'Basic ASCII',
    EDGE:         'Edge Detection',
    EDGE_REFINED: 'Refined Edge',
    COLOR:        'Colored ASCII',
  };
  if (modeLabel) modeLabel.textContent = modeNames[settings.mode] || settings.mode;
}

// ─────────────────────────────────────────────────────────────────────────────
// Snapshot
// ─────────────────────────────────────────────────────────────────────────────

function _snapshot() {
  asciiCanvas.toBlob((blob) => {
    const url  = URL.createObjectURL(blob);
    const ts   = new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5);
    const a    = document.createElement('a');
    a.href     = url;
    a.download = `ascii-snap-${ts}.png`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 10_000);
  }, 'image/png');
}

// ─────────────────────────────────────────────────────────────────────────────
// Upload static image
// ─────────────────────────────────────────────────────────────────────────────

function _loadImageFile(file) {
  const reader = new FileReader();
  reader.onload = (ev) => {
    const img = new Image();
    img.onload = () => {
      // Pause the webcam loop
      state.staticImage = true;
      state.staticImgEl  = img;

      // Show resume button
      const resumeBtn = $('btn-resume');
      if (resumeBtn) resumeBtn.style.display = 'block';

      _dispatchStaticFrame();
    };
    img.src = ev.target.result;
  };
  reader.readAsDataURL(file);
}

function _dispatchStaticFrame() {
  const img   = state.staticImgEl;
  if (!img) return;

  const gridW = settings.width;
  const gridH = Math.round((img.height * gridW) / img.width);

  state.offCanvas.width  = gridW;
  state.offCanvas.height = gridH;
  state.offCtx.drawImage(img, 0, 0, gridW, gridH);
  const imageData = state.offCtx.getImageData(0, 0, gridW, gridH);
  const rgba      = new Uint8ClampedArray(imageData.data.buffer.slice());

  state.workerBusy = true;
  state.worker.postMessage({
    rgba,
    width:       gridW,
    height:      gridH,
    mode:        settings.mode,
    charSetName: settings.charSet,
    threshold:   settings.threshold,
    saturation:  settings.saturation,
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// UI binding
// ─────────────────────────────────────────────────────────────────────────────

function _applySettingsToUI() {
  // Mode radios
  const modeRadio = document.querySelector(`input[name="mode"][value="${settings.mode}"]`);
  if (modeRadio) modeRadio.checked = true;

  // Sliders + readouts
  _setSlider('width-slider',      'width-value',      settings.width,      (v) => `${v} cols`);
  _setSlider('fontsize-slider',   'fontsize-value',   settings.fontSize,   (v) => `${v}px`);
  _setSlider('threshold-slider',  'threshold-value',  settings.threshold,  (v) => v);
  _setSlider('saturation-slider', 'saturation-value', settings.saturation, (v) => parseFloat(v).toFixed(1));
  _setSlider('frameskip-slider',  'frameskip-value',  settings.frameSkip,  (v) => `1/${v}`);

  // Char set select
  const csEl = $('charset-select');
  if (csEl) csEl.value = settings.charSet;

  // Color pickers
  const bgPicker = $('bg-color');
  const fgPicker = $('fg-color');
  if (bgPicker) bgPicker.value = settings.bgColor;
  if (fgPicker) fgPicker.value = settings.fgColor;
}

function _setSlider(sliderId, displayId, value, fmt) {
  const el  = $(sliderId);
  const disp = $(displayId);
  if (el)   el.value      = value;
  if (disp) disp.textContent = fmt(value);
}

function _bindUI() {
  // Mode radio buttons
  document.querySelectorAll('input[name="mode"]').forEach((radio) => {
    radio.addEventListener('change', () => {
      settings.mode = radio.value;
      _onSettingsChange();
    });
  });

  // Sliders
  _bindSlider('width-slider',      'width-value',      'width',      1, (v) => `${v} cols`);
  _bindSlider('fontsize-slider',   'fontsize-value',   'fontSize',   1, (v) => `${v}px`);
  _bindSlider('threshold-slider',  'threshold-value',  'threshold',  1, (v) => v);
  _bindSlider('saturation-slider', 'saturation-value', 'saturation', 0, (v) => parseFloat(v).toFixed(1));
  _bindSlider('frameskip-slider',  'frameskip-value',  'frameSkip',  1, (v) => `1/${v}`);

  // Char set selector
  const csEl = $('charset-select');
  if (csEl) {
    csEl.addEventListener('change', () => {
      settings.charSet = csEl.value;
      _onSettingsChange();
    });
  }

  // Color pickers
  const bgPicker = $('bg-color');
  const fgPicker = $('fg-color');
  if (bgPicker) bgPicker.addEventListener('input', () => { settings.bgColor = bgPicker.value; _onSettingsChange(); });
  if (fgPicker) fgPicker.addEventListener('input', () => { settings.fgColor = fgPicker.value; _onSettingsChange(); });

  // Action buttons
  _on('btn-snapshot', 'click', _snapshot);
  _on('btn-record',   'click', _toggleRecord);
  _on('btn-share',    'click', _share);
  _on('btn-resume',   'click', _resumeWebcam);

  // Upload
  const uploadInput = $('upload-input');
  const uploadBtn   = $('btn-upload');
  if (uploadBtn && uploadInput) {
    uploadBtn.addEventListener('click',  () => uploadInput.click());
    uploadInput.addEventListener('change', (e) => {
      const file = e.target.files[0];
      if (file) _loadImageFile(file);
      // Reset so the same file can be re-uploaded
      uploadInput.value = '';
    });
  }

  // Settings panel toggle (mobile)
  _on('settings-toggle', 'click', () => {
    const panel = $('settings-panel');
    if (panel) panel.classList.toggle('open');
  });

  // Canvas resize observer
  const resizeObs = new ResizeObserver(_onCanvasResize);
  resizeObs.observe(asciiCanvas.parentElement);
  _onCanvasResize();
}

function _bindSlider(sliderId, displayId, key, decimals, fmt) {
  const el   = $(sliderId);
  const disp = $(displayId);
  if (!el) return;

  el.addEventListener('input', () => {
    const v = decimals ? parseFloat(el.value) : parseInt(el.value, 10);
    settings[key] = v;
    if (disp) disp.textContent = fmt(v);
    _onSettingsChange();
  });
}

function _on(id, event, fn) {
  const el = $(id);
  if (el) el.addEventListener(event, fn);
}

function _onSettingsChange() {
  encodeSettings(settings);
  // If in static-image mode, re-process the last frame with new settings
  if (state.staticImage && !state.workerBusy) {
    _dispatchStaticFrame();
  }
}

function _toggleRecord() {
  const btn = $('btn-record');
  if (state.recorder.isRecording) {
    state.recorder.stop();
    if (btn) {
      btn.textContent = '[ REC ]';
      btn.classList.remove('recording');
    }
    if (statusEl) {
      statusEl.textContent = 'REC: OFF';
      statusEl.style.color = '';
    }
    _toast('Recording saved — check your downloads!');
  } else {
    state.recorder.start(30);
    if (btn) {
      btn.textContent = '[ STOP REC ]';
      btn.classList.add('recording');
    }
    if (statusEl) {
      statusEl.textContent = '● REC';
      statusEl.style.color = 'var(--red)';
    }
  }
}

async function _share() {
  encodeSettings(settings);
  await copyShareLink();
  _toast('Link copied to clipboard!');
}

function _resumeWebcam() {
  state.staticImage  = false;
  state.staticImgEl  = null;
  const resumeBtn = $('btn-resume');
  if (resumeBtn) resumeBtn.style.display = 'none';
}

function _toast(msg) {
  let toast = $('toast');
  if (!toast) {
    toast = document.createElement('div');
    toast.id = 'toast';
    document.body.appendChild(toast);
  }
  toast.textContent = msg;
  toast.classList.add('show');
  setTimeout(() => toast.classList.remove('show'), 2500);
}

function _onCanvasResize() {
  const parent = asciiCanvas.parentElement;
  if (!parent) return;
  const w = parent.clientWidth;
  const h = parent.clientHeight || Math.round(w * (9 / 16));
  asciiCanvas.width  = w;
  asciiCanvas.height = h;
}
