import { CommonModule } from '@angular/common';
import { Component, OnInit, TemplateRef, ViewChild } from '@angular/core';
import {
  collection,
  deleteDoc,
  doc,
  Firestore,
  getDoc,
  getDocs,
  query,
  setDoc,
  updateDoc,
  where,
} from '@angular/fire/firestore';
import {
  FormArray,
  FormBuilder,
  FormGroup,
  ReactiveFormsModule,
  Validators,
} from '@angular/forms';
import { NgbModal } from '@ng-bootstrap/ng-bootstrap';
import { ToastrService } from 'ngx-toastr';
import { SmsService } from '../../shared/sms.service';
import { TemplateMapperService } from '../../shared/template-mapper.service';
import {
  DEFAULT_REVIEW_APPROVED_TEMPLATE,
  DEFAULT_REVIEW_DECLINED_TEMPLATE,
} from '../../shared/message-templates';

/** Cloudinary unsigned upload — same account/preset the rest of the app uses. */
const CLOUD_NAME = 'mghs1aiu';
const UPLOAD_PRESET = 'pdf_upload';
const CLOUD_URL = `https://api.cloudinary.com/v1_1/${CLOUD_NAME}/image/upload`;

/** Everything the shared confirmation dialog needs to render and act. */
interface ConfirmBox {
  icon: string;
  tone: 'danger' | 'warn';
  title: string;
  text: string;
  cta: string;
  busyLabel: string;
  run: () => void | Promise<void>;
}

@Component({
  selector: 'app-website-details',
  imports: [CommonModule, ReactiveFormsModule],
  templateUrl: './website-details.component.html',
  styleUrl: './website-details.component.scss',
})
export class WebsiteDetailsComponent implements OnInit {
  websiteForm: FormGroup;

  isLoading = false;
  isSaving = false;

  /** Per-poster upload spinners, keyed by index. -1 is the owner photo. */
  uploading: Record<number, boolean> = {};

  lastSaved: Date | null = null;

  readonly collectionName = 'website';
  readonly docId = 'siteContent';
  readonly siteUrl = 'https://ranjha7star.web.app';

  /* ── Customer reviews submitted from the public site ──
     Each review is its own document in the same `website` collection,
     marked with kind: 'review' so it never collides with siteContent. */
  reviews: any[] = [];
  reviewFilter: 'pending' | 'approved' | 'declined' | 'all' = 'pending';
  isLoadingReviews = false;
  /** Id of the review currently being written, so only its buttons spin. */
  busyReview: string | null = null;

  /* ── Confirmation dialog ──
     One template serves every destructive action on this page; each caller
     supplies its own wording and the work to run once confirmed. */
  @ViewChild('confirmModal') confirmModalTpl!: TemplateRef<any>;

  confirmBox: ConfirmBox | null = null;
  confirmBusy = false;

  /** SMS wording, editable in Settings; the built-ins are the fallback. */
  private approvedTemplate = DEFAULT_REVIEW_APPROVED_TEMPLATE;
  private declinedTemplate = DEFAULT_REVIEW_DECLINED_TEMPLATE;
  private companyDetail: any = {};

  constructor(
    private fb: FormBuilder,
    private firestore: Firestore,
    private toastr: ToastrService,
    private modalService: NgbModal,
    private sms: SmsService,
    private templateMapper: TemplateMapperService,
  ) {
    this.websiteForm = this.fb.group({
      owner: this.fb.group({
        name: ['', Validators.required],
        role: ['', Validators.required],
        photo: [''],
        bio1: ['', Validators.required],
        bio2: [''],
      }),
      points: this.fb.array([]),
      posters: this.fb.array([]),
    });
  }

  ngOnInit(): void {
    this.loadWebsiteContent();
    this.loadReviews();
    this.loadSmsSettings();
  }

  /* ── Convenience getters used by the template ── */
  get ownerGroup(): FormGroup {
    return this.websiteForm.get('owner') as FormGroup;
  }

  get points(): FormArray {
    return this.websiteForm.get('points') as FormArray;
  }

  get posters(): FormArray {
    return this.websiteForm.get('posters') as FormArray;
  }

  posterAt(i: number): FormGroup {
    return this.posters.at(i) as FormGroup;
  }

  get ownerPhoto(): string {
    return this.ownerGroup.get('photo')?.value || '';
  }

  /* ── Load ── */
  async loadWebsiteContent() {
    this.isLoading = true;
    try {
      const ref = doc(this.firestore, this.collectionName, this.docId);
      const snap = await getDoc(ref);

      if (snap.exists()) {
        const data: any = snap.data();

        this.ownerGroup.patchValue({
          name: data.owner?.name || '',
          role: data.owner?.role || '',
          photo: data.owner?.photo || '',
          bio1: data.owner?.bio?.[0] || '',
          bio2: data.owner?.bio?.[1] || '',
        });

        this.points.clear();
        (data.owner?.points || []).forEach((p: string) => this.points.push(this.fb.control(p)));

        this.posters.clear();
        (data.posters || []).forEach((p: any) => this.posters.push(this.makePoster(p)));

        if (data.updatedAt) this.lastSaved = new Date(data.updatedAt);
      } else {
        // First run — start from the copy currently hard-coded on the site
        this.seedDefaults();
      }

      if (!this.points.length) this.addPoint();
      if (!this.posters.length) this.addPoster();
    } catch (err) {
      console.error(err);
      this.toastr.error('Failed to load website content');
    } finally {
      this.isLoading = false;
    }
  }

  private seedDefaults() {
    this.ownerGroup.patchValue({
      name: 'Saqib Ranjha',
      role: 'Founder & CEO',
      photo: '',
      bio1:
        'Saqib Ranjha started Ranjha 7 Star with a single cable line run through Bhagowal Kalan. ' +
        'The idea was simple: villages here deserved the same quality of connection people take ' +
        'for granted in the cities, from someone who actually lives on the same road.',
      bio2:
        'More than a decade later the network reaches thousands of homes across Gujrat District — ' +
        'still locally owned, still maintained by a team you can call by name.',
    });

    [
      'Personally oversees network expansion into new villages',
      'Local team of technicians hired from the areas we serve',
      'Reachable directly for escalations and business connections',
    ].forEach((p) => this.points.push(this.fb.control(p)));
  }

  private makePoster(p: any = {}): FormGroup {
    return this.fb.group({
      title: [p.title || '', Validators.required],
      caption: [p.caption || ''],
      badge: [p.badge || ''],
      image: [p.image || ''],
      active: [p.active !== false],
    });
  }

  /* ── Owner points ── */
  addPoint() {
    this.points.push(this.fb.control(''));
  }

  removePoint(i: number) {
    this.points.removeAt(i);
  }

  /* ── Posters ── */
  addPoster() {
    this.posters.push(this.makePoster());
  }

  removePoster(i: number) {
    const title = this.posterAt(i).get('title')?.value?.trim();

    this.askConfirm({
      icon: 'ri-image-off-line',
      tone: 'danger',
      title: 'Remove this poster?',
      text: title
        ? `"${title}" comes off the website the next time you publish.`
        : 'It comes off the website the next time you publish.',
      cta: 'Remove',
      busyLabel: 'Removing…',
      run: () => this.posters.removeAt(i),
    });
  }

  movePoster(i: number, dir: -1 | 1) {
    const to = i + dir;
    if (to < 0 || to >= this.posters.length) return;
    const ctrl = this.posters.at(i);
    this.posters.removeAt(i);
    this.posters.insert(to, ctrl);
  }

  /* ── Image handling ── */
  async onOwnerPhoto(event: any) {
    const url = await this.handleUpload(event, -1, 900, 0.85);
    if (url) this.ownerGroup.patchValue({ photo: url });
  }

  async onPosterImage(event: any, i: number) {
    const url = await this.handleUpload(event, i, 1200, 0.85);
    if (url) this.posterAt(i).patchValue({ image: url });
  }

  clearOwnerPhoto() {
    this.ownerGroup.patchValue({ photo: '' });
  }

  clearPosterImage(i: number) {
    this.posterAt(i).patchValue({ image: '' });
  }

  private async handleUpload(
    event: any,
    key: number,
    maxSize: number,
    quality: number,
  ): Promise<string | null> {
    const file: File = event?.target?.files?.[0];
    if (!file) return null;

    // Reset the input so picking the same file again still fires a change event
    event.target.value = '';

    if (!file.type.startsWith('image/')) {
      this.toastr.error('Only image files are allowed');
      return null;
    }

    this.uploading[key] = true;
    try {
      const blob = await this.compress(file, maxSize, quality);
      const url = await this.uploadToCloudinary(blob);
      this.toastr.success('Image uploaded');
      return url;
    } catch (err) {
      console.error('Upload failed', err);
      this.toastr.error('Image upload failed');
      return null;
    } finally {
      this.uploading[key] = false;
    }
  }

  /** Shrinks the longest edge to `maxSize` before upload to keep the site fast. */
  private compress(file: File, maxSize: number, quality: number): Promise<Blob> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.readAsDataURL(file);

      reader.onload = () => {
        const img = new Image();
        img.src = reader.result as string;

        img.onload = () => {
          let { width, height } = img;
          const scale = Math.min(1, maxSize / Math.max(width, height));
          width = Math.round(width * scale);
          height = Math.round(height * scale);

          const canvas = document.createElement('canvas');
          canvas.width = width;
          canvas.height = height;

          const ctx = canvas.getContext('2d');
          if (!ctx) return reject('Canvas not supported');

          ctx.drawImage(img, 0, 0, width, height);
          canvas.toBlob(
            (b) => (b ? resolve(b) : reject('Could not encode image')),
            'image/jpeg',
            quality,
          );
        };

        img.onerror = reject;
      };

      reader.onerror = reject;
    });
  }

  private async uploadToCloudinary(blob: Blob): Promise<string> {
    const formData = new FormData();
    formData.append('file', blob);
    formData.append('upload_preset', UPLOAD_PRESET);

    const res: any = await fetch(CLOUD_URL, { method: 'POST', body: formData }).then((r) =>
      r.json(),
    );

    if (!res.secure_url) {
      throw new Error(res?.error?.message || 'Cloudinary upload failed');
    }

    return res.secure_url;
  }

  /* ── Save ── */
  async saveWebsiteContent() {
    if (this.websiteForm.invalid) {
      this.websiteForm.markAllAsTouched();
      this.toastr.error('Please fill the required fields');
      return;
    }

    this.isSaving = true;
    try {
      const raw = this.websiteForm.getRawValue();

      const payload = {
        owner: {
          name: (raw.owner.name || '').trim(),
          role: (raw.owner.role || '').trim(),
          photo: raw.owner.photo || '',
          bio: [raw.owner.bio1, raw.owner.bio2]
            .map((t: string) => (t || '').trim())
            .filter((t: string) => !!t),
          points: (raw.points || []).map((p: string) => (p || '').trim()).filter((p: string) => !!p),
        },
        posters: (raw.posters || [])
          .filter((p: any) => p.active && (p.title || '').trim())
          .map((p: any, i: number) => ({
            title: (p.title || '').trim(),
            caption: (p.caption || '').trim(),
            badge: (p.badge || '').trim(),
            image: p.image || '',
            order: i,
          })),
        updatedAt: Date.now(),
      };

      await setDoc(doc(this.firestore, this.collectionName, this.docId), payload);

      this.lastSaved = new Date(payload.updatedAt);
      this.toastr.success('Website updated — the live site refreshes on its own');
    } catch (err) {
      console.error(err);
      this.toastr.error('Failed to save website content');
    } finally {
      this.isSaving = false;
    }
  }

  /* ══════════════════════════════════════════════════════════
     CUSTOMER REVIEWS

     Visitors write a `pending` document from the public site. Nothing
     is shown there until it is approved here, so this is the moderation
     queue rather than a display list.
     ══════════════════════════════════════════════════════════ */

  get filteredReviews(): any[] {
    if (this.reviewFilter === 'all') return this.reviews;
    return this.reviews.filter((r) => r.status === this.reviewFilter);
  }

  get pendingCount(): number {
    return this.reviews.filter((r) => r.status === 'pending').length;
  }

  countFor(filter: string): number {
    if (filter === 'all') return this.reviews.length;
    return this.reviews.filter((r) => r.status === filter).length;
  }

  readonly reviewFilters = [
    { key: 'pending', label: 'Pending' },
    { key: 'approved', label: 'Approved' },
    { key: 'declined', label: 'Declined' },
    { key: 'all', label: 'All' },
  ] as const;

  async loadReviews() {
    this.isLoadingReviews = true;
    try {
      const q = query(
        collection(this.firestore, this.collectionName),
        where('kind', '==', 'review'),
      );
      const snap = await getDocs(q);

      this.reviews = snap.docs
        .map((d) => this.shapeReview(d.id, d.data() as any))
        // Newest first; ordering here avoids needing a composite index
        .sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
    } catch (err) {
      console.error(err);
      this.toastr.error('Failed to load customer reviews');
    } finally {
      this.isLoadingReviews = false;
    }
  }

  /** Approves the review and thanks the customer by SMS. */
  async approveReview(r: any) {
    const ok = await this.setReviewStatus(r, 'approved', 'Review approved — it is live on the website');
    if (ok) this.queueReviewSms(r, 'approved');
  }

  /**
   * Declines the review and tells the customer by SMS, so they hear back
   * rather than wondering where their review went.
   */
  declineReview(r: any) {
    this.askConfirm({
      icon: 'ri-chat-delete-line',
      tone: 'warn',
      title: `Decline ${r.name}'s review?`,
      text: 'It stays off the website, and an SMS goes out telling the customer.',
      cta: 'Decline & Send SMS',
      busyLabel: 'Declining…',
      run: async () => {
        const ok = await this.setReviewStatus(r, 'declined', 'Review declined');
        if (ok) this.queueReviewSms(r, 'declined');
      },
    });
  }

  /** Re-queues the SMS for a review that was already decided. */
  resendReviewSms(r: any) {
    this.queueReviewSms(r, r.status === 'approved' ? 'approved' : 'declined');
  }

  deleteReview(r: any) {
    this.askConfirm({
      icon: 'ri-delete-bin-6-line',
      tone: 'danger',
      title: 'Delete this review?',
      text: `${r.name}'s review is removed for good. This cannot be undone.`,
      cta: 'Delete',
      busyLabel: 'Deleting…',
      run: () => this.removeReview(r),
    });
  }

  private async removeReview(r: any) {
    this.busyReview = r.id;
    try {
      await deleteDoc(doc(this.firestore, this.collectionName, r.id));
      this.reviews = this.reviews.filter((x) => x.id !== r.id);
      this.toastr.success('Review deleted');
    } catch (err) {
      console.error(err);
      this.toastr.error('Failed to delete the review');
    } finally {
      this.busyReview = null;
    }
  }

  private async setReviewStatus(r: any, status: string, message: string): Promise<boolean> {
    this.busyReview = r.id;
    try {
      await updateDoc(doc(this.firestore, this.collectionName, r.id), {
        status,
        reviewedAt: Date.now(),
      });

      r.status = status;
      r.reviewedAt = Date.now();
      this.toastr.success(message);
      return true;
    } catch (err) {
      console.error(err);
      this.toastr.error('Failed to update the review');
      return false;
    } finally {
      this.busyReview = null;
    }
  }

  /** Precomputes what the template would otherwise recalculate every cycle. */
  private shapeReview(id: string, data: any) {
    const rating = Math.min(5, Math.max(0, Number(data?.rating) || 0));
    const name = (data?.name || 'Customer').toString().trim();

    return {
      ...data,
      id,
      name,
      rating,
      status: data?.status || 'pending',
      starsArr: [1, 2, 3, 4, 5].map((i) => i <= rating),
      initials:
        name
          .split(' ')
          .filter(Boolean)
          .slice(0, 2)
          .map((w: string) => w[0])
          .join('')
          .toUpperCase() || 'C',
    };
  }

  /**
   * Queues the outcome SMS on the same `sms` collection the rest of the app
   * writes to, so it goes out through the existing gateway.
   */
  private queueReviewSms(r: any, outcome: 'approved' | 'declined') {
    const phone = this.sms.format(r.phone);
    if (!phone) {
      this.toastr.warning('No valid phone number on this review — SMS not sent');
      return;
    }

    const template =
      outcome === 'approved' ? this.approvedTemplate : this.declinedTemplate;

    // The mapper reads {Customer Name} off `name` and {Area} off `area`,
    // which is exactly how the review document is shaped.
    const message = this.templateMapper.map(template, r, {
      companyName: this.companyDetail?.companyName || 'Ranjha 7 Star Cable TV & Internet',
      supportNumber:
        this.companyDetail?.complain_no1 ||
        this.companyDetail?.phone1 ||
        undefined,
      areaName: r.area || '',
    });

    if (!message) {
      this.toastr.error('Review SMS template could not be built');
      return;
    }

    this.sms.queue(phone, message);
    this.toastr.success(`SMS queued for ${r.name}`);
  }

  /** Template wording and company contact details, both editable elsewhere. */
  private async loadSmsSettings() {
    try {
      const [approved, declined, company] = await Promise.all([
        getDoc(doc(this.firestore, 'messageTemplates/reviewApproved')),
        getDoc(doc(this.firestore, 'messageTemplates/reviewDeclined')),
        getDoc(doc(this.firestore, 'companyDetail', 'companyDetail')),
      ]);

      if (approved.exists() && approved.data()['message']) {
        this.approvedTemplate = approved.data()['message'];
      }
      if (declined.exists() && declined.data()['message']) {
        this.declinedTemplate = declined.data()['message'];
      }
      if (company.exists()) this.companyDetail = company.data();
    } catch (err) {
      // Not fatal — the built-in wording and defaults still send.
      console.warn('Could not load review SMS settings', err);
    }
  }

  /* ══════════════════════════════════════════════════════════
     CONFIRMATION DIALOG
     ══════════════════════════════════════════════════════════ */

  private askConfirm(box: ConfirmBox) {
    this.confirmBox = box;
    this.confirmBusy = false;

    // Dismissing on the backdrop or Escape rejects the result promise, which
    // is not an error here. The box is left in place so the closing animation
    // does not blank out; the next open replaces it.
    this.modalService.open(this.confirmModalTpl, { centered: true }).result.catch(() => {});
  }

  async runConfirm(modal: any) {
    const box = this.confirmBox;
    if (!box || this.confirmBusy) return;

    this.confirmBusy = true;
    try {
      await box.run();
      modal.close();
    } catch (err) {
      console.error(err);
      this.toastr.error('That did not go through — please try again');
    } finally {
      this.confirmBusy = false;
    }
  }

  openSite() {
    window.open(this.siteUrl, '_blank', 'noopener');
  }
}
