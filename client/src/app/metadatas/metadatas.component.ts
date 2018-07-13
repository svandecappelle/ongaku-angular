import {
  Component,
  OnInit,
  Inject,
  OnDestroy,
  ViewChild,
  ElementRef
} from '@angular/core';

import { DOCUMENT } from '@angular/common';
import { Observable } from 'rxjs/Observable';
import { MatDialog, MAT_DIALOG_DATA, MatTableDataSource } from '@angular/material';
import { DataSource } from "@angular/cdk/collections";
import { BehaviorSubject } from 'rxjs/BehaviorSubject';

@Component({
  selector: 'app-metadatas',
  templateUrl: './metadatas.component.html',
  styleUrls: ['./metadatas.component.scss']
})
export class MetadatasComponent implements OnInit, OnDestroy {

  @ViewChild('filter') filter: ElementRef;
  dataSource: MetadatasDataSource | null;
  metadatasDatabase:MetadatasDatabase;

  private columns = [
    { columnDef: 'key', header: 'Key', cell: (row:Metadata) => `${row.key}`},
    { columnDef: 'value', header: 'Value', cell: (row:Metadata) => `${row.value}`},
    
  ];
  private displayedColumns:String[] = [];

  constructor( @Inject(MAT_DIALOG_DATA) public data: any) {
    let metadatas = [];

    Object.keys(data.metadatas).forEach((key) => {
      metadatas.push({
        key: key,
        value: data.metadatas[key]
      });     
    });

    this.displayedColumns = this.columns.map(x => x.columnDef);
    this.metadatasDatabase = new MetadatasDatabase(metadatas);
    this.dataSource = new MetadatasDataSource(this.metadatasDatabase);
  }

  ngOnInit() {
  }

  applyFilter(filterValue: string) {
    filterValue = filterValue.trim(); // Remove whitespace
    filterValue = filterValue.toLowerCase(); // MatTableDataSource defaults to lowercase matches
    // this.dataSource.filter = filterValue;
  }

  ngOnDestroy() {

  }
}

export interface Metadata {
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