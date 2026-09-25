import { CommonModule } from '@angular/common';
import { Component, Input } from '@angular/core';
import { addDoc, collection, doc, Firestore, getDoc, updateDoc } from '@angular/fire/firestore';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { NgbActiveModal, NgbModal } from '@ng-bootstrap/ng-bootstrap';
import { ToastrService } from 'ngx-toastr';

@Component({
  selector: 'app-expense-modal',
  imports: [ReactiveFormsModule, CommonModule],
  templateUrl: './expense-modal.component.html',
  styleUrl: './expense-modal.component.scss'
})
export class ExpenseModalComponent {
  expenseForm!: FormGroup;
  @Input() editMode = false;
  @Input() userData: any;
  isLoading = false;
  isSaving = false;
  internetOperators: any[] = [];

   constructor(
    public activeModal: NgbActiveModal,
    private fb: FormBuilder,
    private toastr: ToastrService,
    private firestore: Firestore,
    private modalService: NgbModal,
  ) {
    this.expenseForm = this.fb.group({
      date: ['', Validators.required],
      recovery_officer: ['', [Validators.required]],
      petrol: [],
      food: [],
      stationary: [],
      other_reason: [''],
      other_amount: [],
      total_recovery: [, Validators.required],
      salary: [''],
      motorcycle: [''],
      electricity: [''],
      // isActive: [true],
      createdAt: [new Date()],
    });


  }

  ngOnInit() {
    this.editForm();
    this.loadOperatorName();
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

    editForm() {
    if (this.editMode && this.userData) {
      this.expenseForm.patchValue({
        date: this.userData.date,
        recovery_officer: this.userData.recovery_officer,
        petrol: this.userData.petrol,
        food: this.userData.food,
        stationary: this.userData.stationary,
        other_reason: this.userData.other_reason,
        other_amount: this.userData.other_amount,
        total_recovery: this.userData.total_recovery,
        salary: this.userData.salary,
        motorcycle: this.userData.motorcycle,
        electricity: this.userData.electricity,
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
          const userDocRef = doc(this.firestore, 'expenses', this.userData.id);
        
          updateDoc(userDocRef, payload);
          if (!navigator.onLine) {
            this.toastr.info(
              'Saved offline. Will sync when connection is restored.',
            );
          } else {
            this.toastr.success('Expense saved successfully');
          }
        } else {

          addDoc(collection(this.firestore, 'expenses'), {
            ...payload,
            createdAt: new Date(),
          });
          if (!navigator.onLine) {
            this.toastr.info(
              'Saved offline. Will sync when connection is restored.',
            );
          } else {
            this.toastr.success('Expense saved successfully');
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
