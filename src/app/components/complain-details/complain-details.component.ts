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
  updateDoc,
  where,
} from '@angular/fire/firestore';
import { FormsModule, ReactiveFormsModule } from '@angular/forms';
import { NgbModal } from '@ng-bootstrap/ng-bootstrap';
import { ToastrModule, ToastrService } from 'ngx-toastr';
import { ComplainModalComponent } from '../complain-modal/complain-modal.component';
import { TemplateMapperService } from '../../shared/template-mapper.service';
import { FileShareService } from '../../shared/file-share.service';

@Component({
  selector: 'app-complain-details',
  imports: [CommonModule, FormsModule, ToastrModule, SearchSelectComponent],
  templateUrl: './complain-details.component.html',
  styleUrl: './complain-details.component.scss',
})
export class ComplainDetailsComponent {
  isLoading = false;
  isDeleting = false;
  searchTerm = '';
  users: any[] = [];
  filteredUsers: any[] = [];
  selectedDeleteId: string | null = null;
  selectedMsgUser: any = null;
  currentPage = 1;
  pageSize = 10;
  totalPages = 1;
  sublocality: string = '';
  internetAreas: any[] = [];
  showReceiptModal = false;
  companyDetail: any = {};
  selectedDate: string = '';
  totalUsers: number = 0;
  totalRecovery: number = 0;
  totalExpenses: number = 0;
  totalProfit: number = 0;
  selectedStatus: 'all' | 'reopen' | 'close' = 'all';
  recievedByList: string[] = [];
  operatorList: string[] = [];
  selectOperator: string = '';
  selectedRecievedBy: string = '';

  constructor(
    private modalService: NgbModal,
    private firestore: Firestore,
    private toastr: ToastrService,
    private templateMapper: TemplateMapperService,
    private fileShare: FileShareService,
  ) {}

  async ngOnInit() {
    this.loadExpenses();
    this.loadInternetAreas();
    this.complainTemplate = await this.getTemplate('complaint');
    this.resolveTemplate = await this.getTemplate('complainResolve');
  }

  async getTemplate(type: string): Promise<string> {
    const ref = doc(this.firestore, `messageTemplates/${type}`);
    const snap = await getDoc(ref);

    if (snap.exists()) {
      return snap.data()['message'] || '';
    }

    return '';
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

  async loadExpenses() {
    this.isLoading = true;

    try {
      const usersRef = collection(this.firestore, 'complainDetails');
      const snapshot = await getDocs(usersRef);

      this.users = snapshot.docs.map((docSnap) => ({
        id: docSnap.id,
        ...docSnap.data(),
      }));

      this.users.sort((a: any, b: any) => {
        return b.createdAt - a.createdAt;
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
        user.user_name?.toLowerCase().includes(term) ||
        user.internet_id?.toLowerCase().includes(term) ||
        user.sublocality?.toLowerCase().includes(term) ||
        user.date?.includes(term);

      const matchesSublocality =
        !this.sublocality || user.sublocality === this.sublocality;

      return matchesSearch && matchesSublocality;
    });

    this.currentPage = 1;
    this.updateTotalPages();
  }

  openComplainModal(userData?: any) {
    const modalRef = this.modalService.open(ComplainModalComponent, {
      size: 'xl',
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
    this.openComplainModal(user);
  }

  openMsgModal(user: any, modal: any) {
    this.selectedMsgUser = user;
    this.modalService.open(modal, { centered: true, size: 'sm' });
  }

  openDeleteModal(id: string, modal: any) {
    this.selectedDeleteId = id;
    this.modalService.open(modal, { centered: true });
  }

  async confirmDelete(modal: any) {
    if (!this.selectedDeleteId) return;

    this.isDeleting = true;

    const userRef = doc(
      this.firestore,
      'complainDetails',
      this.selectedDeleteId,
    );

    try {
      const userSnap = await getDoc(userRef);

      if (!userSnap.exists()) {
        this.toastr.error('Customer Status not found');
        return;
      }

      const logData = {
        ...userSnap.data(),
        type: 'complainDetails',
        action: 'delete',
        originalId: this.selectedDeleteId,
        deletedAt: new Date(),
      };

      await addDoc(collection(this.firestore, 'logs'), logData);
      await addDoc(collection(this.firestore, 'logs'), {
        type: 'complainDetails',
        action: 'delete',
        targetId: this.selectedDeleteId,
        deletedAt: new Date(),
      });
      await deleteDoc(
        doc(this.firestore, 'complainDetails', this.selectedDeleteId),
      );
      this.toastr.success('Customer Status deleted');
      this.loadExpenses();
      modal.close();
    } catch (err) {
      this.toastr.error('Delete failed');
    } finally {
      this.isDeleting = false;
      this.selectedDeleteId = null;
    }
  }

  complainTemplate: any;
  resolveTemplate: any;

  formatPhoneForSms(phone: string): string | null {
    if (!phone) return null;
    const cleaned = phone.toString().trim().replace(/[\s\-()]/g, '');
    if (cleaned.startsWith('+92') && cleaned.length === 13) return cleaned;
    if (cleaned.startsWith('92') && cleaned.length === 12) return '+' + cleaned;
    if (cleaned.startsWith('0') && cleaned.length === 11) return '+92' + cleaned.slice(1);
    if (cleaned.length === 10) return '+92' + cleaned;
    return null;
  }

  async sendSms(user: any) {
    const phone = this.formatPhoneForSms(user.operator_phone_number);
    if (!phone) { this.toastr.error('No valid operator phone number'); return; }
    const message = this.mapTemplate(this.complainTemplate, user);
    if (!message) { this.toastr.error('Message template not loaded'); return; }
    try {
      await addDoc(collection(this.firestore, 'sms'), { phone, message, status: 'pending', createdAt: new Date().toISOString() });
      this.toastr.success('SMS queued successfully');
    } catch { this.toastr.error('Failed to queue SMS'); }
  }

  async resolveComplain(user: any) {
    try {
      const ref = doc(this.firestore, 'complainDetails', user.id);
      const closeDate = new Date().toLocaleDateString('en-PK');
      await updateDoc(ref, { status: 'close', complain_close_date: closeDate, updatedAt: new Date() });

      const phone = this.formatPhoneForSms(user.phone_number);
      if (phone && this.resolveTemplate) {
        const message = this.templateMapper.map(this.resolveTemplate, user, {
          supportNumber: this.companyDetail?.complain_no1 || undefined,
          complaintDate: user.complain_date,
          resolvedDate: closeDate,
        });
        if (message) {
          await addDoc(collection(this.firestore, 'sms'), { phone, message, status: 'pending', createdAt: new Date().toISOString() });
        }
      }

      this.toastr.success('Complaint resolved & SMS queued');
      this.loadExpenses();
    } catch {
      this.toastr.error('Failed to resolve complaint');
    }
  }

  async sendWhatsapp(user: any) {
    const formattedPhone = this.formatPhoneNumber(user.phone_number);
    const message = this.mapTemplate(this.complainTemplate, user);
    if (!message) { this.toastr.error('Message template not loaded'); return; }
    this.sendWelcomeMessage(formattedPhone, message);
  }

  sendResolveWhatsapp(user: any) {
    const formattedPhone = this.formatPhoneNumber(user.phone_number);
    if (!this.resolveTemplate) { this.toastr.error('Resolve template not loaded'); return; }
    const closeDate = user.complain_close_date || new Date().toLocaleDateString('en-PK');
    const message = this.templateMapper.map(this.resolveTemplate, user, {
      supportNumber: this.companyDetail?.complain_no1 || undefined,
      complaintDate: user.complain_date,
      resolvedDate: closeDate,
    });
    if (!message) { this.toastr.error('Resolve template is empty'); return; }
    this.sendWelcomeMessage(formattedPhone, message);
  }

  mapTemplate(template: any, data: any): string {
    return this.templateMapper.map(template, data, {
      supportNumber: this.companyDetail?.complain_no1 || undefined,
      complaintDate: data?.complain_date,
    });
  }

  formatPhoneNumber(phone: string): string {
    console.log('Phone Number:', phone);
    phone = phone.replace(/\D/g, ''); 

    if (phone.startsWith('03')) {
      return '92' + phone.substring(1);
    }

    if (phone.startsWith('3')) {
      return '92' + phone;
    }

    if (phone.startsWith('92')) {
      return phone;
    }

    if (phone.startsWith('+92')) {
      return phone.substring(1);
    }

    return phone;
  }

  sendWelcomeMessage(phone: string, message: string) {
    this.fileShare.openWhatsApp(phone, message);
  }
}
