import { ChangeDetectionStrategy, Component, DestroyRef, OnInit, inject, signal } from '@angular/core';
import { NotificationsService } from './notifications.service';
import { Event } from '../model/event';

/** A message pushed by the server */
interface Notice {
  id: number;
  text: string;
}

/** Progress of a library scan (server/app/middleware/scanner.js) */
interface ScanProgress {
  /** Percent, 0 to 100 */
  value: number;
  text: string;
  done: boolean;
}

/**
 * Messages of the server, shown as cards over the top right of the page: the progress of
 * a library scan and the other notifications. The container keeps the room of the top bar
 * (64px), which the pages rely on.
 */
@Component({
  selector: 'app-notifications',
  templateUrl: './notifications.component.html',
  styleUrls: ['./notifications.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
  standalone: false,
})
export class NotificationsComponent implements OnInit {
  private readonly service = inject(NotificationsService);
  private readonly destroyRef = inject(DestroyRef);

  readonly notices = signal<Notice[]>([]);
  readonly scan = signal<ScanProgress | null>(null);
  private nextId = 0;
  private hideScan: ReturnType<typeof setTimeout> | undefined;

  ngOnInit() {
    this.service.initSocket();

    const messages = this.service.onMessage().subscribe((message: any) => {
      const text = typeof message === 'string' ? message : message?.content ?? message?.message;
      if (text) {
        this.notices.update((notices) => [...notices, { id: this.nextId++, text: String(text) }]);
      }
    });

    const scans = this.service.onEvent(Event.LIBRARY_SCAN).subscribe((data: { value?: number; content?: string }) => {
      const value = Math.min(100, Math.max(0, Number(data?.value) || 0));
      const done = value >= 100;
      clearTimeout(this.hideScan);
      this.scan.set({ value, done, text: done ? 'The library is up to date.' : data?.content || 'Scanning the music folders' });
      if (done) {
        this.hideScan = setTimeout(() => this.scan.set(null), 6000);
      }
    });

    this.destroyRef.onDestroy(() => {
      messages.unsubscribe();
      scans.unsubscribe();
      clearTimeout(this.hideScan);
    });
  }

  close(notice: Notice) {
    this.notices.update((notices) => notices.filter((n) => n.id !== notice.id));
  }

  closeScan() {
    clearTimeout(this.hideScan);
    this.scan.set(null);
  }
}
