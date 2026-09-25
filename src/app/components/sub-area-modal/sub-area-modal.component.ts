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
  selector: 'app-sub-area-modal',
  imports: [
    CommonModule,
    FormsModule,
    ReactiveFormsModule
  ],
  templateUrl: './sub-area-modal.component.html',
  styleUrl: './sub-area-modal.component.scss'
})
export class SubAreaModalComponent {
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
      // country: ['', [Validators.required]],
      // city: ['', [Validators.required]],
     
      // sublocality: ['', [Validators.required]],
      sub_area: ['', [Validators.required]],
      createdAt: [new Date()],
    });
  }

  ngOnInit() {
    // this.loadCities();
    if (this.editMode && this.userData) {
      this.userForm.patchValue({
        // country: this.userData.country,
        // city: this.userData.city,
        
        // sublocality: this.userData.sublocality,
        sub_area: this.userData.sub_area,
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

    const newSubArea = payload.sub_area;
    const oldSubArea = this.editMode ? this.userData?.sub_area : null;

    if (this.editMode && this.userData?.id) {
      // 🔁 UPDATE
      const userDocRef = doc(this.firestore, 'subArea', this.userData.id);
      await updateDoc(userDocRef, payload);
      this.toastr.success('Area updated successfully');
    } else {
      // ➕ ADD
      await addDoc(collection(this.firestore, 'subArea'), {
        ...payload,
        createdAt: new Date(),
      });
      this.toastr.success('Sub Area added successfully');
    }

    await this.saveInternetArea(newSubArea, oldSubArea);
    this.activeModal.close(true);
  } catch (error) {
    console.error(error);
    this.toastr.error('Failed to save sub area');
  } finally {
    this.isSaving = false;
  }
}

 async saveInternetArea(newSubArea: string, oldSubArea?: string) {
  const internetDocRef = doc(
    this.firestore,
    'internetSubArea',
    'internetSubAreaDoc'
  );

  const snap = await getDoc(internetDocRef);

  let internetSubAreas: any[] = [];

  if (snap.exists()) {
    internetSubAreas = snap.data()?.['internetSubAreas'] || [];
  }

  // 🔁 EDIT CASE
  if (oldSubArea) {
    const index = internetSubAreas.findIndex(
      (item) => item.sub_area === oldSubArea
    );

    if (index > -1) {
      internetSubAreas[index] = {
        ...internetSubAreas[index],
        sub_area: newSubArea,
        updatedAt: new Date(),
      };
    }
  } 
  // ➕ ADD CASE
  else {
    const exists = internetSubAreas.some(
      (item) => item.sub_area === newSubArea
    );

    if (!exists) {
      internetSubAreas.push({
        sub_area: newSubArea,
        createdAt: new Date(),
        updatedAt: new Date(),
      });
    }
  }

  if (snap.exists()) {
    await updateDoc(internetDocRef, { internetSubAreas });
  } else {
    await setDoc(internetDocRef, { internetSubAreas });
  }
}

}
