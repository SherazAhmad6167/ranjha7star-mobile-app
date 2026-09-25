import { ComponentFixture, TestBed } from '@angular/core/testing';

import { RecoveryOfficerModalComponent } from './recovery-officer-modal.component';

describe('RecoveryOfficerModalComponent', () => {
  let component: RecoveryOfficerModalComponent;
  let fixture: ComponentFixture<RecoveryOfficerModalComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [RecoveryOfficerModalComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(RecoveryOfficerModalComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
