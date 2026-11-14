import { ChangeDetectionStrategy, Component, ElementRef, computed, inject, signal, viewChild } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { HttpErrorResponse } from '@angular/common/http';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { catchError, forkJoin, map, of, switchMap } from 'rxjs';

import { MaterialModule } from '../../modules/material.module';
import { PlaybackService } from '../../services/playback.service';
import { Video, VideoService, folderLabel, formatResolution, formatSize } from '../../services/video.service';
import { formatTime } from '../format-time';

type Load = { status: 'loading' } | { status: 'error'; notFound: boolean } | { status: 'ready' };

/** One video, in the player of the browser, with the other videos of its folder to go on with */
@Component({
  selector: 'app-video-page',
  templateUrl: './video-page.component.html',
  styleUrls: ['./video-page.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [MaterialModule, RouterLink],
})
export class VideoPageComponent {
  readonly service = inject(VideoService);
  private readonly playback = inject(PlaybackService);
  private readonly router = inject(Router);
  private readonly player = viewChild<ElementRef<HTMLVideoElement>>('player');

  readonly load = signal<Load>({ status: 'loading' });
  readonly video = signal<Video | null>(null);
  /** The videos of the same folder, this one included */
  readonly siblings = signal<Video[]>([]);
  /** The video could not be read by the browser (codec, damaged file) */
  readonly playError = signal(false);
  /** Goes on with the next video of the folder at the end */
  readonly autoNext = signal(true);

  readonly next = computed(() => {
    const list = this.siblings();
    const index = list.findIndex((video) => video.uid === this.video()?.uid);
    return index >= 0 && index < list.length - 1 ? list[index + 1] : null;
  });
  readonly folderLabel = computed(() => folderLabel(this.video()?.folder ?? ''));

  readonly formatTime = formatTime;
  readonly formatSize = formatSize;
  readonly formatResolution = formatResolution;

  constructor() {
    inject(ActivatedRoute).paramMap.pipe(
      map((params) => params.get('uid') ?? ''),
      switchMap((uid) => {
        this.load.set({ status: 'loading' });
        this.playError.set(false);
        return forkJoin({
          video: this.service.get(uid),
          list: this.service.list().pipe(map(({ videos }) => videos), catchError(() => of([] as Video[]))),
        }).pipe(catchError((err: HttpErrorResponse) => of(err)));
      }),
      takeUntilDestroyed(),
    ).subscribe((answer) => {
      if (answer instanceof HttpErrorResponse) {
        this.video.set(null);
        this.load.set({ status: 'error', notFound: answer.status === 404 });
        return;
      }
      this.video.set(answer.video);
      this.siblings.set(answer.list.filter((video) => video.folder === answer.video.folder));
      this.load.set({ status: 'ready' });
    });
  }

  /** The music stops while a video plays: one sound at a time */
  onPlay() {
    if (this.playback.playing()) {
      this.playback.pause();
    }
  }

  onEnded() {
    const next = this.next();
    if (this.autoNext() && next) {
      this.router.navigate(['/videos', next.uid]);
    }
  }

  onError() {
    // An error of the source, not a pause or a seek
    if (this.player()?.nativeElement.error) {
      this.playError.set(true);
    }
  }
}
