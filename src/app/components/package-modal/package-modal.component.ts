import { CommonModule } from '@angular/common';
import { Component, Input } from '@angular/core';
import {
  addDoc,
  collection,
  doc,
  Firestore,
  getDoc,
  getDocs,
  query,
  setDoc,
  updateDoc,
  where,
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
  selector: 'app-package-modal',
  imports: [CommonModule, FormsModule, ReactiveFormsModule, ToastrModule],
  templateUrl: './package-modal.component.html',
  styleUrl: './package-modal.component.scss',
})
export class PackageModalComponent {
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
      sales_price: ['', [Validators.required]],
      purchase_price: ['', [Validators.required]],
      company_name: ['', [Validators.required]],
      package_name: ['', [Validators.required]],
      package_type: ['', [Validators.required]],
      createdAt: [new Date()],
    });
  }

  ngOnInit() {
    if (this.editMode && this.userData) {
      this.userForm.patchValue({
        sales_price: this.userData.sales_price,
        purchase_price: this.userData.purchase_price,
        company_name: this.userData.company_name,
        package_name: this.userData.package_name,
        package_type: this.userData.package_type,
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
      const raw = this.userForm.getRawValue();

      const payload = {
        ...raw,
        package_name: raw.package_name.trim().toLowerCase(),
        company_name: raw.company_name.trim().toLowerCase(),
        package_type: raw.package_type.trim().toLowerCase(),
        updatedAt: new Date(),
      };

      const newSublocality = payload.package_name.toLowerCase();
      const newSalesPrice = payload.sales_price;
      const oldSublocality = this.editMode
        ? this.userData?.package_name.toLowerCase()
        : null;
      const oldSalesPrice = this.editMode ? this.userData?.sales_price : null;
      const oldCompanyName = this.editMode
        ? this.userData?.company_name.toLowerCase()
        : null;

      const exists = await this.isPackageNameExists(
        newSublocality,
        this.editMode ? this.userData?.id : undefined,
      );

      if (exists) {
        this.toastr.error('Package already exists');
        this.isSaving = false;
        return;
      }

      if (this.editMode && this.userData?.id) {
        // 🔁 UPDATE EXISTING USER
        const userDocRef = doc(this.firestore, 'packages', this.userData.id);
        await updateDoc(userDocRef, payload);
        this.toastr.success('Package updated successfully');
      } else {
        // ➕ ADD NEW USER
        await addDoc(collection(this.firestore, 'packages'), {
          ...payload,
          createdAt: new Date(),
        });
        this.toastr.success('Package added successfully');
      }

      if( payload.company_name){
        await this.saveCompanyName( payload.company_name, oldCompanyName);
      }

      if (payload.package_type === 'internet') {
        await this.saveInternetArea(
          newSublocality,
          oldSublocality,
          newSalesPrice,
          oldSalesPrice,
        );
      }

      if (payload.package_type === 'tv_cable') {
        await this.saveCableArea(
          newSublocality,
          oldSublocality,
          newSalesPrice,
          oldSalesPrice,
        );
      }

      this.activeModal.close(true);
    } catch (error) {
      console.error(error);
      this.toastr.error('Failed to save Package');
    } finally {
      this.isSaving = false;
    }
  }

  async saveCompanyName(companyName: string, oldCompanyName?: string) {
    const companyDocRef = doc(
      this.firestore,
      'company',
      'companyDoc',
    );
    const snap = await getDoc(companyDocRef);

    let companies: any[] = [];

    if (snap.exists()) {
      companies = snap.data()?.['companies'] || [];
    }

    // 🔁 EDIT CASE → old company name exists
    if (oldCompanyName) {
      const index = companies.findIndex(
        (item) => item.company_name === oldCompanyName,
      );

      if (index > -1) {
        companies[index] = {
          ...companies[index],
          company_name: companyName,
          updatedAt: new Date(),
        };
      }
    } else {
      // ➕ ADD CASE
      const exists = companies.some(
        (item) => item.company_name === companyName,
      );

      if (!exists) {
        companies.push({
          company_name: companyName,
          createdAt: new Date(),
          updatedAt: new Date(),
        });
      }
    }

    if (snap.exists()) {
      await updateDoc(companyDocRef, { companies });
    } else {
      await setDoc(companyDocRef, { companies });
    }
  }

  async saveInternetArea(
    newPackage: string,
    oldPackage?: string,
    newSalesPrice?: string,
    oldSalesPrice?: string,
  ) {
    const internetDocRef = doc(
      this.firestore,
      'internetPackage',
      'internetPackageDoc',
    );
    const snap = await getDoc(internetDocRef);

    let internetPackage: any[] = [];

    if (snap.exists()) {
      internetPackage = snap.data()?.['internetPackage'] || [];
    }

    // 🔁 EDIT CASE → old sublocality exists
    if (oldPackage) {
      const index = internetPackage.findIndex(
        (item) => item.package_name === oldPackage,
      );

      if (index > -1) {
        internetPackage[index] = {
          ...internetPackage[index],
          package_name: newPackage,
          sales_price: newSalesPrice,
          updatedAt: new Date(),
        };
      }
    } else {
      // ➕ ADD CASE
      const exists = internetPackage.some(
        (item) => item.package_name === newPackage,
      );

      if (!exists) {
        internetPackage.push({
          package_name: newPackage,
          sales_price: newSalesPrice,
          createdAt: new Date(),
          updatedAt: new Date(),
        });
      }
    }

    if (snap.exists()) {
      await updateDoc(internetDocRef, { internetPackage });
    } else {
      await setDoc(internetDocRef, { internetPackage });
    }
  }

  async saveCableArea(
    newPackage: string,
    oldPackage?: string,
    newSalesPrice?: string,
    oldSalesPrice?: string,
  ) {
    const internetDocRef = doc(
      this.firestore,
      'cablePackage',
      'cablePackageDoc',
    );
    const snap = await getDoc(internetDocRef);

    let cablePackage: any[] = [];

    if (snap.exists()) {
      cablePackage = snap.data()?.['cablePackage'] || [];
    }

    // 🔁 EDIT CASE → old sublocality exists
    if (oldPackage) {
      const index = cablePackage.findIndex(
        (item) => item.package_name === oldPackage,
      );

      if (index > -1) {
        cablePackage[index] = {
          ...cablePackage[index],
          package_name: newPackage,
          sales_price: newSalesPrice,
          updatedAt: new Date(),
        };
      }
    } else {
      // ➕ ADD CASE
      const exists = cablePackage.some(
        (item) => item.package_name === newPackage,
      );

      if (!exists) {
        cablePackage.push({
          package_name: newPackage,
          sales_price: newSalesPrice,
          createdAt: new Date(),
          updatedAt: new Date(),
        });
      }
    }

    if (snap.exists()) {
      await updateDoc(internetDocRef, { cablePackage });
    } else {
      await setDoc(internetDocRef, { cablePackage });
    }
  }

  async isPackageNameExists(
    packageName: string,
    excludeId?: string,
  ): Promise<boolean> {
    const q = query(
      collection(this.firestore, 'packages'),
      where('package_name', '==', packageName),
    );

    const snapshot = await getDocs(q);

    if (snapshot.empty) return false;

    // In edit mode → allow same document
    if (excludeId) {
      return snapshot.docs.some((doc) => doc.id !== excludeId);
    }

    return true;
  }
}
