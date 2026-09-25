import { CommonModule } from '@angular/common';
import { SearchSelectComponent } from '../../shared/search-select/search-select.component';
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
  selector: 'app-customer-status-modal',
  imports: [FormsModule, ReactiveFormsModule, CommonModule, ToastrModule, SearchSelectComponent],
  templateUrl: './customer-status-modal.component.html',
  styleUrl: './customer-status-modal.component.scss',
})
export class CustomerStatusModalComponent {
  userForm!: FormGroup;
  @Input() editMode = false;
  @Input() userData: any;
  isLoading = false;
  isSaving = false;
  internetAreas: any[] = [];
  recievedByList: string[] = [
    'Saqib Ranjha',
    'Qaisar Abbas',
    'Saqib Ranjha-Jazz Cash',
    'Qaisar Abbas- Jazz Cash',
  ];

  constructor(
    public activeModal: NgbActiveModal,
    private fb: FormBuilder,
    private toastr: ToastrService,
    private firestore: Firestore,
    private modalService: NgbModal,
  ) {
    this.userForm = this.fb.group({
      address: ['', [Validators.required]],
      user_name: ['', [Validators.required]],
      sublocality: ['', [Validators.required]],
      internet_id: ['', [Validators.required]],
      package_name: ['', [Validators.required]],
      phone_number: [''],
      connection_status: ['', [Validators.required]],
      close_date: [null],
      closed_by: [null],
      close_operator_name: [''],
      reopened_by: [null],
      reopen_date: [null],
      reopen_operator_name: [''],
      createdAt: [new Date()],
    });
  }

  editForm() {
    if (this.editMode && this.userData) {
      this.userForm.patchValue({
        close_date: this.userData.close_date,
        close_operator_name: this.userData.close_operator_name,
        reopen_operator_name: this.userData.reopen_operator_name,
        address: this.userData.address,
        user_name: this.userData.user_name,
        sublocality: this.userData.sublocality,
        internet_id: this.userData.internet_id,
        phone_number: this.userData.phone_number,
        package_name: this.userData.package_name,
        connection_status: this.userData.connection_status,
        closed_by: this.userData.closed_by,
        reopened_by: this.userData.reopened_by,
        reopen_date: this.userData.reopen_date,
      });
    }
  }

  get connectionStatus() {
  return this.userForm.get('connection_status')?.value;
}

  ngOnInit() {
    this.editForm();
    this.loadInternetAreas();
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

    let payload = {
      ...this.userForm.getRawValue(),
      updatedAt: new Date(),
    };

    Object.entries(payload).forEach(([key, value]) => {
  if (value === undefined) {
    payload[key] = null;
  }
});

    // ✅ CONDITION BASED NULL VALUES
    // if (payload.connection_status === 'close') {
    //   payload.reopen_date = null;
    //   payload.reopened_by = null;
    // }

    // if (payload.connection_status === 'reopen') {
    //   payload.close_date = null;
    //   payload.closed_by = null;
    // }

    // =============================

    if (this.editMode && this.userData?.id) {

      const userDocRef = doc(
        this.firestore,
        'customerStatus',
        this.userData.id
      );

      await updateDoc(userDocRef, payload);

      navigator.onLine
        ? this.toastr.success('Customer status updated successfully')
        : this.toastr.info('Saved offline. Will sync when connection is restored.');

    } else {

      await addDoc(collection(this.firestore, 'customerStatus'), {
        ...payload,
        createdAt: new Date(),
      });

      navigator.onLine
        ? this.toastr.success('Customer status saved successfully')
        : this.toastr.info('Saved offline. Will sync when connection is restored.');
    }

    this.activeModal.close(true);

  } catch (error: any) {

    if (error.code === 'unavailable' || error.code === 'failed-precondition') {
      this.toastr.info('Saved offline. Will sync when connection is restored.');
      this.activeModal.close(true);
    } else {
      console.error(error);
      this.toastr.error('Failed to save user');
    }

  } finally {
    this.isSaving = false;
  }
}
}
