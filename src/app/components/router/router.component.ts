import { Component, OnInit, ViewChild, ElementRef } from '@angular/core';
import { CommonModule, DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import {
  Firestore, collection, getDocs,
  doc, deleteDoc, getDoc, addDoc
} from '@angular/fire/firestore';
import { ToastrService } from 'ngx-toastr';
import { NgbModal } from '@ng-bootstrap/ng-bootstrap';
import { RouterModalComponent } from '../router-modal/router-modal.component';

export type RouterStatus = 'Available' | 'Installed' | 'Returned' | 'Faulty';

interface RouterRecord {
  id: string;
  date: string;
  barcode: string;
  operator: string;
  givenBy: string;
  status: RouterStatus;
  quantity: number;
  notes?: string;
  createdAt: any;
  updatedAt: any;
}

@Component({
  selector: 'app-router',
  standalone: true,
  imports: [CommonModule, FormsModule, DatePipe],
  templateUrl: './router.component.html',
  styleUrl: './router.component.scss'
})
export class RouterComponent implements OnInit {
  @ViewChild('barcodeCanvas') barcodeCanvas!: ElementRef<HTMLCanvasElement>;

  records: RouterRecord[] = [];
  filteredRecords: RouterRecord[] = [];
  operators: { id: string; operator_name: string }[] = [];

  isLoading      = false;
  isDeleting     = false;
  isGenerating   = false;
  showBarcode    = false;
  generatedSerial = '';
  barcodeLabel   = '';

  searchTerm = '';
  pageSize   = 10;
  currentPage = 1;
  totalPages  = 1;

  selectedDeleteId: string | null = null;

  constructor(
    private firestore: Firestore,
    private toastr: ToastrService,
    private modalService: NgbModal
  ) {}

  ngOnInit() {
    this.loadOperators();
    this.loadRecords();
  }

  // ── Data ────────────────────────────────────────────────────────────────────

  async loadOperators() {
    try {
      const snap = await getDocs(collection(this.firestore, 'operators'));
      this.operators = snap.docs.map(d => ({
        id: d.id,
        operator_name: (d.data() as any)['operator_name'] || ''
      })).filter(o => o.operator_name);
    } catch {
      this.toastr.error('Failed to load operators');
    }
  }

  async loadRecords() {
    this.isLoading = true;
    try {
      const snap = await getDocs(collection(this.firestore, 'router'));
      this.records = snap.docs.map(d => ({
        id: d.id, ...(d.data() as any)
      } as RouterRecord));
      this.records.sort((a, b) => {
        const tA = a.createdAt?.toDate ? a.createdAt.toDate().getTime() : new Date(a.createdAt ?? 0).getTime();
        const tB = b.createdAt?.toDate ? b.createdAt.toDate().getTime() : new Date(b.createdAt ?? 0).getTime();
        return tB - tA;
      });
      this.applyFilter();
    } catch {
      this.toastr.error('Failed to load records');
    } finally {
      this.isLoading = false;
    }
  }

  applyFilter() {
    const term = this.searchTerm.toLowerCase().trim();
    this.filteredRecords = term
      ? this.records.filter(r =>
          r.barcode?.toLowerCase().includes(term) ||
          r.operator?.toLowerCase().includes(term) ||
          r.givenBy?.toLowerCase().includes(term) ||
          r.date?.includes(term)
        )
      : [...this.records];
    this.currentPage = 1;
    this.updateTotalPages();
  }

  // ── Pagination ───────────────────────────────────────────────────────────────

  get pagedRecords() {
    const start = (this.currentPage - 1) * this.pageSize;
    return this.filteredRecords.slice(start, start + this.pageSize);
  }

  get showingFrom() { return this.filteredRecords.length ? (this.currentPage - 1) * this.pageSize + 1 : 0; }
  get showingTo()   { return Math.min(this.currentPage * this.pageSize, this.filteredRecords.length); }

  updateTotalPages() {
    this.totalPages = Math.ceil(this.filteredRecords.length / this.pageSize) || 1;
    if (this.currentPage > this.totalPages) this.currentPage = this.totalPages;
  }

  get visiblePages(): number[] {
    const start = Math.floor((this.currentPage - 1) / 5) * 5 + 1;
    const end   = Math.min(start + 4, this.totalPages);
    return Array.from({ length: end - start + 1 }, (_, i) => start + i);
  }

  prevPage() { if (this.currentPage > 1) this.currentPage--; }
  nextPage() { if (this.currentPage < this.totalPages) this.currentPage++; }
  goToPage(p: number) { this.currentPage = p; }

  onPageSizeChange() {
    this.currentPage = 1;
    this.updateTotalPages();
  }

  // ── Modal ────────────────────────────────────────────────────────────────────

  openAddModal(prefillBarcode = '') {
    const ref = this.modalService.open(RouterModalComponent, {
      size: 'lg', backdrop: 'static'
    });
    ref.componentInstance.operators      = this.operators;
    ref.componentInstance.prefillBarcode = prefillBarcode;
    ref.closed.subscribe(result => { if (result) this.loadRecords(); });
  }

  openAddModalWithSerial() {
    this.openAddModal(this.generatedSerial);
  }

  openEditModal(record: RouterRecord) {
    const ref = this.modalService.open(RouterModalComponent, {
      size: 'lg', backdrop: 'static'
    });
    ref.componentInstance.editMode    = true;
    ref.componentInstance.routerData  = record;
    ref.componentInstance.operators   = this.operators;
    ref.closed.subscribe(result => { if (result) this.loadRecords(); });
  }

  // ── Delete ───────────────────────────────────────────────────────────────────

  openDeleteModal(id: string, modal: any) {
    this.selectedDeleteId = id;
    this.modalService.open(modal, { centered: true });
  }

  async confirmDelete(modal: any) {
    if (!this.selectedDeleteId) return;
    this.isDeleting = true;
    try {
      const docRef = doc(this.firestore, 'router', this.selectedDeleteId);
      const snap   = await getDoc(docRef);
      if (snap.exists()) {
        await addDoc(collection(this.firestore, 'logs'), {
          ...snap.data(), type: 'router', action: 'delete',
          originalId: this.selectedDeleteId, deletedAt: new Date()
        });
      }
      await deleteDoc(docRef);
      this.toastr.success('Record deleted');
      modal.close();
      await this.loadRecords();
    } catch {
      this.toastr.error('Failed to delete record');
    } finally {
      this.isDeleting = false;
      this.selectedDeleteId = null;
    }
  }

  // ── Barcode Generation ───────────────────────────────────────────────────────

  async generateSerial() {
    this.isGenerating = true;
    const now = new Date();
    const y   = now.getFullYear();
    const m   = String(now.getMonth() + 1).padStart(2, '0');
    const d   = String(now.getDate()).padStart(2, '0');
    const rnd = String(Math.floor(10000 + Math.random() * 90000));
    this.generatedSerial = `RTR-${y}${m}${d}-${rnd}`;
    this.barcodeLabel    = this.generatedSerial;
    this.showBarcode     = true;
    setTimeout(async () => {
      await this.drawBarcode(this.generatedSerial);
      this.isGenerating = false;
    }, 150);
  }

  async drawBarcode(value: string) {
    const canvas = this.barcodeCanvas?.nativeElement;
    if (!canvas || !value) return;
    try {
      const mod = await import('jsbarcode');
      const JsBarcode = (mod as any).default ?? mod;
      JsBarcode(canvas, value, {
        format:       'CODE128',
        width:        2.5,
        height:       80,
        displayValue: true,
        fontSize:     15,
        margin:       14,
        background:   '#ffffff',
        lineColor:    '#1a1a2e'
      });
    } catch {
      this.toastr.error('Barcode render failed');
    }
  }

  viewBarcode(record: RouterRecord) {
    this.generatedSerial = record.barcode;
    this.barcodeLabel    = record.barcode;
    this.showBarcode     = true;
    setTimeout(() => this.drawBarcode(record.barcode), 150);
  }

  printBarcode() {
    const canvas = this.barcodeCanvas?.nativeElement;
    if (!canvas) return;

    const dataUrl = canvas.toDataURL('image/png');
    const win = window.open('', '_blank', 'width=500,height=350');
    if (!win) {
      this.toastr.error('Pop-up blocked — please allow pop-ups for this site and try again.');
      return;
    }

    win.document.write(`<!DOCTYPE html>
<html>
<head>
  <title>Barcode — ${this.barcodeLabel}</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      min-height: 100vh;
      background: #fff;
      font-family: 'Courier New', monospace;
    }
    .company { font-size: 11px; color: #666; margin-bottom: 6px; letter-spacing: 0.5px; }
    .serial  { font-size: 11px; color: #333; margin-top: 6px; }
    img { display: block; }
    @media print { @page { margin: 6mm; } }
  </style>
</head>
<body>
  <p class="company">Ranjha7star — Router Label</p>
  <img src="${dataUrl}" alt="${this.barcodeLabel}" />
  <p class="serial">${this.barcodeLabel}</p>
  <script>window.onload = function(){ window.print(); window.close(); };<\/script>
</body>
</html>`);
    win.document.close();
  }

  // ── Stock Stats ──────────────────────────────────────────────────────────────

  /** Drives both the summary cards and the status badge colours. */
  readonly statusList: { key: RouterStatus; icon: string; cls: string }[] = [
    { key: 'Available', icon: 'ri-checkbox-circle-line', cls: 'st-available' },
    { key: 'Installed', icon: 'ri-home-wifi-line',       cls: 'st-installed' },
    { key: 'Returned',  icon: 'ri-arrow-go-back-line',   cls: 'st-returned'  },
    { key: 'Faulty',    icon: 'ri-error-warning-line',   cls: 'st-faulty'    },
  ];

  /** Total units carrying the given status. */
  countByStatus(status: string): number {
    return this.records
      .filter(r => r.status === status)
      .reduce((s, r) => s + (Number(r.quantity) || 0), 0);
  }

  get totalRouters(): number {
    return this.records.reduce((s, r) => s + (Number(r.quantity) || 0), 0);
  }

  statusClass(status: string): string {
    return this.statusList.find(s => s.key === status)?.cls || 'st-none';
  }

  statusIcon(status: string): string {
    return this.statusList.find(s => s.key === status)?.icon || 'ri-question-line';
  }

  // ── Helpers ──────────────────────────────────────────────────────────────────

  toDate(val: any): Date | null {
    if (!val) return null;
    return val?.toDate ? val.toDate() : new Date(val);
  }
}
