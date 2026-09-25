import { ComponentFixture, TestBed } from '@angular/core/testing';

import { DefaulterUsersComponent } from './defaulter-users.component';

describe('DefaulterUsersComponent', () => {
  let component: DefaulterUsersComponent;
  let fixture: ComponentFixture<DefaulterUsersComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [DefaulterUsersComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(DefaulterUsersComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
