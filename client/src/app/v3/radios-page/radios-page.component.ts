import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatDialog } from '@angular/material/dialog';
import { MatSnackBar } from '@angular/material/snack-bar';

import { MaterialModule } from '../../modules/material.module';
import { PlaybackService, RadioStation } from '../../services/playback.service';
import { RadiosService } from '../../services/radios.service';
import { LibraryRadioService, LibraryStation } from '../../services/library-radio.service';
import { StationDialogComponent } from './station-dialog.component';
import { StationTileComponent } from './station-tile.component';

type Load = 'loading' | 'error' | 'ready';
const ALL = 'All';
const FAVOURITES = 'Favourites';

/** Radios page: endless stations made from the library, and the internet stations every member can listen to */
@Component({
  selector: 'app-radios-page',
  templateUrl: './radios-page.component.html',
  styleUrls: ['./radios-page.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [MaterialModule, FormsModule, StationTileComponent],
})
export class RadiosPageComponent {
  readonly playback = inject(PlaybackService);
  readonly radios = inject(RadiosService);
  readonly libraryRadio = inject(LibraryRadioService);
  private readonly dialog = inject(MatDialog);
  private readonly snackBar = inject(MatSnackBar);

  readonly status = signal<Load>('loading');
  readonly stations = signal<RadioStation[]>([]);
  readonly administrator = signal(false);
  readonly filter = signal(ALL);
  readonly search = signal('');
  /** Stations made from the library; empty when it could not be loaded */
  readonly libraryStations = signal<LibraryStation[]>([]);
  readonly mix = computed(() => this.libraryStations().find((station) => station.kind === 'mix') ?? null);
  readonly otherLibraryStations = computed(() => this.libraryStations().filter((station) => station.kind !== 'mix'));

  /** All, Favourites (when there are some), then the genres of the stations */
  readonly chips = computed(() => {
    const genres = [...new Set(this.stations().map((station) => station.genre).filter((genre): genre is string => !!genre))]
      .sort((a, b) => a.localeCompare(b));
    return [ALL, ...(this.stations().some((station) => station.favourite) ? [FAVOURITES] : []), ...genres];
  });

  readonly shown = computed(() => {
    const filter = this.filter();
    const search = this.search().trim().toLowerCase();
    return this.stations().filter((station) =>
      (filter === ALL || (filter === FAVOURITES ? station.favourite : station.genre === filter))
      && (!search || station.name.toLowerCase().includes(search) || (station.genre ?? '').toLowerCase().includes(search)));
  });

  constructor() {
    this.load();
  }

  load() {
    this.libraryRadio.stations().subscribe({
      next: (stations) => this.libraryStations.set(stations),
      error: () => this.libraryStations.set([]),
    });
    this.status.set('loading');
    this.radios.list().subscribe({
      next: ({ administrator, stations }) => {
        this.administrator.set(administrator);
        this.stations.set(stations);
        if (!this.chips().includes(this.filter())) {
          this.filter.set(ALL);
        }
        this.status.set('ready');
      },
      error: () => this.status.set('error'),
    });
  }

  isPlaying(station: RadioStation): boolean {
    return this.playback.station()?.id === station.id && this.playback.state() !== 'paused' && this.playback.state() !== 'stopped';
  }

  /** The title on air: live from the player for the station playing, else the last one the server saw */
  onAir(station: RadioStation): string | null {
    return this.playback.station()?.id === station.id ? this.radios.onAir() : station.nowPlaying;
  }

  details(station: RadioStation): string {
    const format = station.type ? station.type.replace(/^audio\//, '').replace('mpeg', 'MP3').toUpperCase() : null;
    return [station.genre, format, station.bitrate ? `${station.bitrate} kbps` : null].filter(Boolean).join(' · ');
  }

  kindLabel(station: LibraryStation): string {
    return { mix: 'Your mix', artist: 'Artist radio', genre: 'Genre', rediscover: 'Rediscover' }[station.kind];
  }

  /** Starts a library station, or pauses and resumes it when it plays */
  toggleLibrary(station: LibraryStation) {
    if (this.libraryRadio.isActive(station)) {
      this.playback.toggle();
      return;
    }
    this.libraryRadio.start(station).subscribe({
      next: (started) => !started && this.snackBar.open('No track for this station yet', undefined, { duration: 4000 }),
      error: () => this.snackBar.open('The station could not be started', undefined, { duration: 4000 }),
    });
  }

  togglePlay(station: RadioStation) {
    if (this.playback.station()?.id === station.id) {
      this.playback.toggle();
    } else {
      this.playback.playStation(station);
    }
  }

  toggleFavourite(station: RadioStation) {
    const favourite = !station.favourite;
    this.patch(station.id, { favourite });
    this.radios.setFavourite(station.id, favourite).subscribe({
      error: () => {
        this.patch(station.id, { favourite: !favourite });
        this.snackBar.open('The favourite could not be saved', undefined, { duration: 4000 });
      },
    });
  }

  add() {
    this.dialog.open(StationDialogComponent, { autoFocus: 'first-tabbable' }).afterClosed().subscribe((station?: RadioStation) => {
      if (station) {
        this.stations.update((stations) => [...stations, station].sort((a, b) => a.name.localeCompare(b.name)));
        this.snackBar.open(`${station.name} added`, undefined, { duration: 3000 });
      }
    });
  }

  edit(station: RadioStation) {
    this.dialog.open(StationDialogComponent, { data: station, autoFocus: 'first-tabbable' }).afterClosed().subscribe((saved?: RadioStation) => {
      if (saved) {
        this.patch(station.id, { ...saved, favourite: station.favourite });
      }
    });
  }

  remove(station: RadioStation) {
    if (!confirm(`Delete the station “${station.name}” for every member?`)) {
      return;
    }
    this.radios.remove(station.id).subscribe({
      next: () => {
        if (this.playback.station()?.id === station.id) {
          this.playback.stopStation();
        }
        this.stations.update((stations) => stations.filter((item) => item.id !== station.id));
        this.snackBar.open(`${station.name} deleted`, undefined, { duration: 3000 });
      },
      error: () => this.snackBar.open('The station could not be deleted', undefined, { duration: 4000 }),
    });
  }

  /** Changes a station in the list, and in the player when it plays */
  private patch(id: string, changes: Partial<RadioStation>) {
    this.stations.update((stations) => stations.map((station) => (station.id === id ? { ...station, ...changes } : station)));
    this.playback.station.update((current) => (current?.id === id ? { ...current, ...changes } : current));
  }
}
