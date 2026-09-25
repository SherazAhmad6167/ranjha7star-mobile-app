import { ComponentFixture, TestBed } from '@angular/core/testing';

import { RecoveryOfficerLogComponent } from './recovery-officer-log.component';

describe('RecoveryOfficerLogComponent', () => {
  let component: RecoveryOfficerLogComponent;
  let fixture: ComponentFixture<RecoveryOfficerLogComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [RecoveryOfficerLogComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(RecoveryOfficerLogComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
