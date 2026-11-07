import { ChangeDetectionStrategy, Component, computed, input, signal } from '@angular/core';

import { MaterialModule } from '../../modules/material.module';

/** Cover of a playlist: a 2×2 mosaic of its first albums, one cover, or an icon */
@Component({
  selector: 'app-playlist-cover',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [MaterialModule],
  template: `
    <mat-icon aria-hidden="true">queue_music</mat-icon>
    <div class="tiles" [class.mosaic]="shown().length === 4">
      @for (cover of shown(); track cover) {
        <img [src]="cover" alt="" loading="lazy" (error)="markBroken(cover)">
      }
    </div>
  `,
  styles: [`
    :host {
      position: relative;
      overflow: hidden;
      display: flex;
      align-items: center;
      justify-content: center;
      color: var(--ongaku-accent);
      background: color-mix(in srgb, var(--ongaku-accent) 18%, var(--ongaku-surface-2));
    }
    mat-icon {
      width: 40%;
      height: auto;
      aspect-ratio: 1;
      font-size: min(96px, 10vw);
      display: flex;
      align-items: center;
      justify-content: center;
      opacity: .7;
    }
    .tiles {
      position: absolute;
      inset: 0;
      display: grid;
    }
    .tiles.mosaic {
      grid-template-columns: 1fr 1fr;
      grid-template-rows: 1fr 1fr;
    }
    img {
      width: 100%;
      height: 100%;
      min-height: 0;
      object-fit: cover;
    }
  `],
})
export class PlaylistCoverComponent {
  readonly covers = input<string[]>([]);

  private readonly broken = signal<ReadonlySet<string>>(new Set());
  /** Four covers make a mosaic; otherwise the first one fills the tile */
  readonly shown = computed(() => {
    const covers = this.covers().filter((cover) => !this.broken().has(cover));
    return covers.length >= 4 ? covers.slice(0, 4) : covers.slice(0, 1);
  });

  markBroken(cover: string) {
    this.broken.update((broken) => new Set(broken).add(cover));
  }
}
