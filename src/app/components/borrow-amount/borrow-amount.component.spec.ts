import { ComponentFixture, TestBed } from '@angular/core/testing';

import { BorrowAmountComponent } from './borrow-amount.component';

describe('BorrowAmountComponent', () => {
  let component: BorrowAmountComponent;
  let fixture: ComponentFixture<BorrowAmountComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [BorrowAmountComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(BorrowAmountComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
