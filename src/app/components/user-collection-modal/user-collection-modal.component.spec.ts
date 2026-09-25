import { ComponentFixture, TestBed } from '@angular/core/testing';

import { UserCollectionModalComponent } from './user-collection-modal.component';

describe('UserCollectionModalComponent', () => {
  let component: UserCollectionModalComponent;
  let fixture: ComponentFixture<UserCollectionModalComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [UserCollectionModalComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(UserCollectionModalComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
