import { ComponentFixture, TestBed } from '@angular/core/testing';

import { CustomerStatusComponent } from './customer-status.component';

describe('CustomerStatusComponent', () => {
  let component: CustomerStatusComponent;
  let fixture: ComponentFixture<CustomerStatusComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [CustomerStatusComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(CustomerStatusComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
