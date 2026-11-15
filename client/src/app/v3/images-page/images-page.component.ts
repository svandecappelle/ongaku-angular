import { ChangeDetectionStrategy, Component, ElementRef, computed, inject, signal, viewChild } from '@angular/core';
import { DatePipe } from '@angular/common';
import { HttpEventType } from '@angular/common/http';
import { RouterLink } from '@angular/router';
import { MatSnackBar } from '@angular/material/snack-bar';
import { catchError, concatMap, from, last, of, tap } from 'rxjs';

import { MaterialModule } from '../../modules/material.module';
import { GalleryImage, GalleryService, IMAGES_FOLDER } from '../../services/gallery.service';
import { formatSize } from '../../services/video.service';

type Load = 'loading' | 'error' | 'ready';
const ALL = '';
/** Swipe distance that turns the image, in pixels */
const SWIPE = 50;

/**
 * The images the member uploaded: his only, nobody else sees them. By month, the latest
 * first, with a viewer to go through them (keyboard, swipe), download or delete them.
 */
@Component({
  selector: 'app-images-page',
  templateUrl: './images-page.component.html',
  styleUrls: ['./images-page.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [MaterialModule, RouterLink, DatePipe],
  host: {
    '(document:keydown)': 'onKey($event)',
    '(dragover)': 'onDragOver($event)',
    '(dragleave)': 'onDragLeave($event)',
    '(drop)': 'onDrop($event)',
  },
})
export class ImagesPageComponent {
  readonly gallery = inject(GalleryService);
  private readonly snackBar = inject(MatSnackBar);
  private readonly viewerElement = viewChild<ElementRef<HTMLElement>>('viewer');

  readonly status = signal<Load>('loading');
  readonly images = signal<GalleryImage[]>([]);
  readonly folder = signal(ALL);
  /** Index in `shown` of the image open in the viewer */
  readonly open = signal<number | null>(null);
  readonly dragging = signal(false);
  /** Upload in progress: files sent, and the percent of the current one */
  readonly uploading = signal<{ done: number; total: number; percent: number } | null>(null);
  /** Thumbnails that could not be made: the icon instead */
  readonly broken = signal<ReadonlySet<string>>(new Set());
  /** The original shown in the viewer is loaded: the thumbnail under it goes */
  readonly loaded = signal(false);
  readonly deleting = signal(false);

  readonly folders = computed(() => [...new Set(this.images().map((image) => image.folder))].sort((a, b) => a.localeCompare(b)));
  readonly shown = computed(() => {
    const folder = this.folder();
    return folder === ALL ? this.images() : this.images().filter((image) => image.folder === folder);
  });
  /** The shown images by month of their date, keeping their order (the latest first) */
  readonly months = computed(() => {
    const groups: { key: string; date: number; items: { image: GalleryImage; index: number }[] }[] = [];
    this.shown().forEach((image, index) => {
      const date = new Date(image.modified);
      const key = `${date.getFullYear()}-${date.getMonth()}`;
      let group = groups[groups.length - 1];
      if (!group || group.key !== key) {
        group = { key, date: new Date(date.getFullYear(), date.getMonth(), 1).getTime(), items: [] };
        groups.push(group);
      }
      group.items.push({ image, index });
    });
    return groups;
  });
  readonly current = computed(() => {
    const index = this.open();
    return index === null ? null : this.shown()[index] ?? null;
  });
  readonly totalSize = computed(() => this.images().reduce((sum, image) => sum + image.size, 0));

  readonly formatSize = formatSize;
  readonly folderName = (folder: string) => folder || 'Uploads';
  private swipeStart: number | null = null;
  private returnFocus: HTMLElement | null = null;

  constructor() {
    this.load();
  }

  load(quietly = false) {
    if (!quietly) {
      this.status.set('loading');
    }
    this.gallery.list().subscribe({
      next: (images) => {
        this.images.set(images);
        if (this.folder() !== ALL && !images.some((image) => image.folder === this.folder())) {
          this.folder.set(ALL);
        }
        this.status.set('ready');
      },
      error: () => {
        if (!quietly) {
          this.status.set('error');
        }
      },
    });
  }

  thumbFailed(image: GalleryImage) {
    this.broken.update((broken) => new Set(broken).add(image.path));
  }

  // ---------- Viewer ----------

  view(index: number, event?: Event) {
    this.returnFocus = (event?.currentTarget as HTMLElement) ?? null;
    this.loaded.set(false);
    this.open.set(index);
    setTimeout(() => this.viewerElement()?.nativeElement.focus());
  }

  close() {
    this.open.set(null);
    this.returnFocus?.focus();
  }

  step(delta: number) {
    const index = this.open();
    const count = this.shown().length;
    if (index === null || !count) {
      return;
    }
    this.loaded.set(false);
    this.open.set((index + delta + count) % count);
  }

  onKey(event: KeyboardEvent) {
    if (this.open() === null) {
      return;
    }
    const actions: Record<string, () => void> = {
      Escape: () => this.close(),
      ArrowLeft: () => this.step(-1),
      ArrowRight: () => this.step(1),
      Delete: () => this.deleteCurrent(),
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

  deleteCurrent() {
    const image = this.current();
    if (!image || this.deleting() || !confirm(`Delete “${image.name}”? This cannot be undone.`)) {
      return;
    }
    this.deleting.set(true);
    this.gallery.delete([image]).subscribe({
      next: ({ failed }) => {
        this.deleting.set(false);
        if (failed.length) {
          this.snackBar.open(failed[0].message, undefined, { duration: 5000 });
          return;
        }
        this.snackBar.open(`“${image.name}” deleted`, undefined, { duration: 3000 });
        const index = this.open()!;
        this.images.update((images) => images.filter((other) => other.path !== image.path));
        const count = this.shown().length;
        if (!count) {
          this.close();
        } else {
          this.loaded.set(false);
          this.open.set(Math.min(index, count - 1));
        }
      },
      error: () => {
        this.deleting.set(false);
        this.snackBar.open('The image could not be deleted', undefined, { duration: 5000 });
      },
    });
  }

  // ---------- Upload ----------

  addFiles(files: FileList | File[] | null) {
    const chosen = Array.from(files ?? []).filter((file) => file.type.startsWith('image/') && file.type !== 'image/svg+xml');
    const skipped = (files?.length ?? 0) - chosen.length;
    if (skipped) {
      this.snackBar.open(`${skipped} ${skipped === 1 ? 'file is' : 'files are'} not an image: left out`, undefined, { duration: 4000 });
    }
    if (!chosen.length || this.uploading()) {
      return;
    }
    this.uploading.set({ done: 0, total: chosen.length, percent: 0 });
    const errors: string[] = [];
    this.gallery.ensureFolder().pipe(
      concatMap(() => from(chosen)),
      // One file after the other: one request each, its progress shown
      concatMap((file) => this.gallery.upload(file).pipe(
        tap((event) => {
          if (event.type === HttpEventType.UploadProgress && event.total) {
            this.uploading.update((state) => state && { ...state, percent: Math.round((100 * event.loaded) / event.total!) });
          } else if (event.type === HttpEventType.Response) {
            const result = event.body?.files?.[0];
            if (result?.error) {
              errors.push(`${file.name}: ${result.error}`);
            }
            this.uploading.update((state) => state && { ...state, done: state.done + 1, percent: 0 });
          }
        }),
        last(),
        catchError((err) => {
          errors.push(`${file.name}: ${err.error?.message || 'upload failed'}`);
          this.uploading.update((state) => state && { ...state, done: state.done + 1, percent: 0 });
          return of(null);
        }),
      )),
    ).subscribe({
      complete: () => this.uploaded(chosen.length, errors),
      error: () => this.uploaded(chosen.length, errors),
    });
  }

  private uploaded(total: number, errors: string[]) {
    this.uploading.set(null);
    const added = total - errors.length;
    this.snackBar.open(errors.length
      ? `${added} of ${total} added. ${errors[0]}`
      : `${added} ${added === 1 ? 'image' : 'images'} added to ${IMAGES_FOLDER}`, undefined, { duration: errors.length ? 6000 : 3000 });
    this.load(true);
  }

  onDragOver(event: DragEvent) {
    if (event.dataTransfer?.types.includes('Files')) {
      event.preventDefault();
      this.dragging.set(true);
    }
  }

  onDragLeave(event: DragEvent) {
    if (!event.relatedTarget || !(event.currentTarget as HTMLElement).contains(event.relatedTarget as Node)) {
      this.dragging.set(false);
    }
  }

  onDrop(event: DragEvent) {
    if (!event.dataTransfer?.files.length) {
      return;
    }
    event.preventDefault();
    this.dragging.set(false);
    this.addFiles(event.dataTransfer.files);
  }
}
