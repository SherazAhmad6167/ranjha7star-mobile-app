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
import { OperatorModalComponent } from '../operator-modal/operator-modal.component';

@Component({
  selector: 'app-operator-details',
  imports: [CommonModule, FormsModule, ToastrModule],
  templateUrl: './operator-details.component.html',
  styleUrl: './operator-details.component.scss',
})
export class OperatorDetailsComponent {
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
      const usersRef = collection(this.firestore, 'operators');
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
        user.country?.toLowerCase().includes(term) ||
        user.operator_name?.toLowerCase().includes(term),
    );

    this.currentPage = 1; // reset to first page after search
    this.updateTotalPages();
  }

  openUserModal(userData?: any) {
    const modalRef = this.modalService.open(OperatorModalComponent, {
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
    const docRef = doc(this.firestore, 'operators', this.selectedDeleteId);
    const snap = await getDoc(docRef);

    if (!snap.exists()) {
      this.toastr.error('Operator not found');
      return;
    }

    const oldName = snap.data()?.['operator_name']; // ✅ FIXED

    // 📝 Save log
    const logData = {
      ...snap.data(),
      type: 'operator', // ✅ FIXED (was subArea)
      action: 'delete',
      originalId: this.selectedDeleteId,
      deletedAt: new Date(),
    };
    await addDoc(collection(this.firestore, 'logs'), logData);

    // 🗑 Delete operator
    await deleteDoc(docRef);

    // 🧹 Remove from operatorNames array
    if (oldName) {
      await this.deleteInternetSubArea(oldName);
    }

    this.toastr.success('Operator deleted successfully');
    this.loadUsers();
    modal.close();
  } catch (err) {
    console.error(err);
    this.toastr.error('Delete failed');
  } finally {
    this.isDeleting = false;
    this.selectedDeleteId = null;
  }
}

 async deleteInternetSubArea(name: string) {
  const ref = doc(this.firestore, 'operatorName', 'operatorNameDoc');
  const snap = await getDoc(ref);

  if (!snap.exists()) return;

  const operatorNames = snap.data()?.['operatorNames'] || []; // ✅ FIXED

  const updated = operatorNames.filter(
    (item: any) => item.operator_name !== name
  );

  await updateDoc(ref, { operatorNames: updated }); // ✅ FIXED
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
