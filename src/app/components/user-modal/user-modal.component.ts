import { CommonModule } from '@angular/common';
import { Component, Input, OnDestroy } from '@angular/core';
import { SearchSelectComponent } from '../../shared/search-select/search-select.component';
import {
  addDoc,
  collection,
  doc,
  Firestore,
  getDoc,
  updateDoc,
} from '@angular/fire/firestore';
import {
  FormBuilder,
  FormGroup,
  FormsModule,
  ReactiveFormsModule,
  Validators,
} from '@angular/forms';
import {
  NgbActiveModal,
  NgbDatepickerModule,
  NgbModal,
} from '@ng-bootstrap/ng-bootstrap';
import { IonSegment, IonSegmentButton, Platform } from '@ionic/angular';
import {
  DD_MM_YYYY_DATE_PROVIDERS,
  optionalDateValue,
  storedOptionalDate,
} from '../../shared/date-picker.config';
import { FileShareService } from '../../shared/file-share.service';
import { ToastrModule, ToastrService } from 'ngx-toastr';
import { whatsappConfig } from '../../../environment/environment';
import { Subscription } from 'rxjs';
import { toWhatsappNumber } from '../../shared/phone';

@Component({
  selector: 'app-user-modal',
  imports: [
    CommonModule,
    FormsModule,
    ReactiveFormsModule,
    ToastrModule,
    SearchSelectComponent,
    NgbDatepickerModule,
    IonSegment,
    IonSegmentButton,
  ],
  providers: [...DD_MM_YYYY_DATE_PROVIDERS],
  templateUrl: './user-modal.component.html',
  styleUrl: './user-modal.component.scss',
})
export class UserModalComponent implements OnDestroy {
  isLoading = false;
  isSaving = false;
  userName: any;
  @Input() editMode = false;
  @Input() userData: any;

  userForm: FormGroup;
  locationText = '';

  // Date of birth picker — dd/mm/yyyy everywhere, unlike the native input.
  minDob = { year: 1900, month: 1, day: 1 };
  maxDob = (() => {
    const now = new Date();
    return { year: now.getFullYear(), month: now.getMonth() + 1, day: now.getDate() };
  })();


  internetAreas: any[] = [];
  internetSubAreas: any[] = [];
  role = '';
  operatorSublocalities: string[] = [];
  companies: any[] = [];
  internetPackages: any[] = [];
  cablePackages: any[] = [];
  imagePreview: string | null = null;
  showImageModal = false;
  internetOriginalPrice = 0;
  cableOriginalPrice = 0;
  // Set while editForm loads a saved user, so the package and discount
  // listeners don't overwrite the saved discount and fee.
  private loadingSaved = false;
  private accessToken!: string;
  private phoneNumberId!: string;
  private baseUrl!: string;
  private version!: string;

  constructor(
    public activeModal: NgbActiveModal,
    private fb: FormBuilder,
    private toastr: ToastrService,
    private firestore: Firestore,
    private modalService: NgbModal,
    private platform: Platform,
    private fileShare: FileShareService,
  ) {
    // Required: ID, name, phone, area, package + discount + fee, status.
    this.userForm = this.fb.group({
      internet_id: ['', [Validators.required]],
      user_name: ['', [Validators.required]],
      // Optional: null when blank - the datepicker rejects ''.
      date_of_birth: [null as string | null],
      address: [''],
      mobile_no: ['', [Validators.required]],
      sublocality: ['', [Validators.required]],
      sub_area: [''],
      installation_amount: [''],
      other_amount: [''],
      installation_date: [''],
      wire: [''],
      // recharge_date: ['', [Validators.required]],
      connection_provider: [''],
      // Decides which package is required, so it starts on the common case.
      connection_type: ['internet', [Validators.required]],
      pkg_cable: [null, [Validators.required]],
      cable_discount: ['no_discount', [Validators.required]],
      internet_discount: ['no_discount', [Validators.required]],
      select_package: [null, [Validators.required]],
      internet_package_fee: [null, [Validators.required]],
      cable_package_fee: [null, [Validators.required]],
      photo: [''], // base64 string
      photoName: [''],
      latitude: [''],
      longitude: [''],
      static_ip: [''],
      customer_status: ['active', [Validators.required]],
      // isActive: [true],
      createdAt: [new Date()],
    });
    this.updateValidators(this.userForm.get('connection_type')?.value);

    this.accessToken = whatsappConfig.accessToken || '';
    this.phoneNumberId = whatsappConfig.phoneNumberId || '';
    this.version = whatsappConfig.version || '';
    this.baseUrl = whatsappConfig.baseUrl || '';

    if (!this.accessToken || !this.phoneNumberId) {
      throw new Error('WhatsApp configuration missing');
    }
  }

  companyDetail: any;
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

  ngOnInit() {
    this.watchBackButton();
    // this.verifyConfig();
    this.role = localStorage.getItem('role') || '';
    if (this.role === 'operator') {
      this.operatorSublocalities = JSON.parse(
        localStorage.getItem('sublocality') || '[]',
      );
    }
    this.loadInternetAreas();
    // this.loadInternetSubAreas();
    this.loadCompanies();
    this.loadInternetPackages();
    this.loadCablePackages();
    // this.editForm();
    this.loadCompanyDetails();

    this.userForm.get('sublocality')?.valueChanges.subscribe((value) => {
      this.onSublocalityChange(value);
    });
    // INTERNET PACKAGE
    this.userForm.get('select_package')?.valueChanges.subscribe((pkgName) => {
      const pkg = this.internetPackages.find((p) => p.package_name === pkgName);

      if (!pkg) return;

      this.internetOriginalPrice = Number(pkg.sales_price);
      if (this.loadingSaved) return;

      this.userForm.patchValue({
        internet_package_fee: this.internetOriginalPrice,
        internet_discount: 'no_discount',
      });
    });

    // INTERNET DISCOUNT
    this.userForm
      .get('internet_discount')
      ?.valueChanges.subscribe((discount) => {
        if (this.loadingSaved) return;
        this.applyDiscount(
          this.internetOriginalPrice,
          discount,
          'internet_package_fee',
        );
      });

    // CABLE PACKAGE
    this.userForm.get('pkg_cable')?.valueChanges.subscribe((pkgName) => {
      const pkg = this.cablePackages.find((p) => p.package_name === pkgName);

      if (!pkg) return;

      this.cableOriginalPrice = Number(pkg.sales_price);
      if (this.loadingSaved) return;

      this.userForm.patchValue({
        cable_package_fee: this.cableOriginalPrice,
        cable_discount: 'no_discount',
      });
    });

    // CABLE DISCOUNT
    this.userForm.get('cable_discount')?.valueChanges.subscribe((discount) => {
      if (this.loadingSaved) return;
      this.applyDiscount(
        this.cableOriginalPrice,
        discount,
        'cable_package_fee',
      );
    });

    this.userForm.get('connection_type')?.valueChanges.subscribe((type) => {
      this.updateValidators(type);
    });
  }

  /* ── Custom pricing ──
     Every other discount is a fixed fraction of the package price, so the
     fee stays read-only and calculated. "Custom" hands the field over to
     the operator to type whatever was actually agreed. */
  get internetFeeIsCustom(): boolean {
    return this.userForm.get('internet_discount')?.value === 'custom';
  }

  get cableFeeIsCustom(): boolean {
    return this.userForm.get('cable_discount')?.value === 'custom';
  }

  applyDiscount(originalPrice: number, discount: string, feeControl: string) {
    if (!originalPrice) return;

    let price = originalPrice;

    switch (discount) {
      case 'no_discount':
        price = originalPrice;
        break;
      case 'quarter':
        price = originalPrice * 0.75;
        break;
      case 'half':
        price = originalPrice * 0.5;
        break;
      case 'semi':
        price = originalPrice * 0.25;
        break;
      case 'full_free':
        price = 0;
        break;
      case 'custom':
        // Leave whatever is in the box as the starting point and let the
        // operator edit it; overwriting here would undo their typing.
        return;
      default:
        return;
    }

    this.userForm.patchValue({
      [feeControl]: Math.round(price),
    });
  }

  editForm() {
    if (this.editMode && this.userData) {
      this.loadingSaved = true;
      this.userForm.patchValue({
        internet_id: this.userData.internet_id ?? '',
        user_name: this.userData.user_name ?? '',
        date_of_birth: optionalDateValue(this.userData.date_of_birth),
        address: this.userData.address ?? '',
        mobile_no: this.userData?.mobile_no || this.userData?.phone_no,
        sublocality: this.userData.sublocality ?? '',
        sub_area: this.userData.sub_area ?? '',
        installation_amount: this.userData.installation_amount ?? '',
        other_amount: this.userData.other_amount ?? '',
        installation_date: this.userData.installation_date,
        wire: this.userData.wire ?? '',
        // recharge_date: this.userData.recharge_date,
        connection_provider: this.userData.connection_provider ?? '',
        connection_type: this.userData.connection_type ?? '',
        pkg_cable: this.userData.pkg_cable ?? '',
        cable_discount: this.userData.cable_discount ?? '',
        internet_discount: this.userData.internet_discount ?? '',
        select_package: this.userData.select_package ?? '',
        internet_package_fee: this.userData.internet_package_fee ?? '',
        cable_package_fee: this.userData.cable_package_fee ?? '',
        photo: this.userData.photo ?? '',
        photoName: this.userData.photoName ?? '',
        latitude: this.userData.latitude ?? '',
        longitude: this.userData.longitude ?? '',
        static_ip: this.userData.static_ip ?? '',
        // Blank already counted as active in the bill creator
        customer_status: this.userData.customer_status || 'active',
        createdAt: this.userData.createdAt ?? new Date(),
      });

      this.updateValidators(this.userData.connection_type);
      this.loadingSaved = false;
      this.onSublocalityChange(this.userData.sublocality);

      setTimeout(() => {
        this.userForm.get('sub_area')?.setValue(this.userData.sub_area);
      });

      // OPTIONAL: force validation refresh
      this.userForm.updateValueAndValidity();
      this.imagePreview = this.userData.photo;
      if (this.userData.latitude && this.userData.longitude) {
        this.locationText = `${this.userData.latitude}, ${this.userData.longitude}`;
      }
    }

    console.log('edit mode', this.userForm.value);
  }

  updateValidators(type: string) {
    const cableControls = ['pkg_cable', 'cable_discount', 'cable_package_fee'];
    const internetControls = [
      'select_package',
      'internet_discount',
      'internet_package_fee',
    ];

    if (type === 'internet') {
      this.enableControls(internetControls);
      this.disableControls(cableControls);
    } else if (type === 'tv_cable') {
      this.enableControls(cableControls);
      this.disableControls(internetControls);
    } else if (type === 'both') {
      this.enableControls([...cableControls, ...internetControls]);
    }
  }

  enableControls(controls: string[]) {
    controls.forEach((name) => {
      const ctrl = this.userForm.get(name);
      ctrl?.setValidators([Validators.required]);
      ctrl?.enable();
      // Discount starts on "No Discount" rather than blank
      if (name.endsWith('_discount') && !ctrl?.value) ctrl?.setValue('no_discount');
      ctrl?.updateValueAndValidity();
    });
  }

  disableControls(controls: string[]) {
    controls.forEach((name) => {
      const ctrl = this.userForm.get(name);
      ctrl?.clearValidators();
      ctrl?.setValue('');
      ctrl?.disable();
      ctrl?.updateValueAndValidity();
    });
  }

  get isInternet() {
    return this.userForm.get('connection_type')?.value === 'internet';
  }

  get isCable() {
    return this.userForm.get('connection_type')?.value === 'tv_cable';
  }

  get isBoth() {
    return this.userForm.get('connection_type')?.value === 'both';
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
        this.editForm();
      }
    } catch (error) {
      console.error('Error loading internet areas', error);
    }
  }

  // An operator may only pick from the areas assigned to him.
  get areaOptions(): any[] {
    if (this.role !== 'operator') return this.internetAreas;
    return this.internetAreas.filter((a) =>
      this.operatorSublocalities.includes(a.sublocality),
    );
  }

  onSublocalityChange(selectedSublocality: string) {
    const selected = this.internetAreas.find(
      (item) => item.sublocality === selectedSublocality,
    );

    this.internetSubAreas = (selected?.subAreas || []).map((sub: string) => ({
      name: sub,
    }));

    if (!this.editMode) {
      this.userForm.get('sub_area')?.reset();
    }
  }

  // async loadInternetSubAreas() {
  //   try {
  //     const ref = doc(this.firestore, 'internetSubArea', 'internetSubAreaDoc');
  //     const snap = await getDoc(ref);

  //     if (snap.exists()) {
  //       this.internetSubAreas = snap.data()?.['internetSubAreas'] || [];

  //       this.internetSubAreas.sort((a: any, b: any) => {
  //         return a.sub_area.localeCompare(b.sub_area);
  //       });
  //     }
  //   } catch (error) {
  //     console.error('Error loading internet sub-areas', error);
  //   }
  // }

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

  async loadCablePackages() {
    try {
      const ref = doc(this.firestore, 'cablePackage', 'cablePackageDoc');
      const snap = await getDoc(ref);

      if (snap.exists()) {
        this.cablePackages = snap.data()?.['cablePackage'] || [];
      }
    } catch (error) {
      console.error('Error loading cable packages', error);
    }
  }

  async loadCompanies() {
    try {
      const ref = doc(this.firestore, 'company', 'companyDoc');
      const snap = await getDoc(ref);

      if (snap.exists()) {
        this.companies = snap.data()?.['companies'] || [];
      }
    } catch (error) {
      console.error('Error loading companies', error);
    }
  }

  async onSubmit() {
    if (this.userForm.invalid) {
      this.toastr.error('Please fill all required fields');
      this.userForm.markAllAsTouched();
      return;
    }

    this.isSaving = true;

    try {
      const payload = {
        ...this.userForm.getRawValue(),
        date_of_birth: storedOptionalDate(
          this.userForm.get('date_of_birth')?.value,
          this.userData?.date_of_birth,
        ),
        updatedAt: new Date(),
      };

      if (this.editMode && this.userData?.id) {
        // 🔁 UPDATE EXISTING USER
        const userDocRef = doc(this.firestore, 'users', this.userData.id);
        const formattedPhone = this.formatPhoneNumber(
          this.userForm.value.mobile_no,
        );

        updateDoc(userDocRef, payload);
        if (!navigator.onLine) {
          this.toastr.info(
            'Saved offline. Will sync when connection is restored.',
          );
        } else {
          this.toastr.success('User saved successfully');
        }
      } else {
        addDoc(collection(this.firestore, 'users'), {
          ...payload,
          createdAt: new Date(),
        });

        if (!navigator.onLine) {
          this.toastr.info(
            'Saved offline. Will sync when connection is restored.',
          );
        } else {
          if (!this.editMode) {
            const formattedPhone = this.formatPhoneNumber(
              this.userForm.value.mobile_no,
            );
            const hasWhatsApp = await this.checkWhatsAppNumber(formattedPhone);

            if (!hasWhatsApp) {
              this.toastr.error('This number is not available on WhatsApp');
            }
            const message = this.generateWelcomeMessage(this.userForm.value);

            this.sendWelcomeMessage(formattedPhone, message);
          }

          this.toastr.success('User saved successfully');
        }
      }

      this.activeModal.close(true);
    } catch (error) {
      console.error(error);
      if (
        (error as any).code === 'unavailable' ||
        (error as any).code === 'failed-precondition'
      ) {
        this.toastr.info(
          'Saved offline. Will sync when connection is restored.',
        );
        this.activeModal.close(true); // still close the modal
      } else {
        console.error(error);
        this.toastr.error('Failed to save user');
      }
    } finally {
      this.isSaving = false;
    }
  }

  /** International digits for WhatsApp - see toWhatsappNumber for the formats handled. */
  formatPhoneNumber(phone: string): string {
    return toWhatsappNumber(phone);
  }

  async checkWhatsAppNumber(phone: string): Promise<boolean> {
    try {
      const res = await fetch(`https://wa.me/${phone}`);
      return res.status === 200;
    } catch {
      return false;
    }
  }

  generateWelcomeMessage(data: any): string {
    return `👋 Assalam-o-Alaikum ${data.user_name},

🎉 Welcome to Ranjha7star!

📶 Package: ${data.select_package}
💰 Fee: ${data.internet_package_fee}
📅 Installation Date: ${data.installation_date}

If there is any complain please contact us ${this.companyDetail.complain_no1} 😊

Thank you!`;
  }

  sendWelcomeMessage(phone: string, message: string) {
    this.fileShare.openWhatsApp(phone, message);
  }

  onImageSelect(event: any) {
    const file = event.target.files[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      this.toastr.error('Only image files allowed');
      return;
    }

    this.resizeAndConvertToBase64(file, 400, 400).then((base64) => {
      this.imagePreview = base64;

      this.userForm.patchValue({
        photo: base64,
        photoName: file.name,
      });
    });
  }

  resizeAndConvertToBase64(
    file: File,
    maxWidth: number,
    maxHeight: number,
  ): Promise<string> {
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.readAsDataURL(file);

      reader.onload = () => {
        const img = new Image();
        img.src = reader.result as string;

        img.onload = () => {
          let width = img.width;
          let height = img.height;

          if (width > height && width > maxWidth) {
            height = (height * maxWidth) / width;
            width = maxWidth;
          } else if (height > maxHeight) {
            width = (width * maxHeight) / height;
            height = maxHeight;
          }

          const canvas = document.createElement('canvas');
          canvas.width = width;
          canvas.height = height;

          const ctx = canvas.getContext('2d')!;
          ctx.drawImage(img, 0, 0, width, height);

          const base64 = canvas.toDataURL('image/jpeg', 0.5);
          resolve(base64);
        };
      };
    });
  }

  openImageModal() {
    if (!this.imagePreview) return;
    this.showImageModal = true;
  }

  ngOnDestroy() {
    this.backSub?.unsubscribe();
  }

  /**
   * Android back closes the photo viewer first; only with nothing on top does
   * it reach the form (priority 120 runs before BackButtonService's modal
   * handler).
   */
  private backSub?: Subscription;

  private watchBackButton() {
    this.backSub = this.platform.backButton.subscribeWithPriority(120, (processNextHandler) => {
      if (this.showImageModal) this.closeImageModal();
      else processNextHandler();
    });
  }

  closeImageModal() {
    this.showImageModal = false;
  }

  getCurrentLocation() {
    if (!navigator.geolocation) {
      this.toastr.error('Geolocation not supported');
      return;
    }
    this.isLoading = true;

    navigator.geolocation.getCurrentPosition(
      (position) => {
        const lat = position.coords.latitude;
        const lng = position.coords.longitude;

        // form values
        this.userForm.patchValue({
          latitude: lat,
          longitude: lng,
        });

        // Google Maps paste-ready format
        this.locationText = `${lat.toFixed(6)}, ${lng.toFixed(6)}`;
        this.isLoading = false;

        this.toastr.success('Location fetched successfully');
      },
      () => {
        this.toastr.error('Location permission denied');
        this.isLoading = false;
      },
      {
        enableHighAccuracy: true,
        timeout: 10000,
      },
    );
  }

  // private formatPhoneNumber(phone: string): string {
  //   phone = phone.trim();
  //   if (phone.startsWith('0')) {
  //     return '+92' + phone.substring(1);
  //   } else if (!phone.startsWith('+')) {
  //     return '+92' + phone; // fallback if user entered without 0 or +
  //   }
  //   return phone;
  // }

  // async checkWhatsAppNumber(phone: string) {
  //   const formattedNumber = this.formatPhoneNumber(phone);

  //   // Example: send POST request to WhatsApp Cloud API (replace TOKEN and YOUR_PHONE_NUMBER_ID)
  //   try {
  //     const response = await fetch(
  //       `${this.baseUrl}/${this.version}/${this.phoneNumberId}/contacts`,
  //       {
  //         method: 'POST',
  //         headers: {
  //           'Content-Type': 'application/json',
  //           Authorization: `Bearer ${this.accessToken}`,
  //         },
  //         body: JSON.stringify({
  //           contacts: [formattedNumber],
  //           messaging_product: 'whatsapp',
  //         }),
  //       },
  //     );

  //     const result = await response.json();
  //     console.log(result);
  //     return result.contacts?.[0]?.status === 'valid';
  //   } catch (err) {
  //     console.error('WhatsApp check failed', err);
  //     return false;
  //   }
  // }

  // async sendWelcomeMessage(phone: string) {
  //   const formattedNumber = this.formatPhoneNumber(phone);
  //   console.log('Sending WhatsApp message to', formattedNumber);

  //   try {
  //     const response = await fetch(
  //       `${this.baseUrl}/${this.version}/${this.phoneNumberId}/messages`,
  //       {
  //         method: 'POST',
  //         headers: {
  //           'Content-Type': 'application/json',
  //           Authorization: `Bearer ${this.accessToken}`,
  //         },
  //         body: JSON.stringify({
  //           messaging_product: 'whatsapp',
  //           recipient_type: 'individual',
  //           to: formattedNumber,
  //           // type: 'text',
  //           // text: {
  //           //   preview_url: true,
  //           //   body: `Welcome to Ranjha7starCable&Internet! 👋\n\nWe're excited to have you on board. Thanks for choosing our Services\n• `
  //           // }
  //           type: 'template',
  //           template: {
  //             name: 'welcome_templates',
  //             language: {
  //               code: 'en_US',
  //             },
  //             components: [
  //               {
  //                 type: 'body',
  //                 parameters: [
  //                   {
  //                     type: 'text',
  //                     parameter_name: 'name',
  //                     text: 'Sheraz',
  //                   },
  //                   {
  //                     type: 'text',
  //                     parameter_name: 'support_number',
  //                     text: '+923001234567',
  //                   },
  //                 ],
  //               },
  //             ],
  //           },
  //         }),
  //       },
  //     );

  //     const data = await response.json();

  //     if (!response.ok) {
  //       console.error('WhatsApp API error:', data);
  //       throw new Error(data.error?.message || 'Failed to send message');
  //     }

  //     console.log('WhatsApp response:', data);
  //     return data;
  //   } catch (err) {
  //     console.error('Failed to send WhatsApp message', err);
  //     throw err;
  //   }
  // }

  // Add this method to verify your configuration
  async verifyConfig() {
    try {
      // Test your credentials
      const response = await fetch(
        `https://graph.facebook.com/v25.0/${this.phoneNumberId}`,
        {
          method: 'GET',
          headers: {
            Authorization: `Bearer ${this.accessToken}`,
          },
        },
      );

      const data = await response.json();
      console.log('Phone Number ID verification:', data);

      // Check if this is a test/sandbox number
      console.log(
        'Account Mode:',
        data.is_test ? 'Test/Sandbox' : 'Production',
      );

      return data;
    } catch (err) {
      console.error('Verification failed:', err);
    }
  }
}
