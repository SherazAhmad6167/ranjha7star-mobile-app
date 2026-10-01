import { Component, ElementRef, ViewChild } from '@angular/core';
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  Firestore,
  getDoc,
  getDocs,
} from '@angular/fire/firestore';
import { NgbModal } from '@ng-bootstrap/ng-bootstrap';
import { ToastrModule, ToastrService } from 'ngx-toastr';
import { RecoveryOfficerModalComponent } from '../recovery-officer-modal/recovery-officer-modal.component';
import { CommonModule } from '@angular/common';
import { FormsModule, ReactiveFormsModule } from '@angular/forms';
import { MaterialFormComponent } from '../material-form/material-form.component';
import html2canvas from 'html2canvas';
import html2pdf from 'html2pdf.js';
import { FileShareService } from '../../shared/file-share.service';
import { toWhatsappNumber } from '../../shared/phone';

@Component({
  selector: 'app-material-details',
  imports: [CommonModule, FormsModule, ReactiveFormsModule, ToastrModule],
  templateUrl: './material-details.component.html',
  styleUrl: './material-details.component.scss',
})
export class MaterialDetailsComponent {
  isLoading = false;
  isDeleting = false;
  searchTerm = '';
  users: any[] = [];
  filteredUsers: any[] = [];
  selectedDeleteId: string | null = null;
  currentPage = 1;
  pageSize = 10;
  totalPages = 1;
  itemsList = [
  { label: 'Modem', key: 'modem' },
  { label: 'Pectail', key: 'pigtail' },
  { label: 'Choti Dabi', key: 'choti_dabi' },
  { label: 'Bari Dabi', key: 'bari_dabi' },
  { label: 'Swab', key: 'swab' },
  { label: 'Splitter', key: 'splitter' },
  { label: 'Meter Bag', key: 'meter_bag' },
  { label: 'Cable Tie', key: 'cable_tie' },
  { label: 'Fiber Cable', key: 'fiber_cable' },
  { label: 'Sleeve', key: 'sleeve' },
  { label: 'Cutter', key: 'cutter' },
  { label: 'Paper Cutter', key: 'paper_cutter' },
  { label: 'Plass', key: 'plass' },
  { label: 'Passive Node', key: 'passive_node' },
  { label: 'Cable Node', key: 'cable_node' },
  { label: 'Adaptor', key: 'adaptor' },
  { label: 'Nito Tape', key: 'nito' },
  { label: 'Osaka Tape', key: 'osaka' },
  { label: 'Packing Tape', key: 'packingTape' }
];

getFilteredItems() {
  return this.itemsList.filter(
    item => this.selectedUser?.[item.key]
  );
}

  constructor(
    private modalService: NgbModal,
    private firestore: Firestore,
    private toastr: ToastrService,
    private fileShare: FileShareService,
  ) {}

  ngOnInit(): void {
    this.loadUsers();
  }

  get pagedUsers() {
    const start = (this.currentPage - 1) * this.pageSize;
    const end = start + this.pageSize;
    return this.filteredUsers.slice(start, end);
  }

  async loadUsers() {
    this.isLoading = true;

    try {
      const usersRef = collection(this.firestore, 'materialDetails');
      const snapshot = await getDocs(usersRef);

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

      console.log('Fetched area:', this.users);
    } catch (error) {
      console.error('Error fetching area:', error);
      this.toastr.error('Failed to load Recovery Officer');
    } finally {
      this.isLoading = false;
    }
  }

  onSearch() {
    const term = this.searchTerm.toLowerCase();

    this.filteredUsers = this.users.filter(
      (user) =>
        user.name?.toLowerCase().includes(term) ||
        user.cnic?.toLowerCase().includes(term) ||
        user.phone?.includes(term),
    );

    this.currentPage = 1; // reset to first page after search
    this.updateTotalPages();
  }

  openUserModal(userData?: any) {
    const modalRef = this.modalService.open(MaterialFormComponent, {
      size: 'xl',
      backdrop: 'static',
    });

    if (userData) {
      modalRef.componentInstance.editMode = true;
      modalRef.componentInstance.userData = userData;
    }

    modalRef.closed.subscribe((result) => {
      if (result) {
        this.loadUsers();
      }
    });
  }

  editUser(user: any) {
    this.openUserModal(user);
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
      'materialDetails',
      this.selectedDeleteId,
    );

    try {
      await deleteDoc(
        doc(this.firestore, 'materialDetails', this.selectedDeleteId),
      );
      this.toastr.success('Material Record deleted');
      this.loadUsers();
      modal.close();
    } catch (err) {
      this.toastr.error('Delete operation failed');
    } finally {
      this.isDeleting = false;
      this.selectedDeleteId = null;
    }
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

  showPdfModal: boolean = false;
  selectedUser: any;
  openPdfModal(user: any) {
    this.selectedUser = user;
    this.showPdfModal = true;
  }

  closePdfModal() {
    this.showPdfModal = false;
  }

  @ViewChild('pdfContent') pdfContent!: ElementRef;

  pdfUser: any;
  downloadPDF() {
    this.isLoadingModal = true;
    const element = this.pdfContent.nativeElement;

    const opt = {
      margin: 5,
      filename: `invoice_${this.selectedUser.name}.pdf`,
      image: { type: 'jpeg' as 'jpeg', quality: 1 },
      html2canvas: { scale: 2, useCORS: true },
      jsPDF: {
        unit: 'mm',
        // ensure tuple type [number, number] to satisfy Html2PdfOptions typing
        format: [210, this.getContentHeightInMM(element)] as [number, number], // dynamic height, A4 width
        orientation: 'portrait' as 'portrait',
      },
      pagebreak: { mode: 'avoid-all' }, // prevents forced breaks
    };

    this.isLoadingModal = false;
    html2pdf().set(opt).from(element).save();
  }

  async downloadImage() {
    this.isLoadingModal = true;
    const original = this.pdfContent.nativeElement;

    // Clone the element so original UI isn't disturbed
    const clone = original.cloneNode(true) as HTMLElement;

    // Fixed-width off-screen wrapper (forces desktop layout, col-md-6 side by side)
    const wrapper = document.createElement('div');
    wrapper.style.position = 'fixed';
    wrapper.style.top = '0';
    wrapper.style.left = '-99999px';
    wrapper.style.width = '900px';
    wrapper.style.background = '#fff';
    wrapper.appendChild(clone);
    document.body.appendChild(wrapper);

    // Let images/layout settle before capture
    await new Promise((resolve) => setTimeout(resolve, 150));

    try {
      const canvas = await html2canvas(clone, {
        scale: 2,
        useCORS: true,
        width: 900,
        windowWidth: 900,
        height: clone.scrollHeight,
        windowHeight: clone.scrollHeight,
      });

      const image = canvas.toDataURL('image/png');

      const link = document.createElement('a');
      link.href = image;
      link.download = `invoice_${this.selectedUser.name}.png`;
      this.isLoadingModal = false;
      link.click();
    } catch (err) {
      this.isLoadingModal = false;
      console.error(err);
      alert('Error generating image');
    } finally {
      
      document.body.removeChild(wrapper);
    }
  }

  getContentHeightInMM(element: HTMLElement): number {
    const pxToMm = 0.264583; // 1px = 0.264583mm at 96dpi
    const heightPx = element.scrollHeight;
    return heightPx * pxToMm + 10; // +10mm buffer for margins
  }

  /** International digits for WhatsApp - see toWhatsappNumber for the formats handled. */
  formatPhoneNumber(phone: string): string {
    return toWhatsappNumber(phone);
  }


  isLoadingModal: boolean = false;
   async sendPdfToWhatsApp() {
    try {
      this.isLoadingModal = true;
      const phone = this.formatPhoneNumber(this.selectedUser.phone);

      // const fileUrl = await this.generateAndUploadPDF();
      const fileUrl = await this.generateAndUploadImage();

      const message = `Dear ${this.selectedUser.name},

Your installation form is ready.

Download Image:
${fileUrl}`;

      await this.fileShare.openWhatsApp(phone, message);

      this.isLoadingModal = false;
    } catch (err) {
      this.isLoadingModal = false;
      console.error(err);
      alert('Error generating PDF');
    }
  }

 

  async generateAndUploadImage(): Promise<string> {
    const original = this.pdfContent.nativeElement;

    // Clone the element so original UI isn't disturbed
    const clone = original.cloneNode(true) as HTMLElement;

    // Fixed-width off-screen wrapper (forces desktop layout, col-md-6 side by side)
    const wrapper = document.createElement('div');
    wrapper.style.position = 'fixed';
    wrapper.style.top = '0';
    wrapper.style.left = '-99999px';
    wrapper.style.width = '900px';
    wrapper.style.background = '#fff';
    wrapper.appendChild(clone);
    document.body.appendChild(wrapper);

    try {
      // Let images/layout settle before capture
      await new Promise((resolve) => setTimeout(resolve, 150));

      // ✅ Convert HTML to Canvas
      const canvas = await html2canvas(clone, {
        scale: 2,
        useCORS: true,
        width: 900,
        windowWidth: 900,
        height: clone.scrollHeight,
        windowHeight: clone.scrollHeight,
      });

      // ✅ Convert Canvas to Blob (Image)
      const blob: Blob = await new Promise((resolve) => {
        canvas.toBlob((b: any) => resolve(b), 'image/png', 1);
      });

      // ✅ Upload to Cloudinary
      const formData = new FormData();
      formData.append('file', blob);
      formData.append('upload_preset', 'pdf_upload'); // same preset works
      formData.append('resource_type', 'image'); // 🔥 IMPORTANT

      const res: any = await fetch(
        'https://api.cloudinary.com/v1_1/mghs1aiu/image/upload',
        {
          method: 'POST',
          body: formData,
        },
      ).then((r) => r.json());

      console.log('Cloudinary Response:', res);

      if (!res.secure_url) {
        throw new Error('Upload failed');
      }

      // ✅ Force download instead of inline preview when opened from WhatsApp
      const downloadUrl = res.secure_url.replace(
        '/upload/',
        `/upload/fl_attachment:${this.selectedUser.name}_material_issue_form/`,
      );

      return downloadUrl; // ✅ Return this instead of res.secure_url
    } finally {
      document.body.removeChild(wrapper);
    }
  }

  blobToBase64(blob: Blob): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.readAsDataURL(blob);
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = (error) => reject(error);
    });
  }
}
