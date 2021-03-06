import { Component, OnInit, ViewChild, ElementRef } from '@angular/core';
import { StatisticsService } from 'app/services/statistics.service';
import { AdminService } from 'app/services/admin.service';
import { ReloadService } from '../library/reload.service';

import { FormGroup, FormBuilder } from '@angular/forms';

import * as moment from 'moment';
import { Chart } from 'chart.js';

@Component({
  selector: 'app-admin',
  templateUrl: './admin.component.html',
  styleUrls: ['./admin.component.scss']
})
export class AdminComponent implements OnInit {
  private formSubmitAttempt: boolean;

  form: FormGroup;
  properties: any;
  reloading: boolean = false;

  statistics = {
    userCount: 0,
    albumsCount: 0,
    tracksCount: 0,
    storage: {
      common: 0,
      users: 0,
      total: 0
    }
  };
  details;

  // lineChart
  public lineChartData: Array<any> = [
    {
      data: [{
        t: moment().startOf('day').subtract(1, 'days'),
        y: 10,
      },
      {
        t: moment().startOf('day').subtract(0, 'days'),
        y: 0,
      }],
      label: 'Connection'
    },
    {
      data: [],
      label: 'Plays'
    },
    {
      data: [],
      label: 'Page access'
    }
  ];
  public lineChartOptions: any = {
    responsive: true,
    scales: {
      xAxes: [{
        type: 'time',
        time: {
          unit: 'day'
        }
      }]
    }
  };
  public lineChartColors: Array<any> = [
    { // grey
      backgroundColor: 'rgba(148,159,177,0.2)',
      borderColor: 'rgba(148,159,177,1)',
      pointBackgroundColor: 'rgba(148,159,177,1)',
      pointBorderColor: '#fff',
      pointHoverBackgroundColor: '#fff',
      pointHoverBorderColor: 'rgba(148,159,177,0.8)'
    },
    { // dark grey
      backgroundColor: 'rgba(77,83,96,0.2)',
      borderColor: 'rgba(77,83,96,1)',
      pointBackgroundColor: 'rgba(77,83,96,1)',
      pointBorderColor: '#fff',
      pointHoverBackgroundColor: '#fff',
      pointHoverBorderColor: 'rgba(77,83,96,1)'
    },
    { // grey
      backgroundColor: 'rgba(148,159,177,0.2)',
      borderColor: 'rgba(148,159,177,1)',
      pointBackgroundColor: 'rgba(148,159,177,1)',
      pointBorderColor: '#fff',
      pointHoverBackgroundColor: '#fff',
      pointHoverBorderColor: 'rgba(148,159,177,0.8)'
    }
  ];
  public lineChartLegend: boolean = true;
  public lineChartType: string = 'line';

  @ViewChild('access', { read: ElementRef, static: true }) canvasUserAccess: ElementRef;

  @ViewChild('activity', { read: ElementRef, static: true }) canvasActivity: ElementRef;

  @ViewChild('storage', { read: ElementRef, static: true }) canvasStorage: ElementRef;

  constructor (private service: StatisticsService, private fb: FormBuilder, private configureService: AdminService, private reloadService: ReloadService) { }

  ngOnInit() {
    setTimeout(() => {
      this.userAccess();
      this.userActivity();
      this.getStatistics();
      this.getDetails();
    }, 500);

    this.form = this.fb.group({
      allowRegisteration: [''],
      requireLogin: [''],
      allowUpload: [''],
      allowDownload: ['']
    });

    this.configureService.getProperties().subscribe(data => {
      this.properties = data;
    });
  }

  getDetails() {
    this.service.getDetails().subscribe(datas => {
      this.details = datas;
    });
  }

  getStatistics() {
    this.service.getStatistics().subscribe(datas => {
      this.statistics = datas;
      new Chart(this.canvasStorage.nativeElement, {
        type: 'doughnut',
        data: {
          datasets: [{
            data: [datas.storage.users.value, datas.storage.common.value],
            backgroundColor: [
              "#3cba9f",
              "#A9A9A9"
            ],
            borderColor: [
                "#3cffff",
                "#989898"
            ],
          }],
          labels: [
            'User storages',
            'Common library'
          ]
        },
        options: {
          maintainAspectRatio: false
        }
      });
    });
  }

  userActivity() {
    this.service.getUsersActivity().subscribe(datas => {
      let maxYValue = Number.MIN_VALUE;
      this.lineChartData[0].data = [];
      const allDates = [];
      const plays = [];
      datas.forEach(day => {
        if (maxYValue < day.value) {
          maxYValue = day.value;
        }
        allDates.push(moment(day.date).format('l'));
        plays.push(parseInt(day.value.toString(), 10));
      });

      maxYValue = parseFloat(maxYValue.toString()) + (parseFloat(maxYValue.toString()) / 10);

      new Chart(this.canvasActivity.nativeElement, {
        type: 'bar',
        data: {
          labels: allDates,
          datasets: [
            {
              data: plays,
              backgroundColor: '#3cba9f',
              label: 'Plays count'
            }
          ]
        },
        options: {
          maintainAspectRatio: false,
          legend: {
            display: true
          },
          scales: {
            yAxes: [{
              ticks: {
                suggestedMax: maxYValue
              }
            }]
          }
        }
      });
    });
  }

  userAccess() {
    this.service.getUsersAccess().subscribe(datas => {
      let maxYValue = Number.MIN_VALUE;
      this.lineChartData[0].data = [];
      const allDates = [];
      const connections = [];
      datas.succeed.forEach(day => {
        allDates.push(moment(day.date).format('l'));
        if (maxYValue < day.value) {
          maxYValue = day.value;
        }
        connections.push(parseInt(day.value.toString(), 10));
      });

      const failedConnection = [];
      datas.failed.forEach(day => {
        if (maxYValue < day.value) {
          maxYValue = day.value;
        }
        failedConnection.push(parseInt(day.value.toString(), 10));
      });

      maxYValue = parseFloat(maxYValue.toString()) + (parseFloat(maxYValue.toString()) / 10);
      new Chart(this.canvasUserAccess.nativeElement, {
        type: 'bar',
        data: {
          labels: allDates,
          datasets: [
            {
              data: connections,
              backgroundColor: '#3cba9f',
              label: 'Connections'
            },
            {
              data: failedConnection,
              backgroundColor: '#ffcc00',
              label: 'Failed connection'
            },
          ]
        },
        options: {
          maintainAspectRatio: false,
          legend: {
            display: true
          },
          scales: {
            yAxes: [{
              ticks: {
                suggestedMax: maxYValue
              }
            }]
          }
        }
      });
    });
  }

  onConfigurationSubmit() {
    this.configureService.configure(this.form.value).subscribe((success) => {

    });
  }

  update() {
    this.details = undefined;
    this.configureService.update().subscribe(success => {
      this.getDetails();
    });
  }

  restart() {
    this.details = undefined;
    this.configureService.restart().subscribe(success => {
      this.getDetails();
    });
  }

  reload() {
    this.reloading = true;
    this.reloadService.reload().subscribe(() => {
      this.reloading = false;
    });
  }
}
