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
  selector: 'app-complain-modal',
  imports: [CommonModule, ReactiveFormsModule, FormsModule, ToastrModule, SearchSelectComponent],
  templateUrl: './complain-modal.component.html',
  styleUrl: './complain-modal.component.scss',
})
export class ComplainModalComponent {
  userForm!: FormGroup;
  @Input() editMode = false;
  @Input() userData: any;
  isLoading = false;
  isSaving = false;
  internetAreas: any[] = [];
  internetOperators: any[] = [];
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
      phone_number: ['', [Validators.required]],
      operator_name: ['', [Validators.required]],
      operator_phone_number: ['', [Validators.required]],
      status: ['', [Validators.required]],
      complain: ['', [Validators.required]],
      complain_date: ['', [Validators.required]],
      complain_close_date: [''],
      createdAt: [new Date()],
    });
  }

  editForm() {
    if (this.editMode && this.userData) {
      this.userForm.patchValue({
        package_name: this.userData.package_name,
        address: this.userData.address,
        user_name: this.userData.user_name,
        sublocality: this.userData.sublocality,
        internet_id: this.userData.internet_id,
        phone_number: this.userData.phone_number,
        status: this.userData.status,
        complain: this.userData.complain,
        complain_date: this.userData.complain_date,
        complain_close_date: this.userData.complain_close_date,
        operator_phone_number: this.userData.operator_phone_number,
        operator_name: this.userData.operator_name,
      });
    }
  }

  get connectionStatus() {
    return this.userForm.get('connection_status')?.value;
  }

  ngOnInit() {
    this.editForm();
    this.loadInternetAreas();
    this.loadOperatorName();

    this.userForm.get('operator_name')?.valueChanges.subscribe((selectedName) => {
      const op = this.internetOperators.find((o) => o.operator_name === selectedName);
      if (op?.operator_phone) {
        this.userForm.patchValue({ operator_phone_number: op.operator_phone });
      }
    });
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


  
  async loadOperatorName() {
    try {
      const ref = doc(this.firestore, 'operatorName', 'operatorNameDoc');
      const snap = await getDoc(ref);

      if (snap.exists()) {
        this.internetOperators = snap.data()?.['operatorNames'] || [];

        this.internetOperators.sort((a: any, b: any) => {
          return a.operator_name.localeCompare(b.operator_name);
        });
      }
    } catch (error) {
      console.error('Error loading operators', error);
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

      if (this.editMode && this.userData?.id) {
        const userDocRef = doc(
          this.firestore,
          'complainDetails',
          this.userData.id,
        );

        await updateDoc(userDocRef, payload);

        navigator.onLine
          ? this.toastr.success('Complain details updated successfully')
          : this.toastr.info(
              'Saved offline. Will sync when connection is restored.',
            );
      } else {
        await addDoc(collection(this.firestore, 'complainDetails'), {
          ...payload,
          createdAt: new Date(),
        });

        navigator.onLine
          ? this.toastr.success('Complain details saved successfully')
          : this.toastr.info(
              'Saved offline. Will sync when connection is restored.',
            );
      }

      this.activeModal.close(true);
    } catch (error: any) {
      if (
        error.code === 'unavailable' ||
        error.code === 'failed-precondition'
      ) {
        this.toastr.info(
          'Saved offline. Will sync when connection is restored.',
        );
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
