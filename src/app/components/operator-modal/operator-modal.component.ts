import { CommonModule } from '@angular/common';
import { Component, Input } from '@angular/core';
import {
  addDoc,
  collection,
  doc,
  Firestore,
  getDoc,
  getDocs,
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
  selector: 'app-operator-modal',
  imports: [
    CommonModule,
    FormsModule,
    ReactiveFormsModule,
    ToastrModule
  ],
  templateUrl: './operator-modal.component.html',
  styleUrl: './operator-modal.component.scss'
})
export class OperatorModalComponent {
    isLoading = false;
    isSaving = false;
    userName: any;
    @Input() editMode = false;
    @Input() userData: any;
    userForm: FormGroup;
    cities: any[] = [];
    constructor(
      public activeModal: NgbActiveModal,
      private fb: FormBuilder,
      private toastr: ToastrService,
      private firestore: Firestore,
      private modalService: NgbModal,
    ) {
      this.userForm = this.fb.group({
        operator_name: ['', [Validators.required]],
        operator_phone: [''],
        createdAt: [new Date()],
      });
    }
  
    ngOnInit() {
      // this.loadCities();
      if (this.editMode && this.userData) {
        this.userForm.patchValue({
          operator_name: this.userData.operator_name,
          operator_phone: this.userData.operator_phone ?? '',
          createdAt: this.userData.createdAt ?? new Date(),
        });
      }
    }
  
    async loadCities() {
    try {
      const querySnapshot = await getDocs(collection(this.firestore, 'city'));
      this.cities = querySnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));
    } catch (error) {
      console.error('Error fetching cities:', error);
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
  
      const newSubArea = payload.operator_name;
      const oldSubArea = this.editMode ? this.userData?.operator_name : null;
  
      if (this.editMode && this.userData?.id) {
        // 🔁 UPDATE
        const userDocRef = doc(this.firestore, 'operators', this.userData.id);
        await updateDoc(userDocRef, payload);
        this.toastr.success('Operator updated successfully');
      } else {
        // ➕ ADD
        await addDoc(collection(this.firestore, 'operators'), {
          ...payload,
          createdAt: new Date(),
        });
        this.toastr.success('Operator added successfully');
      }
  
      await this.saveInternetArea(newSubArea, oldSubArea);
      this.activeModal.close(true);
    } catch (error) {
      console.error(error);
      this.toastr.error('Failed to save operator');
    } finally {
      this.isSaving = false;
    }
  }
  
  async saveInternetArea(newName: string, oldName?: string) {
    const ref = doc(this.firestore, 'operatorName', 'operatorNameDoc');
    const snap = await getDoc(ref);
    let operatorNames: any[] = snap.exists() ? (snap.data()?.['operatorNames'] || []) : [];
    const phone = this.userForm.get('operator_phone')?.value || '';

    if (oldName) {
      const index = operatorNames.findIndex((item) => item.operator_name === oldName);
      if (index > -1) {
        operatorNames[index] = {
          ...operatorNames[index],
          operator_name: newName,
          operator_phone: phone,
          updatedAt: new Date(),
        };
      }
    } else {
      const exists = operatorNames.some((item) => item.operator_name === newName);
      if (!exists) {
        operatorNames.push({
          operator_name: newName,
          operator_phone: phone,
          createdAt: new Date(),
          updatedAt: new Date(),
        });
      }
    }

    if (snap.exists()) {
      await updateDoc(ref, { operatorNames });
    } else {
      await setDoc(ref, { operatorNames });
    }
  }

}
