import { ComponentFixture, TestBed } from '@angular/core/testing';

import { UsersCollectionsComponent } from './users-collections.component';

describe('UsersCollectionsComponent', () => {
  let component: UsersCollectionsComponent;
  let fixture: ComponentFixture<UsersCollectionsComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [UsersCollectionsComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(UsersCollectionsComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
