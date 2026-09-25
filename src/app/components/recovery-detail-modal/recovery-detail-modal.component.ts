import { CommonModule } from '@angular/common';
import { SearchSelectComponent } from '../../shared/search-select/search-select.component';
import { Component, Input } from '@angular/core';
import {
  addDoc,
  collection,
  doc,
  Firestore,
  getDoc,
  getDocs,
  query,
  updateDoc,
  where,
} from '@angular/fire/firestore';
import {
  FormBuilder,
  FormGroup,
  ReactiveFormsModule,
  Validators,
} from '@angular/forms';
import { NgbActiveModal, NgbModal } from '@ng-bootstrap/ng-bootstrap';
import { ToastrModule, ToastrService } from 'ngx-toastr';
import { SmsService } from '../../shared/sms.service';
import { TemplateMapperService } from '../../shared/template-mapper.service';
import { DEFAULT_RECOVERY_RECEIVED_TEMPLATE } from '../../shared/message-templates';

@Component({
  selector: 'app-recovery-detail-modal',
  imports: [CommonModule, ReactiveFormsModule, ToastrModule, SearchSelectComponent],
  templateUrl: './recovery-detail-modal.component.html',
  styleUrl: './recovery-detail-modal.component.scss',
})
export class RecoveryDetailModalComponent {
  expenseForm!: FormGroup;
  @Input() editMode = false;
  @Input() userData: any;
  isLoading = false;
  isSaving = false;
  internetAreas: any[] = [];
  internetOperators: any[] = [];
  role = '';
  operatorSublocalities: string[] = [];
  loggedInOperatorName = '';
  recoveryOfficers: any[] = [];
  receivedByTemplate = '';
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
    private sms: SmsService,
    private templateMapper: TemplateMapperService,
  ) {
    this.expenseForm = this.fb.group({
      date: ['', Validators.required],
      operator_name: ['', [Validators.required]],
      operator_phone: [''],
      total_recovery: [, Validators.required],
      total_expenses: [''],
      remaining_amount: [''],
      recieved_by: [''],
      sublocality: [''],
      // isActive: [true],
      createdAt: [new Date()],
    });

    // Auto-calculate remaining = recovery - expenses whenever either changes.
    const calcRemaining = () => {
      const recovery = Number(this.expenseForm.get('total_recovery')?.value || 0);
      const expenses = Number(this.expenseForm.get('total_expenses')?.value || 0);
      this.expenseForm.get('remaining_amount')?.setValue(
        recovery - expenses,
        { emitEvent: false },
      );
    };

    this.expenseForm.get('total_recovery')?.valueChanges.subscribe(calcRemaining);
    this.expenseForm.get('total_expenses')?.valueChanges.subscribe(calcRemaining);
  }

  ngOnInit() {
    this.role = localStorage.getItem('role') || '';
    if (this.role === 'operator') {
      this.operatorSublocalities = JSON.parse(
        localStorage.getItem('sublocality') || '[]',
      );
      this.resolveOperatorName();
    }

    this.editForm();
    this.loadInternetAreas();
    this.loadOperatorName();
    this.loadRecoveryOfficers();
    this.loadReceivedByTemplate();

    this.expenseForm.get('operator_name')?.valueChanges.subscribe((selectedName) => {
      const op = this.internetOperators.find((o) => o.operator_name === selectedName);
      if (op?.operator_phone) {
        this.expenseForm.patchValue({ operator_phone: op.operator_phone });
      }
    });
  }

  // An operator may only pick from the areas assigned to him.
  get areaOptions(): any[] {
    if (this.role !== 'operator') return this.internetAreas;
    return this.internetAreas.filter((a) =>
      this.operatorSublocalities.includes(a.sublocality),
    );
  }

  // An operator may only file a recovery under his own operator name.
  get operatorOptions(): any[] {
    if (this.role !== 'operator') return this.internetOperators;

    const own = this.normalizeName(this.loggedInOperatorName);
    if (!own) return [];

    const matches = this.internetOperators.filter(
      (op) => this.normalizeName(op.operator_name) === own,
    );

    // Fall back to his login name when he is not in the operator list yet.
    return matches.length
      ? matches
      : [{ operator_name: this.loggedInOperatorName }];
  }

  private normalizeName(name: string): string {
    return String(name || '').trim().toLowerCase();
  }

  // Login stores `user_name`, while recovery records store the operator's
  // display `name` - resolve it once so the dropdown can be scoped to him.
  private async resolveOperatorName() {
    this.loggedInOperatorName = localStorage.getItem('name') || '';

    if (!this.loggedInOperatorName) {
      const userName = localStorage.getItem('username') || '';
      if (!userName) return;

      try {
        const snap = await getDocs(
          query(
            collection(this.firestore, 'recoveryOfficer'),
            where('user_name', '==', userName),
          ),
        );
        if (!snap.empty) {
          this.loggedInOperatorName = snap.docs[0].data()['name'] || '';
          localStorage.setItem('name', this.loggedInOperatorName);
        }
      } catch (error) {
        console.error('Error resolving recovery officer name', error);
      }
    }

    this.applyOperatorDefaults();
  }

  // With a single choice left there is nothing to pick, so pre-select it.
  private applyOperatorDefaults() {
    if (this.role !== 'operator') return;

    const operatorCtrl = this.expenseForm.get('operator_name');
    const operators = this.operatorOptions;
    if (operators.length === 1 && !operatorCtrl?.value) {
      operatorCtrl?.setValue(operators[0].operator_name);
    }

    const areaCtrl = this.expenseForm.get('sublocality');
    const areas = this.areaOptions;
    if (areas.length === 1 && !areaCtrl?.value) {
      areaCtrl?.setValue(areas[0].sublocality);
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

        this.applyOperatorDefaults();
      }
    } catch (error) {
      console.error('Error loading operators', error);
    }
  }

  // Phone numbers of the people cash is handed to live on the officer records.
  async loadRecoveryOfficers() {
    try {
      const snap = await getDocs(collection(this.firestore, 'recoveryOfficer'));
      this.recoveryOfficers = snap.docs.map((d) => ({ id: d.id, ...(d.data() as any) }));
    } catch (error) {
      console.error('Error loading recovery officers', error);
    }
  }

  async loadReceivedByTemplate() {
    try {
      const snap = await getDoc(
        doc(this.firestore, 'messageTemplates/recoveryReceived'),
      );
      if (snap.exists()) this.receivedByTemplate = snap.data()['message'] || '';
    } catch (error) {
      console.error('Error loading received-by template', error);
    }
  }

  // "Saqib Ranjha-Jazz Cash" and "Saqib Ranjha" are the same person - the
  // suffix only records how the money was handed over.
  private receivedByPhone(receivedBy: string): string {
    const base = String(receivedBy || '').split('-')[0].trim().toLowerCase();
    if (!base) return '';

    const officer =
      this.recoveryOfficers.find(
        (o) => this.normalizeName(o.name) === base,
      ) ||
      this.recoveryOfficers.find((o) =>
        this.normalizeName(o.name).startsWith(base),
      );

    return officer?.phone || '';
  }

  // Queued on a new entry only - editing an existing one would re-text the
  // receiver for every correction.
  private notifyReceivedBy(record: any) {
    const receivedBy = record?.recieved_by;
    if (!receivedBy) return;

    const phone = this.sms.format(this.receivedByPhone(receivedBy));
    if (!phone) {
      this.toastr.warning(`No valid phone number for ${receivedBy} - SMS not sent`);
      return;
    }

    const message = this.templateMapper.map(
      this.receivedByTemplate || DEFAULT_RECOVERY_RECEIVED_TEMPLATE,
      record,
    );
    this.sms.queue(phone, message);
    this.toastr.success(`Recovery SMS queued for ${receivedBy}`);
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

        this.applyOperatorDefaults();
      }
    } catch (error) {
      console.error('Error loading internet areas', error);
    }
  }

  editForm() {
    if (this.editMode && this.userData) {
      this.expenseForm.patchValue({
        date: this.userData.date,
        operator_name: this.userData.operator_name,
        operator_phone: this.userData.operator_phone || '',
        sublocality: this.userData.sublocality,
        total_recovery: this.userData.total_recovery,
        total_expenses: this.userData.total_expenses,
        remaining_amount: this.userData.remaining_amount,
        recieved_by: this.userData.recieved_by,
        createdAt: this.userData.createdAt ?? new Date(),
      });
    }
  }

  async onSubmit() {
    if (this.expenseForm.invalid) {
      this.toastr.error('Please fill all required fields');
      this.expenseForm.markAllAsTouched();
      return;
    }

    this.isSaving = true;

    try {
      const payload = {
        ...this.expenseForm.getRawValue(), // 🔥 important for disabled fields
        updatedAt: new Date(),
      };

      if (this.editMode && this.userData?.id) {
        // 🔁 UPDATE EXISTING USER
        const userDocRef = doc(
          this.firestore,
          'recoveryDetails',
          this.userData.id,
        );

        updateDoc(userDocRef, payload);
        if (!navigator.onLine) {
          this.toastr.info(
            'Saved offline. Will sync when connection is restored.',
          );
        } else {
          this.toastr.success('Recovery detail saved successfully');
        }
      } else {
        addDoc(collection(this.firestore, 'recoveryDetails'), {
          ...payload,
          createdAt: new Date(),
        });
        this.notifyReceivedBy(payload);
        if (!navigator.onLine) {
          this.toastr.info(
            'Saved offline. Will sync when connection is restored.',
          );
        } else {
          this.toastr.success('Recovery detail saved successfully');
        }
      }

      this.activeModal.close(true);
    } catch (error) {
      console.error(error);
      if (
        (error as any).code === 'unavailable' ||
        (error as any).code === 'failed-precondition'
      ) {
        this.toastr.info(
          'Saved offline. Will sync when connection is restored.',
        );
        this.activeModal.close(true); // still close the modal
      } else {
        console.error(error);
        this.toastr.error('Failed to save user');
      }
    } finally {
      this.isSaving = false;
    }
  }
}
