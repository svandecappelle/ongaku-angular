import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import { ActivatedRoute } from '@angular/router';

import { MaterialModule } from '../../modules/material.module';
import { GalleryService, SharedImages } from '../../services/gallery.service';
import { formatSize } from '../../services/video.service';
import { ImageViewerComponent, ViewerItem } from '../image-viewer/image-viewer.component';

type Load = { status: 'loading' } | { status: 'error'; message: string } | { status: 'ready'; share: SharedImages };

/**
 * The page of a public link to images (/s/:token): open to everyone, with an account or not.
 * Only the images of the link, their names and the name of whoever shared them.
 */
@Component({
  selector: 'app-share-page',
  templateUrl: './share-page.component.html',
  styleUrls: ['./share-page.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [MaterialModule, DatePipe, ImageViewerComponent],
})
export class SharePageComponent {
  readonly gallery = inject(GalleryService);
  readonly token = inject(ActivatedRoute).snapshot.paramMap.get('token') ?? '';

  readonly load = signal<Load>({ status: 'loading' });
  readonly share = computed(() => {
    const load = this.load();
    return load.status === 'ready' ? load.share : null;
  });
  readonly open = signal<number | null>(null);
  readonly broken = signal<ReadonlySet<number>>(new Set());
  readonly totalSize = computed(() => (this.share()?.images ?? []).reduce((sum, image) => sum + image.size, 0));
  readonly viewerItems = computed<ViewerItem[]>(() => (this.share()?.images ?? []).map((image) => ({
    key: String(image.index),
    name: image.name,
    src: this.gallery.sharedImageUrl(this.token, image.index),
    placeholder: this.gallery.sharedImageUrl(this.token, image.index, { size: 640 }),
    download: this.gallery.sharedImageUrl(this.token, image.index, { download: true }),
    details: formatSize(image.size),
  })));
  readonly formatSize = formatSize;
  private returnFocus: HTMLElement | null = null;

  constructor() {
    this.gallery.openShare(this.token).subscribe({
      next: (share) => this.load.set({ status: 'ready', share }),
      error: (err: HttpErrorResponse) => this.load.set({
        status: 'error',
        message: err.status === 404 ? err.error?.message || 'This link does not exist, or was revoked' : 'The images could not be loaded',
      }),
    });
  }

  thumbUrl(index: number) {
    return this.gallery.sharedImageUrl(this.token, index, { size: 320 });
  }

  thumbFailed(index: number) {
    this.broken.update((broken) => new Set(broken).add(index));
  }

  view(position: number, event: Event) {
    this.returnFocus = event.currentTarget as HTMLElement;
    this.open.set(position);
  }

  close() {
    this.open.set(null);
    this.returnFocus?.focus();
  }
}
