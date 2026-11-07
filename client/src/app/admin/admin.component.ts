import { ChangeDetectionStrategy, Component, DestroyRef, ElementRef, computed, effect, inject, signal, viewChild } from '@angular/core';
import { DatePipe, DecimalPipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpErrorResponse, HttpEventType } from '@angular/common/http';
import { MatDialog } from '@angular/material/dialog';
import { MatSnackBar } from '@angular/material/snack-bar';
import { Chart, registerables } from 'chart.js';
import moment from 'moment';

import { MaterialModule } from '../modules/material.module';
import { AdminService, AdminUser, Duplicates, ImportFolder, ImportResult, UserChanges } from '../services/admin.service';
import { StatisticsService } from '../services/statistics.service';
import { ReloadService } from '../library/reload.service';
import { DeleteUserDialogComponent } from './delete-user-dialog.component';
import { UserDialogComponent, UserDialogResult } from './user-dialog.component';

Chart.register(...registerables);

interface Statistics {
  usersCount: number;
  albumsCount: number;
  tracksCount: number;
  storage: Record<'total' | 'common' | 'users', { value: string; label: string }>;
}

interface DayValue {
  date: string;
  value: number | string;
}

interface Settings {
  allowRegisteration: number;
  requireLogin: boolean;
  allowUpload: boolean;
  allowDownload: boolean;
  deduplicate: boolean;
}

/** A file queued for the public library import */
interface ImportItem {
  file: File;
  progress: number;
  state: 'waiting' | 'uploading' | 'done' | 'error';
  result?: ImportResult;
}

// Settings are stored as strings by the server
const flag = (value: unknown) => value === true || value === 'true';

@Component({
  selector: 'app-admin',
  templateUrl: './admin.component.html',
  styleUrls: ['./admin.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [MaterialModule, FormsModule, DatePipe, DecimalPipe],
})
export class AdminComponent {
  private readonly admin = inject(AdminService);
  private readonly statisticsService = inject(StatisticsService);
  private readonly reloadService = inject(ReloadService);
  private readonly dialog = inject(MatDialog);
  private readonly snackBar = inject(MatSnackBar);

  readonly details = signal<{ version: string; sha: string } | null>(null);
  readonly statistics = signal<Statistics | null>(null);
  readonly logins = signal<{ succeed: DayValue[]; failed: DayValue[] } | null>(null);
  readonly plays = signal<DayValue[] | null>(null);
  readonly reloading = signal(false);
  readonly busy = signal(false);

  readonly settings = signal<Settings | null>(null);
  readonly savingSettings = signal(false);

  readonly users = signal<AdminUser[] | null>(null);
  readonly usersFilter = signal('');
  readonly filteredUsers = computed(() => {
    const filter = this.usersFilter().trim().toLowerCase();
    const users = this.users() ?? [];
    return filter ? users.filter((u) => u.username.toLowerCase().includes(filter) || (u.email ?? '').toLowerCase().includes(filter)) : users;
  });
  readonly administratorsCount = computed(() => (this.users() ?? []).filter((u) => u.administrator).length);
  readonly userColumns = ['user', 'role', 'status', 'storage', 'lastonline', 'actions'];

  readonly duplicates = signal<Duplicates | null>(null);
  readonly importFolder = signal<ImportFolder | null>(null);
  readonly importSubFolder = signal('');
  readonly importItems = signal<ImportItem[]>([]);
  readonly importing = computed(() => this.importItems().some((item) => item.state === 'uploading'));
  readonly dragging = signal(false);

  private readonly storageCanvas = viewChild<ElementRef<HTMLCanvasElement>>('storageChart');
  private readonly loginsCanvas = viewChild<ElementRef<HTMLCanvasElement>>('loginsChart');
  private readonly playsCanvas = viewChild<ElementRef<HTMLCanvasElement>>('playsChart');
  private readonly charts = new Map<string, Chart>();

  constructor() {
    this.loadOverview();
    this.loadUsers();
    this.admin.getProperties().subscribe((properties) => this.settings.set({
      allowRegisteration: Number(properties?.allowRegisteration) || 0,
      requireLogin: flag(properties?.requireLogin),
      allowUpload: flag(properties?.allowUpload),
      allowDownload: flag(properties?.allowDownload),
      // Enabled unless turned off
      deduplicate: properties?.deduplicate === undefined || properties?.deduplicate === null || flag(properties.deduplicate),
    }));
    this.loadDuplicates();
    this.admin.importFolder().subscribe((folder) => this.importFolder.set(folder));

    // The charts are drawn when their tab is shown (the canvases only exist then) and the data is loaded
    effect(() => this.drawStorage(this.storageCanvas(), this.statistics()));
    effect(() => this.drawLogins(this.loginsCanvas(), this.logins()));
    effect(() => this.drawPlays(this.playsCanvas(), this.plays()));
    inject(DestroyRef).onDestroy(() => this.charts.forEach((chart) => chart.destroy()));
  }

  // ---------- Overview ----------

  loadOverview() {
    this.statisticsService.getDetails().subscribe((details) => this.details.set(details));
    this.statisticsService.getStatistics().subscribe((statistics) => this.statistics.set(statistics));
    this.statisticsService.getUsersAccess().subscribe((logins) => this.logins.set(logins));
    this.statisticsService.getUsersActivity().subscribe((plays) => this.plays.set(plays));
  }

  reload() {
    this.reloading.set(true);
    this.reloadService.reload().subscribe({
      next: () => {
        this.reloading.set(false);
        this.statisticsService.getStatistics().subscribe((statistics) => this.statistics.set(statistics));
        this.loadDuplicates();
        this.snackBar.open('Library reloaded', undefined, { duration: 3000 });
      },
      error: (err) => {
        this.reloading.set(false);
        this.error(err, 'Could not reload the library');
      },
    });
  }

  loadDuplicates() {
    this.admin.duplicates().subscribe({
      next: (duplicates) => this.duplicates.set(duplicates),
      error: (err) => this.error(err, 'Could not load the duplicates'),
    });
  }

  update() {
    this.busy.set(true);
    this.admin.update().subscribe({
      next: () => {
        this.busy.set(false);
        this.statisticsService.getDetails().subscribe((details) => this.details.set(details));
        this.snackBar.open('Update checked', undefined, { duration: 3000 });
      },
      error: (err) => {
        this.busy.set(false);
        this.error(err, 'Could not update the application');
      },
    });
  }

  restart() {
    this.busy.set(true);
    // The server exits: the request fails or never answers, the page is reloaded once it is back
    this.admin.restart().subscribe({ error: () => undefined });
    this.snackBar.open('The application restarts…', undefined, { duration: 5000 });
    setTimeout(() => location.reload(), 5000);
  }

  private chartColors() {
    const style = getComputedStyle(document.documentElement);
    const read = (name: string, fallback: string) => style.getPropertyValue(name).trim() || fallback;
    return {
      accent: read('--ongaku-accent', '#3cba9f'),
      muted: read('--ongaku-muted', '#8a8a8a'),
      border: read('--ongaku-border', 'rgba(128,128,128,.2)'),
      surface: read('--ongaku-surface-2', '#a9a9a9'),
      warn: read('--mat-sys-error', '#e5a50a'),
    };
  }

  private replaceChart(id: string, canvas: ElementRef<HTMLCanvasElement> | undefined, build: (canvas: HTMLCanvasElement) => Chart | null) {
    this.charts.get(id)?.destroy();
    this.charts.delete(id);
    const chart = canvas ? build(canvas.nativeElement) : null;
    if (chart) {
      this.charts.set(id, chart);
    }
  }

  private drawStorage(canvas: ElementRef<HTMLCanvasElement> | undefined, statistics: Statistics | null) {
    this.replaceChart('storage', canvas, (element) => {
      if (!statistics) {
        return null;
      }
      const colors = this.chartColors();
      Chart.defaults.color = colors.muted;
      return new Chart(element, {
        type: 'doughnut',
        data: {
          labels: ['Common library', 'User uploads'],
          datasets: [{
            data: [Number(statistics.storage.common.value), Number(statistics.storage.users.value)],
            backgroundColor: [colors.accent, colors.surface],
            borderColor: colors.border,
          }],
        },
        options: {
          maintainAspectRatio: false,
          cutout: '70%',
          plugins: {
            legend: { position: 'bottom' },
            tooltip: { callbacks: { label: (item) => ` ${item.label}: ${item.formattedValue} MB` } },
          },
        },
      });
    });
  }

  private drawLogins(canvas: ElementRef<HTMLCanvasElement> | undefined, logins: { succeed: DayValue[]; failed: DayValue[] } | null) {
    this.replaceChart('logins', canvas, (element) => {
      if (!logins) {
        return null;
      }
      const colors = this.chartColors();
      return this.barChart(element, logins.succeed.map((day) => moment(day.date).format('l')), [
        { label: 'Connections', data: logins.succeed.map((day) => Number(day.value)), backgroundColor: colors.accent },
        { label: 'Failed connections', data: logins.failed.map((day) => Number(day.value)), backgroundColor: colors.warn },
      ], true);
    });
  }

  private drawPlays(canvas: ElementRef<HTMLCanvasElement> | undefined, plays: DayValue[] | null) {
    this.replaceChart('plays', canvas, (element) => {
      if (!plays) {
        return null;
      }
      const colors = this.chartColors();
      return this.barChart(element, plays.map((day) => moment(day.date).format('l')), [
        { label: 'Plays', data: plays.map((day) => Number(day.value)), backgroundColor: colors.accent },
      ], false);
    });
  }

  private barChart(element: HTMLCanvasElement, labels: string[], datasets: { label: string; data: number[]; backgroundColor: string }[], legend: boolean) {
    const colors = this.chartColors();
    Chart.defaults.color = colors.muted;
    return new Chart(element, {
      type: 'bar',
      data: { labels, datasets: datasets.map((dataset) => ({ ...dataset, borderRadius: 3 })) },
      options: {
        maintainAspectRatio: false,
        plugins: { legend: { display: legend, position: 'bottom' } },
        scales: {
          x: { grid: { display: false }, ticks: { maxTicksLimit: 8 } },
          y: { beginAtZero: true, grid: { color: colors.border }, ticks: { precision: 0 } },
        },
      },
    });
  }

  // ---------- Library import ----------

  addImportFiles(files: FileList | null) {
    if (!files?.length) {
      return;
    }
    const added = Array.from(files).map((file): ImportItem => ({ file, progress: 0, state: 'waiting' }));
    this.importItems.update((items) => [...items.filter((item) => item.state !== 'done'), ...added]);
  }

  onDrop(event: DragEvent) {
    event.preventDefault();
    this.dragging.set(false);
    this.addImportFiles(event.dataTransfer?.files ?? null);
  }

  removeImportItem(item: ImportItem) {
    this.importItems.update((items) => items.filter((i) => i !== item));
  }

  clearImport() {
    this.importItems.update((items) => items.filter((item) => item.state === 'uploading'));
  }

  /** Files are sent one after the other: the server rescans the library after each import */
  startImport() {
    const next = this.importItems().find((item) => item.state === 'waiting');
    if (!next) {
      this.admin.importFolder().subscribe((folder) => this.importFolder.set(folder));
      return;
    }
    this.patchImportItem(next, { state: 'uploading', progress: 0 });
    this.admin.importFile(next.file, this.importSubFolder().trim()).subscribe({
      next: (event) => {
        if (event.type === HttpEventType.UploadProgress && event.total) {
          this.patchImportItem(next, { progress: Math.round(100 * event.loaded / event.total) });
        } else if (event.type === HttpEventType.Response) {
          const result = event.body?.files?.[0] ?? { file: next.file.name, imported: [] };
          this.patchImportItem(next, { state: result.error ? 'error' : 'done', progress: 100, result });
          if (event.body?.rescan === 'busy') {
            this.snackBar.open('A library scan was already running: reload the library once it is over.', 'Reload', { duration: 8000 })
              .onAction().subscribe(() => this.reload());
          }
          this.startImport();
        }
      },
      error: (err: HttpErrorResponse) => {
        this.patchImportItem(next, { state: 'error', result: { file: next.file.name, error: err.error?.message || 'Upload failed' } });
        this.startImport();
      },
    });
  }

  private patchImportItem(item: ImportItem, changes: Partial<ImportItem>) {
    Object.assign(item, changes);
    this.importItems.update((items) => [...items]);
  }

  // ---------- Users ----------

  loadUsers() {
    this.admin.users().subscribe({
      next: (users) => this.users.set(users),
      error: (err) => this.error(err, 'Could not load the users'),
    });
  }

  createUser() {
    this.dialog.open<UserDialogComponent, { mode: 'create' }, UserDialogResult>(UserDialogComponent, { data: { mode: 'create' }, width: '440px' })
      .afterClosed().subscribe((result) => {
        if (!result) {
          return;
        }
        this.admin.createUser({ username: result.username, email: result.email, password: result.password, administrator: result.administrator })
          .subscribe({
            next: () => {
              this.snackBar.open(`“${result.username}” created`, undefined, { duration: 3000 });
              this.loadUsers();
            },
            error: (err) => this.error(err, 'Could not create the user'),
          });
      });
  }

  resetPassword(user: AdminUser) {
    this.dialog.open<UserDialogComponent, { mode: 'password'; username: string }, UserDialogResult>(UserDialogComponent,
      { data: { mode: 'password', username: user.username }, width: '440px' })
      .afterClosed().subscribe((result) => {
        if (result) {
          this.changeUser(user, { password: result.password }, `Password of “${user.username}” changed`);
        }
      });
  }

  setAdministrator(user: AdminUser, administrator: boolean) {
    this.changeUser(user, { administrator }, administrator ? `“${user.username}” is an administrator` : `“${user.username}” is no longer an administrator`);
  }

  setBanned(user: AdminUser, banned: boolean) {
    this.changeUser(user, { banned }, banned ? `“${user.username}” can no longer sign in` : `“${user.username}” can sign in again`);
  }

  deleteUser(user: AdminUser) {
    this.dialog.open<DeleteUserDialogComponent, { username: string }, { deleteFiles: boolean }>(DeleteUserDialogComponent,
      { data: { username: user.username }, width: '440px' })
      .afterClosed().subscribe((result) => {
        if (!result) {
          return;
        }
        this.admin.deleteUser(user.username, result.deleteFiles).subscribe({
          next: () => {
            this.snackBar.open(`“${user.username}” deleted`, undefined, { duration: 3000 });
            this.loadUsers();
          },
          error: (err) => this.error(err, 'Could not delete the user'),
        });
      });
  }

  private changeUser(user: AdminUser, changes: UserChanges, message: string) {
    this.admin.updateUser(user.username, changes).subscribe({
      next: () => {
        this.snackBar.open(message, undefined, { duration: 3000 });
        this.loadUsers();
      },
      error: (err) => this.error(err, 'Could not update the user'),
    });
  }

  // ---------- Settings ----------

  patchSettings(changes: Partial<Settings>) {
    this.settings.update((settings) => settings && { ...settings, ...changes });
  }

  saveSettings() {
    const settings = this.settings();
    if (!settings) {
      return;
    }
    this.savingSettings.set(true);
    this.admin.configure(settings).subscribe({
      next: () => {
        this.savingSettings.set(false);
        this.snackBar.open('Settings saved', undefined, { duration: 3000 });
        this.loadDuplicates();
      },
      error: (err) => {
        this.savingSettings.set(false);
        this.error(err, 'Could not save the settings');
      },
    });
  }

  // ---------- Helpers ----------

  readonly formatSize = (bytes: number) => {
    if (!bytes) {
      return '—';
    }
    const units = ['B', 'KB', 'MB', 'GB', 'TB'];
    const exponent = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
    return `${(bytes / Math.pow(1024, exponent)).toFixed(exponent ? 1 : 0)} ${units[exponent]}`;
  };

  private error(err: HttpErrorResponse, fallback: string) {
    this.snackBar.open(err?.error?.message || fallback, undefined, { duration: 5000 });
  }
}
