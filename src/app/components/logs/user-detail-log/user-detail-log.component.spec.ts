import { ComponentFixture, TestBed } from '@angular/core/testing';

import { UserDetailLogComponent } from './user-detail-log.component';

describe('UserDetailLogComponent', () => {
  let component: UserDetailLogComponent;
  let fixture: ComponentFixture<UserDetailLogComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [UserDetailLogComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(UserDetailLogComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
