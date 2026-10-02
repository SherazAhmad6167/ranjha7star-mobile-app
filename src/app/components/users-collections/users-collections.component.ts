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
  runTransaction,
  updateDoc,
} from '@angular/fire/firestore';
import {
  FormBuilder,
  FormGroup,
  FormsModule,
  ReactiveFormsModule,
  Validators,
} from '@angular/forms';
import { ToastrModule, ToastrService } from 'ngx-toastr';
import html2canvas from 'html2canvas';
import { UserCollectionModalComponent } from '../user-collection-modal/user-collection-modal.component';
import { NgbModal } from '@ng-bootstrap/ng-bootstrap';
import { TemplateMapperService } from '../../shared/template-mapper.service';
import { SheetSelectComponent } from '../../shared/sheet-select/sheet-select.component';
import { BluetoothService } from '../../shared/bluetooth.service';
import { FileShareService } from '../../shared/file-share.service';
import { registerPageRefresh } from '../../shared/page-refresh.service';
import { collectionReceiptLines } from '../../shared/thermal-receipts';
import {
  IonModal,
  IonRange,
  IonRippleEffect,
  IonSearchbar,
  IonSkeletonText,
  IonSpinner,
} from '@ionic/angular';
import { toWhatsappNumber } from '../../shared/phone';
import {
  carriedToLabel,
  isCarried,
  linkUntrackedCarries,
  releaseCarried,
  settleCarried,
  unsettleCarried,
} from '../../shared/bill-carry';

type PageSlot = number | 'gap';

@Component({
  selector: 'app-users-collections',
  imports: [
    CommonModule,
    FormsModule,
    ToastrModule,
    ReactiveFormsModule,
    IonModal,
    IonRange,
    IonRippleEffect,
    IonSearchbar,
    IonSkeletonText,
    IonSpinner,
    SheetSelectComponent,
  ],
  templateUrl: './users-collections.component.html',
  styleUrl: './users-collections.component.scss',
})
export class UsersCollectionsComponent {
  selectedWhatsappUser: any = null;
  isLoading = false;
  isDeleting = false;
  searchTerm = '';
  users: any[] = [];
  filteredUsers: any[] = [];
  selectedDeleteId: string | null = null;
  currentPage = 1;
  pageSize = 10;
  totalPages = 1;
  selectedBill: any = null;
  showCollectModal = false;
  showReceiptModal = false;
  userName: string = '';
  role: any;
  sublocality: string = '';
  subArea: string = '';
  subInternetArea: any[] = [];
  internetAreas: any[] = [];
  collectionForm = {
    method: '',
    collected_id: '',
    collected_amount: '',
    bank_name: '',
  };

  receiptData: any = null;
  selectedStatus: 'all' | 'paid' | 'unpaid' | 'advance' | 'remaining' = 'paid';

  /** Collection columns only make sense where settled bills can appear. */
  get showCollectionColumns(): boolean {
    return (
      this.selectedStatus === 'paid' ||
      this.selectedStatus === 'remaining' ||
      this.selectedStatus === 'all'
    );
  }
  nextMonths: { month: string; year: string }[] = [];
  operatorSublocalities: string[] = [];
  recoveryOfficers: any[] = [];
  selectedOfficer = '';
  officerSublocalities: string[] = [];

  get areaOptions(): { sublocality: string }[] {
    if (this.role !== 'admin') {
      return this.operatorSublocalities.map((s) => ({ sublocality: s }));
    }
    // Admin picked a recovery officer - offer only his assigned areas
    if (this.selectedOfficer) {
      return this.officerSublocalities.map((s) => ({ sublocality: s }));
    }
    return this.internetAreas;
  }
  summary = {
    totalUsers: 0,
    totalBillAmount: 0,
    totalPaidUsers: 0,
    totalPaidAmount: 0,
    totalUnpaidUsers: 0,
    totalUnpaidAmount: 0,
    totalAdvanceUsers: 0,
    totalAdvanceAmount: 0,
    totalRemainingUsers: 0,
    totalRemainingAmount: 0,
  };
  companyDetail: any = {};
  showAdvanceModal = false;
  advanceForm = {
    method: '',
    collected_id: '',
    bank_name: '',
    amount: '',
    months: [] as { month: string; year: string }[],
  };
  isBulkMode = false;
  selectedBulkBills: any[] = [];
  isBulkSubmitting = false;
  userForm: FormGroup;
  internetOriginalPrice = 0;
  /** Opens on the current month, e.g. 'october'; null = all months. */
  selectedMonth: string | null = new Date()
    .toLocaleString('en-US', { month: 'long' })
    .toLowerCase();
  /** '' = everyone; 'active' also takes customers with no status set. */
  customerStatus: '' | 'active' | 'inactive' = '';
  paymentRecievedTemplate: any;
  paymentReminderTemplate: any;
  overdue: any;

  constructor(
    private firestore: Firestore,
    private toastr: ToastrService,
    private modalService: NgbModal,
    private fb: FormBuilder,
    private templateMapper: TemplateMapperService,
    public printer: BluetoothService,
    private fileShare: FileShareService,
  ) {
    registerPageRefresh(() => this.refreshData());
    this.userForm = this.fb.group({
      select_package: [null, [Validators.required]],
      internet_package_fee: [null, [Validators.required]],
      previous_remaining: [null],
      previous_remaining_month: [null],
    });
  }

  /** Top-bar refresh: reloads what opening the screen loads, filters kept. */
  refreshData() {
    return Promise.all([
      this.loadUsers(),
      this.loadInternetAreas(),
      this.loadSubInternetAreas(),
      this.loadRecoveryOfficers(),
      this.loadCompanyDetails(),
      this.loadInternetPackages(),
    ]);
  }

  async ngOnInit() {
    this.userName = localStorage.getItem('username') || '';
    this.role = localStorage.getItem('role') || '';

    if (this.role === 'operator') {
      this.operatorSublocalities = JSON.parse(
        localStorage.getItem('sublocality') || '[]',
      );
    }

    this.loadInternetAreas();
    this.loadSubInternetAreas();
    this.loadRecoveryOfficers();
    this.loadUsers();
    this.loadCompanyDetails();
    this.loadInternetPackages();
    this.paymentRecievedTemplate = await this.getTemplate('paymentReceived');
    this.paymentReminderTemplate = await this.getTemplate('paymentReminder');
    this.overdue = await this.getTemplate('overdue');
    // INTERNET PACKAGE
    this.userForm.get('select_package')?.valueChanges.subscribe((pkgName) => {
      const pkg = this.internetPackages.find((p) => p.package_name === pkgName);

      if (!pkg) return;

      this.internetOriginalPrice = Number(pkg.sales_price);

      this.userForm.patchValue({
        internet_package_fee: this.internetOriginalPrice,
        internet_discount: '',
      });
    });
  }

  async loadInternetPackages() {
    try {
      const ref = doc(this.firestore, 'internetPackage', 'internetPackageDoc');
      const snap = await getDoc(ref);

      if (snap.exists()) {
        this.internetPackages = snap.data()?.['internetPackage'] || [];
      }
    } catch (error) {
      console.error('Error loading internet packages', error);
    }
  }

  async loadCompanyDetails() {
    try {
      const ref = doc(this.firestore, 'companyDetail', 'companyDetail');
      const snap = await getDoc(ref);

      if (snap.exists()) {
        this.companyDetail = snap.data();
      }
    } catch (err) {
      console.error(err);
      this.toastr.error('Failed to load company details');
    }
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

  async loadSubInternetAreas() {
    try {
      const ref = doc(this.firestore, 'internetSubArea', 'internetSubAreaDoc');
      const snap = await getDoc(ref);

      if (snap.exists()) {
        this.subInternetArea = snap.data()?.['internetSubAreas'] || [];
        this.subInternetArea.sort((a: any, b: any) =>
          a.sub_area.localeCompare(b.sub_area),
        );
      }
    } catch (error) {
      console.error('Error loading sub internet areas', error);
    }
  }

  // Only field operators are listed - admins are not assigned collection areas
  async loadRecoveryOfficers() {
    try {
      const snap = await getDocs(collection(this.firestore, 'recoveryOfficer'));

      this.recoveryOfficers = snap.docs
        .map((d) => ({ ...d.data(), id: d.id }) as any)
        .filter((o) => o.role === 'operator')
        // Picker label: full name when set, else the login name.
        .map((o) => ({ ...o, display_name: o.name || o.user_name }))
        .sort((a, b) =>
          String(a.display_name).localeCompare(String(b.display_name)),
        );
    } catch (error) {
      console.error('Error loading recovery officers', error);
    }
  }

  get filteredSubAreas(): { sub_area: string }[] {
    if (!this.sublocality) return this.subInternetArea;

    const subAreasInArea = new Set(
      this.users
        .filter((u) => u.sublocality === this.sublocality && u.sub_area)
        .map((u) => u.sub_area as string),
    );

    return this.subInternetArea.filter((s) => subAreasInArea.has(s.sub_area));
  }

  onAreaChange() {
    this.subArea = '';
    this.onFilterChange();
  }

  onOfficerChange() {
    const officer = this.recoveryOfficers.find(
      (o) => o.user_name === this.selectedOfficer,
    );

    this.officerSublocalities = [...(officer?.sublocality || [])].sort(
      (a: string, b: string) => a.localeCompare(b),
    );

    // The area list is now scoped to him - drop a selection he does not cover
    if (
      this.sublocality &&
      !this.officerSublocalities.includes(this.sublocality)
    ) {
      this.sublocality = '';
    }
    this.subArea = '';
    this.currentPage = 1;
    this.onFilterChange();
  }

  get pagedUsers() {
    const start = (this.currentPage - 1) * this.pageSize;
    const end = start + this.pageSize;
    return this.filteredUsers.slice(start, end);
  }

  async loadUsers() {
    this.isLoading = true;

    try {
      const usersRef = collection(this.firestore, 'users');
      const snapshot = await getDocs(usersRef);

      const paidRows: any[] = [];
      const unpaidMap = new Map<string, any>();
      const advanceRows: any[] = [];
      // Users whose old-method bills get linked below, saved once the list shows
      const carryFixes: string[] = [];

      snapshot.docs.forEach((docSnap) => {
        const user = docSnap.data();
        const userDocId = docSnap.id;

        let bills = user['bills'] || [];
        const advances = user['advancePayments'] || [];

        // Bills made before carry tracking: a month already included in a later
        // bill is linked to it (same check as Bill Creator's fix), so it is not
        // listed twice and is closed once that later bill is paid.
        const linkedBills = bills.map((b: any) => ({ ...b }));
        if (linkUntrackedCarries(linkedBills, this.carryFees(user)).linked) {
          bills = linkedBills;
          carryFixes.push(userDocId);
        }

        /* ================= BILLS ================= */
        bills.forEach((bill: any) => {
          // Balance moved into a later bill - it is collected there, not twice.
          // A part-paid one still lists its collection, with nothing left due.
          if (isCarried(bill)) {
            if (!(Number(bill.collected_amount) > 0)) return;
            bill = { ...bill, remaining_amount: 0 };
          }

          const baseRow = {
            user_name: user['user_name'],
            internet_id: user['internet_id'],
            docId: userDocId,
            address: user['address'],
            sublocality: user['sublocality'] || '',
            sub_area: user['sub_area'] || '',
            connection_type: bill.type,
            createdAt: bill.createdAt,
            installationDate: user['installation_date'],
            advancePayments: advances || [],
            select_package: user['select_package'],
            internet_package_fee: user['internet_package_fee'],
            extra_advance: user['extra_advance'] || 0,
            phone_no: user['phone_no'],
            mobile_no: user['mobile_no'],
            customer_status: user['customer_status'] || '',
          };

          if (bill.status === 'paid') {
            paidRows.push({
              ...baseRow,
              month: bill.month,
              year: bill.year,
              amount: bill.amount,
              status: 'paid',
              bill_id: bill.bill_id,
              collected_amount: bill.collected_amount,
              remaining_amount: bill.remaining_amount || 0,
              extra_amount: bill.extra_amount || 0,
              extra_advance: user['extra_advance'] || 0,
              collected_method: bill.collected_method,
              collected_by: bill.collected_by,
              collected_date: bill.collected_date,
              collected_bank: bill.collected_bank,
              advancePayments: advances || [],
              phone_no: user['phone_no'],
              mobile_no: user['mobile_no'],
            });
          } else {
            const key = `${user['internet_id']}_${bill.month}_${bill.year}`;

            if (!unpaidMap.has(key)) {
              unpaidMap.set(key, {
                ...baseRow,
                status: 'unpaid',
                amount: bill.amount,
                collected_amount: Number(bill.collected_amount || 0),
                remaining_amount:
                  Number(bill.amount) - Number(bill.collected_amount || 0),
                months: [`${bill.month} ${bill.year}`],
                bills: [bill],
                advancePayments: advances || [],

              });
            } else {
              // const existing = unpaidMap.get(key);
              // existing.amount = bill.amount;
              // existing.months.push(`${bill.month} ${bill.year}`);
              // existing.bills.push(bill);
              const existing = unpaidMap.get(key);

              // ✅ amount add karo
              existing.amount += bill.amount;
              existing.collected_amount += Number(bill.collected_amount || 0);
              existing.remaining_amount +=
                Number(bill.amount) - Number(bill.collected_amount || 0);

              // ✅ month already same hai (key me hai), so no need push

              // ✅ bills push karo
              existing.bills.push(bill);

              // ✅ type check karo
              if (existing.connection_type !== bill.type) {
                existing.connection_type = 'both';
              }
            }
          }
        });

        /* ================= ADVANCE PAYMENTS ================= */
        advances.forEach((adv: any) => {
          if (!adv.isAdvance) return;

          const advanceMonthText = (adv.advance_months || [])
            .map((m: any) => `${m.month} ${m.year}`)
            .join(', ');

          advanceRows.push({
            user_name: user['user_name'],
            internet_id: user['internet_id'],
            docId: userDocId,
            address: user['address'],
            sublocality: user['sublocality'] || '',
            sub_area: user['sub_area'] || '',
            connection_type: user['connection_type'],
            createdAt: adv.collected_date,
            phone_no: user['phone_no'],
            mobile_no: user['mobile_no'],
            customer_status: user['customer_status'] || '',

            month: advanceMonthText,
            year: '',
            extra_advance: user['extra_advance'] || 0,
            amount: adv.advance_amount + (user['extra_advance'] || 0),
            status: 'advance',

            advance_id: adv.advance_id,
            collected_amount: adv.advance_amount,
            collected_method: adv.collected_method,
            collected_by: adv.collected_by,
            collected_date: adv.collected_date,
            collected_bank: adv.collected_bank,
            advancePayments: [adv],
          });
        });
      });

      if (carryFixes.length) this.saveCarryLinks(carryFixes);

      const unpaidRows = Array.from(unpaidMap.values()).map((u) => ({
        ...u,
        month: u.months.join(', '),
        year: '',
      }));

      /* 🔥 INCLUDE ADVANCE ROWS */
      this.users = [...paidRows, ...unpaidRows, ...advanceRows];

      this.users.sort((a, b) => {
        const getNumericPrefix = (id: string) => {
          if (!id) return 0;
          const match = id.match(/^0*(\d+)/);
          return match ? parseInt(match[1], 10) : 0;
        };

        const numA = getNumericPrefix(a.internet_id);
        const numB = getNumericPrefix(b.internet_id);

        return numA - numB;
      });

      this.filteredUsers = this.users;
      this.onFilterChange();
    } catch (err) {
      console.error(err);
      this.toastr.error('Failed to load users bills');
    } finally {
      this.isLoading = false;
    }
  }

  /** Monthly fee per bill type - what an old-method bill added on top of a carried balance. */
  private carryFees(user: any): Record<string, number> {
    return {
      cable: Number(user?.['cable_package_fee']) || 0,
      internet: Number(user?.['internet_package_fee']) || 0,
    };
  }

  private savingCarryLinks = false;

  /**
   * Saves the links loadUsers found. Each user is re-read and written in a
   * transaction, so a payment saved meanwhile from another phone is never
   * overwritten. Skipped offline - anything left is retried on the next load.
   */
  private async saveCarryLinks(userIds: string[]) {
    if (this.savingCarryLinks || !navigator.onLine) return;

    this.savingCarryLinks = true;
    try {
      for (const id of userIds) {
        const ref = doc(this.firestore, 'users', id);
        try {
          await runTransaction(this.firestore, async (tx) => {
            const snap = await tx.get(ref);
            if (!snap.exists()) return;

            const data = snap.data();
            const bills = data['bills'] || [];
            if (linkUntrackedCarries(bills, this.carryFees(data)).linked) {
              tx.update(ref, { bills });
            }
          });
        } catch (err) {
          console.error('Could not link carried bills for user', id, err);
        }
      }
    } finally {
      this.savingCarryLinks = false;
    }
  }

  onSearch() {
    const term = this.searchTerm.toLowerCase();

    this.filteredUsers = this.users.filter(
      (user) =>
        user.user_name?.toLowerCase().includes(term) ||
        user.internet_id?.toLowerCase().includes(term) ||
        user.address?.toLowerCase().includes(term),
    );

    this.currentPage = 1;
    this.updateTotalPages();
  }

  // in component
  getAdvanceButtonDisabled(row: any): boolean {
    const disabled = this.isAdvanceButtonDisabled(row);
    return disabled;
  }

  isAdvanceButtonDisabled(row: any): boolean {
    if (!row.advancePayments || row.advancePayments.length === 0) return false;

    const now = new Date();
    const currentMonth = now.getMonth(); // 0 = Jan
    const currentYear = now.getFullYear();

    const monthNames = [
      'january',
      'february',
      'march',
      'april',
      'may',
      'june',
      'july',
      'august',
      'september',
      'october',
      'november',
      'december',
    ];

    return row.advancePayments.some((adv: any) => {
      if (!adv.advance_months || adv.advance_months.length === 0) return false;

      return adv.advance_months.some((m: any) => {
        const monthIndex = monthNames.indexOf(m.month.toLowerCase());
        const yearNum = Number(m.year);
        if (monthIndex === -1 || isNaN(yearNum)) return false;

        // disable if advance for current month or future months
        if (yearNum > currentYear) return true;
        if (yearNum === currentYear && monthIndex >= currentMonth) return true;

        return false;
      });
    });
  }

  onFilterChange() {
    const term = this.searchTerm.toLowerCase();

    this.filteredUsers = this.users.filter((user) => {
      const matchesSearch =
        user.user_name?.toLowerCase().includes(term) ||
        user.internet_id?.toLowerCase().includes(term) ||
        user.address?.toLowerCase().includes(term);

      // const matchesStatus =
      //   !this.selectedStatus || user.status === this.selectedStatus;

      // 'all' keeps every row; 'remaining' is a paid bill with money still due
      const matchesStatus =
        !this.selectedStatus || this.selectedStatus === 'all'
          ? true
          : this.selectedStatus === 'remaining'
            ? user.status === 'paid' && (user.remaining_amount || 0) > 0
            : user.status === this.selectedStatus;


      // Normalize sublocality to an array
      const userSublocalities: string[] = Array.isArray(user.sublocality)
        ? user.sublocality
        : user.sublocality
          ? [user.sublocality]
          : [];

      // Recovery officer selected - keep only users in his assigned areas
      if (this.selectedOfficer) {
        const inOfficerAreas = userSublocalities.some((sub) =>
          this.officerSublocalities.includes(sub),
        );
        if (!inOfficerAreas) return false;
      }

      const matchesMonth =
        !this.selectedMonth || user.month?.toLowerCase().includes(this.selectedMonth);
      const matchesSubArea = !this.subArea || user.sub_area === this.subArea;
      // Blank status counts as active, as in the bill creator.
      const matchesCustomerStatus =
        !this.customerStatus ||
        (user.customer_status === 'inactive') === (this.customerStatus === 'inactive');
      let matchesSublocality = true;

      if (this.role === 'operator') {
        // Operator sees only their assigned sublocalities
        const overlap = userSublocalities.filter((sub) =>
          this.operatorSublocalities.includes(sub),
        );
        if (!overlap.length) return false; // no match, skip user

        // If operator also selected a sublocality from dropdown, filter further
        if (this.sublocality) {
          matchesSublocality = overlap.includes(this.sublocality);
        } else {
          matchesSublocality = true; // no dropdown selection, all operator sublocalities
        }
      } else {
        // Admin filter by dropdown if selected
        matchesSublocality =
          !this.sublocality || userSublocalities.includes(this.sublocality);
      }

      return (
        matchesSearch && matchesStatus && matchesSublocality && matchesMonth && matchesSubArea &&
        matchesCustomerStatus
      );
    });

    // this.currentPage = 1;
    this.updateTotalPages();

    const filtered = this.filteredUsers;

    this.summary.totalUsers = filtered.length;
    this.summary.totalBillAmount = filtered.reduce(
      (sum, u) => sum + (u.amount || 0),
      0,
    );

    const paidUsers = filtered.filter((u) => u.status === 'paid');

    this.summary.totalPaidUsers = paidUsers.length;

    this.summary.totalPaidAmount = paidUsers.reduce(
      (sum, u) => sum + (u.collected_amount || 0),
      0,
    );

    const unpaidUsers = filtered.filter((u) => u.status === 'unpaid');
    this.summary.totalUnpaidUsers = unpaidUsers.length;
    this.summary.totalUnpaidAmount = unpaidUsers.reduce(
      (sum, u) => sum + (u.amount || 0),
      0,
    );

    const advanceUsers = filtered.filter((u) => u.status === 'advance');

    this.summary.totalAdvanceUsers = advanceUsers.length;
    this.summary.totalAdvanceAmount = advanceUsers.reduce(
      (sum, u) => sum + (u.amount || 0),
      0,
    );

    const remainingUsers = filtered.filter(
      (u) => u.status === 'paid' && (u.remaining_amount || 0) > 0,
    );

    this.summary.totalRemainingUsers = remainingUsers.length;
    this.summary.totalRemainingAmount = remainingUsers.reduce(
      (sum, u) => sum + (u.remaining_amount || 0),
      0,
    );
  }

  async quickCashPay(bill: any) {
    if (this.isSubmitting) return;
    this.selectedBill = { ...bill, userDocId: bill.docId };

    this.collectionForm = {
      method: 'cash',
      collected_id: '',
      collected_amount:
        bill.remaining_amount > 0 ? bill.remaining_amount : bill.amount,
      bank_name: '',
    };

    await this.submitCollection();
  }

  /**
   * Unpaid rows always, part-paid rows only on the Partial and All tabs — the
   * Paid tab is a record of settled bills, so it keeps its read-only actions.
   */
  canCollect(row: any): boolean {
    if (row?.status === 'unpaid') return true;

    return (
      (this.selectedStatus === 'remaining' || this.selectedStatus === 'all') &&
      row?.status === 'paid' &&
      Number(row?.remaining_amount || 0) > 0
    );
  }

  openCollectModal(bill: any, userDocId: string) {
    this.selectedBill = { ...bill, userDocId };
    // this.nextMonths = this.getNextMonths(bill.month, bill.year, 12);
    this.collectionForm = {
      method: '',
      collected_id: '',
      collected_amount:
        bill.remaining_amount > 0 ? bill.remaining_amount : bill.amount,
      bank_name: '',
    };
    this.showCollectModal = true;
  }
  isSubmitting = false;

  async revertBill(billRow: any) {
    try {
      // 🔹 Use doc() for a specific user
      const userDocRef = doc(this.firestore, 'users', billRow.docId);
      const userSnap = await getDoc(userDocRef);

      if (!userSnap.exists()) return;

      const userData = userSnap.data();
      const bills = userData['bills'] || [];

      let updated = false;

      // Its unpaid part already sits on a later bill - reverting would lose it.
      const carried = bills.find(
        (b: any) => b.bill_id && b.bill_id === billRow.bill_id && isCarried(b),
      );
      if (carried) {
        this.toastr.warning(
          `This bill's balance was moved to the ${carriedToLabel(carried)} bill, so it can't be reverted`,
        );
        return;
      }

      bills.forEach((bill: any) => {
        if (
          bill.status === 'paid' &&
          ((bill.bill_id && bill.bill_id === billRow.bill_id) ||
            (!bill.bill_id &&
              bill.amount === billRow.amount &&
              bill.month === billRow.month &&
              bill.year === billRow.year))
        ) {
          // Earlier months closed by this payment are owed again
          unsettleCarried(bills, bill.bill_id);

          // 🔁 revert
          bill.status = 'unpaid';
          bill.collected_by = null;
          bill.collected_date = null;
          bill.collected_method = null;
          bill.collected_id = null;
          bill.collected_amount = null;
          bill.collected_bank = null;
          bill.remaining_amount = null;
          bill.extra_amount = null;

          updated = true;
        }
      });

      if (updated) {
        updateDoc(userDocRef, { bills });
      }

      if (!navigator.onLine) {
        this.toastr.info(
          'Saved offline. Will sync when connection is restored.',
        );
      } else {
        this.toastr.success('Bill reverted to unpaid');
      }
      this.loadUsers();
    } catch (error) {
      console.error(error);
      this.toastr.error('Failed to revert bill');
    }
  }

  openReceiptModal(bill: any) {
    this.selectedBill = bill;

    // Overpayment saved on the bill at collection time. Bills collected before
    // that was stored only have the user's advance balance, which is what the
    // Remaining column shows for them.
    const extraAmount = Number(bill.extra_amount) || 0;
    const advanceBalance =
      !extraAmount && !(Number(bill.remaining_amount) > 0)
        ? Number(bill.extra_advance) || 0
        : 0;

    this.receiptData = {
      name: bill.user_name,
      month: bill.month,
      year: bill.year,
      address: this.selectedBill.address,
      area: this.receiptArea(bill),
      phone_no: this.selectedBill.phone_no,
      advance: '',
      totalAmount: bill.amount,
      method: bill.collected_method ?? 'cash',
      // Bills paid before collected_amount existed are fully paid by definition.
      collectedAmount:
        (Number(bill.collected_amount ?? bill.amount) || 0) + extraAmount,
      remainingAmount: Number(bill.remaining_amount) || 0,
      extraAmount,
      advanceBalance,
      date: bill.collected_date
        ? bill.collected_date.toDate?.() || bill.collected_date
        : new Date(),
      collectedBy: bill.collected_by ?? '—',
      bank: bill.collected_bank ?? '',
      internetId: bill.internet_id,
      installationDate: this.selectedBill.installationDate,
    };
    console.log('Receipt Data:', this.selectedBill);

    this.showReceiptModal = true;
  }

  /** Area, then sub-area when there is one; blank hides the receipt line. */
  private receiptArea(row: any): string {
    return [row?.sublocality, row?.sub_area].filter(Boolean).join(', ');
  }

  // Arrears settled by the payment being receipted, captured before the bill clears them.
  arrearsPaid = 0;
  arrearsMonth: string | null = null;

  captureArrearsForReceipt(bill: any) {
    const amount = Number(bill.previous_remaining || 0);
    if (amount > 0) {
      this.arrearsPaid = amount;
      this.arrearsMonth = bill.previous_remaining_month || null;
    }
  }

  prepareReceipt() {
    const bill = this.selectedBill;

    let totalAmount = 0;

    if (bill.bills && bill.bills.length) {
      bill.bills.forEach((b: any) => {
        totalAmount += Number(b.amount || 0);
      });
    } else {
      totalAmount = Number(bill.amount) || 0;
    }

    // Paid over the bill: the bill is capped at its amount and the rest went
    // to advance, so add it back to show what was actually received.
    const extraAmount = Number(bill.extra_amount) || 0;

    this.receiptData = {
      name: bill.user_name,
      month: bill.month,
      year: bill.year,
      previousAmount: this.arrearsPaid,
      previousMonth: this.arrearsMonth,
      currentAmount: totalAmount - this.arrearsPaid,
      address: this.selectedBill.address,
      area: this.receiptArea(bill),
      advance: '',
      totalAmount,
      phone_no: this.selectedBill.phone_no,
      collectedAmount: (Number(bill.collected_amount) || 0) + extraAmount,
      remainingAmount: Number(bill.remaining_amount) || 0,
      extraAmount,
      internetId: bill.internet_id,
      installationDate: this.selectedBill.installationDate,
      method: this.collectionForm.method,
      date: new Date(),
      collectedBy: this.userName,
      bank: this.collectionForm.bank_name || '',
    };

    console.log('Receipt Data:', this.receiptData);
  }

  /** Which receipt action is running: its button spins and repeat taps are ignored. */
  receiptBusy: 'save' | 'share' | null = null;

  async saveReceiptImage() {
    const receipt = document.getElementById('receipt');
    if (!receipt || this.receiptBusy) return;

    this.receiptBusy = 'save';
    try {
      const image = await this.fileShare.capture(receipt);
      const folder = await this.fileShare.save(
        image,
        this.fileShare.fileName('receipt', this.receiptData?.internetId, 'png'),
      );
      this.toastr.success(`Receipt saved to ${folder}`);
    } catch (err) {
      console.error('Error saving receipt:', err);
      this.toastr.error('Could not save the receipt');
    } finally {
      this.receiptBusy = null;
    }
  }

  printReceipt() {
    // Make sure modal is visible
    if (!this.showReceiptModal) {
      console.warn('Receipt modal is not visible');
      return;
    }

    // Target the modal body
    const receipt = document.getElementById('receipt');
    if (!receipt) {
      console.warn('Receipt element not found');
      return;
    }

    // Use html2canvas with proper options
    html2canvas(receipt, {
      scale: 2, // Higher resolution
      useCORS: true, // For external images, if any
      backgroundColor: '#fff', // Force white background
    })
      .then((canvas) => {
        const dataUrl = canvas.toDataURL('image/png');

        const printWindow = window.open('', '', 'height=600,width=400');
        if (!printWindow) return;

        printWindow.document.write(`
      <html>
        <head>
          <title>Receipt</title>
          <style>
            body { margin: 0; padding: 0; text-align: center; }
            img { max-width: 100%; height: auto; }
          </style>
        </head>
        <body>
          <img src="${dataUrl}" />
        </body>
      </html>
    `);

        printWindow.document.close();
        printWindow.focus();

        setTimeout(() => {
          printWindow.print();
          printWindow.close();
        }, 200);
      })
      .catch((err) => {
        console.error('Error printing receipt:', err);
      });
  }

  /** Sends the receipt image to the customer's WhatsApp chat. */
  async shareReceiptImage() {
    const receipt = document.getElementById('receipt');
    if (!receipt || this.receiptBusy) return;

    this.receiptBusy = 'share';
    try {
      const phone = this.resolveUserPhone(this.receiptData);
      const image = await this.fileShare.capture(receipt);
      const result = await this.fileShare.shareToWhatsApp(
        image,
        this.fileShare.fileName('receipt', this.receiptData?.internetId, 'png'),
        {
          phone: phone ? this.formatPhoneNumber(phone) : '',
          text: `Payment receipt - ${this.receiptData?.name} (#${this.receiptData?.internetId})`,
        },
      );
      if (result === 'downloaded') {
        this.toastr.info('Receipt downloaded - attach it in the WhatsApp chat');
      }
    } catch (err) {
      console.error('Error sharing receipt:', err);
      this.toastr.error('Could not share the receipt');
    } finally {
      this.receiptBusy = null;
    }
  }

  toggleAdvanceMonthSeparate(monthObj: { month: string; year: string }) {
    const index = this.advanceForm.months.findIndex(
      (m) => m.month === monthObj.month && m.year === monthObj.year,
    );

    if (index > -1) {
      this.advanceForm.months.splice(index, 1);
    } else {
      this.advanceForm.months.push(monthObj);
    }

    this.advanceForm.amount = String(
      this.advanceForm.months.length * this.packageFee,
    );
  }

  getNextMonths(startMonth: string, startYear?: string, count: number = 12) {
    const months = [
      'january',
      'february',
      'march',
      'april',
      'may',
      'june',
      'july',
      'august',
      'september',
      'october',
      'november',
      'december',
    ];

    let result: { month: string; year: string }[] = [];

    // STEP 1: comma handle karo
    // "february 2026, january 2026" → "january 2026"
    const normalized = startMonth.includes(',')
      ? startMonth.split(',').pop()!.trim()
      : startMonth.trim();

    let monthName = '';
    let year: number;

    // STEP 2: check karo year string ke andar hai ya nahi
    const parts = normalized.split(' ');

    if (parts.length === 2) {
      // case: "february 2026"
      monthName = parts[0].toLowerCase();
      year = parseInt(parts[1], 10);
    } else if (parts.length === 1 && startYear) {
      // case: "february" + "2026"
      monthName = parts[0].toLowerCase();
      year = parseInt(startYear, 10);
    } else {
      console.error('Invalid month/year', startMonth, startYear);
      return [];
    }

    const mIndexStart = months.indexOf(monthName);
    if (mIndexStart === -1 || isNaN(year)) {
      console.error('Invalid month/year', startMonth, startYear);
      return [];
    }

    let mIndex = mIndexStart;

    for (let i = 1; i <= count; i++) {
      mIndex++;
      if (mIndex > 11) {
        mIndex = 0;
        year++;
      }
      result.push({ month: months[mIndex], year: year.toString() });
    }

    return result;
  }

  openUserDetails(docId: string) {
    // Full-screen sheet on phones, centered dialog from tablet width up.
    const modalRef = this.modalService.open(UserCollectionModalComponent, {
      size: 'lg',
      fullscreen: 'md',
      windowClass: 'mk-sheet-window',
    });
    modalRef.componentInstance.docId = docId;
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

  packageFee: any;
  openAdvanceModal(row: any) {
    this.selectedBill = row;

    this.packageFee =
      Number(row.internet_package_fee) || Number(row.cable_package_fee);
    console.log('Selected Bill MOnth:', row.month, row.year);
    this.nextMonths = this.getNextMonths(row.month, row.year, 12);

    this.advanceForm = {
      method: '',
      collected_id: '',
      bank_name: '',
      amount: '',
      months: [],
    };

    this.showAdvanceModal = true;
  }

  async submitAdvance() {
    this.isLoadingAdvance = true;
    try {
      const ref = doc(this.firestore, 'users', this.selectedBill.docId);
      const snap = await getDoc(ref);

      if (!snap.exists()) return;

      const userData = snap.data();
      const advancePayments = userData['advancePayments'] || [];

      const totalBill = this.advanceForm.months.length * this.packageFee;

      const paidAmount = Number(this.advanceForm.amount);

      // ✅ extra advance
      let extraAdvance = 0;

      if (paidAmount > totalBill) {
        extraAdvance = paidAmount - totalBill;
      }

      const advanceAmountToSave =
        paidAmount > totalBill ? totalBill : paidAmount;

      const existingExtraAdvance = Number(userData['extra_advance']) || 0;

      advancePayments.push({
        advance_id: crypto.randomUUID(),
        advance_amount: advanceAmountToSave,
        advance_months: this.advanceForm.months,
        collected_by: this.userName,
        collected_method: this.advanceForm.method,
        collected_id: this.advanceForm.collected_id || null,
        collected_bank:
          this.advanceForm.method === 'bank'
            ? this.advanceForm.bank_name
            : null,
        collected_date: new Date(),
        isAdvance: true,
      });

      updateDoc(ref, {
        advancePayments,
        extra_advance: existingExtraAdvance + extraAdvance,
      });

      this.showAdvanceModal = false;
      this.prepareAdvanceReceipt();
      this.showReceiptModal = true;

      if (!navigator.onLine) {
        this.toastr.info(
          'Saved offline. Will sync when connection is restored.',
        );
      } else {
        this.toastr.success('Advance payment saved');
      }
      this.loadUsers();
    } catch (err) {
      console.error(err);
      this.toastr.error('Advance failed');
    } finally {
      this.isLoadingAdvance = false;
    }
  }

  async revertAdvance(advanceRow: any) {
    if (!confirm('Are you sure you want to revert this advance?')) return;

    try {
      const ref = doc(this.firestore, 'users', advanceRow.docId);
      const snap = await getDoc(ref);
      if (!snap.exists()) return;

      const advancePayments = snap.data()['advancePayments'] || [];

      const updatedAdvances = advancePayments.filter(
        (adv: any) => adv.advance_id !== advanceRow.advance_id,
      );

      updateDoc(ref, { advancePayments: updatedAdvances });

      if (!navigator.onLine) {
        this.toastr.info(
          'Saved offline. Will sync when connection is restored.',
        );
      } else {
        this.toastr.success('Advance reverted successfully');
      }

      this.loadUsers();
    } catch (err) {
      console.error(err);
      this.toastr.error('Failed to revert advance');
    }
  }

  isLoadingAdvance = false;

  prepareAdvanceReceipt() {
    const monthsText = (this.advanceForm.months || [])
      .map((m: any) => `${m.month} ${m.year}`)
      .join(', ');

    // Same split as submitAdvance: anything over the selected months' fee
    // goes to extra_advance.
    const paid = Number(this.advanceForm.amount) || 0;
    const totalBill = (this.advanceForm.months || []).length * this.packageFee;
    const extraAmount = totalBill > 0 && paid > totalBill ? paid - totalBill : 0;

    this.receiptData = {
      name: this.selectedBill.user_name,
      month: monthsText,
      advance: 'Advance',
      totalAmount: extraAmount ? totalBill : this.advanceForm.amount,
      collectedAmount: paid,
      remainingAmount: 0,
      extraAmount,
      address: this.selectedBill.address,
      area: this.receiptArea(this.selectedBill),
      method: this.advanceForm.method,
      date: new Date(),
      collectedBy: this.userName,
      bank: this.advanceForm.bank_name,
      advanceMonths: this.advanceForm.months,
      internetId: this.selectedBill.internet_id,
      installationDate: this.selectedBill.installationDate,
    };
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

  startBulkMode() {
    this.isBulkMode = true;
    this.selectedBulkBills = [];
    this.bulkAmounts = {};
  }

  cancelBulkMode() {
    this.isBulkMode = false;
    this.selectedBulkBills = [];
    this.bulkAmounts = {};
  }

  toggleBulkSelection(row: any) {
    const index = this.selectedBulkBills.findIndex(
      (b) => b.docId === row.docId && b.month === row.month,
    );

    if (index > -1) {
      this.selectedBulkBills.splice(index, 1);
      delete this.bulkAmounts[this.bulkKey(row)];
    } else {
      this.selectedBulkBills.push(row);
    }
  }

  /**
   * Amount received per selected row in bulk mode, e.g. 2000 against a 2100
   * bill. Only rows the collector edited have an entry — the rest are still
   * collected in full, exactly as before.
   */
  bulkAmounts: Record<string, number | null> = {};

  bulkKey(row: any): string {
    return `${row.docId}_${row.month}`;
  }

  getBulkPending(row: any): number {
    return (
      Number(row.remaining_amount > 0 ? row.remaining_amount : row.amount) || 0
    );
  }

  getBulkAmount(row: any): number | null {
    const key = this.bulkKey(row);
    return key in this.bulkAmounts
      ? this.bulkAmounts[key]
      : this.getBulkPending(row);
  }

  setBulkAmount(row: any, value: any) {
    this.bulkAmounts[this.bulkKey(row)] =
      value === '' || value === null || value === undefined
        ? null
        : Number(value);
  }

  /** Received minus pending: negative is left on the bill, positive goes to advance. */
  getBulkDifference(row: any): number {
    return Number(this.getBulkAmount(row) || 0) - this.getBulkPending(row);
  }

  get bulkTotal(): number {
    return this.selectedBulkBills.reduce(
      (sum, row) => sum + (Number(this.getBulkAmount(row)) || 0),
      0,
    );
  }

  isSelected(row: any): boolean {
    return this.selectedBulkBills.some(
      (b) => b.docId === row.docId && b.month === row.month,
    );
  }

  async submitCollection() {
    if (this.isSubmitting) return;

    this.isSubmitting = true;
    try {
      // Reset per-collection so a previous receipt's arrears don't leak into this one
      this.arrearsPaid = 0;
      this.arrearsMonth = null;

      const collectedNow = Number(this.collectionForm.collected_amount || 0);
      const userDocRef = doc(
        this.firestore,
        'users',
        this.selectedBill.userDocId,
      );
      const userSnap = await getDoc(userDocRef);

      if (!userSnap.exists()) return;

      const userData = userSnap.data();
      const bills = userData['bills'] || [];
      let existingAdvance = Number(userData['extra_advance'] || 0);

      // Old-method bill that already includes earlier months: link them, so
      // paying this bill in full closes them too (see loadUsers)
      const payingIds = new Set<string>(
        (this.selectedBill.bills || [this.selectedBill])
          .map((b: any) => b.bill_id)
          .filter(Boolean),
      );
      linkUntrackedCarries(bills, this.carryFees(userData), payingIds);
      let newAdvanceTotal = existingAdvance;
      let updatedSelectedBill: any = null;

      // if (this.selectedBill.status === 'unpaid' && this.selectedBill.bills) {
      //   bills.forEach((bill: any) => {
      //     const match = this.selectedBill.bills.some((b: any) =>
      //       b.bill_id
      //         ? b.bill_id === bill.bill_id
      //         : b.month === bill.month &&
      //           b.year === bill.year &&
      //           b.amount === bill.amount,
      //     );

      //     if (match) {
      //       const paidNow = Number(this.collectionForm.collected_amount || 0);
      //       const total = Number(bill.amount);
      //       const alreadyPaid = Number(bill.collected_amount || 0);

      //       const newCollected = alreadyPaid + paidNow;
      //       const remaining = total - newCollected;
      //       let extraAdvance = 0;

      //       if (newCollected > total) {
      //         extraAdvance = newCollected - total;

      //         // 🔥 ADD THIS
      //         newAdvanceTotal += extraAdvance;
      //       }

      //       bill.collected_amount = newCollected;
      //       bill.remaining_amount = remaining > 0 ? remaining : 0;
      //       bill.status = 'paid';
      //       bill.collected_by = this.userName;
      //       bill.collected_date = new Date();
      //       bill.collected_method = this.collectionForm.method;
      //       bill.collected_id = this.collectionForm.collected_id;
      //       bill.collected_bank =
      //         this.collectionForm.method === 'bank'
      //           ? this.collectionForm.bank_name
      //           : null;
      //       updatedSelectedBill = { ...bill };
      //       // 🔹 NEW ADDITION: adjust payment against previous pending bills
      //       let adjustAmount = Number(
      //         this.collectionForm.collected_amount || 0,
      //       );

      //       bills
      //         .filter(
      //           (b: any) =>
      //             b.type === bill.type &&
      //             b.remaining_amount > 0 &&
      //             b.createdAt.toDate() < bill.createdAt.toDate(),
      //         )
      //         .sort(
      //           (a: any, b: any) => a.createdAt.toDate() - b.createdAt.toDate(),
      //         )
      //         .forEach((prevBill: any) => {
      //           if (adjustAmount <= 0) return;

      //           const reduce = Math.min(
      //             prevBill.remaining_amount,
      //             adjustAmount,
      //           );
      //           prevBill.remaining_amount -= reduce;
      //           adjustAmount -= reduce;

      //           if (prevBill.remaining_amount === 0) {
      //             prevBill.status = 'paid';
      //           }
      //         });
      //     }
      //   });
      // }
      if (this.selectedBill.status === 'unpaid' && this.selectedBill.bills) {
        let remainingPayment = Number(
          this.collectionForm.collected_amount || 0,
        );

        // Totals across every selected bill, so the receipt shows where this row
        // stands after the payment instead of falling back to the bill amount.
        let receiptCollected = 0;
        let receiptRemaining = 0;
        let lastPaidBill: any = null;

        this.selectedBill.bills.forEach((selected: any) => {
          const bill = bills.find((b: any) => b.bill_id === selected.bill_id);
          if (!bill) return;

          const total = Number(bill.amount);
          const alreadyPaid = Number(bill.collected_amount || 0);
          const pending = Math.max(total - alreadyPaid, 0);

          const pay = Math.min(pending, Math.max(remainingPayment, 0));

          if (pay > 0) {
            bill.collected_amount = alreadyPaid + pay;
            bill.remaining_amount = total - bill.collected_amount;

            // A collected bill leaves the unpaid list even when part of it is
            // still due — it shows as "Partial" until remaining_amount hits 0.
            bill.status = 'paid';

            if (bill.remaining_amount === 0) {
              // Arrears are settled — keep them on the receipt, clear from the bill
              this.captureArrearsForReceipt(bill);
              bill.previous_remaining = null;
              bill.previous_remaining_month = null;
              // Earlier months whose balance was added to this bill are paid too
              settleCarried(bills, bill.bill_id);
            }

            remainingPayment -= pay;

            bill.collected_by = this.userName;
            bill.collected_date = new Date();
            bill.collected_method = this.collectionForm.method;
            bill.collected_id = this.collectionForm.collected_id;
            bill.collected_bank =
              this.collectionForm.method === 'bank'
                ? this.collectionForm.bank_name
                : null;
            lastPaidBill = bill;
          }

          const collectedSoFar = Number(bill.collected_amount || 0);
          receiptCollected += collectedSoFar;
          receiptRemaining += Math.max(total - collectedSoFar, 0);
        });

        const extraAmount = remainingPayment > 0 ? remainingPayment : 0;

        updatedSelectedBill = {
          collected_amount: receiptCollected,
          remaining_amount: receiptRemaining,
          extra_amount: extraAmount,
        };

        // ✅ extra advance
        if (extraAmount > 0) {
          newAdvanceTotal += extraAmount;
          // Kept on the bill so a reopened receipt still shows the overpayment
          if (lastPaidBill) lastPaidBill.extra_amount = extraAmount;
        }
      } else {
        bills.forEach((bill: any) => {
          // Part-paid bills are 'paid' with money still due, so status alone is
          // not enough; match on bill_id when the row carries one.
          const isTargetBill = this.selectedBill.bill_id
            ? bill.bill_id === this.selectedBill.bill_id
            : bill.month === this.selectedBill.month &&
              bill.year === this.selectedBill.year;
          const stillOwed =
            bill.status === 'unpaid' || Number(bill.remaining_amount || 0) > 0;

          if (isTargetBill && stillOwed) {
            const paidNow = Number(this.collectionForm.collected_amount || 0);
            const total = Number(bill.amount);
            const alreadyPaid = Number(bill.collected_amount || 0);

            const newCollected = alreadyPaid + paidNow;
            const remaining = total - newCollected;
            let extraAdvance = 0;

            if (newCollected > total) {
              extraAdvance = newCollected - total;

              // 🔥 ADD THIS
              newAdvanceTotal += extraAdvance;
            }

            bill.collected_amount = newCollected > total ? total : newCollected;
            bill.remaining_amount = remaining > 0 ? remaining : 0;
            // Kept on the bill so a reopened receipt still shows the overpayment
            if (extraAdvance > 0) bill.extra_amount = extraAdvance;

            bill.status = 'paid';

            if (bill.remaining_amount === 0) {
              // Arrears are settled — keep them on the receipt, clear from the bill
              this.captureArrearsForReceipt(bill);
              bill.previous_remaining = null;
              bill.previous_remaining_month = null;
              // Earlier months whose balance was added to this bill are paid too
              settleCarried(bills, bill.bill_id);
            }

            bill.collected_by = this.userName;
            bill.collected_date = new Date();
            bill.collected_method = this.collectionForm.method;
            bill.collected_id = this.collectionForm.collected_id;
            bill.collected_bank =
              this.collectionForm.method === 'bank'
                ? this.collectionForm.bank_name
                : null;
            updatedSelectedBill = { ...bill, extra_amount: extraAdvance };
            // 🔹 NEW ADDITION: adjust payment against previous pending bills
            let adjustAmount = Number(
              this.collectionForm.collected_amount || 0,
            );

            bills
              .filter(
                (b: any) =>
                  b.type === bill.type &&
                  b.remaining_amount > 0 &&
                  b.createdAt.toDate() < bill.createdAt.toDate(),
              )
              .sort(
                (a: any, b: any) => a.createdAt.toDate() - b.createdAt.toDate(),
              )
              .forEach((prevBill: any) => {
                if (adjustAmount <= 0) return;

                const reduce = Math.min(
                  prevBill.remaining_amount,
                  adjustAmount,
                );
                prevBill.remaining_amount -= reduce;
                adjustAmount -= reduce;

                if (prevBill.remaining_amount === 0) {
                  prevBill.status = 'paid';
                }
              });
          }
        });
      }

      updateDoc(userDocRef, {
        bills,
        extra_advance: newAdvanceTotal,
      });

      if (updatedSelectedBill) {
        this.selectedBill = {
          ...this.selectedBill,
          ...updatedSelectedBill,
        };
      }

      this.showCollectModal = false;
      this.prepareReceipt();
      this.showReceiptModal = true;

      // Queued online and offline alike — the SMS doc syncs with the bill.
      const smsQueued = this.autoSendPaymentSms(this.selectedBill, collectedNow);

      if (!navigator.onLine) {
        this.toastr.info(
          'Saved offline. Will sync when connection is restored.',
        );
      } else {
        this.toastr.success('Bill collected successfully');
      }

      if (smsQueued) {
        this.toastr.info('Payment SMS queued');
      } else {
        this.toastr.warning(
          'Payment SMS not sent — check the customer number and the Payment Received template',
        );
      }
      const page = this.currentPage;
      console.log('before save', page);
      this.loadUsers();
      this.currentPage = page;
      console.log('after save', this.currentPage);
    } catch (err) {
      console.error(err);
      this.toastr.error('Collection failed');
    } finally {
      this.isSubmitting = false;
    }
  }

  async submitBulkCollection() {
    if (!this.selectedBulkBills.length) return;
    console.log('selectedBulkBills:', this.selectedBulkBills);

    const missingAmount = this.selectedBulkBills.find(
      (row) => !(Number(this.getBulkAmount(row)) > 0),
    );
    if (missingAmount) {
      this.toastr.error(
        `Enter the amount received from ${missingAmount.user_name}`,
      );
      return;
    }

    this.isBulkSubmitting = true;

    try {
      // Rows that really got money collected, so only they get an SMS.
      const collected: { row: any; amount: number }[] = [];
      let partialCount = 0;

      for (const row of this.selectedBulkBills) {
        const userDocRef = doc(this.firestore, 'users', row.docId);
        const userSnap = await getDoc(userDocRef);
        if (!userSnap.exists()) continue;

        const userData = userSnap.data();
        const bills = userData['bills'] || [];
        let rowCollected = 0;

        // Same as a single collection: link the earlier months these bills include
        linkUntrackedCarries(
          bills,
          this.carryFees(userData),
          new Set<string>((row.bills || []).map((b: any) => b.bill_id).filter(Boolean)),
        );
        let lastPaidBill: any = null;

        // Amount typed for this row, spread over its bills in order.
        // null = nothing typed, so every bill is collected in full.
        const key = this.bulkKey(row);
        let budget: number | null =
          key in this.bulkAmounts ? Number(this.bulkAmounts[key]) : null;

        bills.forEach((bill: any) => {
          const match = row.bills?.some(
            (selected: any) => selected.bill_id === bill.bill_id,
          );

          if (match && bill.status === 'unpaid') {
            const total = Number(bill.amount);
            const alreadyPaid = Number(bill.collected_amount || 0);
            // Only the pending part - a part-paid bill must not be charged twice.
            const pending = Math.max(total - alreadyPaid, 0);
            const paidNow = budget === null ? pending : Math.min(pending, budget);

            // Typed amount already used up by this row's earlier bills.
            if (budget !== null && paidNow <= 0 && pending > 0) return;
            if (budget !== null) budget -= paidNow;

            const newCollected = alreadyPaid + paidNow;
            const remaining = total - newCollected;

            bill.collected_amount = newCollected;
            bill.remaining_amount = remaining > 0 ? remaining : 0;
            bill.status = 'paid';

            // Earlier months whose balance was added to this bill are paid too
            if (bill.remaining_amount === 0) settleCarried(bills, bill.bill_id);

            bill.collected_by = this.userName;
            bill.collected_date = new Date();
            bill.collected_method = 'cash';
            bill.collected_id = '';
            bill.collected_bank = null;
            lastPaidBill = bill;

            rowCollected += paidNow;

            // 🔹 Same adjustment logic as submitCollection
            let adjustAmount = paidNow;

            bills
              .filter(
                (b: any) =>
                  b.type === bill.type &&
                  b.remaining_amount > 0 &&
                  b.createdAt.toDate() < bill.createdAt.toDate(),
              )
              .sort(
                (a: any, b: any) => a.createdAt.toDate() - b.createdAt.toDate(),
              )
              .forEach((prevBill: any) => {
                if (adjustAmount <= 0) return;

                const reduce = Math.min(
                  prevBill.remaining_amount,
                  adjustAmount,
                );

                prevBill.remaining_amount -= reduce;
                adjustAmount -= reduce;

                if (prevBill.remaining_amount === 0) {
                  prevBill.status = 'paid';
                }
              });
          }
        });

        const update: any = { bills };

        if (rowCollected > 0) {
          // Received more than was due — the extra goes to advance, same as a
          // single collection.
          const extra = budget !== null ? budget : 0;
          if (extra > 0) {
            update.extra_advance = Number(userData['extra_advance'] || 0) + extra;
            rowCollected += extra;
            // Kept on the bill so its receipt shows the overpayment
            if (lastPaidBill) lastPaidBill.extra_amount = extra;
          }
        }

        updateDoc(userDocRef, update);

        if (rowCollected > 0) {
          // What this row still owes after the payment, for the SMS.
          let rowRemaining = 0;
          row.bills?.forEach((selected: any) => {
            const bill = bills.find((b: any) => b.bill_id === selected.bill_id);
            if (!bill) return;
            rowRemaining += Math.max(
              Number(bill.amount) - Number(bill.collected_amount || 0),
              0,
            );
          });

          if (rowRemaining > 0) partialCount++;

          collected.push({
            row: {
              ...row,
              collected_amount: rowCollected,
              remaining_amount: rowRemaining,
            },
            amount: rowCollected,
          });
        }
      }

      // One SMS per user, queued one by one, online and offline alike.
      let smsQueued = 0;
      for (const entry of collected) {
        if (this.autoSendPaymentSms(entry.row, entry.amount)) smsQueued++;
      }
      const smsSkipped = collected.length - smsQueued;

      if (!navigator.onLine) {
        this.toastr.info(
          'Saved offline. Will sync when connection is restored.',
        );
      } else {
        this.toastr.success('Selected bills collected successfully');
      }

      if (partialCount) {
        this.toastr.info(
          `${partialCount} user(s) paid partially — balance is in the Partial tab`,
        );
      }

      if (smsQueued) {
        this.toastr.info(`Payment SMS queued for ${smsQueued} user(s)`);
      }

      if (smsSkipped) {
        this.toastr.warning(
          `No SMS for ${smsSkipped} user(s) — missing number or template`,
        );
      }

      this.isBulkMode = false;
      this.selectedBulkBills = [];
      this.bulkAmounts = {};
      await this.loadUsers();
    } catch (err) {
      console.error(err);
      this.toastr.error('Bulk collection failed');
    } finally {
      this.isBulkSubmitting = false;
    }
  }

  showUpdateModal = false;
  internetPackages: any[] = [];
  selectedRow: any;

  monthsList = [
    'january', 'february', 'march', 'april', 'may', 'june',
    'july', 'august', 'september', 'october', 'november', 'december',
  ];

  get feeDifference(): number {
    const newFee = Number(this.userForm.value.internet_package_fee) || 0;
    const oldFee = Number(this.selectedRow?.internet_package_fee) || 0;
    return newFee - oldFee;
  }

  /** Bill amount with any previously-added arrears stripped back out. */
  get baseBillAmount(): number {
    const bill = this.selectedRow?.bills?.[0];
    return Number(bill?.amount || 0) - Number(bill?.previous_remaining || 0);
  }

  get updatedBillPreview(): number {
    const previous = Number(this.userForm.value.previous_remaining) || 0;
    return this.baseBillAmount + previous + this.feeDifference;
  }

  openUpdateModal(row: any) {
    console.log('update row data:', row);
    this.selectedRow = row;
    const bill = row.bills?.[0];
    this.userForm.patchValue({
      select_package: row.select_package,
      internet_package_fee: row.internet_package_fee,
      previous_remaining: bill?.previous_remaining ?? null,
      previous_remaining_month: bill?.previous_remaining_month ?? null,
    });
    this.showUpdateModal = true;
  }

  async updateBill() {
    if (this.userForm.invalid) {
      this.userForm.markAllAsTouched();
      return;
    }

    this.isSubmitting = true;

    try {
      const newPackage = this.userForm.value.select_package;
      const newFee = Number(this.userForm.value.internet_package_fee);
      // Arrears carried forward from previous months, added on top of this bill
      const previousRemaining = Number(this.userForm.value.previous_remaining) || 0;
      const previousRemainingMonth =
        this.userForm.value.previous_remaining_month || null;

      const userRef = doc(this.firestore, 'users', this.selectedRow.docId);
      const userSnap = await getDoc(userRef);

      if (!userSnap.exists()) return;

      const userData = userSnap.data();
      const bills = userData['bills'] || [];

      // Old-method bill: pick up the earlier month it already includes first,
      // so that balance is replaced below instead of added a second time
      linkUntrackedCarries(
        bills,
        this.carryFees(userData),
        new Set([this.selectedRow.bills[0].bill_id]),
      );

      // Read oldFee from fresh Firestore data, not from the potentially stale UI row
      const oldFee = Number(userData['internet_package_fee'] || 0);
      const difference = newFee - oldFee;

      const updatedBills = bills.map((bill: any) => {
        if (bill.bill_id === this.selectedRow.bills[0].bill_id) {
          // Strip any arrears added by a previous edit so re-editing replaces
          // rather than compounds the carried-forward balance.
          const oldPrevious = Number(bill.previous_remaining || 0);
          const baseAmount = Number(bill.amount) - oldPrevious;
          const baseRemaining =
            Number(bill.remaining_amount ?? bill.amount) - oldPrevious;

          return {
            ...bill,
            amount: baseAmount + difference + previousRemaining,
            remaining_amount: baseRemaining + difference + previousRemaining,
            previous_remaining: previousRemaining || null,
            previous_remaining_month: previousRemaining
              ? previousRemainingMonth
              : null,
          };
        }
        return bill;
      });

      // Previous balance taken off this bill - the months it came from are
      // owed on their own again.
      if (!previousRemaining) {
        releaseCarried(updatedBills, new Set([this.selectedRow.bills[0].bill_id]));
      }

      await updateDoc(userRef, {
        select_package: newPackage,
        internet_package_fee: newFee,
        bills: updatedBills,
      });

      // Keep newConnection in sync
      const newConnRef = doc(this.firestore, 'newConnection', this.selectedRow.docId);
      const newConnSnap = await getDoc(newConnRef);
      if (newConnSnap.exists()) {
        await updateDoc(newConnRef, {
          select_package: newPackage,
          internet_package_fee: newFee,
        });
      }

      if (!navigator.onLine) {
        this.toastr.info('Saved offline. Will sync when connection is restored.');
      } else {
        this.toastr.success('Bill updated successfully');
      }

      this.showUpdateModal = false;
      this.loadUsers();
    } catch (error) {
      console.error(error);
      this.toastr.error('Update failed');
    } finally {
      this.isSubmitting = false;
    }
  }

  /**
   * Reads a template and keeps a copy in localStorage, so the screen still has
   * one after an offline cold start where Firestore cannot serve the document
   * from its own cache either.
   */
  async getTemplate(type: string): Promise<string> {
    const cacheKey = `messageTemplate_${type}`;

    try {
      const ref = doc(this.firestore, `messageTemplates/${type}`);
      const snap = await getDoc(ref);

      if (snap.exists()) {
        const message = snap.data()['message'] || '';
        localStorage.setItem(cacheKey, message);
        return message;
      }

      return localStorage.getItem(cacheKey) || '';
    } catch {
      return localStorage.getItem(cacheKey) || '';
    }
  }

  openWhatsappModal(user: any) {
    this.selectedWhatsappUser = user;
    this.whatsappSheetOpen = true;
  }

  /**
   * The contact number to text for a row.
   *
   * `mobile_no` is the field the user form actually requires; `phone_no` is a
   * legacy field that is often absent or literally '0'. Same precedence the
   * new-connection and user-details screens use.
   */
  private resolveUserPhone(user: any): string {
    const phoneNo = user?.phone_no;
    return phoneNo && phoneNo !== '0' ? phoneNo : user?.mobile_no || '';
  }

  formatPhoneForSms(phone: string): string | null {
    if (!phone) return null;
    const cleaned = phone.toString().trim().replace(/[\s\-()]/g, '');
    if (cleaned.startsWith('+92') && cleaned.length === 13) return cleaned;
    if (cleaned.startsWith('92') && cleaned.length === 12) return '+' + cleaned;
    if (cleaned.startsWith('0') && cleaned.length === 11) return '+92' + cleaned.slice(1);
    if (cleaned.length === 10) return '+92' + cleaned;
    return null;
  }

  async sendSmsReminder(user: any) {
    const phone = this.formatPhoneForSms(this.resolveUserPhone(user));
    if (!phone) { this.toastr.error('No valid phone number'); return; }
    const message = this.mapReminderTemplate(this.paymentReminderTemplate, user);
    if (!message) { this.toastr.error('Template not loaded'); return; }
    try {
      await addDoc(collection(this.firestore, 'sms'), { phone, message, status: 'pending', createdAt: new Date().toISOString() });
      this.toastr.success('SMS queued successfully');
    } catch { this.toastr.error('Failed to queue SMS'); }
  }

  async sendSmsDisconnection(user: any) {
    const phone = this.formatPhoneForSms(this.resolveUserPhone(user));
    if (!phone) { this.toastr.error('No valid phone number'); return; }
    const message = this.mapOverdueTemplate(this.overdue, user);
    if (!message) { this.toastr.error('Template not loaded'); return; }
    try {
      await addDoc(collection(this.firestore, 'sms'), { phone, message, status: 'pending', createdAt: new Date().toISOString() });
      this.toastr.success('SMS queued successfully');
    } catch { this.toastr.error('Failed to queue SMS'); }
  }

  async sendSmsPaymentReceived(user: any) {
    const phone = this.formatPhoneForSms(this.resolveUserPhone(user));
    if (!phone) { this.toastr.error('No valid phone number'); return; }
    const message = this.mapTemplate(this.paymentRecievedTemplate, user);
    if (!message) { this.toastr.error('Template not loaded'); return; }
    try {
      await addDoc(collection(this.firestore, 'sms'), { phone, message, status: 'pending', createdAt: new Date().toISOString() });
      this.toastr.success('SMS queued successfully');
    } catch { this.toastr.error('Failed to queue SMS'); }
  }

  /**
   * Queues the "Payment Received" SMS for one collected bill.
   *
   * Nothing is awaited on purpose: while offline Firestore never settles a
   * write promise until the server acknowledges it, so awaiting here would
   * stall the collection flow. The doc is written to the local cache
   * immediately and the SDK syncs it once the connection is back.
   *
   * Returns whether a message was actually queued.
   */
  private autoSendPaymentSms(billData: any, collectedAmount?: any): boolean {
    const phone = this.formatPhoneForSms(this.resolveUserPhone(billData));

    if (!phone) {
      console.warn(
        'Payment SMS skipped — no usable number for',
        billData?.user_name,
        billData?.internet_id,
      );
      return false;
    }

    if (!this.paymentRecievedTemplate) {
      console.warn(
        'Payment SMS skipped — the "Payment Received" template is empty in Settings',
      );
      return false;
    }

    const message = this.templateMapper.map(
      this.paymentRecievedTemplate,
      billData,
      {
        ...this.templateCtx(),
        amount:
          collectedAmount ?? billData?.collected_amount ?? billData?.amount,
        paymentDate: new Date(),
      },
    );
    if (!message) return false;

    addDoc(collection(this.firestore, 'sms'), {
      phone,
      message,
      status: 'pending',
      createdAt: new Date().toISOString(),
    }).catch((err) => console.error('Auto payment SMS failed for', phone, err));

    return true;
  }

  disconnectionWarning(user: any){
    const formattedPhone = this.formatPhoneNumber(this.resolveUserPhone(user));

    const message = this.mapOverdueTemplate(this.overdue, user);
    if (!message) {
      this.toastr.error('Message template not loaded');
      return;
    }

    this.sendWelcomeMessage(formattedPhone, message);
  }

  paymentRemainder(user: any){
     const formattedPhone = this.formatPhoneNumber(this.resolveUserPhone(user));

    const message = this.mapReminderTemplate(this.paymentReminderTemplate, user);
    if (!message) {
      this.toastr.error('Message template not loaded');
      return;
    }

    this.sendWelcomeMessage(formattedPhone, message);
  }

  async sendWhatsapp(user: any) {
    const formattedPhone = this.formatPhoneNumber(this.resolveUserPhone(user));

    const message = this.mapTemplate(this.paymentRecievedTemplate, user);
    if (!message) {
      this.toastr.error('Message template not loaded');
      return;
    }

    this.sendWelcomeMessage(formattedPhone, message);
  }


  /** Context shared by every template sent from this screen. */
  private templateCtx() {
    return {
      supportNumber: this.companyDetail?.complain_no1 || undefined,
    };
  }

  /** Overdue warning — uses the outstanding balance, not the billed amount. */
  mapOverdueTemplate(template: any, data: any): string {
    return this.templateMapper.map(template, data, {
      ...this.templateCtx(),
      overdueAmount: data?.remaining_amount || data?.amount,
      amount: data?.remaining_amount || data?.amount,
    });
  }

  /** Payment reminder — uses the amount currently billed and due. */
  mapReminderTemplate(template: any, data: any): string {
    return this.templateMapper.map(template, data, {
      ...this.templateCtx(),
      amount: data?.remaining_amount || data?.amount,
    });
  }

  /** Payment received — uses what was actually collected and when. */
  mapTemplate(template: any, data: any): string {
    return this.templateMapper.map(template, data, {
      ...this.templateCtx(),
      amount: data?.collected_amount ?? data?.amount,
      paymentDate: data?.collected_date || new Date(),
    });
  }

  /** International digits for WhatsApp - see toWhatsappNumber for the formats handled. */
  formatPhoneNumber(phone: string): string {
    return toWhatsappNumber(phone);
  }

  sendWelcomeMessage(phone: string, message: string) {
    this.fileShare.openWhatsApp(phone, message);
  }

  // ── Mobile UI state & helpers (presentation only) ─────────────────────

  readonly pageSizes = [10, 30, 50, 100];
  readonly skeletonRows = [0, 1, 2, 3, 4];
  readonly paymentMethods = [
    { value: 'cash', label: 'Cash', icon: 'ri-money-dollar-box-line' },
    { value: 'easypaisa', label: 'EasyPaisa', icon: 'ri-smartphone-line' },
    { value: 'jazzcash', label: 'JazzCash', icon: 'ri-wallet-line' },
    { value: 'bank', label: 'Bank', icon: 'ri-bank-line' },
  ];
  detailSheetOpen = false;
  whatsappSheetOpen = false;
  detailRow: any = null;
  private pendingSheetAction: (() => void) | null = null;

  @ViewChild('listTop') listTop?: ElementRef<HTMLElement>;

  /** Amounts can be stored as strings; group digits when the value is numeric. */
  money(value: any): string {
    const n = Number(value);
    return Number.isFinite(n) ? n.toLocaleString('en-US') : String(value ?? 0);
  }

  userInitial(row: any): string {
    return (row?.user_name || '?').charAt(0).toUpperCase();
  }

  /** Number shown on the sheets and used by the call button. */
  getContact(row: any): string {
    return String(this.resolveUserPhone(row) || '').trim();
  }

  /** A paid bill with money still due reads as Partial, same as the old status badge. */
  private rowState(row: any): 'paid' | 'partial' | 'unpaid' | 'advance' {
    if (row?.status === 'paid') {
      return (row.remaining_amount || 0) > 0 ? 'partial' : 'paid';
    }
    return row?.status === 'advance' ? 'advance' : 'unpaid';
  }

  statusClass(row: any): string {
    return 'st-' + this.rowState(row);
  }

  statusLabel(row: any): string {
    const labels = { paid: 'Paid', partial: 'Partial', unpaid: 'Unpaid', advance: 'Advance' };
    return labels[this.rowState(row)];
  }

  statusIcon(row: any): string {
    const icons = {
      paid: 'ri-check-line',
      partial: 'ri-error-warning-line',
      unpaid: 'ri-time-line',
      advance: 'ri-arrow-up-line',
    };
    return icons[this.rowState(row)];
  }

  get activeFilterCount(): number {
    return [this.selectedOfficer, this.sublocality, this.subArea, this.selectedMonth, this.customerStatus].filter(Boolean).length;
  }

  get hasAnyFilter(): boolean {
    return !!(this.searchTerm || this.activeFilterCount);
  }

  onSearchInput(event: Event) {
    this.searchTerm = ((event as CustomEvent).detail?.value ?? '').toString();
    this.onFilterChange();
  }

  resetFilters() {
    this.selectedOfficer = '';
    this.officerSublocalities = [];
    this.sublocality = '';
    this.subArea = '';
    this.selectedMonth = null;
    this.customerStatus = '';
    this.currentPage = 1;
    this.onFilterChange();
  }

  clearFilters() {
    this.searchTerm = '';
    this.resetFilters();
  }

  isAdvanceMonthSelected(monthObj: { month: string; year: string }): boolean {
    return this.advanceForm.months.some(
      (m) => m.month === monthObj.month && m.year === monthObj.year,
    );
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

  /** In bulk mode a tap selects the bill; otherwise it opens the detail sheet. */
  onCardTap(row: any) {
    if (this.isBulkMode) this.toggleBulkSelection(row);
    else this.openDetailSheet(row);
  }

  openDetailSheet(row: any) {
    this.detailRow = row;
    this.detailSheetOpen = true;
  }

  /** Closes the detail sheet, then runs the action once the sheet has gone. */
  fromDetailSheet(
    action: 'collect' | 'cash' | 'receipt' | 'revert' | 'revertAdvance' | 'update' | 'advance' | 'history' | 'message',
  ) {
    const row = this.detailRow;
    this.pendingSheetAction = () => {
      if (action === 'collect') this.openCollectModal(row, row.docId);
      else if (action === 'cash') this.quickCashPay(row);
      else if (action === 'receipt') this.openReceiptModal(row);
      else if (action === 'revert') this.revertBill(row);
      else if (action === 'revertAdvance') this.revertAdvance(row);
      else if (action === 'update') this.openUpdateModal(row);
      else if (action === 'advance') this.openAdvanceModal(row);
      else if (action === 'history') this.openUserDetails(row.docId);
      else this.openWhatsappModal(row);
    };
    this.detailSheetOpen = false;
  }

  onDetailSheetDismiss() {
    this.detailSheetOpen = false;
    const action = this.pendingSheetAction;
    this.pendingSheetAction = null;
    action?.();
  }

  closeWhatsappSheet() {
    this.whatsappSheetOpen = false;
  }

  // ── Bluetooth thermal printer ─────────────────────────────────────────

  /** True while a print or reconnect is running, to lock the button. */
  get printerBusy(): boolean {
    const status = this.printer.status$.value;
    return status === 'printing' || status === 'connecting';
  }

  printThermalReceipt() {
    if (!this.receiptData) return;
    this.printer.printLines(collectionReceiptLines(this.receiptData, this.companyDetail));
  }
}
