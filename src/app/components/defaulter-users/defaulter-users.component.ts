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
import { FormsModule } from '@angular/forms';
import { ToastrModule, ToastrService } from 'ngx-toastr';
import {
  NgbActiveModal,
  NgbModal,
  NgbModule,
} from '@ng-bootstrap/ng-bootstrap';
@Component({
  selector: 'app-defaulter-users',
  imports: [CommonModule, FormsModule, SearchSelectComponent],
  templateUrl: './defaulter-users.component.html',
  styleUrl: './defaulter-users.component.scss',
})
export class DefaulterUsersComponent {
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

  getCurrentMonthYear() {
    const now = new Date();
    return {
      month: now.toLocaleString('en-US', { month: 'long' }).toLowerCase(),
      year: now.getFullYear().toString(),
    };
  }

  getPreviousMonthYear() {
    const date = new Date();
    date.setMonth(date.getMonth() - 1);

    return {
      month: date.toLocaleString('en-US', { month: 'long' }).toLowerCase(),
      year: date.getFullYear().toString(),
    };
  }

  isDefaulter(user: any): boolean {
    if (!user.bills || !Array.isArray(user.bills)) return false;

    const { month: currentMonth, year: currentYear } =
      this.getCurrentMonthYear();
    const { month: prevMonth, year: prevYear } = this.getPreviousMonthYear();

    const currentBill = user.bills.find(
      (b: any) => b.month === currentMonth && b.year === currentYear,
    );

    const previousBill = user.bills.find(
      (b: any) => b.month === prevMonth && b.year === prevYear,
    );

    // Rule:
    // current month bill exists
    // AND previous month bill unpaid
    return !!currentBill && previousBill?.status === 'unpaid';
  }

  getUnpaidMonths(user: any): string {
  if (!user.bills || !Array.isArray(user.bills)) return '-';

  const unpaidBills = user.bills.filter(
    (b: any) => b.status === 'unpaid'
  );

  if (unpaidBills.length === 0) return '-';

  return unpaidBills
    .map((b: any) => `${b.month} ${b.year}`)
    .map((m: string) =>
      m.replace(/^\w/, (c) => c.toUpperCase())
    )
    .join(', ');
}


  async loadUsers() {
    this.isLoading = true;

    try {
      const usersRef = collection(this.firestore, 'users');
      const snapshot = await getDocs(usersRef);

      const allUsers = snapshot.docs.map((docSnap) => ({
        id: docSnap.id,
        ...docSnap.data(),
      }));

      this.users = allUsers.filter((user) => this.isDefaulter(user));

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

      console.log('Defaulter Users:', this.users);
    } catch (error) {
      console.error('Error fetching users:', error);
      this.toastr.error('Failed to load defaulter users');
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
