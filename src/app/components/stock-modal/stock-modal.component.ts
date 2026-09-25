import { CommonModule } from '@angular/common';
import { Component, Input } from '@angular/core';
import { addDoc, collection, doc, Firestore, updateDoc } from '@angular/fire/firestore';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { NgbActiveModal, NgbModal } from '@ng-bootstrap/ng-bootstrap';
import { ToastrModule, ToastrService } from 'ngx-toastr';

@Component({
  selector: 'app-stock-modal',
  imports: [CommonModule, ReactiveFormsModule, ToastrModule],
  templateUrl: './stock-modal.component.html',
  styleUrl: './stock-modal.component.scss'
})
export class StockModalComponent {
   expenseForm!: FormGroup;
    @Input() editMode = false;
    @Input() userData: any;
    isLoading = false;
    isSaving = false;
  
     constructor(
      public activeModal: NgbActiveModal,
      private fb: FormBuilder,
      private toastr: ToastrService,
      private firestore: Firestore,
      private modalService: NgbModal,
    ) {
      this.expenseForm = this.fb.group({
        date: ['', Validators.required],
        name: ['', Validators.required],
        quantity: [null, [Validators.required, Validators.min(1)]],
        createdAt: [new Date()],
      });
  
  
    }
  
    ngOnInit() {
      this.editForm();
    }
  
      editForm() {
      if (this.editMode && this.userData) {
        this.expenseForm.patchValue({
          date: this.userData.date,
          name: this.userData.name,
          quantity: this.userData.quantity ?? null,
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
            const userDocRef = doc(this.firestore, 'stock', this.userData.id);
          
            updateDoc(userDocRef, payload);
            if (!navigator.onLine) {
              this.toastr.info(
                'Saved offline. Will sync when connection is restored.',
              );
            } else {
              this.toastr.success('stock amount saved successfully');
            }
          } else {
  
            addDoc(collection(this.firestore, 'stock'), {
              ...payload,
              createdAt: new Date(),
            });
            if (!navigator.onLine) {
              this.toastr.info(
                'Saved offline. Will sync when connection is restored.',
              );
            } else {
              this.toastr.success('stock amount saved successfully');
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
