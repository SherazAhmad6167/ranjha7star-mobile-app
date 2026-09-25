import { ComponentFixture, TestBed } from '@angular/core/testing';

import { AreaLogComponent } from './area-log.component';

describe('AreaLogComponent', () => {
  let component: AreaLogComponent;
  let fixture: ComponentFixture<AreaLogComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [AreaLogComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(AreaLogComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
