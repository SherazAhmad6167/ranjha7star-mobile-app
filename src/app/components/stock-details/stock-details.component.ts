import { CommonModule } from '@angular/common';
import { Component } from '@angular/core';
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  Firestore,
  getDoc,
  getDocs,
  orderBy,
  query,
} from '@angular/fire/firestore';
import { FormsModule, ReactiveFormsModule } from '@angular/forms';
import { NgbModal } from '@ng-bootstrap/ng-bootstrap';
import { ToastrModule, ToastrService } from 'ngx-toastr';
import { PayableModalComponent } from '../payable-modal/payable-modal.component';
import { StockModalComponent } from '../stock-modal/stock-modal.component';

@Component({
  selector: 'app-stock-details',
  imports: [CommonModule, FormsModule, ReactiveFormsModule, ToastrModule],
  templateUrl: './stock-details.component.html',
  styleUrl: './stock-details.component.scss'
})
export class StockDetailsComponent {
   isLoading = false;
    isDeleting = false;
    searchTerm = '';
    users: any[] = [];
    filteredUsers: any[] = [];
    selectedDeleteId: string | null = null;
    currentPage = 1;
    pageSize = 10;
    totalPages = 1;
    sublocality: string = '';
    internetAreas: any[] = [];
    showReceiptModal = false;
    companyDetail: any = {};
    selectedDate: string = '';
    totalQuantity: number = 0;
  
    constructor(
      private modalService: NgbModal,
      private firestore: Firestore,
      private toastr: ToastrService,
    ) {}
  
    ngOnInit(): void {
      this.loadExpenses();
    }
  
    async loadExpenses() {
      this.isLoading = true;
  
      try {
        const usersRef = collection(this.firestore, 'stock');
        const q = query(usersRef, orderBy('createdAt', 'desc'));
  
        const snapshot = await getDocs(q);
  
        this.users = snapshot.docs.map((docSnap) => {
          const data: any = docSnap.data();
  
          return {
            id: docSnap.id,
            ...data,
          };
        });
  
        this.filteredUsers = this.users;
        this.updateTotalPages();
        this.calculateTotals(this.users);
  
        console.log('Fetched users:', this.users);
      } catch (error) {
        console.error('Error fetching users:', error);
        this.toastr.error('Failed to load users');
      } finally {
        this.isLoading = false;
      }
    }
  
    get pagedUsers() {
      const start = (this.currentPage - 1) * this.pageSize;
      const end = start + this.pageSize;
      return this.filteredUsers.slice(start, end);
    }
  
    updateTotalPages() {
      this.totalPages = Math.ceil(this.filteredUsers.length / this.pageSize) || 1;
      if (this.currentPage > this.totalPages) this.currentPage = this.totalPages;
    }
  
    prevPage() {
      if (this.currentPage > 1) this.currentPage--;
    }
  
    nextPage() {
      if (this.currentPage < this.totalPages) this.currentPage++;
    }
  
    goToPage(page: number) {
      this.currentPage = page;
    }
  
    get visiblePages(): number[] {
      const pages: number[] = [];
  
      const startPage = Math.floor((this.currentPage - 1) / 5) * 5 + 1;
  
      const endPage = Math.min(startPage + 4, this.totalPages);
  
      for (let i = startPage; i <= endPage; i++) {
        pages.push(i);
      }
  
      return pages;
    }
  
    onPageSizeChange() {
      this.currentPage = 1;
      this.updateTotalPages();
    }
  
    onFilterChange() {
      const term = this.searchTerm.toLowerCase();
  
      this.filteredUsers = this.users.filter((user) => {
        const matchesSearch =
          user.name?.toLowerCase().includes(term) ||
          user.date?.includes(term);

        return matchesSearch;
      });

      this.currentPage = 1;
      this.updateTotalPages();
      this.calculateTotals(this.filteredUsers);
    }
  
    openExpenseModal(userData?: any) {
      const modalRef = this.modalService.open(StockModalComponent, {
        size: 'xl',
        backdrop: 'static',
      });
  
      if (userData) {
        modalRef.componentInstance.editMode = true;
        modalRef.componentInstance.userData = userData;
      }
  
      modalRef.closed.subscribe((result) => {
        if (result) {
          this.loadExpenses();
        }
      });
    }
  
    editUser(user: any) {
      this.openExpenseModal(user);
    }
  
    openDeleteModal(id: string, modal: any) {
      this.selectedDeleteId = id;
      this.modalService.open(modal, { centered: true });
    }
  
    async confirmDelete(modal: any) {
      if (!this.selectedDeleteId) return;
  
      this.isDeleting = true;
  
      const userRef = doc(this.firestore, 'stock', this.selectedDeleteId);
  
      try {
        const userSnap = await getDoc(userRef);
  
        if (!userSnap.exists()) {
          this.toastr.error('stock not found');
          return;
        }
  
        const logData = {
          ...userSnap.data(),
          type: 'stock',
          action: 'delete',
          originalId: this.selectedDeleteId,
          deletedAt: new Date(),
        };
  
        await addDoc(collection(this.firestore, 'logs'), logData);
        await addDoc(collection(this.firestore, 'logs'), {
          type: 'users',
          action: 'delete',
          targetId: this.selectedDeleteId,
          deletedAt: new Date(),
        });
        await deleteDoc(doc(this.firestore, 'stock', this.selectedDeleteId));
        this.toastr.success('stock deleted');
        this.loadExpenses();
        modal.close();
      } catch (err) {
        this.toastr.error('Delete failed');
      } finally {
        this.isDeleting = false;
        this.selectedDeleteId = null;
      }
    }
  
    fromDate: string = '';
    toDate: string = '';
  
    filterByDate() {
      if (!this.selectedDate) {
        // agar date select nahi hai to sab ka total dikhao
        this.calculateTotals(this.users);
        this.filteredUsers = this.users;
        return;
      }
  
      // ✅ Filter by selected date
      this.filteredUsers = this.users.filter((user: any) => {
        return user.date === this.selectedDate;
      });
  
      // ✅ Calculate totals for filtered data
      this.calculateTotals(this.filteredUsers);
    }
  
    filterByDateRange() {
      if (!this.fromDate && !this.toDate) {
        this.filteredUsers = this.users;
        this.calculateTotals(this.users);
        return;
      }
  
      this.filteredUsers = this.users.filter((user: any) => {
        const userDate = new Date(user.borrow_date);
  
        const from = this.fromDate ? new Date(this.fromDate) : null;
        const to = this.toDate ? new Date(this.toDate) : null;
  
        if (from && to) {
          return userDate >= from && userDate <= to;
        }
  
        if (from) {
          return userDate >= from;
        }
  
        if (to) {
          return userDate <= to;
        }
  
        return true;
      });
  
      this.calculateTotals(this.filteredUsers);
    }
  
    calculateTotals(data: any[]) {
      this.totalQuantity = data.reduce(
        (sum, item) => sum + (Number(item.quantity) || 0),
        0,
      );
    }

}
