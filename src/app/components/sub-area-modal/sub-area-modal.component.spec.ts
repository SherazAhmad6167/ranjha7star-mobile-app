import { ComponentFixture, TestBed } from '@angular/core/testing';

import { SubAreaModalComponent } from './sub-area-modal.component';

describe('SubAreaModalComponent', () => {
  let component: SubAreaModalComponent;
  let fixture: ComponentFixture<SubAreaModalComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [SubAreaModalComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(SubAreaModalComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
