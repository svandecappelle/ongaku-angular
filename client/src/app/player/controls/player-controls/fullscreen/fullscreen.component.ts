import {
  Component,
  OnInit,
  Inject,
  Renderer2,
  ViewChild,
  ElementRef
} from '@angular/core';

import { DOCUMENT } from '@angular/common';
import { Observable ,  BehaviorSubject } from 'rxjs';
import { DataSource } from '@angular/cdk/collections';
import { Store } from '@ngrx/store';

import { PlayerActions } from '../../../player-actions';
import { Song, IAppState } from '../../../../app-state';

import { PlayerControlsComponent } from '../player-controls.component';

interface Metadata {
  key: string;
  value: string;
}

/**
 * Data source to provide what data should be rendered in the table. Note that the data source
 * can retrieve its data in any way. In this case, the data source is provided a reference
 * to a common data base, ExampleDatabase. It is not the data source's responsibility to manage
 * the underlying data. Instead, it only needs to take the data and send the table exactly what
 * should be rendered.
 */
class MetadatasDataSource extends DataSource<any> {
  constructor(private _metadatasDatabase: MetadatasDatabase) {
    super();
  }

  /** Connect function called by the table to retrieve one stream containing the data to render. */
  connect(): Observable<any[]> {
    return this._metadatasDatabase.dataChange;
  }

  disconnect() {}
}

/** An example database that the data source uses to retrieve data for the table. */
class MetadatasDatabase {
  /** Stream that emits whenever the data has been modified. */
  dataChange: BehaviorSubject<any[]> = new BehaviorSubject<any[]>([]);
  get data(): any[] { return this.dataChange.value; }

  constructor(metadatas) {
    metadatas.forEach(element => {
      this.addMetadata(element);
    });
  }

  /** Adds a new user to the database. */
  addMetadata(element) {
    const copiedData = this.data.slice();
    copiedData.push(element);
    this.dataChange.next(copiedData);
  }
}

@Component({
  selector: 'app-fullscreen',
  templateUrl: './fullscreen.component.html',
  styleUrls: ['./fullscreen.component.scss']
})
export class FullscreenComponent implements OnInit {

  private currentTime: number;
  private duration: number;
  private percent: number;
  private state: String;

  private player: PlayerControlsComponent;

  private visible: Boolean = false;

  private metadatasDatabase: MetadatasDatabase;
  private columns = [
    { columnDef: 'key', header: 'Key', cell: (row: Metadata) => `${row.key}`},
    { columnDef: 'value', header: 'Value', cell: (row: Metadata) => `${row.value}`},
  ];

  dataSource: MetadatasDataSource | null;
  displayedColumns: String[] = [];
  current: Song;
  
  @ViewChild('animatedArt', { read: ElementRef }) animationElement: ElementRef;
  @ViewChild('fullscreener', { read: ElementRef }) fullscreener: ElementRef;
  @ViewChild('fullscreenerBackground', { read: ElementRef }) background: ElementRef;

  constructor(private store: Store<IAppState>,
    private actions: PlayerActions,
    @Inject(DOCUMENT) private document: Document,
    private renderer: Renderer2) {
  }

  ngOnInit() {
  }

  setCurrent(song: Song) {
    this.current = song;

    const metadatas = [];

    Object.keys(this.current.metadatas).forEach((key) => {
      metadatas.push({
        key: key,
        value: this.current.metadatas[key]
      });
    });

    this.displayedColumns = this.columns.map(x => x.columnDef);
    this.metadatasDatabase = new MetadatasDatabase(metadatas);
    this.dataSource = new MetadatasDataSource(this.metadatasDatabase);
  }

  setState(state: String) {
    this.state = state;
    if (!this.animationElement) {
      return;
    }

    if (this.state === 'playing') {
      this.animationElement.nativeElement.style.animationPlayState = 'running';
      this.animationElement.nativeElement.style.webkitAnimationPlayState = 'running';
    } else {
      this.animationElement.nativeElement.style.animationPlayState = 'paused';
      this.animationElement.nativeElement.style.webkitAnimationPlayState = 'paused';
    }
  }

  open(player: PlayerControlsComponent) {
    this.player = player;
    this.renderer.addClass(this.document.body, 'no-scroll');
    setTimeout(() => {
      this.renderer.addClass(this.fullscreener.nativeElement, 'open');
      this.renderer.addClass(this.background.nativeElement, 'open');
      this.visible = true;

      // The timeout is because the animation playstate has no effect until the image
      // had been rendered by browser.
      if (this.state === 'playing') {
        this.animationElement.nativeElement.style.animationPlayState = 'running';
        this.animationElement.nativeElement.style.webkitAnimationPlayState = 'running';
      } else {
        this.animationElement.nativeElement.style.animationPlayState = 'paused';
        this.animationElement.nativeElement.style.webkitAnimationPlayState = 'paused';
      }
    }, 100);
  }

  close() {
    this.visible = false;
    this.renderer.removeClass(this.document.body, 'no-scroll');
    this.renderer.removeClass(this.fullscreener.nativeElement, 'open');
    this.renderer.removeClass(this.background.nativeElement, 'open');
  }

  time(time: number, duration: number) {
    if (this.visible) {
      this.currentTime = time;
      this.duration = duration;
      this.percent = this.currentTime / this.duration * 100;
    }
  }

  // TODO find why store doesn't works in this context and
  // use it instead of direct reference

  play() {
    this.player.play();
    // this.store.select(state => state.player).dispatch(this.actions.playSelectedTrack(this.current));
  }

  pause() {
    this.player.play();
    // this.store.select(state => state.player).dispatch(this.actions.audioPaused());
  }

  next() {
    this.player.next();
  }

  previous() {
    this.player.previous();
  }

  onStepperClick($event) {
    const time = this.duration * $event.layerX / $event.target.offsetWidth;
    this.player.goTo(time);
  }
}
