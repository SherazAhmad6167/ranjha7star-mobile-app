import { Component, ElementRef, OnInit, TemplateRef, ViewChild } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormGroup, FormsModule, ReactiveFormsModule, Validators } from '@angular/forms';
import { NgbModal, NgbModalRef } from '@ng-bootstrap/ng-bootstrap';
import { ToastrModule, ToastrService } from 'ngx-toastr';
import {
  IonModal,
  IonRange,
  IonRippleEffect,
  IonSearchbar,
  IonSegment,
  IonSegmentButton,
  IonSkeletonText,
  IonSpinner,
} from '@ionic/angular';
import { ZalService, ZalError, ZalStats, ZAL_MAX_LIMIT } from '../../shared/zal.service';
import { SheetSelectComponent } from '../../shared/sheet-select/sheet-select.component';

type NetAction = 'enable' | 'disable';
type PageSlot = number | 'gap';
type SheetAction = 'edit' | 'renew' | 'net' | 'delete';
export type ExpiryState = 'expired' | 'soon' | 'ok' | 'none';

/** Expiring within this many days is flagged on the card. */
const EXPIRY_SOON_DAYS = 3;

@Component({
  selector: 'app-zal-subscribers',
  imports: [
    CommonModule,
    FormsModule,
    ReactiveFormsModule,
    ToastrModule,
    IonModal,
    IonRange,
    IonRippleEffect,
    IonSearchbar,
    IonSegment,
    IonSegmentButton,
    IonSkeletonText,
    IonSpinner,
    SheetSelectComponent,
  ],
  templateUrl: './zal-subscribers.component.html',
  styleUrl: './zal-subscribers.component.scss',
})
export class ZalSubscribersComponent implements OnInit {
  isLoading = false;
  isActing = false;
  isSaving = false;
  isDeleting = false;
  proxyError: string | null = null;
  proxyIsCors = false;

  subscribers: any[] = [];
  /** null when the panel returns no count - it usually does not. */
  totalCount: number | null = null;
  hasMore = false;

  searchTerm = '';
  packageId: string = '';
  packages: any[] = [];
  areas: any[] = [];
  nasDevices: any[] = [];
  salespersons: any[] = [];
  stats: ZalStats | null = null;

  form!: FormGroup;
  editMode = false;
  editingId: any = null;

  renewForm!: FormGroup;
  renewPreview: any = null;
  isPreviewing = false;

  currentPage = 1;
  pageSize = 50;
  readonly maxLimit = ZAL_MAX_LIMIT;

  selectedSubscriber: any = null;
  pendingAction: NetAction | null = null;

  // ── Mobile UI state (presentation only) ──
  readonly pageSizes = [25, 50, 100];
  readonly skeletonRows = [0, 1, 2, 3, 4];
  detailSheetOpen = false;
  confirmSheetOpen = false;
  deleteSheetOpen = false;
  detailSubscriber: any = null;
  private pendingSheetAction: (() => void) | null = null;

  @ViewChild('formModal') formModal!: TemplateRef<any>;
  @ViewChild('renewModal') renewModal!: TemplateRef<any>;
  @ViewChild('listTop') listTop?: ElementRef<HTMLElement>;

  private formRef?: NgbModalRef;
  private renewRef?: NgbModalRef;

  constructor(
    private zal: ZalService,
    private modalService: NgbModal,
    private toastr: ToastrService,
    private fb: FormBuilder,
  ) {}

  ngOnInit() {
    // Only username / fullname / password / package_id are required upstream.
    this.form = this.fb.group({
      fullname:            ['', [Validators.required, Validators.minLength(2)]],
      username:            ['', [Validators.required, Validators.minLength(2)]],
      password:            ['', Validators.required],
      connection_password: [''],
      package_id:          ['', Validators.required],
      salesperson_id:      ['', Validators.required],
      phone:               ['', Validators.required],
      email:               [''],
      identity:            ['', Validators.required],
      address:             [''],
      area:                [''],
      nas_id:              [''],
      expiration_date:     [''],
      profile_status:      [2],
      // 1 = PPPoE, 0 = Hotspot on this panel (5556 of 5565 subscribers are 1).
      connection_type:     [1],
      // 1 = internet enabled, 2 = disabled (what enable-net / disable-net set).
      connection_status:   [1],
    });

    this.renewForm = this.fb.group({
      package_id:             [''],
      // 0 means "no cash now" - the fee comes out of the subscriber's balance.
      // Numeric so it can drive an ion-segment.
      take_payment:           [1],
      payment_amount:         [0, [Validators.required, Validators.min(1)]],
      payment_method:         [1, [Validators.required]],
      custom_expiry_datetime: [''],
    });

    this.renewForm.get('take_payment')?.valueChanges.subscribe(() => {
      this.syncPaymentValidators();
    });

    this.loadStats();
    this.loadPackages();
    this.loadAreas();
    this.loadNas();
    this.loadSalespersons();
    this.loadSubscribers();
  }

  // ── Data ───────────────────────────────────────────────────────────────────

  loadSubscribers() {
    this.isLoading = true;
    this.proxyError = null;

    this.zal
      .getSubscribers({
        search: this.searchTerm.trim(),
        package_id: this.packageId,
        limit: this.pageSize,
        offset: (this.currentPage - 1) * this.pageSize,
      })
      .subscribe({
        next: (page) => {
          this.subscribers = page.rows;
          this.totalCount = page.total;
          this.hasMore = page.hasMore;
          this.isLoading = false;
        },
        error: (err: ZalError) => {
          this.subscribers = [];
          this.totalCount = null;
          this.hasMore = false;
          this.proxyError = err.message;
          this.proxyIsCors = err.isCors;
          this.isLoading = false;
        },
      });
  }

  loadPackages() {
    this.zal.getPackages().subscribe({
      next: (rows) => (this.packages = rows || []),
      error: () => (this.packages = []), // filter is optional, never block the page
    });
  }

  loadStats() {
    this.zal.getStats().subscribe({
      next: (stats) => (this.stats = stats),
      error: () => (this.stats = null), // page still works, just without totals
    });
  }

  // Subscribers carry an area id, so the names have to be looked up.
  loadAreas() {
    this.zal.getAreas().subscribe({
      next: (rows) => (this.areas = rows || []),
      error: () => (this.areas = []),
    });
  }

  loadSalespersons() {
    this.zal.getUsers().subscribe({
      next: (rows) => (this.salespersons = rows || []),
      error: () => (this.salespersons = []),
    });
  }

  loadNas() {
    this.zal.getNas().subscribe({
      next: (rows) => (this.nasDevices = rows || []),
      error: () => (this.nasDevices = []),
    });
  }

  /** Areas are a hierarchy; type 4 rows are the pickable areas. */
  get areaOptions(): any[] {
    const leaves = this.areas.filter((a) => Number(a?.type) === 4);
    return (leaves.length ? leaves : this.areas)
      .slice()
      .sort((a, b) => String(a?.name || '').localeCompare(String(b?.name || '')));
  }

  salespersonName(user: any): string {
    const label = user?.name || user?.username || `#${user?.id}`;
    return user?.username && user?.name ? `${user.name} (${user.username})` : label;
  }

  // The pickers read {id, name}, so shape the derived lists once per change.
  private nasCache: { source: any[]; options: any[] } | null = null;
  private salespersonCache: { source: any[]; options: any[] } | null = null;

  get nasOptions(): any[] {
    if (this.nasCache?.source !== this.nasDevices) {
      this.nasCache = {
        source: this.nasDevices,
        options: this.nasDevices.map((n) => ({ id: n.id, name: this.nasName(n) })),
      };
    }
    return this.nasCache.options;
  }

  get salespersonOptions(): any[] {
    if (this.salespersonCache?.source !== this.salespersons) {
      this.salespersonCache = {
        source: this.salespersons,
        options: this.salespersons.map((u) => ({ id: u.id, name: this.salespersonName(u) })),
      };
    }
    return this.salespersonCache.options;
  }

  nasName(device: any): string {
    return (
      device?.shortname ||
      device?.nas_details_data?.nas_name ||
      device?.nasname ||
      `#${device?.id}`
    );
  }

  // -- Create / edit ---------------------------------------------------------

  /** Full-screen sheet on phones, centered dialog from tablet width up. */
  private openFormWindow(template: TemplateRef<any>): NgbModalRef {
    return this.modalService.open(template, {
      size: 'lg',
      fullscreen: 'md',
      windowClass: 'mk-sheet-window',
      backdrop: 'static',
    });
  }

  openAdd() {
    this.editMode = false;
    this.editingId = null;
    this.form.reset({
      profile_status: 2,
      connection_type: 1,
      connection_status: 1,
      package_id: '',
      salesperson_id: '',
      nas_id: '',
      area: '',
    });
    this.form.get('password')?.setValidators([Validators.required]);
    this.form.get('password')?.updateValueAndValidity();
    this.formRef = this.openFormWindow(this.formModal);
  }

  openEdit(s: any) {
    this.editMode = true;
    this.editingId = this.subscriberId(s);
    this.form.reset({
      fullname:            s?.fullname || '',
      username:            s?.username || '',
      password:            '',
      connection_password: s?.connection_password || '',
      package_id:          s?.package_id || '',
      salesperson_id:      s?.salesperson_id || '',
      phone:               s?.phone || '',
      email:               s?.email || '',
      identity:            s?.identity || '',
      address:             s?.address || '',
      area:                s?.area || '',
      nas_id:              s?.nas_id || '',
      expiration_date:     this.toInputDateTime(s?.expiration_date),
      // Numeric for the status segment; anything unexpected is kept as sent.
      profile_status:      this.numericOr(s?.profile_status ?? 2),
      // Keep whatever the subscriber already is - an edit must not retype him
      connection_type:     s?.connection_type ?? 1,
      connection_status:   s?.connection_status ?? 1,
    });
    // Blank password means "keep the existing one".
    this.form.get('password')?.clearValidators();
    this.form.get('password')?.updateValueAndValidity();
    this.formRef = this.openFormWindow(this.formModal);
  }

  saveSubscriber() {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      this.toastr.error('Fill in the required fields');
      return;
    }

    const payload: Record<string, any> = { ...this.form.getRawValue() };
    payload['expiration_date'] = this.toApiDateTime(payload['expiration_date']);

    // The panel stores the parent chain alongside the area, so copy it across.
    const area = this.areas.find((a) => String(a?.id) === String(payload['area']));
    if (area) {
      payload['country'] = area.country ?? undefined;
      payload['province'] = area.province ?? undefined;
      payload['city'] = area.city ?? undefined;
    }

    this.isSaving = true;

    const done = {
      next: () => {
        this.toastr.success(this.editMode ? 'Subscriber updated' : 'Subscriber created');
        this.isSaving = false;
        this.formRef?.close();
        this.refreshAll();
      },
      error: (err: ZalError) => {
        this.toastr.error(err.message);
        this.isSaving = false;
      },
    };

    if (this.editMode) this.zal.updateSubscriber(this.editingId, payload).subscribe(done);
    else this.zal.createSubscriber(payload).subscribe(done);
  }

  /** Shared by the form template for the invalid + touched check. */
  invalid(group: FormGroup, name: string): boolean {
    const control = group.get(name);
    return !!(control?.invalid && control?.touched);
  }

  // -- Delete ----------------------------------------------------------------

  askDelete(s: any) {
    this.selectedSubscriber = s;
    this.deleteSheetOpen = true;
  }

  confirmDelete() {
    const id = this.subscriberId(this.selectedSubscriber);
    if (!id) return;

    this.isDeleting = true;
    this.zal.deleteSubscriber(id).subscribe({
      next: () => {
        this.toastr.success(`Deleted ${this.displayName(this.selectedSubscriber)}`);
        this.isDeleting = false;
        this.deleteSheetOpen = false;
        this.refreshAll();
      },
      error: (err: ZalError) => {
        this.toastr.error(err.message);
        this.isDeleting = false;
      },
    });
  }

  // -- Renew / activation ----------------------------------------------------

  openRenew(s: any) {
    this.selectedSubscriber = s;
    this.renewPreview = null;
    this.renewForm.reset({
      package_id: s?.package_id || '',
      take_payment: 1,
      payment_amount: 0,
      payment_method: 1,
      custom_expiry_datetime: '',
    });
    this.syncPaymentValidators();
    this.renewRef = this.openFormWindow(this.renewModal);
  }

  /** Prices the renewal without charging - preview_only: 1. */
  previewRenew() {
    const id = this.subscriberId(this.selectedSubscriber);
    if (!id) return;

    this.isPreviewing = true;
    this.zal
      .activate({ ...this.renewPayload(), subscriber_id: id, preview_only: 1 })
      .subscribe({
        next: (res) => {
          this.renewPreview = res?.data ?? res;

          // Save a round of guesswork - the panel just told us the shortfall.
          const due = Number(this.renewPreview?.required_payment);
          const amount = this.renewForm.get('payment_amount');
          if (
            this.renewForm.get('take_payment')?.value &&
            due > 0 &&
            !Number(amount?.value)
          ) {
            amount?.setValue(due);
          }

          this.isPreviewing = false;
        },
        error: (err: ZalError) => {
          this.toastr.error(err.message);
          this.isPreviewing = false;
        },
      });
  }

  confirmRenew() {
    const id = this.subscriberId(this.selectedSubscriber);
    if (!id) return;

    if (this.renewForm.invalid) {
      this.renewForm.markAllAsTouched();
      this.toastr.error('Enter the payment amount, or switch payment off');
      return;
    }

    this.isActing = true;
    this.zal.activate({ ...this.renewPayload(), subscriber_id: id }).subscribe({
      next: () => {
        this.toastr.success(`Activated ${this.displayName(this.selectedSubscriber)}`);
        this.isActing = false;
        this.renewRef?.close();
        this.refreshAll();
      },
      error: (err: ZalError) => {
        this.toastr.error(err.message);
        this.isActing = false;
      },
    });
  }

  /**
   * With payment on, the amount is credited to the subscriber and the fee is
   * taken from it. With payment off, nothing is collected and the panel pays
   * the fee from the balance he already has - which it refuses when that
   * balance is short ("Insufficient Subscriber Balance").
   */
  private renewPayload(): Record<string, any> {
    const raw = this.renewForm.getRawValue();

    const payload: Record<string, any> = {
      package_id: raw.package_id,
      custom_expiry_datetime: this.toApiDateTime(raw.custom_expiry_datetime),
    };

    if (raw.take_payment) {
      payload['payment_amount'] = raw.payment_amount;
      payload['payment_method'] = raw.payment_method;
    } else {
      payload['cut_subscriber_balance'] = 1;
    }

    return payload;
  }

  private syncPaymentValidators() {
    const on = !!this.renewForm.get('take_payment')?.value;
    const amount = this.renewForm.get('payment_amount');
    const method = this.renewForm.get('payment_method');

    if (on) {
      amount?.setValidators([Validators.required, Validators.min(1)]);
      method?.setValidators([Validators.required]);
    } else {
      amount?.clearValidators();
      method?.clearValidators();
    }

    amount?.updateValueAndValidity({ emitEvent: false });
    method?.updateValueAndValidity({ emitEvent: false });
  }

  // The panel wants 'YYYY-MM-DD HH:mm:ss'; datetime-local speaks 'YYYY-MM-DDTHH:mm'.
  private toApiDateTime(value: string): string {
    if (!value) return '';
    const cleaned = String(value).replace('T', ' ').trim();
    return cleaned.length === 16 ? `${cleaned}:00` : cleaned;
  }

  private numericOr(value: any): any {
    const num = Number(value);
    return value !== '' && Number.isFinite(num) ? num : value;
  }

  private toInputDateTime(value: any): string {
    if (!value) return '';
    return String(value).replace(' ', 'T').slice(0, 16);
  }

  refreshAll() {
    this.loadSubscribers();
    this.loadStats();
  }

  // ── Filters ────────────────────────────────────────────────────────────────

  // The list is paged server-side; ion-searchbar debounces the typing.
  onSearchInput(event: Event) {
    this.searchTerm = ((event as CustomEvent).detail?.value ?? '').toString();
    this.onFilterChange();
  }

  onFilterChange() {
    this.currentPage = 1;
    this.loadSubscribers();
  }

  get activeFilterCount(): number {
    return this.packageId ? 1 : 0;
  }

  clearPackage() {
    this.packageId = '';
    this.onFilterChange();
  }

  clearFilters() {
    this.searchTerm = '';
    this.clearPackage();
  }

  // ── Pagination ─────────────────────────────────────────────────────────────

  get isFiltered(): boolean {
    return !!this.searchTerm.trim() || !!this.packageId;
  }

  /**
   * The list endpoint sends no count, so the branch total from the dashboard
   * stands in - but only while nothing is filtering the results.
   */
  get knownTotal(): number | null {
    if (this.totalCount !== null) return this.totalCount;
    if (!this.isFiltered && this.stats?.total != null) return Number(this.stats.total);
    return null;
  }

  /** Pre-formatted so the template never pipes a `number | null` union. */
  get totalLabel(): string {
    const total = this.knownTotal;
    return total === null ? '' : total.toLocaleString();
  }

  get totalPages(): number | null {
    const total = this.knownTotal;
    if (total === null) return null;
    return Math.max(1, Math.ceil(total / this.pageSize));
  }

  /** Compact page strip, e.g. 1 … 5 [6] 7 … 40. Without a total, just the current page. */
  get pageWindow(): PageSlot[] {
    const total = this.totalPages;
    if (total === null) return [this.currentPage];
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

  get rangeStart(): number {
    return this.subscribers.length === 0 ? 0 : (this.currentPage - 1) * this.pageSize + 1;
  }

  get rangeEnd(): number {
    return (this.currentPage - 1) * this.pageSize + this.subscribers.length;
  }

  get canGoNext(): boolean {
    const pages = this.totalPages;
    return pages === null ? this.hasMore : this.currentPage < pages;
  }

  goToPage(page: number) {
    if (page < 1 || page === this.currentPage) return;
    if (page > this.currentPage && !this.canGoNext) return;
    this.currentPage = page;
    this.loadSubscribers();
  }

  changePage(slot: PageSlot) {
    if (slot === 'gap' || !Number.isFinite(slot)) return;
    const before = this.currentPage;
    this.goToPage(slot);
    if (this.currentPage !== before) {
      this.listTop?.nativeElement.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }

  prevPage() {
    this.changePage(this.currentPage - 1);
  }

  nextPage() {
    this.changePage(this.currentPage + 1);
  }

  onPageScrub(event: Event) {
    this.changePage(Math.round(Number((event as CustomEvent).detail?.value)));
  }

  // ── Enable / disable internet ──────────────────────────────────────────────

  askAction(subscriber: any, action: NetAction) {
    this.selectedSubscriber = subscriber;
    this.pendingAction = action;
    this.confirmSheetOpen = true;
  }

  confirmAction() {
    if (!this.selectedSubscriber || !this.pendingAction) return;

    const id = this.subscriberId(this.selectedSubscriber);
    if (!id) {
      this.toastr.error('This subscriber has no id in the API response');
      return;
    }

    const action = this.pendingAction;
    this.isActing = true;

    const done = {
      next: () => {
        this.toastr.success(`Internet ${action}d for ${this.displayName(this.selectedSubscriber)}`);
        this.isActing = false;
        this.confirmSheetOpen = false;
        this.loadSubscribers();
      },
      error: (err: ZalError) => {
        this.toastr.error(err.message);
        this.isActing = false;
      },
    };

    if (action === 'enable') this.zal.enableNet(id).subscribe(done);
    else this.zal.disableNet(id).subscribe(done);
  }

  // ── Detail sheet ───────────────────────────────────────────────────────────

  openDetailSheet(s: any) {
    this.detailSubscriber = s;
    this.detailSheetOpen = true;
  }

  /** Closes the detail sheet, then runs the action once the sheet has gone. */
  fromDetailSheet(action: SheetAction) {
    const s = this.detailSubscriber;
    this.pendingSheetAction = () => {
      if (action === 'edit') this.openEdit(s);
      else if (action === 'renew') this.openRenew(s);
      else if (action === 'net') this.askAction(s, this.isOnline(s) ? 'disable' : 'enable');
      else this.askDelete(s);
    };
    this.detailSheetOpen = false;
  }

  onDetailSheetDismiss() {
    this.detailSheetOpen = false;
    const action = this.pendingSheetAction;
    this.pendingSheetAction = null;
    action?.();
  }

  // ── Field readers ──────────────────────────────────────────────────────────
  // The list response shape is not documented, so read each field defensively.

  trackBySubscriber = (index: number, s: any) => this.subscriberId(s) ?? index;

  subscriberId(s: any): any {
    return s?.id ?? s?.subscriber_id ?? s?.uid ?? null;
  }

  displayName(s: any): string {
    return s?.fullname || s?.full_name || s?.name || s?.username || '-';
  }

  initial(s: any): string {
    return (this.displayName(s).trim().charAt(0) || '?').toUpperCase();
  }

  username(s: any): string {
    return s?.username || s?.user_name || '-';
  }

  phone(s: any): string {
    return s?.phone || s?.mobile || s?.contact || '-';
  }

  /** Dialable number for the call button, or '' when there is none. */
  telNumber(s: any): string {
    const raw = s?.phone || s?.mobile || s?.contact || '';
    return String(raw).replace(/[^\d+]/g, '');
  }

  area(s: any): string {
    if (s?.area?.name) return s.area.name;
    if (s?.area_name) return s.area_name;
    const match = this.areas.find((a) => String(a?.id) === String(s?.area));
    return match?.name || (s?.area ? `#${s.area}` : '-');
  }

  packageName(s: any): string {
    if (s?.package?.name) return s.package.name;
    if (s?.package_name) return s.package_name;
    const match = this.packages.find((p) => String(p?.id) === String(s?.package_id));
    return match?.name || (s?.package_id ? `#${s.package_id}` : '-');
  }

  expiry(s: any): string {
    return s?.expiration_date || s?.expiry_date || s?.expire_date || '-';
  }

  /** The panel sends 'YYYY-MM-DD HH:mm:ss' in local time. */
  expiryDate(s: any): Date | null {
    const raw = this.expiry(s);
    if (raw === '-') return null;
    const date = new Date(String(raw).replace(' ', 'T'));
    return isNaN(date.getTime()) ? null : date;
  }

  expiryState(s: any): ExpiryState {
    const date = this.expiryDate(s);
    if (!date) return 'none';
    const msLeft = date.getTime() - Date.now();
    if (msLeft <= 0) return 'expired';
    return msLeft <= EXPIRY_SOON_DAYS * 86_400_000 ? 'soon' : 'ok';
  }

  /** Account state: the panel documents profile_status as 0=Inactive, 1=Pending, 2=Active. */
  status(s: any): string {
    const raw = s?.profile_status ?? s?.status;
    if (raw === null || raw === undefined || raw === '') return 'unknown';

    const map: Record<string, string> = { '0': 'inactive', '1': 'pending', '2': 'active' };
    const value = String(raw).toLowerCase();
    return map[value] || value;
  }

  /** Service state, and what enable-net / disable-net actually toggle: 1=on, 2=off. */
  isOnline(s: any): boolean {
    const raw = s?.connection_status;
    if (raw === null || raw === undefined || raw === '') return this.status(s) === 'active';
    return String(raw) === '1';
  }
}
