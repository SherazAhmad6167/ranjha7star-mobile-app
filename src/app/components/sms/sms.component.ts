import { CommonModule } from '@angular/common';
import { SearchSelectComponent } from '../../shared/search-select/search-select.component';
import { Component, OnInit, TemplateRef, ViewChild } from '@angular/core';
import { FormBuilder, FormGroup, FormsModule, ReactiveFormsModule, Validators } from '@angular/forms';
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
  writeBatch,
} from '@angular/fire/firestore';
import { NgbModal } from '@ng-bootstrap/ng-bootstrap';
import { ToastrModule, ToastrService } from 'ngx-toastr';
import { TemplateMapperService } from '../../shared/template-mapper.service';
import { ActivatedRoute } from '@angular/router';

@Component({
  selector: 'app-sms',
  standalone: true,
  imports: [CommonModule, FormsModule, ReactiveFormsModule, ToastrModule, SearchSelectComponent],
  templateUrl: './sms.component.html',
  styleUrl: './sms.component.scss',
})
export class SmsComponent {
  @ViewChild('deleteModal') deleteModal!: TemplateRef<any>;
  @ViewChild('purgeModal') purgeModal!: TemplateRef<any>;
  @ViewChild('broadcastConfirmModal') broadcastConfirmModal!: TemplateRef<any>;
  @ViewChild('viewModal') viewModal!: TemplateRef<any>;
  selectedSms: any = null;
  activeTab: 'compose' | 'inbox' = 'compose';
  isSaving = false;
  isLoading = false;
  isDeleting = false;
  searchTerm = '';
  smsList: any[] = [];
  filteredList: any[] = [];
  currentPage = 1;
  pageSize = 10;
  totalPages = 1;
  selectedDeleteId: string | null = null;

  smsForm!: FormGroup;

  // ── Broadcast ─────────────────────────────────
  areas: any[] = [];
  smsTemplates: any[] = [];
  allUsers: any[] = [];
  broadcastArea = 'all';
  broadcastTemplateId = '';
  broadcastMessage = '';
  broadcastUsers: any[] = [];
  isBroadcasting = false;
  broadcastSent = 0;
  broadcastTotal = 0;
  broadcastDataLoaded = false;
  showRecipientList = false;
  broadcastCurrentIndex = -1;
  broadcastUserStatuses: Record<string, 'done' | 'failed'> = {};

  constructor(
    private fb: FormBuilder,
    private firestore: Firestore,
    private toastr: ToastrService,
    private modalService: NgbModal,
    private templateMapper: TemplateMapperService,
    private route: ActivatedRoute,
  ) {
    this.smsForm = this.fb.group({
      phone: ['+92', [Validators.required, Validators.pattern(/^\+92\d{10}$/)]],
      message: ['', [Validators.required, Validators.minLength(1)]],
      status: [{ value: 'pending', disabled: true }],
    });
  }

  ngOnInit() {
    this.loadSms();
    this.loadBroadcastData().then(() => {
      const tmpl = this.route.snapshot.queryParamMap.get('template');
      if (tmpl) {
        this.broadcastTemplateId = tmpl;
        this.onBroadcastTemplateChange();
      }
    });
  }

  switchTab(tab: 'compose' | 'inbox') {
    this.activeTab = tab;
    if (tab === 'inbox') this.loadSms();
  }

  get charCount() {
    return this.smsForm.get('message')?.value?.length ?? 0;
  }

  async onSubmit() {
    if (this.smsForm.invalid) {
      this.smsForm.markAllAsTouched();
      return;
    }

    this.isSaving = true;
    try {
      const payload = {
        phone: this.smsForm.value.phone,
        message: this.smsForm.value.message,
        status: 'pending',
        createdAt: new Date().toISOString(),
      };

      await addDoc(collection(this.firestore, 'sms'), payload);
      this.toastr.success('SMS queued successfully');
      this.smsForm.reset();
      this.smsForm.patchValue({ phone: '+92', status: 'pending' });
    } catch {
      this.toastr.error('Failed to queue SMS');
    } finally {
      this.isSaving = false;
    }
  }

  async loadSms() {
    this.isLoading = true;
    try {
      const q = query(collection(this.firestore, 'sms'), orderBy('createdAt', 'desc'));
      const snap = await getDocs(q);
      this.smsList = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      this.filteredList = [...this.smsList];
      this.updateTotalPages();
    } catch {
      this.toastr.error('Failed to load SMS records');
    } finally {
      this.isLoading = false;
    }
  }

  onSearch() {
    const term = this.searchTerm.toLowerCase();
    this.filteredList = this.smsList.filter(
      (s) =>
        s.phone?.toLowerCase().includes(term) ||
        s.message?.toLowerCase().includes(term) ||
        s.status?.toLowerCase().includes(term),
    );
    this.currentPage = 1;
    this.updateTotalPages();
  }

  updateTotalPages() {
    this.totalPages = Math.ceil(this.filteredList.length / this.pageSize) || 1;
    if (this.currentPage > this.totalPages) this.currentPage = this.totalPages;
  }

  onPageSizeChange() {
    this.currentPage = 1;
    this.updateTotalPages();
  }

  get pagedList() {
    const start = (this.currentPage - 1) * this.pageSize;
    return this.filteredList.slice(start, start + this.pageSize);
  }

  prevPage() { if (this.currentPage > 1) this.currentPage--; }
  nextPage() { if (this.currentPage < this.totalPages) this.currentPage++; }

  get visiblePages(): number[] {
    const start = Math.floor((this.currentPage - 1) / 5) * 5 + 1;
    const end = Math.min(start + 4, this.totalPages);
    const pages: number[] = [];
    for (let i = start; i <= end; i++) pages.push(i);
    return pages;
  }

  openDeleteModal(id: string) {
    this.selectedDeleteId = id;
    this.modalService.open(this.deleteModal, { centered: true, size: 'sm', windowClass: 'delete-confirm-modal' });
  }

  async confirmDelete(modal: any) {
    if (!this.selectedDeleteId) return;
    this.isDeleting = true;
    try {
      await deleteDoc(doc(this.firestore, 'sms', this.selectedDeleteId));
      this.toastr.success('SMS deleted');
      this.smsList = this.smsList.filter((s) => s.id !== this.selectedDeleteId);
      this.filteredList = this.filteredList.filter((s) => s.id !== this.selectedDeleteId);
      this.updateTotalPages();
      modal.close();
    } catch {
      this.toastr.error('Delete failed');
    } finally {
      this.isDeleting = false;
      this.selectedDeleteId = null;
    }
  }

  // ── Clear old logs ─────────────────────────────
  /** How many of the most recent messages the purge always keeps. */
  readonly KEEP_RECENT = 100;
  isPurging = false;
  purgeDeleted = 0;
  purgeTotal = 0;

  get purgeableCount(): number {
    return Math.max(0, this.smsList.length - this.KEEP_RECENT);
  }

  openPurgeModal() {
    if (this.purgeableCount === 0) return;
    this.purgeDeleted = 0;
    this.purgeTotal = this.purgeableCount;
    this.modalService.open(this.purgeModal, {
      centered: true,
      size: 'sm',
      windowClass: 'delete-confirm-modal',
      backdrop: 'static',
    });
  }

  async confirmPurge(modal: any) {
    if (this.purgeableCount === 0) return;

    // Unlike the single-row delete, this queues hundreds of writes — doing that
    // offline would pile up a huge pending batch with no way to review it.
    if (!navigator.onLine) {
      this.toastr.error('You are offline. Reconnect to clear old logs.');
      return;
    }

    this.isPurging = true;
    this.purgeDeleted = 0;

    // smsList is ordered createdAt desc, so everything past KEEP_RECENT is older.
    const doomed = this.smsList.slice(this.KEEP_RECENT);
    this.purgeTotal = doomed.length;

    try {
      const CHUNK = 450; // Firestore caps a batch at 500 writes
      for (let i = 0; i < doomed.length; i += CHUNK) {
        const slice = doomed.slice(i, i + CHUNK);
        const batch = writeBatch(this.firestore);
        for (const sms of slice) {
          batch.delete(doc(this.firestore, 'sms', sms.id));
        }
        await batch.commit();
        this.purgeDeleted += slice.length;
      }

      this.smsList = this.smsList.slice(0, this.KEEP_RECENT);
      this.onSearch();
      this.toastr.success(`${doomed.length} old SMS deleted`);
      modal.close();
    } catch {
      this.toastr.error('Failed to clear old logs');
      // Earlier batches may have committed — resync so the table matches the DB.
      this.loadSms();
      modal.close();
    } finally {
      this.isPurging = false;
    }
  }

  statusClass(status: string) {
    switch (status) {
      case 'sent':   return 'status-sent';
      case 'failed': return 'status-failed';
      default:       return 'status-pending';
    }
  }

  get pendingCount(): number {
    return this.smsList.filter(s => s.status === 'pending').length;
  }

  get sentCount(): number {
    return this.smsList.filter(s => s.status === 'sent').length;
  }

  get failedCount(): number {
    return this.smsList.filter(s => s.status === 'failed').length;
  }

  openViewModal(sms: any) {
    this.selectedSms = sms;
    this.modalService.open(this.viewModal, { centered: true, size: 'md' });
  }

  // ── Broadcast Logic ────────────────────────────

  async loadBroadcastData() {
    if (this.broadcastDataLoaded) return;
    try {
      const [areaSnap, tmplSnap, usersSnap] = await Promise.all([
        getDoc(doc(this.firestore, 'internetArea', 'internetAreaDoc')),
        getDocs(collection(this.firestore, 'messageTemplates')),
        getDocs(collection(this.firestore, 'users')),
      ]);

      if (areaSnap.exists()) {
        this.areas = (areaSnap.data()?.['internetAreas'] || [])
          .sort((a: any, b: any) => a.sublocality.localeCompare(b.sublocality));
      }

      this.smsTemplates = tmplSnap.docs
        .map(d => ({ id: d.id, ...d.data() } as any))
        .filter(t => t.message)
        .sort((a: any, b: any) => a.title?.localeCompare(b.title));

      this.allUsers = usersSnap.docs.map(d => ({ id: d.id, ...d.data() }));

      this.broadcastDataLoaded = true;
      this.onBroadcastAreaChange();
    } catch {
      this.toastr.error('Failed to load broadcast data');
    }
  }

  onBroadcastAreaChange() {
    const source = this.broadcastArea === 'all'
      ? this.allUsers
      : this.allUsers.filter(u => (u as any).sublocality === this.broadcastArea);

    let filtered = source.filter(u => !!this.formatUserPhone((u as any).mobile_no || (u as any).phone_no));

    if (this.broadcastTemplateId === 'paymentReminder') {
      filtered = filtered.filter(u => {
        const bills: any[] = (u as any).bills || [];
        return bills.some((b: any) => b.status === 'unpaid');
      });
    }

    if (this.broadcastTemplateId === 'birthday') {
      const today = new Date();
      const mm = String(today.getMonth() + 1).padStart(2, '0');
      const dd = String(today.getDate()).padStart(2, '0');
      filtered = filtered.filter(u => {
        const dob: string = (u as any).date_of_birth || '';
        if (!dob) return false;
        const parts = dob.split('-');
        return parts.length === 3 && parts[1] === mm && parts[2] === dd;
      });
    }

    this.broadcastUsers = filtered;
    this.broadcastUserStatuses = {};
    this.broadcastCurrentIndex = -1;
    if (this.broadcastUsers.length > 0) this.showRecipientList = true;
  }

  getUserStatus(user: any, index: number): 'idle' | 'waiting' | 'sending' | 'done' | 'failed' {
    const uid = user.id || `u_${index}`;
    if (this.broadcastUserStatuses[uid] === 'done') return 'done';
    if (this.broadcastUserStatuses[uid] === 'failed') return 'failed';
    if (!this.isBroadcasting) return 'idle';
    if (index === this.broadcastCurrentIndex) return 'sending';
    return 'waiting';
  }

  getUserInitials(user: any): string {
    const name: string = user.user_name || user.name || '?';
    return name.charAt(0).toUpperCase();
  }

  onBroadcastTemplateChange() {
    const tmpl = this.smsTemplates.find(t => t.id === this.broadcastTemplateId);
    if (tmpl) this.broadcastMessage = tmpl.message;
    this.onBroadcastAreaChange();
  }

  formatUserPhone(raw: string): string | null {
    if (!raw) return null;
    const cleaned = raw.toString().trim().replace(/[\s\-()]/g, '');
    if (cleaned.startsWith('+92') && cleaned.length === 13) return cleaned;
    if (cleaned.startsWith('92') && cleaned.length === 12) return '+' + cleaned;
    if (cleaned.startsWith('0') && cleaned.length === 11) return '+92' + cleaned.slice(1);
    if (cleaned.length === 10) return '+92' + cleaned;
    return null;
  }

  mapTemplate(message: string, user: any): string {
    const unpaidBill = (user?.bills || []).find((b: any) => b.status === 'unpaid');
    return this.templateMapper.map(message, user, {
      amount: unpaidBill?.amount ?? unpaidBill?.remaining_amount ?? user?.internet_package_fee,
      overdueAmount: unpaidBill?.remaining_amount ?? unpaidBill?.amount ?? user?.internet_package_fee,
    });
  }

  get broadcastProgress(): number {
    if (!this.broadcastTotal) return 0;
    return Math.round((this.broadcastSent / this.broadcastTotal) * 100);
  }

  get broadcastParts(): number {
    return Math.ceil(this.broadcastMessage.length / 153);
  }

  openBroadcastConfirm() {
    if (!this.broadcastMessage.trim() || this.broadcastUsers.length === 0) return;
    this.modalService.open(this.broadcastConfirmModal, {
      centered: true,
      size: 'md',
      windowClass: 'broadcast-confirm-modal',
    });
  }

  async sendBroadcast(modal: any) {
    modal.close();

    this.isBroadcasting = true;
    this.broadcastSent = 0;
    this.broadcastTotal = this.broadcastUsers.length;
    this.broadcastUserStatuses = {};
    this.showRecipientList = true;

    const areaLabel = this.broadcastArea === 'all' ? 'All Areas' : this.broadcastArea;

    try {
      const smsCol = collection(this.firestore, 'sms');

      for (let i = 0; i < this.broadcastUsers.length; i++) {
        const user = this.broadcastUsers[i];
        const uid = user.id || `u_${i}`;
        this.broadcastCurrentIndex = i;
        const phone = this.formatUserPhone((user as any).mobile_no || (user as any).phone_no)!;
        const message = this.mapTemplate(this.broadcastMessage, user);

        try {
          await addDoc(smsCol, {
            phone,
            message,
            status: 'pending',
            createdAt: new Date().toISOString(),
            source: 'broadcast',
            area: areaLabel,
          });
          this.broadcastUserStatuses = { ...this.broadcastUserStatuses, [uid]: 'done' };
        } catch {
          this.broadcastUserStatuses = { ...this.broadcastUserStatuses, [uid]: 'failed' };
        }

        this.broadcastSent++;
      }

      this.broadcastCurrentIndex = -1;
      this.toastr.success(`${this.broadcastTotal} SMS queued successfully`);
      this.broadcastMessage = '';
      this.broadcastTemplateId = '';
    } catch {
      this.toastr.error('Failed to queue some broadcast SMS');
    } finally {
      this.isBroadcasting = false;
      this.broadcastCurrentIndex = -1;
    }
  }
}
