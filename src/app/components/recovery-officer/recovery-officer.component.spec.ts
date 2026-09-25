import { ComponentFixture, TestBed } from '@angular/core/testing';

import { RecoveryOfficerComponent } from './recovery-officer.component';

describe('RecoveryOfficerComponent', () => {
  let component: RecoveryOfficerComponent;
  let fixture: ComponentFixture<RecoveryOfficerComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [RecoveryOfficerComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(RecoveryOfficerComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
