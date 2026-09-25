import { CommonModule } from '@angular/common';
import { SearchSelectComponent } from '../../../shared/search-select/search-select.component';
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
import { FormsModule } from '@angular/forms';
import { ToastrModule, ToastrService } from 'ngx-toastr';
import {
  NgbActiveModal,
  NgbModal,
  NgbModule,
} from '@ng-bootstrap/ng-bootstrap';
@Component({
  selector: 'app-user-detail-log',
  imports: [CommonModule, FormsModule, SearchSelectComponent],
  templateUrl: './user-detail-log.component.html',
  styleUrl: './user-detail-log.component.scss',
})
export class UserDetailLogComponent {
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

  constructor(
    private modalService: NgbModal,
    private firestore: Firestore,
    private toastr: ToastrService,
  ) {}

  ngOnInit(): void {
    this.loadUsers();
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

  get pagedUsers() {
    const start = (this.currentPage - 1) * this.pageSize;
    const end = start + this.pageSize;
    return this.filteredUsers.slice(start, end);
  }

  async loadUsers() {
    this.isLoading = true;

    try {
      const usersRef = collection(this.firestore, 'logs');
      const q = query(usersRef, where('type', '==', 'users'));
      const snapshot = await getDocs(q);

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

      console.log('Fetched users:', this.users);
    } catch (error) {
      console.error('Error fetching users:', error);
      this.toastr.error('Failed to load users');
    } finally {
      this.isLoading = false;
    }
  }

  onSearch() {
    const term = this.searchTerm.toLowerCase();

    this.filteredUsers = this.users.filter(
      (user) =>
        user.user_name?.toLowerCase().includes(term) ||
        user.internet_id?.toLowerCase().includes(term) ||
        user.sublocality?.toLowerCase().includes(term) ||
        user.phone_no?.includes(term),
    );

    this.currentPage = 1; // reset to first page after search
    this.updateTotalPages();
  }

  onFilterChange() {
    const term = this.searchTerm.toLowerCase();

    this.filteredUsers = this.users.filter((user) => {
      const matchesSearch =
        user.user_name?.toLowerCase().includes(term) ||
        user.internet_id?.toLowerCase().includes(term) ||
        user.address?.toLowerCase().includes(term) ||
        user.sublocality?.toLowerCase().includes(term) ||
        user.phone_no?.includes(term);

      const matchesSublocality =
        !this.sublocality || user.sublocality === this.sublocality;

      return matchesSearch && matchesSublocality;
    });

    this.currentPage = 1;
    this.updateTotalPages();
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
}
