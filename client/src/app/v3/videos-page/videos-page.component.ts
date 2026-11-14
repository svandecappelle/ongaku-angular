import { ChangeDetectionStrategy, Component, computed, effect, inject, signal, untracked } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';

import { MaterialModule } from '../../modules/material.module';
import { Video, VideoService, folderLabel, formatResolution, formatSize } from '../../services/video.service';
import { formatTime } from '../format-time';
import { LibraryEventsService } from '../../services/library-events.service';

type Load = 'loading' | 'error' | 'ready';

/** Lower case, without accents: "Été" matches "ete" */
function normalize(text: string): string {
  return text.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
}

/** Videos page: the videos of the music folders, by folder, to watch in the browser */
@Component({
  selector: 'app-videos-page',
  templateUrl: './videos-page.component.html',
  styleUrls: ['./videos-page.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [MaterialModule, FormsModule, RouterLink],
})
export class VideosPageComponent {
  readonly service = inject(VideoService);

  readonly status = signal<Load>('loading');
  readonly videos = signal<Video[]>([]);
  readonly scanning = signal(false);
  readonly search = signal('');
  /** Posters that could not be made: the icon instead */
  readonly brokenPosters = signal<ReadonlySet<string>>(new Set());

  readonly shown = computed(() => {
    const words = normalize(this.search().trim()).split(/\s+/).filter(Boolean);
    return words.length
      ? this.videos().filter((video) => {
        const text = normalize(`${video.title} ${video.name} ${video.folder}`);
        return words.every((word) => text.includes(word));
      })
      : this.videos();
  });

  /** The shown videos by folder, in the order of the server (folder, then title) */
  readonly folders = computed(() => {
    const groups = new Map<string, Video[]>();
    for (const video of this.shown()) {
      groups.set(video.folder, [...(groups.get(video.folder) ?? []), video]);
    }
    return [...groups].map(([path, videos]) => ({ path, label: folderLabel(path), videos }));
  });

  readonly totalDuration = computed(() => this.videos().reduce((sum, video) => sum + (video.duration ?? 0), 0));

  readonly formatTime = formatTime;
  readonly formatSize = formatSize;
  readonly formatResolution = formatResolution;

  constructor() {
    this.load();
    // Videos added or deleted in the music folders: the list is loaded again, in place
    const events = inject(LibraryEventsService);
    effect(() => {
      if (events.version()) {
        untracked(() => this.load(true));
      }
    });
  }

  load(quietly = false) {
    if (!quietly) {
      this.status.set('loading');
    }
    this.service.list().subscribe({
      next: ({ videos, scanning }) => {
        this.videos.set(videos);
        this.scanning.set(scanning);
        this.status.set('ready');
      },
      error: () => {
        if (!quietly) {
          this.status.set('error');
        }
      },
    });
  }

  posterFailed(uid: string) {
    this.brokenPosters.update((broken) => new Set(broken).add(uid));
  }

  /** Length of all the videos: "12 min", "2 h 5 min" */
  totalLabel(): string {
    const total = Math.round(this.totalDuration());
    const hours = Math.floor(total / 3600);
    return hours ? `${hours} h ${Math.floor((total % 3600) / 60)} min` : `${Math.max(1, Math.round(total / 60))} min`;
  }
}
