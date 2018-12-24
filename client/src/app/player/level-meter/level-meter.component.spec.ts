import { async, ComponentFixture, TestBed } from '@angular/core/testing';

import { LevelMeterComponent } from './level-meter.component';

describe('LevelMeterComponent', () => {
  let component: LevelMeterComponent;
  let fixture: ComponentFixture<LevelMeterComponent>;

  beforeEach(async(() => {
    TestBed.configureTestingModule({
      declarations: [ LevelMeterComponent ]
    })
    .compileComponents();
  }));

  beforeEach(() => {
    fixture = TestBed.createComponent(LevelMeterComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
