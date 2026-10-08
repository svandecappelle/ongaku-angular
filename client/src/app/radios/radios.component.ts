import { Component, OnInit, ChangeDetectionStrategy } from '@angular/core';

@Component({
    selector: 'app-radios',
    templateUrl: './radios.component.html',
    styleUrls: ['./radios.component.scss'],
    changeDetection: ChangeDetectionStrategy.Eager,
    standalone: false
})
export class RadiosComponent implements OnInit {

  constructor() { }

  ngOnInit() {
  }

}
