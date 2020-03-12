import {
  Component,
  OnInit,
  Inject,
  OnDestroy,
  ViewChild,
  ElementRef
} from '@angular/core';


import { MetadataService } from 'app/services/metadata.service';
import {NgForm} from '@angular/forms';

import { Observable ,  BehaviorSubject } from 'rxjs';
import { MAT_DIALOG_DATA } from '@angular/material/dialog';
import { DataSource } from "@angular/cdk/collections";
import clone from 'lodash/clone';
import isArray from 'lodash/isArray';
import has from 'lodash/has';

export interface Metadata {
  key: string;
  value: string;
}


@Component({
  selector: 'app-metadatas',
  templateUrl: './metadatas.component.html',
  styleUrls: ['./metadatas.component.scss']
})
export class MetadatasComponent implements OnInit, OnDestroy {

  @ViewChild('filter', { static: false }) filter: ElementRef;
  dataSource: MetadatasDataSource | null;
  metadatasDatabase:MetadatasDatabase;

  columns = [{
      columnDef: 'key',
      header: 'Key',
      cell: (row:Metadata) => `${row.key}`,
      data: true
    }, {
      editable: true,
      columnDef: 'value',
      header: 'Value',
      cell: (row:Metadata) => `${row.value}`,
      data: true
    }, {
      columnDef: 'delete',
      header: 'Delete'
    }
  ];
  displayedColumns: String[] = [];
  
  dataColumns: any[] = [];
  metadata: any;
  metadatasList: Array<Metadata>;

  tracks = Array<string>();

  constructor(
    @Inject(MAT_DIALOG_DATA) public data: any,
    private metadataService: MetadataService
  ) {
    this.metadatasList = [];
    if (isArray(data)) {
      this.tracks = data.map(t => t.uuid);
      this.metadata = {};
      const ignore = [];
      data.forEach(track => {
        Object.keys(track.metadatas).forEach(metadata => {
          if (!has(this.metadata, metadata)) {
            this.metadata[metadata] = track.metadatas[metadata];
          } else if (this.metadata[metadata] !== track.metadatas[metadata]) {
            ignore.push(metadata);
          }
        });
      });
      ignore.forEach(metadata => {
        delete this.metadata[metadata];
      });

    } else {
      this.tracks = [data.uuid];
      this.metadata = clone(data.metadatas);
    }

    this.displayedColumns = this.columns.map(x => x.columnDef);
    this.dataColumns = this.columns.filter(x => x.data);
  }

  ngOnInit() {
    this.populateMetadataList();
  }

  ngOnDestroy() {

  }

  onSubmit(f: NgForm) {
    this.metadataService.set(this.tracks, f.value).subscribe(r => {
      if (r) {
        console.log("close popup");
      }
    });
  }

  populateMetadataList() {
    this.metadatasList = [];
    Object.keys(this.metadata).forEach((key) => {
      this.metadatasList.push({
        key: key,
        value: this.metadata[key],
      });
    });

    this.metadatasDatabase = new MetadatasDatabase(this.metadatasList);
    this.dataSource = new MetadatasDataSource(this.metadatasDatabase);
  }

  delete(ev: Event, key: string) {
    ev.stopPropagation();
    ev.preventDefault();
    delete this.metadata[key];
    this.populateMetadataList();
  }
}

/**
 * Data source to provide what data should be rendered in the table. Note that the data source
 * can retrieve its data in any way. In this case, the data source is provided a reference
 * to a common data base, ExampleDatabase. It is not the data source's responsibility to manage
 * the underlying data. Instead, it only needs to take the data and send the table exactly what
 * should be rendered.
 */
export class MetadatasDataSource extends DataSource<any> {
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
export class MetadatasDatabase {
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