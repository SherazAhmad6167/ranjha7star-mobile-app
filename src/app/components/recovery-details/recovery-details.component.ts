import { CommonModule } from '@angular/common';
import { Component, ElementRef, ViewChild } from '@angular/core';
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
  where,
} from '@angular/fire/firestore';
import { FormsModule, ReactiveFormsModule } from '@angular/forms';
import { NgbModal } from '@ng-bootstrap/ng-bootstrap';
import { ToastrModule, ToastrService } from 'ngx-toastr';
import { ExpenseModalComponent } from '../expense-modal/expense-modal.component';
import { RecoveryDetailModalComponent } from '../recovery-detail-modal/recovery-detail-modal.component';
import { TemplateMapperService } from '../../shared/template-mapper.service';
import { FileShareService } from '../../shared/file-share.service';
import { registerPageRefresh } from '../../shared/page-refresh.service';
import { SheetSelectComponent } from '../../shared/sheet-select/sheet-select.component';
import {
  IonModal,
  IonRange,
  IonRippleEffect,
  IonSearchbar,
  IonSkeletonText,
  IonSpinner,
} from '@ionic/angular';

type PageSlot = number | 'gap';

@Component({
  selector: 'app-recovery-details',
  imports: [
    CommonModule,
    FormsModule,
    ReactiveFormsModule,
    ToastrModule,
    IonModal,
    IonRange,
    IonRippleEffect,
    IonSearchbar,
    IonSkeletonText,
    IonSpinner,
    SheetSelectComponent,
  ],
  templateUrl: './recovery-details.component.html',
  styleUrl: './recovery-details.component.scss',
})
export class RecoveryDetailsComponent {
  isLoading = false;
  isDeleting = false;
  searchTerm = '';
  users: any[] = [];
  recoveryOfficerList: string[] = [];
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
  totalRecovery: number = 0;
  totalExpenses: number = 0;
  remainingAmount: number = 0;
  role: string = '';
  loggedInOperator: string = '';
  loggedInOperatorName: string = '';
  operatorSublocalities: string[] = [];
  operatorName: string = '';
  internetOperators: any[] = [];
  selectedMsgUser: any = null;
  recoveryTemplate: string = '';
  selectedMonth: string | null = null;
  monthMap: any = {
  january: '01',
  february: '02',
  march: '03',
  april: '04',
  may: '05',
  june: '06',
  july: '07',
  august: '08',
  september: '09',
  october: '10',
  november: '11',
  december: '12',
};

  // ── Mobile UI state (presentation only) ──
  readonly pageSizes = [10, 30, 50, 100];
  readonly skeletonRows = [0, 1, 2, 3, 4];
  detailSheetOpen = false;
  msgSheetOpen = false;
  deleteSheetOpen = false;
  detailUser: any = null;
  private pendingSheetAction: (() => void) | null = null;

  /** Handed to confirmDelete(), which closes "its modal" once the delete succeeds. */
  readonly deleteSheet = {
    close: () => (this.deleteSheetOpen = false),
    dismiss: () => (this.deleteSheetOpen = false),
  };

  @ViewChild('listTop') listTop?: ElementRef<HTMLElement>;

  constructor(
    private modalService: NgbModal,
    private firestore: Firestore,
    private toastr: ToastrService,
    private templateMapper: TemplateMapperService,
    private fileShare: FileShareService,
  ) {
    registerPageRefresh(() => this.refreshData());
  }

  /** Top-bar refresh: reloads what opening the screen loads, filters kept. */
  async refreshData() {
    await Promise.all([
      this.loadExpenses(),
      this.loadOperatorName(),
      this.loadRecoveryTemplate(),
    ]);
    // loadExpenses shows every record; put the search / filters back.
    this.onFilterChange();
  }

  async ngOnInit(): Promise<void> {
    this.role = localStorage.getItem('role') || '';
    this.loggedInOperator = localStorage.getItem('username') || '';

    if (this.role === 'operator') {
      this.operatorSublocalities = JSON.parse(
        localStorage.getItem('sublocality') || '[]',
      );
      // Records are matched on his display name, so resolve it first.
      await this.resolveOperatorName();
    }

    this.loadExpenses();
    this.loadOperatorName();
    this.loadRecoveryTemplate();
  }

  // Login stores `user_name`, while recovery records store the operator's
  // display `name` - resolve it once so his own rows can be matched.
  private async resolveOperatorName() {
    this.loggedInOperatorName = localStorage.getItem('name') || '';
    if (this.loggedInOperatorName || !this.loggedInOperator) return;

    try {
      const snap = await getDocs(
        query(
          collection(this.firestore, 'recoveryOfficer'),
          where('user_name', '==', this.loggedInOperator),
        ),
      );
      if (!snap.empty) {
        this.loggedInOperatorName = snap.docs[0].data()['name'] || '';
        localStorage.setItem('name', this.loggedInOperatorName);
      }
    } catch (error) {
      console.error('Error resolving recovery officer name', error);
    }
  }

  private normalizeName(name: string): string {
    return String(name || '').trim().toLowerCase();
  }

  // Older rows may carry the login handle instead of the display name.
  private isOwnRecord(user: any): boolean {
    const recordName = this.normalizeName(user.operator_name);
    if (!recordName) return false;

    return (
      recordName === this.normalizeName(this.loggedInOperatorName) ||
      recordName === this.normalizeName(this.loggedInOperator)
    );
  }

  async loadRecoveryTemplate() {
    try {
      const snap = await getDoc(doc(this.firestore, 'messageTemplates/recovery'));
      if (snap.exists()) this.recoveryTemplate = snap.data()['message'] || '';
    } catch {}
  }

  openMsgModal(user: any) {
    this.selectedMsgUser = user;
    this.msgSheetOpen = true;
  }

  formatPhoneForSms(phone: string): string | null {
    if (!phone) return null;
    const cleaned = phone.toString().trim().replace(/[\s\-()]/g, '');
    if (cleaned.startsWith('+92') && cleaned.length === 13) return cleaned;
    if (cleaned.startsWith('92')  && cleaned.length === 12) return '+' + cleaned;
    if (cleaned.startsWith('0')   && cleaned.length === 11) return '+92' + cleaned.slice(1);
    if (cleaned.length === 10) return '+92' + cleaned;
    return null;
  }

  formatPhoneNumber(phone: string): string {
    phone = (phone || '').replace(/\D/g, '');
    if (phone.startsWith('03'))  return '92' + phone.substring(1);
    if (phone.startsWith('3'))   return '92' + phone;
    if (phone.startsWith('92'))  return phone;
    if (phone.startsWith('+92')) return phone.substring(1);
    return phone;
  }

  async sendSms(user: any) {
    const phone = this.formatPhoneForSms(user.operator_phone);
    if (!phone) { this.toastr.error('No valid operator phone number'); return; }
    if (!this.recoveryTemplate) { this.toastr.error('Recovery template not configured in Settings'); return; }
    const message = this.templateMapper.map(this.recoveryTemplate, user);
    try {
      await addDoc(collection(this.firestore, 'sms'), { phone, message, status: 'pending', createdAt: new Date().toISOString() });
      this.toastr.success('SMS queued successfully');
    } catch { this.toastr.error('Failed to queue SMS'); }
  }

  sendWhatsapp(user: any) {
    if (!this.recoveryTemplate) { this.toastr.error('Recovery template not configured in Settings'); return; }
    const phone = this.formatPhoneNumber(user.operator_phone || '');
    const message = this.templateMapper.map(this.recoveryTemplate, user);
    this.fileShare.openWhatsApp(phone, message);
  }

  async loadOperatorName() {
    try {
      const ref = doc(this.firestore, 'operatorName', 'operatorNameDoc');
      const snap = await getDoc(ref);

      if (snap.exists()) {
        this.internetOperators = snap.data()?.['operatorNames'] || [];

        this.internetOperators.sort((a: any, b: any) => {
          return a.operator_name.localeCompare(b.operator_name);
        });
      }
    } catch (error) {
      console.error('Error loading internet operators', error);
    }
  }


  async loadExpenses() {
    this.isLoading = true;

    try {
      const usersRef = collection(this.firestore, 'recoveryDetails');
      const recoveryOfficerRef = collection(this.firestore, 'recoveryOfficer');

      // ✅ Order by createdAt descending
      const q = query(usersRef, orderBy('createdAt', 'desc'));
      const rq = query(recoveryOfficerRef, orderBy('createdAt', 'desc'));

      const snapshot = await getDocs(q);
      const recoveryOfficerSnapshot = await getDocs(rq);

      this.recoveryOfficerList = recoveryOfficerSnapshot.docs.map((docSnap) => docSnap.data()['user_name']);

      this.users = snapshot.docs.map((docSnap) => {
        const data: any = docSnap.data();

        const profit = (data.total_recovery || 0) - (data.total_expenses || 0);

        return {
          id: docSnap.id,
          ...data,
          profit,
        };
      });

      // Restrict operator to their own records only
      if (this.role === 'operator') {
        this.users = this.users.filter((u) => this.isOwnRecord(u));
      }

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
        user.recovey_officer?.toLowerCase().includes(term) ||
        user.date?.includes(term);

      const matchesOperator =
        !this.operatorName || user.operator_name === this.operatorName;

      let matchesMonth = true;

    if (this.selectedMonth) {
      const selectedMonthNumber = this.monthMap[this.selectedMonth]; // e.g. "05"
      const userMonth = user.date?.split('-')[1]; // "05"

      matchesMonth = userMonth === selectedMonthNumber;
    }

    return matchesSearch && matchesOperator && matchesMonth;
    });

    this.currentPage = 1;
    this.updateTotalPages();
    this.calculateTotals(this.filteredUsers);
  }

  openExpenseModal(userData?: any) {
    // Full-screen sheet on phones, centered dialog from tablet width up.
    const modalRef = this.modalService.open(RecoveryDetailModalComponent, {
      size: 'lg',
      fullscreen: 'md',
      windowClass: 'mk-sheet-window',
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

  openDeleteModal(id: string) {
    this.selectedDeleteId = id;
    this.deleteSheetOpen = true;
  }

  async confirmDelete(modal: any) {
    if (!this.selectedDeleteId) return;

    this.isDeleting = true;

    const userRef = doc(
      this.firestore,
      'recoveryDetails',
      this.selectedDeleteId,
    );

    try {
      const userSnap = await getDoc(userRef);

      if (!userSnap.exists()) {
        this.toastr.error('Recovery detail not found');
        return;
      }

      const logData = {
        ...userSnap.data(),
        type: 'recovery',
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
      await deleteDoc(
        doc(this.firestore, 'recoveryDetails', this.selectedDeleteId),
      );
      this.toastr.success('Recovery detail deleted');
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
      const userDate = new Date(user.date);

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
    this.totalRecovery = data.reduce(
      (sum, item) => sum + (item.total_recovery || 0),
      0,
    );

    this.totalExpenses = data.reduce(
      (sum, item) => sum + (item.total_expenses || 0),
      0,
    );

    this.remainingAmount = data.reduce(
      (sum, item) => sum + (item.remaining_amount || 0),
      0,
    );
  }
  // ── Mobile UI helpers (presentation only) ─────────────────────────────

  trackByRecord(_: number, user: any) {
    return user.id;
  }

  userInitial(user: any): string {
    return (user?.operator_name || '?').charAt(0).toUpperCase();
  }

  /** Operator number shown on the card and used by the call button. */
  getContact(user: any): string {
    return (user?.operator_phone || '').toString().trim();
  }

  statusClass(user: any): string {
    return user?.recieved_by ? 'st-received' : 'st-pending';
  }

  statusLabel(user: any): string {
    return user?.recieved_by ? 'Received' : 'Pending';
  }

  statusIcon(user: any): string {
    return user?.recieved_by ? 'ri-check-line' : 'ri-time-line';
  }

  get activeFilterCount(): number {
    return [this.operatorName, this.selectedMonth, this.fromDate, this.toDate].filter(Boolean).length;
  }

  get hasAnyFilter(): boolean {
    return !!(this.searchTerm || this.activeFilterCount);
  }

  onSearchInput(event: Event) {
    this.searchTerm = ((event as CustomEvent).detail?.value ?? '').toString();
    this.onFilterChange();
  }

  resetFilters() {
    this.operatorName = '';
    this.selectedMonth = null;
    this.fromDate = '';
    this.toDate = '';
    this.onFilterChange();
  }

  clearFilters() {
    this.searchTerm = '';
    this.resetFilters();
  }

  get pageStart(): number {
    return this.filteredUsers.length ? (this.currentPage - 1) * this.pageSize + 1 : 0;
  }

  get pageEnd(): number {
    return Math.min(this.currentPage * this.pageSize, this.filteredUsers.length);
  }

  /** Compact page strip, e.g. 1 … 5 [6] 7 … 40. */
  get pageWindow(): PageSlot[] {
    const total = this.totalPages;
    if (total <= 5) return Array.from({ length: total }, (_, i) => i + 1);

    const current = this.currentPage;
    const start = Math.max(2, Math.min(current - 1, total - 3));
    const end = Math.min(total - 1, Math.max(current + 1, 4));
    const slots: PageSlot[] = [1];
    // A gap only ever hides two or more pages; a single hidden page is shown instead.
    if (start === 3) slots.push(2);
    else if (start > 3) slots.push('gap');
    for (let page = start; page <= end; page++) slots.push(page);
    if (end === total - 2) slots.push(total - 1);
    else if (end < total - 2) slots.push('gap');
    slots.push(total);
    return slots;
  }

  changePage(slot: PageSlot) {
    if (slot === 'gap' || !Number.isFinite(slot) || slot === this.currentPage || slot < 1 || slot > this.totalPages) {
      return;
    }
    this.goToPage(slot);
    this.scrollListIntoView();
  }

  goPrev() {
    this.changePage(this.currentPage - 1);
  }

  goNext() {
    this.changePage(this.currentPage + 1);
  }

  onPageScrub(event: Event) {
    this.changePage(Math.round(Number((event as CustomEvent).detail?.value)));
  }

  private scrollListIntoView() {
    this.listTop?.nativeElement.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  openDetailSheet(user: any) {
    this.detailUser = user;
    this.detailSheetOpen = true;
  }

  /** Closes the detail sheet, then runs the action once the sheet has gone. */
  fromDetailSheet(action: 'edit' | 'message' | 'delete') {
    const user = this.detailUser;
    this.pendingSheetAction = () => {
      if (action === 'edit') this.editUser(user);
      else if (action === 'message') this.openMsgModal(user);
      else this.openDeleteModal(user.id);
    };
    this.detailSheetOpen = false;
  }

  onDetailSheetDismiss() {
    this.detailSheetOpen = false;
    const action = this.pendingSheetAction;
    this.pendingSheetAction = null;
    action?.();
  }

  closeMsgSheet() {
    this.msgSheetOpen = false;
  }
}
