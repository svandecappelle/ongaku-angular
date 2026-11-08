import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { HttpErrorResponse, HttpEventType } from '@angular/common/http';
import { MatSnackBar } from '@angular/material/snack-bar';

import { MaterialModule } from '../modules/material.module';
import { ThemeService } from '../services/theme.service';
import { ArtistCardComponent } from '../v3/artist-card/artist-card.component';
import { artistImages } from '../v3/library';
import { Profile, ProfileImage, UserService } from './user.service';
import { PresenceService } from '../services/presence.service';

interface ImageSlot {
  type: ProfileImage;
  label: string;
  description: string;
}

/** Profile of a user (/profile/:user), or of the connected user (/profile) who can change its images */
@Component({
  selector: 'app-user',
  templateUrl: './user.component.html',
  styleUrls: ['./user.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [MaterialModule, RouterLink, ArtistCardComponent],
})
export class UserComponent {
  private readonly service = inject(UserService);
  private readonly theme = inject(ThemeService);
  private readonly snackBar = inject(MatSnackBar);
  readonly presence = inject(PresenceService);

  readonly profile = signal<Profile | null>(null);
  readonly state = signal<'loading' | 'ready' | 'missing' | 'failed'>('loading');
  /** Image being uploaded or reset, with the upload progress */
  readonly busy = signal<{ type: ProfileImage; progress: number | null } | null>(null);
  /** Changed after an upload or a reset to reload the images */
  private readonly version = signal(Date.now());
  /** Images that failed to load: the placeholder shows instead (the URL changes with the version) */
  readonly broken = signal<ReadonlySet<string>>(new Set());
  private username: string | undefined;

  readonly slots: ImageSlot[] = [
    { type: 'avatar', label: 'Avatar', description: 'Shown next to your name.' },
    { type: 'cover', label: 'Cover', description: 'The banner of your profile.' },
    { type: 'background', label: 'Background', description: 'Behind the pages, under a veil in the theme colours.' },
  ];

  readonly artists = computed(() => (this.profile()?.artists ?? []).map((artist) => ({ ...artist, images: artistImages(artist.name, null) })));

  constructor() {
    inject(ActivatedRoute).paramMap.pipe(takeUntilDestroyed()).subscribe((params) => {
      this.username = params.get('user') ?? undefined;
      this.load();
    });
  }

  setShareListening(share: boolean) {
    this.service.setShareListening(share).subscribe({
      next: () => {
        this.profile.update((profile) => profile && { ...profile, shareListening: share });
        this.snackBar.open(share ? 'The other members see what you listen to' : 'What you listen to is hidden', undefined, { duration: 3000 });
      },
      error: () => this.snackBar.open('The setting could not be saved', undefined, { duration: 5000 }),
    });
  }

  load() {
    this.state.set('loading');
    const request = this.username ? this.service.getUserInfos(this.username) : this.service.getMyInfos();
    request.subscribe({
      next: (profile) => {
        this.profile.set(profile);
        this.state.set('ready');
      },
      error: (err: HttpErrorResponse) => this.state.set(err.status === 404 ? 'missing' : 'failed'),
    });
  }

  /** The connected user's images are served (and generated when missing) by the API, the others' are static files */
  image(type: ProfileImage): string {
    const profile = this.profile();
    if (!profile) {
      return '';
    }
    const base = profile.self ? `/api/user/image/${type}` : `/static/user/${encodeURIComponent(profile.username)}/${type}`;
    return `${base}?v=${this.version()}`;
  }

  imageFailed(url: string) {
    this.broken.update((broken) => new Set(broken).add(url));
  }

  upload(type: ProfileImage, input: HTMLInputElement) {
    const file = input.files?.[0];
    input.value = '';
    if (!file) {
      return;
    }
    this.busy.set({ type, progress: 0 });
    this.service.uploadImage(type, file).subscribe({
      next: (event) => {
        if (event.type === HttpEventType.UploadProgress && event.total) {
          this.busy.set({ type, progress: Math.round(100 * event.loaded / event.total) });
        } else if (event.type === HttpEventType.Response) {
          this.done(type, 'changed');
        }
      },
      error: (err: HttpErrorResponse) => this.failed(err),
    });
  }

  reset(type: ProfileImage) {
    this.busy.set({ type, progress: null });
    this.service.resetImage(type).subscribe({
      next: () => this.done(type, 'reset'),
      error: (err: HttpErrorResponse) => this.failed(err),
    });
  }

  readonly formatSize = (bytes: number) => {
    if (!bytes) {
      return '0 B';
    }
    const units = ['B', 'KB', 'MB', 'GB', 'TB'];
    const exponent = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
    return `${(bytes / Math.pow(1024, exponent)).toFixed(exponent ? 1 : 0)} ${units[exponent]}`;
  };

  private done(type: ProfileImage, action: 'changed' | 'reset') {
    this.busy.set(null);
    this.version.set(Date.now());
    if (type === 'background') {
      this.theme.refreshBackground();
    }
    const label = this.slots.find((slot) => slot.type === type)?.label ?? type;
    this.snackBar.open(`${label} ${action}`, undefined, { duration: 3000 });
  }

  private failed(err: HttpErrorResponse) {
    this.busy.set(null);
    this.snackBar.open(err.error?.message || 'The image could not be saved', undefined, { duration: 5000 });
  }
}
