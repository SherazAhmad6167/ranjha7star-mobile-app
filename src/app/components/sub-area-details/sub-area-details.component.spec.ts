import { ComponentFixture, TestBed } from '@angular/core/testing';

import { SubAreaDetailsComponent } from './sub-area-details.component';

describe('SubAreaDetailsComponent', () => {
  let component: SubAreaDetailsComponent;
  let fixture: ComponentFixture<SubAreaDetailsComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [SubAreaDetailsComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(SubAreaDetailsComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
