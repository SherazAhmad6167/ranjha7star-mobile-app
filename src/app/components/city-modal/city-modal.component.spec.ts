import { ComponentFixture, TestBed } from '@angular/core/testing';

import { CityModalComponent } from './city-modal.component';

describe('CityModalComponent', () => {
  let component: CityModalComponent;
  let fixture: ComponentFixture<CityModalComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [CityModalComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(CityModalComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
