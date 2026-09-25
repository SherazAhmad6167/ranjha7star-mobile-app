import { ComponentFixture, TestBed } from '@angular/core/testing';

import { RecoveryDetailModalComponent } from './recovery-detail-modal.component';

describe('RecoveryDetailModalComponent', () => {
  let component: RecoveryDetailModalComponent;
  let fixture: ComponentFixture<RecoveryDetailModalComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [RecoveryDetailModalComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(RecoveryDetailModalComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
