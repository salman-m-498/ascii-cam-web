/**
 * recorder.js
 * Thin wrapper around MediaRecorder.
 * Captures frames from the ASCII canvas stream and produces a downloadable WebM.
 */

'use strict';

export class Recorder {
  /** @param {HTMLCanvasElement} canvas */
  constructor(canvas) {
    this._canvas  = canvas;
    this._mr      = null;
    this._chunks  = [];
    this.isRecording = false;
  }

  /**
   * Start recording the canvas at the given frame rate.
   * @param {number} [fps=30]
   */
  start(fps = 30) {
    if (this.isRecording) return;

    this._chunks = [];
    const stream = this._canvas.captureStream(fps);

    // Prefer VP9 WebM; fall back to whatever the browser supports
    const mimeType = this._getSupportedMime();
    const options  = mimeType ? { mimeType } : {};

    this._mr = new MediaRecorder(stream, options);

    this._mr.ondataavailable = (e) => {
      if (e.data && e.data.size > 0) this._chunks.push(e.data);
    };

    this._mr.onstop = () => this._save();

    this._mr.start(100); // collect chunks every 100 ms
    this.isRecording = true;
  }

  /** Stop recording and trigger a download of the WebM file. */
  stop() {
    if (!this.isRecording || !this._mr) return;
    this._mr.stop();
    this.isRecording = false;
  }

  _getSupportedMime() {
    const candidates = [
      'video/webm;codecs=vp9',
      'video/webm;codecs=vp8',
      'video/webm',
    ];
    return candidates.find((m) => MediaRecorder.isTypeSupported(m)) || '';
  }

  _save() {
    if (this._chunks.length === 0) return;

    const blob = new Blob(this._chunks, { type: 'video/webm' });
    const url  = URL.createObjectURL(blob);
    const ts   = new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5);
    const a    = document.createElement('a');
    a.href     = url;
    a.download = `ascii-cam-${ts}.webm`;
    a.click();

    // Revoke after a short delay to allow the download to start
    setTimeout(() => URL.revokeObjectURL(url), 10_000);
    this._chunks = [];
  }
}
