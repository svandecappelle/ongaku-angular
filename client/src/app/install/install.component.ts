import { Component, OnInit } from '@angular/core';
import { InstallService } from './install.service';

@Component({
  selector: 'app-install',
  templateUrl: './install.component.html',
  styleUrls: ['./install.component.scss']
})
export class InstallComponent implements OnInit {

  constructor(private installService: InstallService) { }

  ngOnInit() {
  }

  install() {
    console.log("Install in progress");
    this.installService.install().subscribe(() => {
      console.log("installed");
    });
  }
}
