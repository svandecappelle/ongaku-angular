import { DestroyRef, Directive, ElementRef, afterNextRender, computed, effect, inject, signal, viewChild } from '@angular/core';
import { toObservable, toSignal } from '@angular/core/rxjs-interop';
import { from, of } from 'rxjs';
import { switchMap } from 'rxjs/operators';

import { CoverColorsService } from '../../services/cover-colors.service';
import { PlaybackService } from '../../services/playback.service';
import { ThemeService } from '../../services/theme.service';
import { VisualFrame, VisualizerService } from '../../services/visualizer.service';
import { mix, toRgb } from '../../theme/color';

/** Colours an animation draws with: the theme's, and the two of the cover (theme ones without cover) */
export interface VisualColours {
  accent: string;
  muted: string;
  background: string;
  coverA: string;
  coverB: string;
}

/** A colour of the palette with some transparency */
export function rgba(hex: string, alpha: number): string {
  const [r, g, b] = toRgb(hex);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

const HEX = /^#[0-9a-f]{6}$/i;

/**
 * What the animations of the full-screen player share: a canvas sized to the host at the pixel
 * density of the screen (at most 2), the colours of the theme and of the cover, and the drawing.
 * They draw on every frame while the visualizers move (`frame` given, `dt` in seconds), and once
 * when anything they show changes while still (no frame: the still version). `watch()` reads the
 * signals that change the still version.
 */
@Directive()
export abstract class PlayerVisual {
  protected readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  protected readonly theme = inject(ThemeService);
  protected readonly visualizer = inject(VisualizerService);
  protected readonly playback = inject(PlaybackService);
  private readonly coverColors = inject(CoverColorsService);
  private readonly canvasRef = viewChild<ElementRef<HTMLCanvasElement>>('canvas');

  /** CSS pixels of the canvas */
  protected width = 0;
  protected height = 0;
  protected colours: VisualColours = { accent: '#4fd1c5', muted: '#9aa3b2', background: '#0f1115', coverA: '#2d6a73', coverB: '#e3a35b' };
  /** Colours of the cover being played, null while read or without a cover */
  private readonly cover = toSignal(
    toObservable(computed(() => this.playback.current()?.uid ?? null)).pipe(
      switchMap((uid) => (uid ? from(this.coverColors.get(String(uid))) : of(null))),
    ),
    { initialValue: null },
  );
  private readonly size = signal(0);
  private last = 0;

  constructor() {
    effect(() => {
      this.theme.active();
      this.theme.accent();
      this.colours = this.readColours();
      this.size();
      this.visualizer.motion();
      this.visualizer.running();
      this.watch();
      this.last = 0;
      if (!this.visualizer.running()) {
        this.paint();
      }
    });
    const stop = this.visualizer.listen((frame) => {
      const now = performance.now();
      // Seconds since the last frame: the first one after a pause moves nothing
      const dt = this.last ? Math.min(0.1, (now - this.last) / 1000) : 0;
      this.last = now;
      this.paint(frame, dt);
    });
    let disconnect = () => undefined as void;
    afterNextRender(() => {
      const observer = new ResizeObserver(() => this.resize());
      observer.observe(this.host.nativeElement);
      this.resize();
      disconnect = () => observer.disconnect();
    });
    inject(DestroyRef).onDestroy(() => {
      stop();
      disconnect();
    });
  }

  /** Reads the signals the still version depends on */
  protected watch(): void {}

  protected abstract draw(context: CanvasRenderingContext2D, frame: VisualFrame | undefined, dt: number): void;

  private paint(frame?: VisualFrame, dt = 0) {
    const context = this.canvasRef()?.nativeElement.getContext('2d');
    if (!context || !this.width || !this.height) {
      return;
    }
    context.clearRect(0, 0, this.width, this.height);
    this.draw(context, frame, dt);
  }

  private resize() {
    const canvas = this.canvasRef()?.nativeElement;
    if (!canvas) {
      return;
    }
    const rect = this.host.nativeElement.getBoundingClientRect();
    const ratio = Math.min(window.devicePixelRatio || 1, 2);
    this.width = rect.width;
    this.height = rect.height;
    canvas.width = Math.max(1, Math.round(rect.width * ratio));
    canvas.height = Math.max(1, Math.round(rect.height * ratio));
    canvas.getContext('2d')?.setTransform(ratio, 0, 0, ratio, 0, 0);
    // Through the effect: drawn again, still or on the next frame
    this.size.update((n) => n + 1);
  }

  private readColours(): VisualColours {
    const style = getComputedStyle(this.host.nativeElement);
    const read = (name: string, fallback: string) => {
      const value = style.getPropertyValue(name).trim();
      return HEX.test(value) ? value : fallback;
    };
    const accent = read('--ongaku-accent', this.colours.accent);
    const background = read('--ongaku-bg', this.colours.background);
    const cover = this.cover();
    // Without a cover: the accent, and the accent darkened towards the background
    const coverA = cover?.average && HEX.test(cover.average) ? cover.average : mix(accent, background, 0.55);
    const coverB = cover?.vibrant && HEX.test(cover.vibrant) ? cover.vibrant : accent;
    return { accent, muted: read('--ongaku-muted', this.colours.muted), background, coverA, coverB };
  }
}
