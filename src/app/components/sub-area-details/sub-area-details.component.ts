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
  updateDoc,
} from '@angular/fire/firestore';
import { FormsModule, ReactiveFormsModule } from '@angular/forms';
import { NgbModal } from '@ng-bootstrap/ng-bootstrap';
import { ToastrModule, ToastrService } from 'ngx-toastr';
import { AreaModalComponent } from '../area-modal/area-modal.component';
import { SubAreaModalComponent } from '../sub-area-modal/sub-area-modal.component';

@Component({
  selector: 'app-sub-area-details',
  imports: [CommonModule, FormsModule, ReactiveFormsModule, ToastrModule],
  templateUrl: './sub-area-details.component.html',
  styleUrl: './sub-area-details.component.scss'
})
export class SubAreaDetailsComponent {
   isLoading = false;
    isDeleting = false;
    searchTerm = '';
    users: any[] = [];
    filteredUsers: any[] = [];
    selectedDeleteId: string | null = null;
    currentPage = 1;
    pageSize = 10;
    totalPages = 1;
  
    constructor(
      private modalService: NgbModal,
      private firestore: Firestore,
      private toastr: ToastrService,
    ) {}
  
    ngOnInit(): void {
      this.loadUsers();
    }
  
    get pagedUsers() {
      const start = (this.currentPage - 1) * this.pageSize;
      const end = start + this.pageSize;
      return this.filteredUsers.slice(start, end);
    }
  
    async loadUsers() {
      this.isLoading = true;
  
      try {
        const usersRef = collection(this.firestore, 'subArea');
        const snapshot = await getDocs(usersRef);
  
        this.users = snapshot.docs.map((docSnap) => ({
          id: docSnap.id,
          ...docSnap.data(),
        }));
  
        this.users.sort((a, b) => {
          // Firestore Timestamp
          const timeA = a.createdAt?.toDate
            ? a.createdAt.toDate().getTime()
            : new Date(a.createdAt).getTime();
          const timeB = b.createdAt?.toDate
            ? b.createdAt.toDate().getTime()
            : new Date(b.createdAt).getTime();
          return timeB - timeA; // descending
        });
  
        this.filteredUsers = this.users;
        this.updateTotalPages();
  
        console.log('Fetched area:', this.users);
      } catch (error) {
        console.error('Error fetching area:', error);
        this.toastr.error('Failed to load area');
      } finally {
        this.isLoading = false;
      }
    }
  
    onSearch() {
      const term = this.searchTerm.toLowerCase();
  
      this.filteredUsers = this.users.filter(
        (user) =>
          user.city?.toLowerCase().includes(term) ||
          user.sub_area?.toLowerCase().includes(term) ||
          user.sublocality?.toLowerCase().includes(term),
      );
  
      this.currentPage = 1; // reset to first page after search
      this.updateTotalPages();
    }
  
    openUserModal(userData?: any) {
      const modalRef = this.modalService.open(SubAreaModalComponent, {
        size: 'lg',
        backdrop: 'static',
      });
  
      if (userData) {
        modalRef.componentInstance.editMode = true;
        modalRef.componentInstance.userData = userData;
      }
  
      modalRef.closed.subscribe((result) => {
        if (result) {
          this.loadUsers();
        }
      });
    }
  
    editUser(user: any) {
      this.openUserModal(user);
    }
  
    openDeleteModal(id: string, modal: any) {
      this.selectedDeleteId = id;
      this.modalService.open(modal, { centered: true });
    }
  
   async confirmDelete(modal: any) {
  if (!this.selectedDeleteId) return;

  this.isDeleting = true;

  try {
    const subAreaDocRef = doc(this.firestore, 'subArea', this.selectedDeleteId);
    const snap = await getDoc(subAreaDocRef);

    if (!snap.exists()) {
      this.toastr.error('Sub Area not found');
      return;
    }

    const oldSubArea = snap.data()?.['sub_area'];

    // Save delete log
    const logData = {
      ...snap.data(),
      type: 'subArea',
      action: 'delete',
      originalId: this.selectedDeleteId,
      deletedAt: new Date(),
    };
    await addDoc(collection(this.firestore, 'logs'), logData);

    // Delete from subArea collection
    await deleteDoc(subAreaDocRef);

    // Delete from internetSubArea collection
    if (oldSubArea) {
      await this.deleteInternetSubArea(oldSubArea);
    }

    this.toastr.success('Sub Area deleted successfully');
    this.loadUsers(); // refresh list
    modal.close();
  } catch (err) {
    console.error(err);
    this.toastr.error('Delete failed');
  } finally {
    this.isDeleting = false;
    this.selectedDeleteId = null;
  }
}

async deleteInternetSubArea(subArea: string) {
  const internetDocRef = doc(
    this.firestore,
    'internetSubArea',
    'internetSubAreaDoc'
  );
  const snap = await getDoc(internetDocRef);

  if (!snap.exists()) return;

  const internetSubAreas = snap.data()?.['internetSubAreas'] || [];

  const updatedSubAreas = internetSubAreas.filter(
    (item: any) => item.sub_area !== subArea
  );

  await updateDoc(internetDocRef, { internetSubAreas: updatedSubAreas });
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

}
