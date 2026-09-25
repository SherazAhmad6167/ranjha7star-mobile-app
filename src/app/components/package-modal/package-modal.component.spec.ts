import { ComponentFixture, TestBed } from '@angular/core/testing';

import { PackageModalComponent } from './package-modal.component';

describe('PackageModalComponent', () => {
  let component: PackageModalComponent;
  let fixture: ComponentFixture<PackageModalComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [PackageModalComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(PackageModalComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
