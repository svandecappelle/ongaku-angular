import { DOCUMENT, Injectable, computed, effect, inject, signal, untracked } from '@angular/core';

import { PlaybackService } from './playback.service';
import { ThemeService } from './theme.service';

/**
 * full: they move with the sound; reduced: they stand still (Reduce animations, or the system
 * asks for less motion); off: the plain controls.
 */
export type VisualizerMotion = 'full' | 'reduced' | 'off';

/** What the visualizers read, once per frame */
export interface VisualFrame {
  /** Lows, low-mids, high-mids and highs, from 0 to 1 */
  readonly eq: Float32Array;
  /** Energy of the low frequencies, smoothed: quick to rise, slow to fall */
  readonly bass: number;
  /** The spectrum in BANDS bands from 40 Hz to 14 kHz, spaced as the ear hears them, from 0 to 1 */
  readonly bands: Float32Array;
  /** Overall loudness, slowly smoothed, from 0 to 1 */
  readonly loudness: number;
  /** 0.5 for "subtle", 1 for "lively" */
  readonly intensity: number;
}

/** Bands of VisualFrame.bands */
export const BANDS = 48;
const LOW_HZ = 40;
const HIGH_HZ = 14000;

export type FrameListener = (frame: VisualFrame) => void;

/**
 * The animations that follow the music. One loop reads the analyser of the player once per frame
 * for every visualizer on screen, and runs only while it is useful: something to draw, music
 * playing, motion allowed and the tab visible. The visualizers draw in their listener, outside
 * Angular's change detection.
 */
@Injectable({ providedIn: 'root' })
export class VisualizerService {
  private readonly playback = inject(PlaybackService);
  private readonly theme = inject(ThemeService);
  private readonly document = inject(DOCUMENT);
  private readonly view = this.document.defaultView;

  private readonly systemReduced = signal(false);
  private readonly hidden = signal(this.document.hidden);
  private readonly listeners = signal<ReadonlySet<FrameListener>>(new Set());

  readonly motion = computed<VisualizerMotion>(() => {
    if (this.theme.visualizers() === 'off') {
      return 'off';
    }
    return this.theme.reduceMotion() || this.systemReduced() ? 'reduced' : 'full';
  });
  /** The loop runs: the visualizers move */
  readonly running = computed(() => this.motion() === 'full' && this.playback.playing() && !this.hidden() && this.listeners().size > 0);

  private readonly bins = new Uint8Array(this.playback.analyser.frequencyBinCount);
  private readonly frame = { eq: new Float32Array(4), bass: 0, bands: new Float32Array(BANDS), loudness: 0, intensity: 0.5 };
  private raf = 0;

  constructor() {
    const media = this.view?.matchMedia?.('(prefers-reduced-motion: reduce)');
    if (media) {
      this.systemReduced.set(media.matches);
      media.addEventListener('change', (event) => this.systemReduced.set(event.matches));
    }
    this.document.addEventListener('visibilitychange', () => this.hidden.set(this.document.hidden));

    effect(() => {
      const running = this.running();
      untracked(() => (running ? this.start() : this.stop()));
    });
  }

  /** Calls `listener` on every frame while the visualizers move; returns what stops it */
  listen(listener: FrameListener): () => void {
    this.listeners.update((listeners) => new Set(listeners).add(listener));
    return () => this.listeners.update((listeners) => {
      const next = new Set(listeners);
      next.delete(listener);
      return next;
    });
  }

  private start() {
    if (!this.raf && this.view) {
      this.raf = this.view.requestAnimationFrame(() => this.tick());
    }
  }

  private stop() {
    if (this.raf) {
      this.view?.cancelAnimationFrame(this.raf);
      this.raf = 0;
    }
    this.frame.bass = 0;
    this.frame.loudness = 0;
    this.frame.eq.fill(0);
    this.frame.bands.fill(0);
  }

  private tick() {
    this.read();
    for (const listener of this.listeners()) {
      listener(this.frame);
    }
    this.raf = this.view ? this.view.requestAnimationFrame(() => this.tick()) : 0;
  }

  private read() {
    const analyser = this.playback.analyser;
    analyser.getByteFrequencyData(this.bins);
    const binHz = analyser.context.sampleRate / analyser.fftSize;
    const band = (from: number, to: number) => {
      const a = Math.max(1, Math.floor(from / binHz));
      const b = Math.min(this.bins.length, Math.max(a + 1, Math.ceil(to / binHz)));
      let sum = 0;
      for (let i = a; i < b; i++) {
        sum += this.bins[i];
      }
      return sum / (b - a) / 255;
    };
    this.frame.eq[0] = band(40, 160);
    this.frame.eq[1] = band(160, 800);
    this.frame.eq[2] = band(800, 4000);
    // The highs are quieter: lifted a little
    this.frame.eq[3] = Math.min(1, band(4000, 12000) * 1.8);
    const bass = band(40, 130);
    this.frame.bass += (bass - this.frame.bass) * (bass > this.frame.bass ? 0.5 : 0.08);
    for (let i = 0; i < BANDS; i++) {
      const from = LOW_HZ * Math.pow(HIGH_HZ / LOW_HZ, i / BANDS);
      const to = LOW_HZ * Math.pow(HIGH_HZ / LOW_HZ, (i + 1) / BANDS);
      // The highs are quieter: lifted little by little
      this.frame.bands[i] = Math.min(1, band(from, to) * (1 + (i / BANDS) * 0.8));
    }
    let total = 0;
    for (let i = 0; i < this.bins.length; i++) {
      total += this.bins[i];
    }
    this.frame.loudness += (total / this.bins.length / 255 - this.frame.loudness) * 0.05;
    this.frame.intensity = this.theme.visualizers() === 'lively' ? 1 : 0.5;
  }
}
