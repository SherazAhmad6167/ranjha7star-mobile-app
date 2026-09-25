import { ComponentFixture, TestBed } from '@angular/core/testing';

import { BillCreatorComponent } from './bill-creator.component';

describe('BillCreatorComponent', () => {
  let component: BillCreatorComponent;
  let fixture: ComponentFixture<BillCreatorComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [BillCreatorComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(BillCreatorComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
