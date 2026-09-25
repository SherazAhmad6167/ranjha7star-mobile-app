import { ComponentFixture, TestBed } from '@angular/core/testing';

import { BorrowAmountModalComponent } from './borrow-amount-modal.component';

describe('BorrowAmountModalComponent', () => {
  let component: BorrowAmountModalComponent;
  let fixture: ComponentFixture<BorrowAmountModalComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [BorrowAmountModalComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(BorrowAmountModalComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
