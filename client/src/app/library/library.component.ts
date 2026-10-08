import {Component, OnInit, ElementRef, ViewChild, ChangeDetectionStrategy} from '@angular/core';
import {FormBuilder, FormGroup, Validators} from "@angular/forms";

@Component({
    selector: 'app-library',
    templateUrl: './library.component.html',
    styleUrls: ['./library.component.scss'],
    changeDetection: ChangeDetectionStrategy.Eager,
    standalone: false
})
export class LibraryComponent implements OnInit {

  constructor() { }

  ngOnInit() {
  }

}
