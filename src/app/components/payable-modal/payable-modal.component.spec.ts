import { ComponentFixture, TestBed } from '@angular/core/testing';

import { PayableModalComponent } from './payable-modal.component';

describe('PayableModalComponent', () => {
  let component: PayableModalComponent;
  let fixture: ComponentFixture<PayableModalComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [PayableModalComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(PayableModalComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
