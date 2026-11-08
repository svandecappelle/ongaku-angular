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
import { HistoryService, ListeningStats } from '../services/history.service';

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
  private readonly history = inject(HistoryService);

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

  /** Listening figures, on the profile of the connected user only */
  readonly stats = signal<ListeningStats | null>(null);
  /** Bars of the chart of the last 7 days, height in % of the busiest day */
  readonly chart = computed(() => {
    const days = this.stats()?.days ?? [];
    const max = Math.max(1, ...days.map((day) => day.plays));
    const today = days.at(-1)?.date;
    return days.map((day) => ({
      ...day,
      height: (day.plays / max) * 100,
      today: day.date === today,
      label: new Date(`${day.date}T12:00:00`).toLocaleDateString(undefined, { weekday: 'short' }),
      long: new Date(`${day.date}T12:00:00`).toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' }),
    }));
  });
  readonly chartSummary = computed(() => this.chart().map((day) => `${day.long}: ${day.plays} play${day.plays === 1 ? '' : 's'}`).join('; '));

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
        this.stats.set(null);
        if (profile.self) {
          this.loadStats();
        }
      },
      error: (err: HttpErrorResponse) => this.state.set(err.status === 404 ? 'missing' : 'failed'),
    });
  }

  loadStats() {
    this.history.stats().subscribe({
      next: (stats) => this.stats.set(stats),
      error: () => this.stats.set(null),
    });
  }

  setHistoryPaused(paused: boolean) {
    this.history.setPaused(paused).subscribe({
      next: () => {
        this.stats.update((stats) => stats && { ...stats, paused });
        this.snackBar.open(paused ? 'Your listening history is paused' : 'Your listening history is recorded again', undefined, { duration: 3000 });
      },
      error: () => this.snackBar.open('The setting could not be saved', undefined, { duration: 5000 }),
    });
  }

  clearHistory() {
    if (!confirm('Clear your listening history? Recently played and your listening figures start again from zero.')) {
      return;
    }
    this.history.clear().subscribe({
      next: () => {
        this.loadStats();
        this.snackBar.open('Listening history cleared', undefined, { duration: 3000 });
      },
      error: () => this.snackBar.open('The history could not be cleared', undefined, { duration: 5000 }),
    });
  }

  /** Listening time: "45 min", "3 h 20", "27 h" */
  readonly formatListened = (seconds: number) => {
    const minutes = Math.round(seconds / 60);
    if (minutes < 60) {
      return `${minutes} min`;
    }
    const hours = Math.floor(minutes / 60);
    const rest = minutes % 60;
    return hours >= 10 || !rest ? `${hours} h` : `${hours} h ${String(rest).padStart(2, '0')}`;
  };

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
