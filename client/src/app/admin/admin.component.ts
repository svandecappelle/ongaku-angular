import { Component, OnInit, ViewChild, ElementRef } from '@angular/core';
import { StatisticsService } from './statistics.service';

import * as moment from 'moment';
import { Chart } from 'chart.js';

@Component({
  selector: 'app-admin',
  templateUrl: './admin.component.html',
  styleUrls: ['./admin.component.scss']
})
export class AdminComponent implements OnInit {

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
  @ViewChild('canvas', { read: ElementRef }) canvas: ElementRef;
  private chart;

  constructor (private service: StatisticsService) { }

  ngOnInit() {
    this.service.getUsersAccess().subscribe(datas => {
      this.lineChartData[0].data = [];
      const allDates = [];
      const connections = [];
      datas.forEach(day => {
        allDates.push(moment(day.date).format('LLL'));
        connections.push(parseInt(day.value.toString(), 10));
      });

      this.chart = new Chart(this.canvas.nativeElement, {
        type: 'line',
        data: {
          labels: allDates,
          datasets: [
            {
              data: connections,
              borderColor: '#3cba9f',
              fill: false,
              label: 'Connections'
            },
            {
              data: connections,
              borderColor: '#ffcc00',
              fill: false
            },
          ]
        },
        options: {
          legend: {
            display: true
          },
          scales: {
            xAxes: [{
              display: true
            }],
            yAxes: [{
              display: true
            }],
          }
        }
      });
    });
  }

}
