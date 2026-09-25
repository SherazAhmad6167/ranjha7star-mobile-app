import { CommonModule } from '@angular/common';
import { SearchSelectComponent } from '../../shared/search-select/search-select.component';
import { Component } from '@angular/core';
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  Firestore,
  getDoc,
  getDocs,
  query,
  where,
} from '@angular/fire/firestore';
import { FormsModule, ReactiveFormsModule } from '@angular/forms';
import { NgbModal } from '@ng-bootstrap/ng-bootstrap';
import { ToastrModule, ToastrService } from 'ngx-toastr';
import { NewConnectionModalComponent } from '../new-connection-modal/new-connection-modal.component';
import { CustomerStatusModalComponent } from '../customer-status-modal/customer-status-modal.component';

@Component({
  selector: 'app-customer-status',
  imports: [FormsModule, CommonModule, ReactiveFormsModule, ToastrModule, SearchSelectComponent],
  templateUrl: './customer-status.component.html',
  styleUrl: './customer-status.component.scss'
})
export class CustomerStatusComponent {
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
    totalUsers: number = 0;
    totalRecovery: number = 0;
    totalExpenses: number = 0;
    totalProfit: number = 0;
    selectedStatus: 'all' | 'reopen' | 'close' = 'all';
    recievedByList: string[] = [];
    operatorList: string[] = [];
    selectOperator: string = '';
    selectedRecievedBy: string = '';
  
    constructor(
      private modalService: NgbModal,
      private firestore: Firestore,
      private toastr: ToastrService,
    ) {}
  
    ngOnInit(): void {
      this.loadExpenses();
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
  
    async loadExpenses() {
      this.isLoading = true;
  
      try {
        const usersRef = collection(this.firestore, 'customerStatus');
        const snapshot = await getDocs(usersRef);
  
        this.users = snapshot.docs.map((docSnap) => {
          const data: any = docSnap.data();
  
          const remaining_amount =
            Number(data.installation_amount) - Number(data.recieved_amount);
  
          return {
            id: docSnap.id,
            ...data,
            createdAt: data.createdAt?.toDate
              ? data.createdAt.toDate()
              : new Date(data.createdAt),
            remaining_amount,
          };
        });
  
        this.users.sort((a: any, b: any) => {
          return b.createdAt - a.createdAt;
        });
  
        // this.recievedByList = [
        //   ...new Set(
        //     this.users
        //       .map((u: any) => u.recieved_by)
        //       .filter((name: string) => !!name), // remove null/undefined
        //   ),
        // ];
  
        // this.operatorList = [
        //   ...new Set(
        //     this.users
        //       .map((u: any) => u.operator_name)
        //       .filter((name: string) => !!name), // remove null/undefined
        //   ),
        // ];
  
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
          user.user_name?.toLowerCase().includes(term) ||
          user.sublocality?.toLowerCase().includes(term) ||
          user.date?.includes(term);
  
        const matchesSublocality =
          !this.sublocality || user.sublocality === this.sublocality;
  
        const matchesRecievedBy =
          !this.selectedRecievedBy ||
          user.recieved_by === this.selectedRecievedBy;
  
        const matchesOperator =
          !this.selectOperator || user.operator_name === this.selectOperator;
  
        let matchesStatus = true;
  
        if (this.selectedStatus === 'reopen') {
          matchesStatus = user.connection_status === 'reopen';
        } else if (this.selectedStatus === 'close') {
          matchesStatus = user.connection_status === 'close';
        }
  
        return (
          matchesSearch &&
          matchesSublocality &&
          matchesStatus &&
          matchesRecievedBy &&
          matchesOperator
        );
      });
  
      this.currentPage = 1;
      this.updateTotalPages();
      this.calculateTotals(this.filteredUsers);
    }
  
    openExpenseModal(userData?: any) {
      const modalRef = this.modalService.open(CustomerStatusModalComponent, {
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
  
      const userRef = doc(this.firestore, 'customerStatus', this.selectedDeleteId);
  
      try {
        const userSnap = await getDoc(userRef);
  
        if (!userSnap.exists()) {
          this.toastr.error('Customer Status not found');
          return;
        }
  
        const logData = {
          ...userSnap.data(),
          type: 'customerStatus',
          action: 'delete',
          originalId: this.selectedDeleteId,
          deletedAt: new Date(),
        };
  
        await addDoc(collection(this.firestore, 'logs'), logData);
        await addDoc(collection(this.firestore, 'logs'), {
          type: 'customerStatus',
          action: 'delete',
          targetId: this.selectedDeleteId,
          deletedAt: new Date(),
        });
        await deleteDoc(
          doc(this.firestore, 'customerStatus', this.selectedDeleteId),
        );
        this.toastr.success('Customer Status deleted');
        this.loadExpenses();
        modal.close();
      } catch (err) {
        this.toastr.error('Delete failed');
      } finally {
        this.isDeleting = false;
        this.selectedDeleteId = null;
      }
    }
  
    filterByDate() {
      if (!this.selectedDate) {
        this.calculateTotals(this.users);
        this.filteredUsers = this.users;
        return;
      }
  
      this.filteredUsers = this.users.filter((user: any) => {
        return user.installation_date === this.selectedDate;
      });
  
      this.calculateTotals(this.filteredUsers);
    }
  
    calculateTotals(data: any[]) {
      this.totalUsers = data.length;
      this.totalRecovery = data.reduce(
        (sum, item) => sum + (Number(item.installation_amount) || 0),
        0,
      );
  
      this.totalExpenses = data.reduce(
        (sum, item) => sum + (Number(item.recieved_amount) || 0),
        0,
      );
  
      this.totalProfit = this.totalRecovery - this.totalExpenses;
    }
}
