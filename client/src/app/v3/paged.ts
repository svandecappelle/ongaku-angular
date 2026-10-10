import { signal } from '@angular/core';
import { Observable, Subscription, forkJoin, of } from 'rxjs';
import { catchError } from 'rxjs/operators';

/** List loaded page by page from the API, for "Show more" buttons */
export class Paged<T> {
  readonly items = signal<T[]>([]);
  readonly loading = signal(false);
  /** The last page was not full: there is nothing more to load */
  readonly done = signal(false);
  readonly failed = signal(false);

  private page = 0;
  private subscription?: Subscription;

  /**
   * @param fetch loads one page
   * @param pageSize number of items of a full page (set by the server)
   * @param pagesPerLoad pages loaded at once, the server pages being small
   */
  constructor(
    private readonly fetch: (page: number) => Observable<T[]>,
    private readonly pageSize: number,
    private readonly pagesPerLoad = 1,
  ) {}

  /** Loads the first pages again, for example when the search changes */
  reset() {
    this.subscription?.unsubscribe();
    this.page = 0;
    this.items.set([]);
    this.done.set(false);
    this.failed.set(false);
    this.loading.set(false);
    this.more();
  }

  more() {
    if (this.loading() || this.done()) {
      return;
    }
    this.loading.set(true);
    const pages = Array.from({ length: this.pagesPerLoad }, (_, i) => this.page + i);
    this.page += this.pagesPerLoad;
    this.subscription = forkJoin(pages.map((page) => this.fetch(page).pipe(catchError(() => {
      this.failed.set(true);
      return of([] as T[]);
    })))).subscribe((results) => {
      this.items.update((items) => [...items, ...results.flat()]);
      this.done.set(results[results.length - 1].length < this.pageSize);
      this.loading.set(false);
    });
  }

  destroy() {
    this.subscription?.unsubscribe();
  }
}
