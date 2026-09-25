import { CommonModule } from '@angular/common';
import { SearchSelectComponent } from '../../shared/search-select/search-select.component';
import { Component } from '@angular/core';
import {
  addDoc,
  collection,
  deleteDoc,
  deleteField,
  doc,
  Firestore,
  getDoc,
  getDocs,
  updateDoc,
} from '@angular/fire/firestore';
import { FormsModule, ReactiveFormsModule } from '@angular/forms';
import { NgbModal } from '@ng-bootstrap/ng-bootstrap';
import { Toast, ToastrModule, ToastrService } from 'ngx-toastr';

@Component({
  selector: 'app-bill-creator',
  imports: [CommonModule, FormsModule, ReactiveFormsModule, ToastrModule, SearchSelectComponent],
  templateUrl: './bill-creator.component.html',
  styleUrl: './bill-creator.component.scss',
})
export class BillCreatorComponent {
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
  overlayMessage = 'Loading bills...';

  months = [
    { value: 'january', label: 'January' },
    { value: 'february', label: 'February' },
    { value: 'march', label: 'March' },
    { value: 'april', label: 'April' },
    { value: 'may', label: 'May' },
    { value: 'june', label: 'June' },
    { value: 'july', label: 'July' },
    { value: 'august', label: 'August' },
    { value: 'september', label: 'September' },
    { value: 'october', label: 'October' },
    { value: 'november', label: 'November' },
    { value: 'december', label: 'December' },
  ];
  years: string[] = [];

  constructor(
    private modalService: NgbModal,
    private firestore: Firestore,
    private toastr: ToastrService,
  ) {}

  ngOnInit(): void {
    this.userName = localStorage.getItem('username');
    this.buildYears();
    this.loadInternetAreas();
    this.loadBills();
  }

  buildYears() {
    const now = new Date().getFullYear();
    this.years = [];
    for (let y = now - 3; y <= now + 2; y++) this.years.push(String(y));
  }

  // ── Header stats ──────────────────────────────
  get totalUsersBilled(): number {
    return this.bills.reduce((sum, b) => sum + (Number(b.users) || 0), 0);
  }

  get totalAmountBilled(): number {
    return this.bills.reduce((sum, b) => sum + (Number(b.amount) || 0), 0);
  }

  // ── Display helpers ───────────────────────────
  get canCreate(): boolean {
    return !!(
      this.selectedMonth &&
      this.selectedYear &&
      this.connection_type &&
      this.sublocality
    );
  }

  connectionLabel(type: string): string {
    if (type === 'tv_cable') return 'Cable';
    if (type === 'internet') return 'Internet';
    if (type === 'both') return 'Both';
    return type || '—';
  }

  connectionClass(type: string): string {
    if (type === 'tv_cable') return 'conn-cable';
    if (type === 'internet') return 'conn-internet';
    if (type === 'both') return 'conn-both';
    return '';
  }

  areaLabel(area: string): string {
    return area === 'all' ? 'All Areas' : area;
  }

  monthLabel(value: string): string {
    return this.months.find((m) => m.value === value)?.label || value;
  }

  resetFilters() {
    this.selectedMonth = '';
    this.selectedYear = '';
    this.connection_type = '';
    this.sublocality = '';
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
    this.overlayMessage = 'Loading bills...';

    try {
      const billsRef = collection(this.firestore, 'billCreator');
      const snapshot = await getDocs(billsRef);

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
        String(bill.year ?? '').toLowerCase().includes(term) ||
        bill.sublocality?.toLowerCase().includes(term) ||
        bill.connection_type?.toLowerCase().includes(term) ||
        bill.created_by?.toLowerCase().includes(term),
    );

    this.currentPage = 1; // reset to first page after search
    this.updateTotalPages();
  }

  openDeleteModal(id: string, modal: any) {
    this.selectedDeleteId = id;
    this.modalService.open(modal, { centered: true });
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

  async createBill() {
    if (
      !this.selectedMonth ||
      !this.selectedYear ||
      !this.connection_type ||
      !this.sublocality
    ) {
      this.toastr.error('Please select all filters');
      return;
    }

    await this.checkDuplicateBill();
  }

  async checkDuplicateBill() {
    const billsRef = collection(this.firestore, 'billCreator');
    const snap = await getDocs(billsRef);

    const exists = snap.docs.some(
      (d) =>
        d.data()['month'] === this.selectedMonth &&
        d.data()['year'] === this.selectedYear &&
        d.data()['connection_type'] === this.connection_type &&
        d.data()['sublocality'] === this.sublocality,
    );

    if (exists) {
      this.toastr.error('Bill already created for this Month & Year');
      return;
    }

    await this.createBillForUsers();
  }

  async createBillForUsers() {
    this.isLoading = true;
    this.overlayMessage = 'Creating bills, please wait...';

    try {
      const usersSnap = await getDocs(collection(this.firestore, 'users'));

      const eligibleUsers = usersSnap.docs.filter((docSnap) => {
        const u = docSnap.data();
        return (
          u['connection_type'] === this.connection_type &&
          (this.sublocality === 'all' || u['sublocality'] === this.sublocality)
        );
      });

      if (!eligibleUsers.length) {
        this.toastr.warning('No users found');
        return;
      }

      const totalAmount = await this.updateUsersBills(eligibleUsers);

      await this.createBillCreatorDoc(eligibleUsers.length, totalAmount);

      this.toastr.success('Bill created successfully');
      this.loadBills();
    } catch (e) {
      console.error(e);
      this.toastr.error('Bill creation failed');
    } finally {
      this.isLoading = false;
    }
  }

  remainingExtraAdvance: any;
  applyExtraAdvance(amount: number) {
    if (!this.remainingExtraAdvance || this.remainingExtraAdvance <= 0)
      return amount;

    if (this.remainingExtraAdvance >= amount) {
      this.remainingExtraAdvance -= amount;
      return 0;
    } else {
      const finalAmount = amount - this.remainingExtraAdvance;
      this.remainingExtraAdvance = 0;
      return finalAmount;
    }
  }

  async updateUsersBills(users: any[]) {
    let totalAmount = 0;

    for (const u of users) {
      const ref = doc(this.firestore, 'users', u.id);
      const snap = await getDoc(ref);

      const userData = snap.data();
      let bills = userData?.['bills'] || [];
      const advancePayments = userData?.['advancePayments'] || [];
      const installationAmount = Number(userData?.['installation_amount'] || 0);
      const otherAmount = Number(userData?.['other_amount'] || 0);
      const extraAdvance = Number(userData?.['extra_advance'] || 0);
      let remainingExtraAdvance = extraAdvance;

      const extraAmount = installationAmount + otherAmount;

      const exists = (type: string) =>
        bills.some(
          (b: any) =>
            b.month === this.selectedMonth &&
            b.year === this.selectedYear &&
            b.type === type,
        );

      const hasAdvanceForMonth = (type: string) =>
        advancePayments.some((adv: any) =>
          adv.months?.some(
            (m: any) =>
              m.month.toLowerCase() === this.selectedMonth.toLowerCase() &&
              m.year === this.selectedYear,
          ),
        );

      // ================= CABLE =================
      if (
        (this.connection_type === 'tv_cable' ||
          this.connection_type === 'both') &&
        userData?.['cable_package_fee']
      ) {
        if (!exists('cable') && !hasAdvanceForMonth('cable')) {
          let amount = Number(userData['cable_package_fee']);
          const prevRemaining = this.getPreviousMonthRemaining(
            bills,
            this.selectedMonth,
            this.selectedYear,
            'cable',
          );
          amount += prevRemaining;
          amount += extraAmount;

          if (remainingExtraAdvance > 0) {
            if (remainingExtraAdvance >= amount) {
              remainingExtraAdvance -= amount;
              amount = 0;
            } else {
              amount -= remainingExtraAdvance;
              remainingExtraAdvance = 0;
            }
          }

          bills.push({
            bill_id: crypto.randomUUID(),
            month: this.selectedMonth,
            year: this.selectedYear,
            type: 'cable',
            amount,
            status: 'unpaid',
            remaining_amount: amount,
            createdAt: new Date(),
          });

          totalAmount += amount;
        }
      }

      // ================= INTERNET =================
      if (
        (this.connection_type === 'internet' ||
          this.connection_type === 'both') &&
        userData?.['internet_package_fee']
      ) {
        if (!exists('internet') && !hasAdvanceForMonth('internet')) {
          let amount = Number(userData['internet_package_fee']);

          const prevRemaining = this.getPreviousMonthRemaining(
            bills,
            this.selectedMonth,
            this.selectedYear,
            'internet',
          );
          amount += prevRemaining;
          amount += extraAmount;

          if (remainingExtraAdvance > 0) {
            if (remainingExtraAdvance >= amount) {
              remainingExtraAdvance -= amount;
              amount = 0;
            } else {
              amount -= remainingExtraAdvance;
              remainingExtraAdvance = 0;
            }
          }

          bills.push({
            bill_id: crypto.randomUUID(),
            month: this.selectedMonth,
            year: this.selectedYear,
            type: 'internet',
            amount,
            sublocality: this.sublocality,
            status: 'unpaid',
            remaining_amount: amount,
            createdAt: new Date(),
          });

          totalAmount += amount;
        }
      }

      const updatePayload: any = {
        bills,
        installation_amount: 0,
        other_amount: 0,
      };

      // ✅ remove or update extra advance
      if (remainingExtraAdvance > 0) {
        updatePayload.extra_advance = remainingExtraAdvance;
      } else {
        updatePayload.extra_advance = deleteField();
      }

      await updateDoc(ref, updatePayload);
    }

    return totalAmount;
  }

  async createBillCreatorDoc(totalUsers: number, totalAmount: number) {
    await addDoc(collection(this.firestore, 'billCreator'), {
      month: this.selectedMonth,
      year: this.selectedYear,
      connection_type: this.connection_type,
      sublocality: this.sublocality,
      amount: totalAmount,
      users: totalUsers,

      status: 'unpaid',
      createdAt: new Date(),
      created_by: this.userName || 'Unknown',
    });
  }

  getPreviousMonthRemaining(
    bills: any[],
    month: string,
    year: string,
    type: string,
  ) {
    const prevBill = bills.find(
      (b: any) =>
        b.type === type &&
        // case 1: unpaid bill → amount = remaining
        (b.status === 'unpaid' ||
          // case 2: paid but partial remaining
          (b.status === 'paid' && Number(b.remaining_amount) > 0)),
    );

    if (!prevBill) return 0;

    // unpaid me remaining_amount nahi hota
    return Number(prevBill.remaining_amount ?? prevBill.amount ?? 0);
  }

  async confirmDelete(modal: any) {
    if (!this.selectedDeleteId) return;

    this.isDeleting = true;

    try {
      const billRef = doc(this.firestore, 'billCreator', this.selectedDeleteId);
      const billSnap = await getDoc(billRef);
      const bill = billSnap.data();

      if (!billSnap.exists()) {
        this.toastr.error('Bill not found');
        return;
      }

      const logData = {
        ...billSnap.data(),
        type: 'bill',
        action: 'delete',
        originalId: this.selectedDeleteId,
        deletedAt: new Date(),
      };

      await addDoc(collection(this.firestore, 'logs'), logData);

      await deleteDoc(billRef);
      await this.removeBillFromUsers(bill);

      this.toastr.success('Bill deleted');
      this.loadBills();
      modal.close();
    } catch {
      this.toastr.error('Delete failed');
    } finally {
      this.isDeleting = false;
    }
  }

  async removeBillFromUsers(bill: any) {
    const usersSnap = await getDocs(collection(this.firestore, 'users'));

    for (const docSnap of usersSnap.docs) {
      const ref = doc(this.firestore, 'users', docSnap.id);
      const bills = docSnap.data()['bills'] || [];

      const updatedBills = bills.filter(
        (b: any) =>
          !(
            b.month === bill.month &&
            b.year === bill.year &&
            b.sublocality === bill.sublocality &&
            (bill.connection_type === 'both' || b.type === bill.connection_type)
          ),
      );

      if (updatedBills.length !== bills.length) {
        await updateDoc(ref, { bills: updatedBills });
      }
    }
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
