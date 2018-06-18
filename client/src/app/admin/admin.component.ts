import { Component, OnInit } from '@angular/core';

@Component({
  selector: 'app-admin',
  templateUrl: './admin.component.html',
  styleUrls: ['./admin.component.scss']
})
export class AdminComponent implements OnInit {

  // lineChart
  public lineChartData: Array<any> = [
    {
      data: [
      { t: new Date('2018-06-07'), y: 25 },
      { t: new Date('2018-06-08'), y: 15 },
      { t: new Date('2018-06-09'), y: 15 },
      { t: new Date('2018-06-10'), y: 16 },
      { t: new Date('2018-06-11'), y: 18 },
      { t: new Date('2018-06-12'), y: 20 },
      { t: new Date('2018-06-13'), y: 23 }], label: 'Connection'
    },
    {
      data: [
      { t: new Date('2018-06-07'), y: 17 },
      { t: new Date('2018-06-08'), y: 25 },
      { t: new Date('2018-06-09'), y: 10 },
      { t: new Date('2018-06-10'), y: 8 },
      { t: new Date('2018-06-11'), y: 12 },
      { t: new Date('2018-06-12'), y: 45 },
      { t: new Date('2018-06-13'), y: 19 }], label: 'Plays'
    },
    {
      data: [
      { t: new Date('2018-06-07'), y: 35 },
      { t: new Date('2018-06-08'), y: 25 },
      { t: new Date('2018-06-09'), y: 15 },
      { t: new Date('2018-06-10'), y: 17 },
      { t: new Date('2018-06-11'), y: 19 },
      { t: new Date('2018-06-12'), y: 26 },
      { t: new Date('2018-06-13'), y: 24 }], label: 'Page access'
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

  constructor() { }

  ngOnInit() {
  }

  public randomize(): void {
    let _lineChartData: Array<any> = new Array(this.lineChartData.length);
    for (let i = 0; i < this.lineChartData.length; i++) {
      _lineChartData[i] = { data: new Array(this.lineChartData[i].data.length), label: this.lineChartData[i].label };
      for (let j = 0; j < this.lineChartData[i].data.length; j++) {
        _lineChartData[i].data[j] = Math.floor((Math.random() * 100) + 1);
      }
    }
    this.lineChartData = _lineChartData;
  }


}
