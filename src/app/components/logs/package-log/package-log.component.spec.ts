import { ComponentFixture, TestBed } from '@angular/core/testing';

import { PackageLogComponent } from './package-log.component';

describe('PackageLogComponent', () => {
  let component: PackageLogComponent;
  let fixture: ComponentFixture<PackageLogComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [PackageLogComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(PackageLogComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
