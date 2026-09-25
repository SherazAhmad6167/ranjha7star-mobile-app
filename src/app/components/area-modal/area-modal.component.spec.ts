import { ComponentFixture, TestBed } from '@angular/core/testing';

import { AreaModalComponent } from './area-modal.component';

describe('AreaModalComponent', () => {
  let component: AreaModalComponent;
  let fixture: ComponentFixture<AreaModalComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [AreaModalComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(AreaModalComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
