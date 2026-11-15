import { ChangeDetectionStrategy, Component, ElementRef, afterNextRender, computed, effect, input, model, output, signal, untracked, viewChild } from '@angular/core';

import { MaterialModule } from '../../modules/material.module';

/** An image of the viewer */
export interface ViewerItem {
  key: string;
  name: string;
  /** The image itself */
  src: string;
  /** Shown blurred while the image loads (a thumbnail) */
  placeholder: string;
  /** Address that downloads it */
  download: string;
  /** Line under the name: folder, size, date… */
  details: string;
}

/** Swipe distance that turns the image, in pixels */
const SWIPE = 50;

/**
 * Full-screen viewer of a list of images: previous and next (buttons, arrow keys, swipe),
 * download, and delete when the page allows it. Escape or a click beside the image closes it.
 */
@Component({
  selector: 'app-image-viewer',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [MaterialModule],
  host: {
    '(document:keydown)': 'onKey($event)',
  },
  template: `
    @if (current(); as image) {
      <div #viewer class="viewer" role="dialog" aria-modal="true" [attr.aria-label]="image.name" tabindex="-1" cdkTrapFocus
        (pointerdown)="onPointerDown($event)" (pointerup)="onPointerUp($event)">
        <div class="viewer-bar">
          <div class="viewer-info">
            <strong>{{ image.name }}</strong>
            <span class="muted small">{{ image.details }}</span>
          </div>
          <span class="muted small counter">{{ index() + 1 }} / {{ items().length }}</span>
          <a mat-icon-button class="download" [href]="image.download" aria-label="Download" matTooltip="Download">
            <mat-icon>file_download</mat-icon>
          </a>
          @if (deletable()) {
            <button mat-icon-button type="button" class="delete" (click)="deleteRequested.emit(image)" [disabled]="deleting()" aria-label="Delete" matTooltip="Delete">
              <mat-icon>delete</mat-icon>
            </button>
          }
          <button mat-icon-button type="button" class="close" (click)="closed.emit()" aria-label="Close" matTooltip="Close (Esc)">
            <mat-icon>close</mat-icon>
          </button>
        </div>

        <div class="stage" (click)="$event.target === $event.currentTarget && closed.emit()">
          @if (!loaded()) {
            <img class="placeholder" [src]="image.placeholder" alt="" aria-hidden="true">
          }
          @for (key of [image.key]; track key) {
            <img class="full" [class.ready]="loaded()" [src]="image.src" [alt]="image.name" (load)="loaded.set(true)" draggable="false">
          }
        </div>

        @if (items().length > 1) {
          <button mat-icon-button type="button" class="nav previous" (click)="step(-1)" aria-label="Previous image">
            <mat-icon>chevron_left</mat-icon>
          </button>
          <button mat-icon-button type="button" class="nav next" (click)="step(1)" aria-label="Next image">
            <mat-icon>chevron_right</mat-icon>
          </button>
        }
      </div>
    }
  `,
  styles: [`
    .viewer {
      position: fixed;
      inset: 0;
      z-index: 1000;
      display: flex;
      flex-direction: column;
      background: #050506;
      color: #fff;
      outline: none;
      .muted {
        color: rgba(255, 255, 255, .7);
      }
      button, a {
        color: #fff;
      }
    }
    .small {
      font-size: 13px;
    }
    .viewer-bar {
      padding: 8px 8px 8px 20px;
      display: flex;
      align-items: center;
      gap: 4px;
    }
    .viewer-info {
      flex: 1;
      min-width: 0;
      display: flex;
      flex-direction: column;
      strong, span {
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }
    }
    .counter {
      margin-right: 8px;
      font-variant-numeric: tabular-nums;
    }
    .stage {
      position: relative;
      flex: 1;
      min-height: 0;
      margin: 0 64px 24px;
      display: grid;
      place-items: center;
      touch-action: pan-y;
      img {
        grid-area: 1 / 1;
        max-width: 100%;
        max-height: 100%;
        object-fit: contain;
        user-select: none;
      }
      .placeholder {
        width: 100%;
        height: 100%;
        filter: blur(6px);
      }
      .full {
        opacity: 0;
        transition: opacity .2s;
        &.ready {
          opacity: 1;
        }
      }
    }
    .nav {
      position: absolute;
      top: 50%;
      width: 52px;
      height: 52px;
      transform: translateY(-50%);
      background: rgba(255, 255, 255, .1);
      &.previous {
        left: 8px;
      }
      &.next {
        right: 8px;
      }
      mat-icon {
        width: 32px;
        height: 32px;
        font-size: 32px;
      }
    }
    @media (max-width: 600px) {
      .stage {
        margin: 0 0 16px;
      }
      .nav {
        display: none;
      }
    }
    @media (prefers-reduced-motion: reduce) {
      .stage .full {
        transition: none;
      }
    }
  `],
})
export class ImageViewerComponent {
  readonly items = input.required<ViewerItem[]>();
  readonly index = model.required<number>();
  readonly deletable = input(false);
  readonly deleting = input(false);
  readonly closed = output<void>();
  readonly deleteRequested = output<ViewerItem>();

  private readonly viewer = viewChild<ElementRef<HTMLElement>>('viewer');
  readonly current = computed(() => this.items()[this.index()] ?? null);
  /** The image is loaded: the thumbnail under it goes */
  readonly loaded = signal(false);
  private swipeStart: number | null = null;

  constructor() {
    afterNextRender(() => this.viewer()?.nativeElement.focus());
    // A new image: its thumbnail until it is loaded
    effect(() => {
      this.current()?.key;
      untracked(() => this.loaded.set(false));
    });
  }

  step(delta: number) {
    const count = this.items().length;
    if (count) {
      this.index.set((this.index() + delta + count) % count);
    }
  }

  onKey(event: KeyboardEvent) {
    const actions: Record<string, () => void> = {
      Escape: () => this.closed.emit(),
      ArrowLeft: () => this.step(-1),
      ArrowRight: () => this.step(1),
      Delete: () => {
        const image = this.current();
        if (this.deletable() && image && !this.deleting()) {
          this.deleteRequested.emit(image);
        }
      },
    };
    const action = actions[event.key];
    if (action) {
      event.preventDefault();
      action();
    }
  }

  onPointerDown(event: PointerEvent) {
    this.swipeStart = event.pointerType === 'mouse' ? null : event.clientX;
  }

  onPointerUp(event: PointerEvent) {
    if (this.swipeStart === null) {
      return;
    }
    const distance = event.clientX - this.swipeStart;
    this.swipeStart = null;
    if (Math.abs(distance) > SWIPE) {
      this.step(distance < 0 ? 1 : -1);
    }
  }
}
