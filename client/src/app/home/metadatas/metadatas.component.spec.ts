import { async, ComponentFixture, TestBed } from '@angular/core/testing';

import { MetadatasComponent } from './metadatas.component';

describe('MetadatasComponent', () => {
  let component: MetadatasComponent;
  let fixture: ComponentFixture<MetadatasComponent>;

  beforeEach(async(() => {
    TestBed.configureTestingModule({
      declarations: [ MetadatasComponent ]
    })
    .compileComponents();
  }));

  beforeEach(() => {
    fixture = TestBed.createComponent(MetadatasComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should be created', () => {
    expect(component).toBeTruthy();
  });
});
