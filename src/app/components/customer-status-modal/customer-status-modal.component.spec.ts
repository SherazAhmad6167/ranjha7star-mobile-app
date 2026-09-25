import { ComponentFixture, TestBed } from '@angular/core/testing';

import { CustomerStatusModalComponent } from './customer-status-modal.component';

describe('CustomerStatusModalComponent', () => {
  let component: CustomerStatusModalComponent;
  let fixture: ComponentFixture<CustomerStatusModalComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [CustomerStatusModalComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(CustomerStatusModalComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
