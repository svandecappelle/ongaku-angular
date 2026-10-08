import { ComponentFixture, TestBed, waitForAsync } from '@angular/core/testing';

import { LevelMeterComponent } from './level-meter.component';

describe('LevelMeterComponent', () => {
  let component: LevelMeterComponent;
  let fixture: ComponentFixture<LevelMeterComponent>;

  beforeEach(waitForAsync(() => {
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
