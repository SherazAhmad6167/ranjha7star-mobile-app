import { CommonModule } from '@angular/common';
import { Component, Input } from '@angular/core';
import {
  addDoc,
  collection,
  doc,
  Firestore,
  getDoc,
  setDoc,
  updateDoc,
} from '@angular/fire/firestore';
import {
  FormBuilder,
  FormGroup,
  FormsModule,
  ReactiveFormsModule,
  Validators,
} from '@angular/forms';
import { NgbActiveModal, NgbModal } from '@ng-bootstrap/ng-bootstrap';
import { ToastrModule, ToastrService } from 'ngx-toastr';

@Component({
  selector: 'app-city-modal',
  imports: [CommonModule, FormsModule, ReactiveFormsModule, ToastrModule],
  templateUrl: './city-modal.component.html',
  styleUrl: './city-modal.component.scss'
})
export class CityModalComponent {
   isLoading = false;
  isSaving = false;
  userName: any;
  @Input() editMode = false;
  @Input() userData: any;
  userForm: FormGroup;
  constructor(
    public activeModal: NgbActiveModal,
    private fb: FormBuilder,
    private toastr: ToastrService,
    private firestore: Firestore,
    private modalService: NgbModal,
  ) {
    this.userForm = this.fb.group({
      country: ['', [Validators.required]],
      city: ['', [Validators.required]],
      createdAt: [new Date()],
    });
  }

  ngOnInit() {
    if (this.editMode && this.userData) {
      this.userForm.patchValue({
        country: this.userData.country,
        city: this.userData.city,
        createdAt: this.userData.createdAt ?? new Date(),
      });
    }
  }

  async onSubmit() {
    if (this.userForm.invalid) {
      this.toastr.error('Please fill all required fields');
      this.userForm.markAllAsTouched();
      return;
    }

    this.isSaving = true;

    try {
      const payload = {
        ...this.userForm.getRawValue(),
        updatedAt: new Date(),
      };

      if (this.editMode && this.userData?.id) {
        // 🔁 UPDATE EXISTING USER
        const userDocRef = doc(this.firestore, 'city', this.userData.id);
        await updateDoc(userDocRef, payload);
        this.toastr.success('City updated successfully');
      } else {
        // ➕ ADD NEW USER
        await addDoc(collection(this.firestore, 'city'), {
          ...payload,
          createdAt: new Date(),
        });
        this.toastr.success('City added successfully');
      }

      this.activeModal.close(true);
    } catch (error) {
      console.error(error);
      this.toastr.error('Failed to save city');
    } finally {
      this.isSaving = false;
    }
  }


}
