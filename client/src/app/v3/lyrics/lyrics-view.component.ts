import { ChangeDetectionStrategy, Component, ElementRef, computed, effect, inject, input } from '@angular/core';

import { PlaybackService } from '../../services/playback.service';
import { ParsedLyrics, activeLine } from './lrc';

/** Lyrics of the track being played: synced ones follow the music, a click on a line seeks to it */
@Component({
  selector: 'app-lyrics-view',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (lyrics().synced) {
      <ol class="lines synced" aria-label="Lyrics">
        @for (line of lyrics().lines; track $index) {
          <li>
            <button type="button" class="line" [class.active]="$index === active()" [class.past]="$index < active()"
              [attr.aria-current]="$index === active() ? 'true' : null" (click)="seek(line.time)">
              {{ line.text || '♪' }}
            </button>
          </li>
        }
      </ol>
    } @else {
      <div class="lines plain" aria-label="Lyrics">
        @for (line of lyrics().lines; track $index) {
          <p [class.gap]="!line.text">{{ line.text }}</p>
        }
      </div>
    }
  `,
  styles: [`
    :host {
      position: relative;
      display: block;
      overflow-y: auto;
      overscroll-behavior: contain;
      scroll-behavior: smooth;
      /* Scrolled with the wheel or the finger; a bar would cut the fading edges */
      scrollbar-width: none;
      -webkit-mask-image: linear-gradient(transparent, #000 12%, #000 88%, transparent);
      mask-image: linear-gradient(transparent, #000 12%, #000 88%, transparent);
    }
    .lines {
      margin: 0;
      padding: 30% 4px;
      list-style: none;
    }
    .line {
      width: 100%;
      padding: 6px 0;
      border: 0;
      text-align: left;
      font: inherit;
      font-size: 22px;
      font-weight: 700;
      line-height: 1.3;
      color: var(--ongaku-muted);
      background: transparent;
      cursor: pointer;
      opacity: .55;
      transition: color .2s, opacity .2s, transform .2s;
      &:hover {
        opacity: .9;
      }
      &.past {
        opacity: .4;
      }
      &.active {
        color: var(--ongaku-text);
        opacity: 1;
      }
      &:focus-visible {
        outline: 2px solid var(--ongaku-accent);
        border-radius: 6px;
      }
    }
    .plain p {
      margin: 0;
      font-size: 18px;
      line-height: 1.6;
      &.gap {
        height: 1em;
      }
    }
    :host::-webkit-scrollbar {
      display: none;
    }
    @media (prefers-reduced-motion: reduce) {
      :host {
        scroll-behavior: auto;
      }
    }
  `],
})
export class LyricsViewComponent {
  private readonly playback = inject(PlaybackService);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);

  readonly lyrics = input.required<ParsedLyrics>();

  readonly active = computed(() => activeLine(this.lyrics(), this.playback.currentTime() + 0.2));

  constructor() {
    // The current line stays in the middle of the panel
    effect(() => {
      const index = this.active();
      const line = this.host.nativeElement.querySelectorAll('.line')[index] as HTMLElement | undefined;
      if (line) {
        const host = this.host.nativeElement;
        host.scrollTop = line.offsetTop - host.clientHeight / 2 + line.clientHeight / 2;
      }
    });
  }

  seek(time: number | null) {
    if (time !== null) {
      this.playback.seek(time);
      if (!this.playback.playing()) {
        this.playback.resume();
      }
    }
  }
}
