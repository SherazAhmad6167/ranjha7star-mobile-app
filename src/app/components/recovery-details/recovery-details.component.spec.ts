import { ComponentFixture, TestBed } from '@angular/core/testing';

import { RecoveryDetailsComponent } from './recovery-details.component';

describe('RecoveryDetailsComponent', () => {
  let component: RecoveryDetailsComponent;
  let fixture: ComponentFixture<RecoveryDetailsComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [RecoveryDetailsComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(RecoveryDetailsComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
