import { Component, OnInit, ChangeDetectionStrategy } from '@angular/core';

import { ReloadService } from '../reload.service';

@Component({
    selector: 'app-reload',
    templateUrl: './reload.component.html',
    styleUrls: ['./reload.component.scss'],
    changeDetection: ChangeDetectionStrategy.Eager,
    standalone: false
})
export class ReloadComponent implements OnInit {

  reloading: boolean = false;

  constructor(private service: ReloadService) { }

  ngOnInit() {
  }

  reload() {
    this.reloading = true;
    this.service.reload().subscribe(() => {
      this.reloading = false;
    });
  }
}
