import {
  Component,
  OnInit,
  Inject,
  OnDestroy,
  Renderer2,
  ChangeDetectorRef,
  ViewChild,
  ElementRef
} from '@angular/core';

import { DOCUMENT } from '@angular/common';
import { Observable } from 'rxjs/Observable';
import { MatDialog, MAT_DIALOG_DATA, MatTableDataSource } from '@angular/material';
import { DataSource } from "@angular/cdk/collections";
import { BehaviorSubject } from 'rxjs/BehaviorSubject';

import { Song, IAppState } from '../../../../app-state';

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

  private current: Song;
  private visible: Boolean = false;

  private dataSource: MetadatasDataSource | null;
  private metadatasDatabase:MetadatasDatabase;
  private columns = [
    { columnDef: 'key', header: 'Key', cell: (row: Metadata) => `${row.key}`},
    { columnDef: 'value', header: 'Value', cell: (row: Metadata) => `${row.value}`},  
  ];
  private displayedColumns:String[] = [];
  
  constructor(@Inject(DOCUMENT) private document: Document,
  private renderer: Renderer2) { }

  ngOnInit() {
  }

  setCurrent(song: Song) {
    this.current = song;

    this.renderer.addClass(this.document.body, 'no-scroll');
    let metadatas = [];
    
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

  open() {
    this.visible = true;
  }

  close() {
    this.visible = false;
    this.renderer.removeClass(this.document.body, 'no-scroll');
  }
}
