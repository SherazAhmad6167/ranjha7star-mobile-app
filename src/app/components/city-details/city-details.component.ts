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
import { CityModalComponent } from '../city-modal/city-modal.component';
@Component({
  selector: 'app-city-details',
  imports: [CommonModule, FormsModule, ToastrModule],
  templateUrl: './city-details.component.html',
  styleUrl: './city-details.component.scss'
})
export class CityDetailsComponent {
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
      const usersRef = collection(this.firestore, 'city');
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

      console.log('Fetched cities:', this.users);
    } catch (error) {
      console.error('Error fetching city:', error);
      this.toastr.error('Failed to load cities');
    } finally {
      this.isLoading = false;
    }
  }

  onSearch() {
    const term = this.searchTerm.toLowerCase();

    this.filteredUsers = this.users.filter(
      (user) =>
        user.city?.toLowerCase().includes(term) ||
        user.country?.toLowerCase().includes(term)
    );

    this.currentPage = 1; // reset to first page after search
    this.updateTotalPages();
  }

  openUserModal(userData?: any) {
    const modalRef = this.modalService.open(CityModalComponent, {
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
      const areaDocRef = doc(this.firestore, 'city', this.selectedDeleteId);
      const snap = await getDoc(areaDocRef);


      if (!snap.exists()) {
        this.toastr.error('City not found');
        return;
      }

      const logData = {
        ...snap.data(),
        type: 'city',
        action: 'delete',
        originalId: this.selectedDeleteId,
        deletedAt: new Date(),
      };

      await addDoc(collection(this.firestore, 'logs'), logData);

      await deleteDoc(areaDocRef);


      this.toastr.success('City deleted');
      this.loadUsers();
      modal.close();
    } catch (err) {
      this.toastr.error('Delete failed');
    } finally {
      this.isDeleting = false;
      this.selectedDeleteId = null;
    }
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
