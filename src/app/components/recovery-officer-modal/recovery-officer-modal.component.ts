import { CommonModule } from '@angular/common';
import { Component, Input } from '@angular/core';
import {
  addDoc,
  collection,
  doc,
  Firestore,
  getDoc,
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
  selector: 'app-recovery-officer-modal',
  imports: [CommonModule, FormsModule, ReactiveFormsModule, ToastrModule],
  templateUrl: './recovery-officer-modal.component.html',
  styleUrl: './recovery-officer-modal.component.scss',
})
export class RecoveryOfficerModalComponent {
  isLoading = false;
  isSaving = false;
  userName: any;
  @Input() editMode = false;
  @Input() userData: any;
  userForm: FormGroup;
  internetAreas: any[] = [];
  constructor(
    public activeModal: NgbActiveModal,
    private fb: FormBuilder,
    private toastr: ToastrService,
    private firestore: Firestore,
    private modalService: NgbModal,
  ) {
    this.userForm = this.fb.group({
      name: ['', [Validators.required]],
      cnic: ['', [Validators.required]],
      address: ['', [Validators.required]],
      phone: ['', [Validators.required]],
      join_date: ['', [Validators.required]],
      status: ['', [Validators.required]],
      salary: ['', [Validators.required]],
      advance_salary: [''],
      pending_salary: [''],
      password: ['', [Validators.required]],
      user_name: ['', [Validators.required]],
      role: ['', [Validators.required]],
      sublocality: [[], [Validators.required]],
      createdAt: [new Date()],
    });
  }

  ngOnInit() {
    this.loadInternetAreas();
    if (this.editMode && this.userData) {
      this.userForm.patchValue({
        name: this.userData.name,
        cnic: this.userData.cnic,
        address: this.userData.address,
        phone: this.userData.phone,
        join_date: this.userData.join_date,
        status: this.userData.status,
        salary: this.userData.salary,
        advance_salary: this.userData.advance_salary,
        pending_salary: this.userData.pending_salary,
        user_name: this.userData.user_name,
        password: this.userData.password,
        role: this.userData.role,
        sublocality: this.userData.sublocality || [],
        createdAt: this.userData.createdAt ?? new Date(),
      });
    }
  }

   async loadInternetAreas() {
  try {
    const ref = doc(this.firestore, 'internetArea', 'internetAreaDoc');
    const snap = await getDoc(ref);

    if (snap.exists()) {
      this.internetAreas = snap.data()?.['internetAreas'] || [];

      this.internetAreas.sort((a: any, b: any) => {
        return a.sublocality.localeCompare(b.sublocality);
      });
    }
  } catch (error) {
    console.error('Error loading internet areas', error);
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
      const raw = this.userForm.getRawValue();

      const payload = {
        ...raw,
        user_name: raw.user_name.trim().toLowerCase(),
        updatedAt: new Date(),
      };

      if (this.editMode && this.userData?.id) {
        const userDocRef = doc(
          this.firestore,
          'recoveryOfficer',
          this.userData.id,
        );
         updateDoc(userDocRef, payload);
          if (!navigator.onLine) {
          this.toastr.info(
            'Saved offline. Will sync when connection is restored.',
          );
        } else {
          this.toastr.success('Recovery Officer updated successfully');
        }
      } else {
         addDoc(collection(this.firestore, 'recoveryOfficer'), {
          ...payload,
          createdAt: new Date(),
        });
         if (!navigator.onLine) {
          this.toastr.info(
            'Saved offline. Will sync when connection is restored.',
          );
        } else {
          this.toastr.success('Recovery Officer added successfully');
        }
      }

      this.activeModal.close(true);
    } catch (error) {
      console.error(error);
      this.toastr.error('Failed to save Recovery Officer');
    } finally {
      this.isSaving = false;
    }
  }

  addSublocality(event: Event) {
    const select = event.target as HTMLSelectElement;
    const value = select.value;
    if (!value) return;

    const control = this.userForm.get('sublocality');
    if (!control) return;

    let current: string[] = control.value || [];

    if (value === 'all') {
      // Add all sublocalities from internetAreas
      current = this.internetAreas.map((a) => a.sublocality);
    } else {
      // Add single sublocality if not already added
      if (!current.includes(value)) {
        current.push(value);
      }
    }

    control.setValue(current);
    control.markAsTouched();

    // Reset select to default
    select.value = '';
  }

  removeSublocality(value: string) {
    const current = this.userForm.get('sublocality')?.value || [];
    this.userForm
      .get('sublocality')
      ?.setValue(current.filter((s: string) => s !== value));
  }
}
