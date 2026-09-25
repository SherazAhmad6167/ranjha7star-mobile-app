import { ComponentFixture, TestBed } from '@angular/core/testing';

import { BillCreatorLogComponent } from './bill-creator-log.component';

describe('BillCreatorLogComponent', () => {
  let component: BillCreatorLogComponent;
  let fixture: ComponentFixture<BillCreatorLogComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [BillCreatorLogComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(BillCreatorLogComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
