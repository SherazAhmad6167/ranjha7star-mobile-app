import { CommonModule } from '@angular/common';
import { Component, Input } from '@angular/core';
import {
  addDoc,
  collection,
  doc,
  Firestore,
  getDoc,
  getDocs,
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
  selector: 'app-material-form',
  imports: [CommonModule, FormsModule, ReactiveFormsModule, ToastrModule],
  templateUrl: './material-form.component.html',
  styleUrl: './material-form.component.scss',
})
export class MaterialFormComponent {
  isLoading = false;
  isSaving = false;
  userName: any;
  @Input() editMode = false;
  @Input() userData: any;
  userForm: FormGroup;
  internetAreas: any[] = [];
  internetOperators: any[] = [];
  constructor(
    public activeModal: NgbActiveModal,
    private fb: FormBuilder,
    private toastr: ToastrService,
    private firestore: Firestore,
    private modalService: NgbModal,
  ) {
    this.userForm = this.fb.group({
      issue_no: ['', [Validators.required]],
      name: ['', [Validators.required]],
      // cnic: ['', [Validators.required]],
      phone: ['', [Validators.required]],
      date: ['', [Validators.required]],
      // designation: ['', [Validators.required]],
      purpose: ['', [Validators.required]],
      remarks: [''],
      createdAt: [new Date()],
      modem: [''],
      pigtail: [''],
      choti_dabi: [''],
      bari_dabi: [''],
      swab: [''],
      splitter: [''],
      meter_bag: [''],
      cable_tie: [''],
      fiber_cable: [''],
      sleeve: [''],
      cutter: [''],
      paper_cutter: [''],
      plass: [''],
      passive_node: [''],
      cable_node: [''],
      adaptor: [''],
      nito: [''],
      osaka: [''],
      packingTape: ['']
    });
  }

  ngOnInit() {
    this.loadOperatorName();

    this.userForm.get('name')?.valueChanges.subscribe((selectedName) => {
      const op = this.internetOperators.find((o) => o.operator_name === selectedName);
      if (op?.operator_phone) {
        this.userForm.patchValue({ phone: op.operator_phone });
      }
    });

    if (this.editMode && this.userData) {
      this.userForm.patchValue({
        issue_no: this.userData.issue_no,
        name: this.userData.name,
        // cnic: this.userData.cnic,
        phone: this.userData.phone,
        date: this.userData.date,
        // designation: this.userData.designation,
        purpose: this.userData.purpose,
        createdAt: this.userData.createdAt ?? new Date(),

        modem: this.userData.modem ?? '',
        pigtail: this.userData.pigtail ?? '',
        choti_dabi: this.userData.choti_dabi ?? '',
        bari_dabi: this.userData.bari_dabi ?? '',
        swab: this.userData.swab ?? '',
        splitter: this.userData.splitter ?? '',
        meter_bag: this.userData.meter_bag ?? '',
        cable_tie: this.userData.cable_tie ?? '',
        fiber_cable: this.userData.fiber_cable ?? '',
        sleeve: this.userData.sleeve ?? '',
        cutter: this.userData.cutter ?? '',
        paper_cutter: this.userData.paper_cutter ?? '',
        plass: this.userData.plass ?? '',
        passive_node: this.userData.passive_node ?? '',
        cable_node: this.userData.cable_node ?? '',
        adaptor: this.userData.adaptor ?? '',
        remarks: this.userData.remarks ?? '',
        nito: this.userData.nito ?? '',
        osaka: this.userData.osaka ?? '',
        packingTape: this.userData.packingTape ?? ''
      });
    }
  }

  async loadOperatorName() {
    try {
      const ref = doc(this.firestore, 'operatorName', 'operatorNameDoc');
      const snap = await getDoc(ref);
      if (snap.exists()) {
        this.internetOperators = snap.data()?.['operatorNames'] || [];
        this.internetOperators.sort((a: any, b: any) =>
          a.operator_name.localeCompare(b.operator_name)
        );
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
      const raw = this.userForm.getRawValue();

      const payload = {
        ...raw,
        updatedAt: new Date(),
      };

      if (this.editMode && this.userData?.id) {
        const userDocRef = doc(
          this.firestore,
          'materialDetails',
          this.userData.id,
        );
        updateDoc(userDocRef, payload);
        if (!navigator.onLine) {
          this.toastr.info(
            'Saved offline. Will sync when connection is restored.',
          );
        } else {
          this.toastr.success('Material Details updated successfully');
        }
      } else {
        addDoc(collection(this.firestore, 'materialDetails'), {
          ...payload,
          createdAt: new Date(),
        });
        if (!navigator.onLine) {
          this.toastr.info(
            'Saved offline. Will sync when connection is restored.',
          );
        } else {
          this.toastr.success('Material Details added successfully');
        }
      }

      this.activeModal.close(true);
    } catch (error) {
      console.error(error);
      this.toastr.error('Failed to save Material Details');
    } finally {
      this.isSaving = false;
    }
  }
}
