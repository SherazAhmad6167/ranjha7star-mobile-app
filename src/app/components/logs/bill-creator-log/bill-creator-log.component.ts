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
  query,
  updateDoc,
  where,
} from '@angular/fire/firestore';
import { FormsModule, ReactiveFormsModule } from '@angular/forms';
import { NgbModal } from '@ng-bootstrap/ng-bootstrap';
import { Toast, ToastrModule, ToastrService } from 'ngx-toastr';

@Component({
  selector: 'app-bill-creator-log',
  imports: [FormsModule, ReactiveFormsModule, CommonModule],
  templateUrl: './bill-creator-log.component.html',
  styleUrl: './bill-creator-log.component.scss',
})
export class BillCreatorLogComponent {
  isLoading = false;
  isDeleting = false;
  searchTerm = '';
  bills: any[] = [];
  filteredBills: any[] = [];
  selectedDeleteId: string | null = null;
  currentPage = 1;
  pageSize = 10;
  totalPages = 1;
  internetAreas: any[] = [];
  sublocality: string = '';
  connection_type: string = '';
  selectedMonth: string = '';
  selectedYear: string = '';
  userName: string | null = '';
  constructor(
    private modalService: NgbModal,
    private firestore: Firestore,
    private toastr: ToastrService,
  ) {}

  ngOnInit(): void {
    this.userName = localStorage.getItem('username');
    this.loadInternetAreas();
    this.loadBills();
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
    return this.filteredBills.slice(start, end);
  }

  async loadBills() {
    this.isLoading = true;

    try {
      const billsRef = collection(this.firestore, 'logs');
      const q = query(billsRef, where('type', '==', 'bill'));
      const snapshot = await getDocs(q);

      this.bills = snapshot.docs.map((docSnap) => ({
        id: docSnap.id,
        ...docSnap.data(),
      }));

      this.bills.sort((a, b) => {
        // Firestore Timestamp
        const timeA = a.createdAt?.toDate
          ? a.createdAt.toDate().getTime()
          : new Date(a.createdAt).getTime();
        const timeB = b.createdAt?.toDate
          ? b.createdAt.toDate().getTime()
          : new Date(b.createdAt).getTime();
        return timeB - timeA; // descending
      });

      this.filteredBills = this.bills;
      this.updateTotalPages();

      console.log('Fetched bills:', this.bills);
    } catch (error) {
      console.error('Error fetching bills:', error);
      this.toastr.error('Failed to load Bills');
    } finally {
      this.isLoading = false;
    }
  }

  onSearch() {
    const term = this.searchTerm.toLowerCase();

    this.filteredBills = this.bills.filter(
      (bill) =>
        bill.month?.toLowerCase().includes(term) ||
        bill.year?.toLowerCase().includes(term) ||
        bill.sublocality?.toLowerCase().includes(term),
    );

    this.currentPage = 1; // reset to first page after search
    this.updateTotalPages();
  }

  updateTotalPages() {
    this.totalPages = Math.ceil(this.filteredBills.length / this.pageSize) || 1;
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
