import { ComponentFixture, TestBed } from '@angular/core/testing';

import { RoReportComponent } from './ro-report.component';

describe('RoReportComponent', () => {
  let component: RoReportComponent;
  let fixture: ComponentFixture<RoReportComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [RoReportComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(RoReportComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
