import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { HttpEventType } from '@angular/common/http';
import { RouterLink } from '@angular/router';
import { MatSnackBar } from '@angular/material/snack-bar';
import { MatDialog } from '@angular/material/dialog';
import { catchError, concatMap, from, last, of, tap } from 'rxjs';

import { MaterialModule } from '../../modules/material.module';
import { GalleryImage, GalleryService, IMAGES_FOLDER } from '../../services/gallery.service';
import { formatSize } from '../../services/video.service';
import { ShareDialogComponent, ShareDialogData } from './share-dialog.component';
import { ImageViewerComponent, ViewerItem } from '../image-viewer/image-viewer.component';
import { DatePipe as DateFormatter } from '@angular/common';
import { SharesDialogComponent } from './shares-dialog.component';

type Load = 'loading' | 'error' | 'ready';
const ALL = '';

/**
 * The images the member uploaded: his only, nobody else sees them. By month, the latest
 * first, with a viewer to go through them (keyboard, swipe), download or delete them.
 */
@Component({
  selector: 'app-images-page',
  templateUrl: './images-page.component.html',
  styleUrls: ['./images-page.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [MaterialModule, RouterLink, DatePipe, ImageViewerComponent],
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
  private readonly dialog = inject(MatDialog);

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
  readonly deleting = signal(false);
  /** Selection mode: a tap checks an image instead of opening it */
  readonly selecting = signal(false);
  /** Paths of the checked images */
  readonly selected = signal<ReadonlySet<string>>(new Set());

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
  private readonly dates = new DateFormatter('en-US');
  /** The shown images, for the viewer */
  readonly viewerItems = computed<ViewerItem[]>(() => this.shown().map((image) => ({
    key: image.path,
    name: image.name,
    src: this.gallery.fileUrl(image),
    placeholder: this.gallery.thumbUrl(image, 640),
    download: this.gallery.fileUrl(image, true),
    details: `${this.folderName(image.folder)} · ${formatSize(image.size)} · ${this.dates.transform(image.modified, 'medium')}`,
  })));
  readonly totalSize = computed(() => this.images().reduce((sum, image) => sum + image.size, 0));
  /** The checked images among the shown ones, in their order */
  readonly selectedImages = computed(() => this.shown().filter((image) => this.selected().has(image.path)));
  readonly selectedSize = computed(() => this.selectedImages().reduce((sum, image) => sum + image.size, 0));
  readonly allSelected = computed(() => this.shown().length > 0 && this.selectedImages().length === this.shown().length);

  readonly formatSize = formatSize;
  readonly folderName = (folder: string) => folder || 'Uploads';
  private returnFocus: HTMLElement | null = null;
  /** Last image checked, for the range of a shift click */
  private anchor: string | null = null;
  /** A long press on a phone starts the selection; the click that follows it does nothing */
  private pressTimer: ReturnType<typeof setTimeout> | undefined;
  private pressed = false;

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
        const paths = new Set(images.map((image) => image.path));
        this.selected.update((selected) => new Set([...selected].filter((path) => paths.has(path))));
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

  /** Another folder: the selection is of the images shown only */
  setFolder(folder: string) {
    this.folder.set(folder);
    this.selected.set(new Set());
    this.anchor = null;
  }

  // ---------- Selection ----------

  /** A tile tapped: checked in selection mode (its check circle starts it), else opened */
  tileClick(index: number, image: GalleryImage, event: MouseEvent) {
    if (this.pressed) {
      this.pressed = false;
      return;
    }
    const onCheck = (event.target as HTMLElement).closest?.('.check');
    if (this.selecting() || onCheck) {
      this.selecting.set(true);
      this.toggle(image, event.shiftKey);
    } else {
      this.view(index, event);
    }
  }

  isSelected(image: GalleryImage) {
    return this.selected().has(image.path);
  }

  /** Checks or unchecks an image; with shift, the images since the last one checked too */
  toggle(image: GalleryImage, range = false) {
    const shown = this.shown();
    const check = !this.isSelected(image);
    const next = new Set(this.selected());
    const from = this.anchor === null ? -1 : shown.findIndex((other) => other.path === this.anchor);
    const to = shown.findIndex((other) => other.path === image.path);
    const affected = range && from >= 0 && to >= 0 ? shown.slice(Math.min(from, to), Math.max(from, to) + 1) : [image];
    for (const other of affected) {
      if (check) {
        next.add(other.path);
      } else {
        next.delete(other.path);
      }
    }
    this.anchor = image.path;
    this.selected.set(next);
  }

  startSelection() {
    this.selecting.set(true);
  }

  selectAll() {
    this.selected.set(this.allSelected() ? new Set() : new Set(this.shown().map((image) => image.path)));
    this.anchor = null;
  }

  exitSelection() {
    this.selecting.set(false);
    this.selected.set(new Set());
    this.anchor = null;
  }

  onPress(image: GalleryImage, event: PointerEvent) {
    clearTimeout(this.pressTimer);
    if (event.pointerType === 'mouse') {
      return;
    }
    this.pressTimer = setTimeout(() => {
      this.pressed = true;
      this.selecting.set(true);
      if (!this.isSelected(image)) {
        this.toggle(image);
      }
      navigator.vibrate?.(20);
    }, 500);
  }

  onRelease() {
    clearTimeout(this.pressTimer);
  }

  /** A public link to the checked images; the title suggested is their folder when they share one */
  shareSelected() {
    const chosen = this.selectedImages();
    if (!chosen.length) {
      return;
    }
    const folders = new Set(chosen.map((image) => image.folder));
    const folder = folders.size === 1 ? [...folders][0] : '';
    const data: ShareDialogData = {
      images: chosen,
      title: folder ? folder.split('/').pop()! : `${chosen.length} ${chosen.length === 1 ? 'image' : 'images'}`,
    };
    // A link made: the selection is done
    this.dialog.open(ShareDialogComponent, { data, autoFocus: 'first-tabbable' }).afterClosed().subscribe((created?: boolean) => {
      if (created) {
        this.exitSelection();
      }
    });
  }

  openShares() {
    this.dialog.open(SharesDialogComponent, { autoFocus: false });
  }

  deleteSelected() {
    const chosen = this.selectedImages();
    if (!chosen.length || this.deleting()) {
      return;
    }
    const label = chosen.length === 1 ? `“${chosen[0].name}”` : `${chosen.length} images`;
    if (!confirm(`Delete ${label}? This cannot be undone.`)) {
      return;
    }
    this.deleting.set(true);
    this.gallery.delete(chosen).subscribe({
      next: ({ deleted, failed }) => {
        this.deleting.set(false);
        const gone = new Set(deleted);
        this.images.update((images) => images.filter((image) => !gone.has(image.path)));
        const done = `${deleted.length} ${deleted.length === 1 ? 'image' : 'images'} deleted`;
        this.snackBar.open(failed.length ? `${done}, ${failed.length} could not be: ${failed[0].message}` : done, undefined, { duration: failed.length ? 6000 : 3000 });
        // What could not be deleted stays checked
        this.selected.set(new Set(failed.map((item) => item.path)));
        if (!failed.length) {
          this.exitSelection();
        }
      },
      error: (err) => {
        this.deleting.set(false);
        this.snackBar.open(err.error?.message || 'The images could not be deleted', undefined, { duration: 5000 });
      },
    });
  }

  thumbFailed(image: GalleryImage) {
    this.broken.update((broken) => new Set(broken).add(image.path));
  }

  // ---------- Viewer ----------

  view(index: number, event?: Event) {
    this.returnFocus = (event?.currentTarget as HTMLElement) ?? null;
    this.open.set(index);
  }

  close() {
    this.open.set(null);
    this.returnFocus?.focus();
  }

  /** Escape and Delete act on the selection while the viewer is closed (it has its own keys) */
  onKey(event: KeyboardEvent) {
    if (this.open() !== null || !this.selecting()) {
      return;
    }
    if (event.key === 'Escape') {
      event.preventDefault();
      this.exitSelection();
    } else if (event.key === 'Delete' && this.selected().size) {
      event.preventDefault();
      this.deleteSelected();
    }
  }

  deleteViewed(item: ViewerItem) {
    const image = this.shown().find((other) => other.path === item.key);
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
        const index = this.open() ?? 0;
        this.images.update((images) => images.filter((other) => other.path !== image.path));
        const count = this.shown().length;
        if (!count) {
          this.close();
        } else {
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
