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
import { NgbModal } from '@ng-bootstrap/ng-bootstrap';
import { ToastrModule, ToastrService } from 'ngx-toastr';
import { PackageModalComponent } from '../package-modal/package-modal.component';
import { FormsModule } from '@angular/forms';

@Component({
  selector: 'app-package-details',
  imports: [CommonModule, ToastrModule, FormsModule],
  templateUrl: './package-details.component.html',
  styleUrl: './package-details.component.scss',
})
export class PackageDetailsComponent {
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
      const usersRef = collection(this.firestore, 'packages');
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

      console.log('Fetched Package:', this.users);
    } catch (error) {
      console.error('Error fetching packages:', error);
      this.toastr.error('Failed to load packages');
    } finally {
      this.isLoading = false;
    }
  }

  onSearch() {
    const term = this.searchTerm.toLowerCase();

    this.filteredUsers = this.users.filter(
      (user) =>
        user.company_name?.toLowerCase().includes(term) ||
        user.package_name?.toLowerCase().includes(term),
    );

    this.currentPage = 1;
    this.updateTotalPages();
  }

  openUserModal(userData?: any) {
    const modalRef = this.modalService.open(PackageModalComponent, {
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
      const areaDocRef = doc(this.firestore, 'packages', this.selectedDeleteId);
      const snap = await getDoc(areaDocRef);

      const packageName = snap.exists() ? snap.data()?.['package_name'] : null;
      const type = snap.exists() ? snap.data()?.['package_type'] : null;

      if (type === 'internet' && packageName) {
        await this.deleteInternetArea(packageName);
      }

      if (type === 'tv_cable' && packageName) {
        await this.deleteCableArea(packageName);
      }

      if (!snap.exists()) {
        this.toastr.error('User not found');
        return;
      }

      const logData = {
        ...snap.data(),
        type: 'packages',
        action: 'delete',
        originalId: this.selectedDeleteId,
        deletedAt: new Date(),
      };

      await addDoc(collection(this.firestore, 'logs'), logData);

      await deleteDoc(areaDocRef);

      this.toastr.success('Package deleted');
      this.loadUsers();
      modal.close();
    } catch (err) {
      this.toastr.error('Delete failed');
    } finally {
      this.isDeleting = false;
      this.selectedDeleteId = null;
    }
  }

  async deleteInternetArea(package_name: string) {
    const internetDocRef = doc(
      this.firestore,
      'internetPackage',
      'internetPackageDoc',
    );
    const snap = await getDoc(internetDocRef);

    if (!snap.exists()) return;

    const internetPackage = snap.data()?.['internetPackage'] || [];

    const updatedAreas = internetPackage.filter(
      (item: any) => item.package_name !== package_name,
    );

    await updateDoc(internetDocRef, {
      internetPackage: updatedAreas,
    });
  }

  async deleteCableArea(package_name: string) {
    const CableDocRef = doc(this.firestore, 'cablePackage', 'cablePackageDoc');
    const snap = await getDoc(CableDocRef);

    if (!snap.exists()) return;

    const cablePackage = snap.data()?.['cablePackage'] || [];

    const updatedAreas = cablePackage.filter(
      (item: any) => item.package_name !== package_name,
    );

    await updateDoc(CableDocRef, {
      cablePackage: updatedAreas,
    });
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
