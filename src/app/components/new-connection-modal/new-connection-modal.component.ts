import { CommonModule } from '@angular/common';
import { SearchSelectComponent } from '../../shared/search-select/search-select.component';
import { Component, ElementRef, HostListener, Input, OnDestroy, ViewChild } from '@angular/core';
import {
  addDoc,
  collection,
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
import { firstValueFrom, Subscription } from 'rxjs';
import { MikrotikService, MikrotikServer } from '../../shared/mikrotik.service';
import { ZalService } from '../../shared/zal.service';
import { ToastrModule, ToastrService } from 'ngx-toastr';

/** Pre-filled MikroTik / ZalUltra password for a new connection. */
const DEFAULT_PASSWORD = '1234567';

@Component({
  selector: 'app-new-connection-modal',
  imports: [
    FormsModule,
    ReactiveFormsModule,
    CommonModule,
    ToastrModule,
    SearchSelectComponent,
    NgbDatepickerModule,
    IonSegment,
    IonSegmentButton,
  ],
  providers: [...DD_MM_YYYY_DATE_PROVIDERS],
  templateUrl: './new-connection-modal.component.html',
  styleUrl: './new-connection-modal.component.scss',
})
export class NewConnectionModalComponent implements OnDestroy {
  userForm!: FormGroup;

  // Date of birth picker — dd/mm/yyyy everywhere, unlike the native input.
  minDob = { year: 1900, month: 1, day: 1 };
  maxDob = (() => {
    const now = new Date();
    return { year: now.getFullYear(), month: now.getMonth() + 1, day: now.getDate() };
  })();

  @Input() editMode = false;
  @Input() userData: any;

  @ViewChild('cameraVideo') cameraVideoRef?: ElementRef<HTMLVideoElement>;
  @ViewChild('cropImageContainer') cropContainerRef?: ElementRef<HTMLDivElement>;

  // Camera state
  showCamera = false;
  cameraTarget: 'front' | 'back' | null = null;
  cameraStream: MediaStream | null = null;
  capturedPhoto: string | null = null;
  cameraError: string | null = null;

  // Crop state
  showCropOverlay = false;
  cropTarget: 'front' | 'back' | null = null;
  cropSourceImage: string | null = null;
  cropBox = { x: 0.05, y: 0.05, w: 0.9, h: 0.9 };
  private cropDrag: null | {
    mode: 'move' | 'tl' | 'tr' | 'bl' | 'br';
    startX: number; startY: number;
    startBox: { x: number; y: number; w: number; h: number };
  } = null;

  // OCR state
  isExtracting = false;
  extractionDone = false;
  private cnicFrontOcrSource: string | null = null;
  isLoading = false;
  isSaving = false;
  internetAreas: any[] = [];
  internetSubAreas: any[] = [];
  internetOperators: any[] = [];
  role = '';
  operatorSublocalities: string[] = [];
  loggedInOperatorName = '';

  // ── Provisioning (MikroTik + ZalUltra) ──
  readonly mikrotikServers: { id: MikrotikServer; label: string; ip: string }[] = [
    { id: 1, label: '194.1002', ip: '103.66.149.194' },
    { id: 2, label: '195.9998', ip: '103.66.149.195' },
  ];
  mtProfiles: string[] = [];
  mtProfilesLoading = false;
  mtProfilesError: string | null = null;

  // Set once the operator picks a NAS himself - the auto-fill then backs off.
  private nasPickedByHand = false;

  zalPackages: any[] = [];
  zalAreas: any[] = [];
  zalNas: any[] = [];
  zalSalespersons: any[] = [];
  zalLookupsLoaded = false;
  zalLookupsLoading = false;

  provisionLog: { target: string; ok: boolean; message: string }[] = [];
  recievedByList: string[] = [
    'Saqib Ranjha',
    'Qaisar Abbas',
    'Saqib Ranjha-Jazz Cash',
    'Qaisar Abbas- Jazz Cash',
  ];
  companies: any[] = [];
  internetPackages: any[] = [];
  internetOriginalPrice = 0;
  cableOriginalPrice = 0;
  cablePackages: any[] = [];
  locationText = '';
  // Set while editForm loads a saved connection, so the package and discount
  // listeners don't overwrite the saved discount and fee.
  private loadingSaved = false;

  constructor(
    public activeModal: NgbActiveModal,
    private fb: FormBuilder,
    private toastr: ToastrService,
    private firestore: Firestore,
    private modalService: NgbModal,
    private mikrotikService: MikrotikService,
    private zalService: ZalService,
    private platform: Platform,
  ) {
    this.userForm = this.fb.group({
      installation_date: [''],
      address: [''],
      user_name: ['', [Validators.required]],
      father_name: [''],
      cnic: [''],
      // Optional: null when blank - the datepicker rejects ''.
      date_of_birth: [null as string | null],
      mobile_no: ['', [Validators.required]],
      alter_mobile_no: [''],
      sublocality: ['', [Validators.required]],
      internet_id: ['', [Validators.required]],
      installation_amount: [null],
      advance_paid: [null],
      balance: [null],
      monthly_fee: [null],
      operator_name: [''],
      recieved_by: [''],
      recieved_date: [''],
      recieved_amount: [null],
      isRecieved: [false],
      remarks: [''],
      bank_name: [''],
      payment_method: [''],
      connection_payment: [''],
      cnic_front: [''],
      cnic_back: [''],
      connection_provider: [''],
      // Decides which package is required, so it starts on the common case.
      // The package, discount and fee of the chosen type turn required in
      // updateValidators.
      connection_type: ['internet', [Validators.required]],
      pkg_cable: [null],
      cable_discount: ['no_discount'],
      internet_discount: ['no_discount'],
      select_package: [null],
      internet_package_fee: [null],
      cable_package_fee: [null],
      sub_area: [null],
      customer_status: ['active', [Validators.required]],
      createdAt: [new Date()],

      // Pushed to the router / panel after the local record is saved.
      provisioning: this.fb.group({
        mikrotik_enabled: [false],
        mikrotik_server: [1],
        mikrotik_profile: [''],
        // Passwords start on the standard one; the operator can change them.
        mikrotik_password: [DEFAULT_PASSWORD],
        // Every working customer on both routers carries a disabled secret:
        // PPPoE then falls through to RADIUS and the panel sees the session.
        mikrotik_disabled: [true],

        zal_enabled: [false],
        zal_package_id: [''],
        zal_salesperson_id: [''],
        zal_area: [''],
        zal_nas_id: [''],
        zal_expiry: [''],
        zal_password: [DEFAULT_PASSWORD],
        zal_connection_password: [DEFAULT_PASSWORD],
      }),
    });

    this.updateValidators(this.userForm.get('connection_type')?.value);

    // Required fields depend on which targets are switched on.
    this.provisioning.get('mikrotik_enabled')?.valueChanges.subscribe((on) => {
      this.syncProvisionValidators();
      if (on) this.loadRouterProfiles();
    });
    this.provisioning.get('zal_enabled')?.valueChanges.subscribe((on) => {
      this.syncProvisionValidators();
      if (on) this.loadZalLookups();
    });
    this.provisioning.get('mikrotik_server')?.valueChanges.subscribe(() => {
      if (this.provisioning.get('mikrotik_enabled')?.value) this.loadRouterProfiles();
      this.syncZalNas();
    });
    // Our own writes are silent, so this only fires when the operator picks one.
    this.provisioning.get('zal_nas_id')?.valueChanges.subscribe(() => {
      this.nasPickedByHand = true;
    });
  }

  editForm() {
    if (this.editMode && this.userData) {
      this.loadingSaved = true;
      this.userForm.patchValue({
        installation_date: this.userData.installation_date || '',
        address: this.userData.address || '',
        user_name: this.userData.user_name || '',
        father_name: this.userData.father_name || '',
        cnic: this.userData.cnic || '',
        date_of_birth: optionalDateValue(this.userData.date_of_birth),
        mobile_no: this.userData.mobile_no || '',
        alter_mobile_no: this.userData.alter_mobile_no || '',
        sublocality: this.userData.sublocality || '',
        internet_id: this.userData.internet_id || '',
        installation_amount: this.userData.installation_amount || null,
        advance_paid: this.userData.advance_paid || null,
        balance: this.userData.balance || null,
        // router_no: this.userData.router_no || '',
        monthly_fee: this.userData.monthly_fee || null,
        operator_name: this.userData.operator_name || '',
        recieved_by: this.userData.recieved_by || '',
        recieved_date: this.userData.recieved_date || '',
        // expenses: this.userData.expenses || null,
        recieved_amount: this.userData.recieved_amount || null,
        isRecieved: this.userData.isRecieved || false,
        sub_area: this.userData.sub_area || '',
        // mac_address: this.userData.mac_address || '',
        // wifi: this.userData.wifi || '',
        // wifi_password: this.userData.wifi_password || '',
        remarks: this.userData.remarks || '',
        bank_name: this.userData.bank_name || '',
        payment_method: this.userData.payment_method || '',
        connection_payment: this.userData.connection_payment || '',
        cnic_front: this.userData.cnic_front || '',
        cnic_back: this.userData.cnic_back || '',
        connection_provider: this.userData.connection_provider || '',
        connection_type: this.userData.connection_type || '',
        pkg_cable: this.userData.pkg_cable || null,
        cable_discount: this.userData.cable_discount || null,
        internet_discount: this.userData.internet_discount || null,
        select_package: this.userData.select_package || null,
        internet_package_fee: this.userData.internet_package_fee || null,
        cable_package_fee: this.userData.cable_package_fee || null,
        // Blank already counted as active in the bill creator
        customer_status: this.userData.customer_status || 'active',
      });
      // Again after the discounts are in, so a blank one gets its default
      this.updateValidators(this.userForm.get('connection_type')?.value);
      this.loadingSaved = false;

      this.onSublocalityChange(this.userData.sublocality);

      setTimeout(() => {
        this.userForm.get('sub_area')?.setValue(this.userData.sub_area);
      });
      this.cnicFrontPreview = this.userData.cnic_front || null;
      this.cnicBackPreview = this.userData.cnic_back || null;
    }
  }

  ngOnInit() {
    this.watchBackButton();
    this.role = localStorage.getItem('role') || '';
    if (this.role === 'operator') {
      this.operatorSublocalities = JSON.parse(
        localStorage.getItem('sublocality') || '[]',
      );
      this.resolveOperatorName();
    }
    this.loadInternetAreas();
    this.loadOperatorName();
    this.loadCompanies();
    this.loadInternetPackages();
    this.loadCablePackages();
    this.userForm.get('sublocality')?.valueChanges.subscribe((value) => {
      this.onSublocalityChange(value);
    });

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
        this.applyOperatorDefaults();
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

  // An operator may only book a connection under his own operator name.
  get operatorOptions(): any[] {
    if (this.role !== 'operator') return this.internetOperators;

    const own = this.normalizeName(this.loggedInOperatorName);
    if (!own) return [];

    const matches = this.internetOperators.filter(
      (op) => this.normalizeName(op.operator_name) === own,
    );

    // Fall back to his login name when he is not in the operator list yet.
    return matches.length
      ? matches
      : [{ operator_name: this.loggedInOperatorName }];
  }

  private normalizeName(name: string): string {
    return String(name || '').trim().toLowerCase();
  }

  // Login stores `user_name`, while connections store the operator's display
  // `name` - resolve it once so the operator dropdown can be scoped to him.
  private async resolveOperatorName() {
    this.loggedInOperatorName = localStorage.getItem('name') || '';

    if (!this.loggedInOperatorName) {
      const userName = localStorage.getItem('username') || '';
      if (!userName) return;

      try {
        const snap = await getDocs(
          query(
            collection(this.firestore, 'recoveryOfficer'),
            where('user_name', '==', userName),
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

    this.applyOperatorDefaults();
  }

  // With a single choice left there is nothing to pick, so pre-select it.
  private applyOperatorDefaults() {
    if (this.role !== 'operator') return;

    const operatorCtrl = this.userForm.get('operator_name');
    const operators = this.operatorOptions;
    if (operators.length === 1 && !operatorCtrl?.value) {
      operatorCtrl?.setValue(operators[0].operator_name);
    }

    const areaCtrl = this.userForm.get('sublocality');
    const areas = this.areaOptions;
    if (areas.length === 1 && !areaCtrl?.value) {
      areaCtrl?.setValue(areas[0].sublocality);
    }
  }

  get provisioning(): FormGroup {
    return this.userForm.get('provisioning') as FormGroup;
  }

  get provisionMikrotik(): boolean {
    return !!this.provisioning?.get('mikrotik_enabled')?.value;
  }

  get provisionZal(): boolean {
    return !!this.provisioning?.get('zal_enabled')?.value;
  }

  /** Areas are a hierarchy on the panel; type 4 rows are the pickable ones. */
  get zalAreaOptions(): any[] {
    const leaves = this.zalAreas.filter((a) => Number(a?.type) === 4);
    return (leaves.length ? leaves : this.zalAreas)
      .slice()
      .sort((a, b) => String(a?.name || '').localeCompare(String(b?.name || '')));
  }

  // app-search-select reads {id, name}, so shape the lists once here.
  get mikrotikServerOptions(): any[] {
    return this.mikrotikServers.map((srv) => ({
      id: srv.id,
      name: `${srv.label} — ${srv.ip}`,
    }));
  }

  /**
   * The panel only counts a session reported by the NAS recorded on the
   * subscriber, so the NAS has to be the router the secret was created on.
   * Matched on IP, and never over an operator's own choice.
   */
  private syncZalNas() {
    if (this.nasPickedByHand || !this.zalNas.length) return;

    const server = Number(this.provisioning.get('mikrotik_server')?.value || 1);
    const ip = this.mikrotikServers.find((s) => s.id === server)?.ip;
    if (!ip) return;

    const nas = this.zalNas.find(
      (device) => String(device?.nasname || '').trim() === ip,
    );
    if (!nas) return;

    this.provisioning.get('zal_nas_id')?.setValue(nas.id, { emitEvent: false });
  }

  get zalNasOptions(): any[] {
    return this.zalNas.map((nas) => ({ id: nas.id, name: this.zalNasName(nas) }));
  }

  get zalSalespersonOptions(): any[] {
    return this.zalSalespersons.map((user) => ({
      id: user.id,
      name: this.zalSalespersonName(user),
    }));
  }

  zalNasName(device: any): string {
    return (
      device?.shortname ||
      device?.nas_details_data?.nas_name ||
      device?.nasname ||
      `#${device?.id}`
    );
  }

  zalSalespersonName(user: any): string {
    const label = user?.name || user?.username || `#${user?.id}`;
    return user?.username && user?.name ? `${user.name} (${user.username})` : label;
  }

  private syncProvisionValidators() {
    const group = this.provisioning;
    if (!group) return;

    const mt = !!group.get('mikrotik_enabled')?.value;
    const zal = !!group.get('zal_enabled')?.value;

    const setRequired = (name: string, required: boolean) => {
      const control = group.get(name);
      if (!control) return;
      if (required) control.setValidators([Validators.required]);
      else control.clearValidators();
      control.updateValueAndValidity({ emitEvent: false });
    };

    setRequired('mikrotik_profile', mt);
    setRequired('mikrotik_password', mt);
    setRequired('zal_package_id', zal);
    setRequired('zal_salesperson_id', zal);
    setRequired('zal_password', zal);

    // The panel rejects a create without identity / phone.
    const cnic = this.userForm.get('cnic');
    if (zal) cnic?.setValidators([Validators.required]);
    else cnic?.clearValidators();
    cnic?.updateValueAndValidity({ emitEvent: false });
  }

  loadRouterProfiles() {
    const server = Number(this.provisioning.get('mikrotik_server')?.value || 1) as MikrotikServer;
    this.mtProfilesLoading = true;
    this.mtProfilesError = null;
    this.mtProfiles = [];

    this.mikrotikService.getPppProfiles(server).subscribe({
      next: (profiles) => {
        this.mtProfiles = (profiles || [])
          .map((p: any) => p.name)
          .filter((name: string) => !!name)
          .sort();
        this.mtProfilesLoading = false;
      },
      error: (err) => {
        this.mtProfilesError = err?.message || 'Cannot reach the router';
        this.mtProfilesLoading = false;
      },
    });
  }

  // Fetched on demand - four calls that most connections never need.
  loadZalLookups() {
    if (this.zalLookupsLoaded || this.zalLookupsLoading) return;
    this.zalLookupsLoading = true;

    const done = () => (this.zalLookupsLoading = false);

    this.zalService.getPackages().subscribe({
      next: (rows) => { this.zalPackages = rows || []; this.zalLookupsLoaded = true; done(); },
      error: done,
    });
    this.zalService.getAreas().subscribe({ next: (rows) => (this.zalAreas = rows || []), error: () => {} });
    this.zalService.getNas().subscribe({
      next: (rows) => {
        this.zalNas = rows || [];
        this.syncZalNas();
      },
      error: () => {},
    });
    this.zalService.getUsers().subscribe({ next: (rows) => (this.zalSalespersons = rows || []), error: () => {} });
  }

  onSublocalityChange(selectedSublocality: string) {
    const selected = this.internetAreas.find(
      (item) => item.sublocality === selectedSublocality,
    );

    this.internetSubAreas = (selected?.subAreas || []).map((sub: string) => ({
      name: sub,
    }));

    this.userForm.get('sub_area')?.reset();
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

  get isInternet() {
    return this.userForm.get('connection_type')?.value === 'internet';
  }

  get isCable() {
    return this.userForm.get('connection_type')?.value === 'tv_cable';
  }

  get isBoth() {
    return this.userForm.get('connection_type')?.value === 'both';
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

        this.applyOperatorDefaults();
      }
    } catch (error) {
      console.error('Error loading operators', error);
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
    this.userForm.markAllAsTouched();
    setTimeout(() => {
      // app-search-select flags itself with .ss-invalid, not .is-invalid
      document
        .querySelector('.is-invalid, .ss-invalid')
        ?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }, 50);
    return;
  }

  this.isSaving = true;

  try {
    const raw = this.userForm.getRawValue();
    raw.date_of_birth = storedOptionalDate(raw.date_of_birth, this.userData?.date_of_birth);
    if (this.editMode) delete raw.provisioning; // set once, at creation

    const payload = {
      ...raw,
      updatedAt: new Date(),
    };

    if (this.editMode && this.userData?.id) {
      // 🔁 UPDATE

      const id = this.userData.id;

      const newConnectionRef = doc(this.firestore, 'newConnection', id);
      const usersRef = doc(this.firestore, 'users', id);

      // 🔍 check if users doc exists
      const userSnap = await getDoc(usersRef);

      if (userSnap.exists()) {
        // ✅ update both
        await Promise.all([
          updateDoc(newConnectionRef, payload),
          updateDoc(usersRef, payload),
        ]);
      } else {
        // ⚠️ users doc not found → only update newConnection
        await updateDoc(newConnectionRef, payload);

        console.warn('User doc not found, skipped users update for ID:', id);
      }

    } else {
      // ➕ ADD

      const dataToSave = {
        ...payload,
        createdAt: new Date(),
      };

      // 🔥 create ID manually
      const newDocRef = doc(collection(this.firestore, 'newConnection'));
      const id = newDocRef.id;

      // ✅ save in newConnection
      await setDoc(newDocRef, {
        ...dataToSave,
        id,
      });

      // ✅ save in users
      await setDoc(doc(this.firestore, 'users', id), {
        ...dataToSave,
        connectionId: id,
      });

      // Push to the router / panel. Never blocks the local record - a failure
      // out there must not lose the customer here.
      await this.provision(dataToSave, id);
    }

    // ✅ TOAST
    if (!navigator.onLine) {
      this.toastr.info(
        'Saved offline. Will sync when connection is restored.'
      );
    } else {
      this.toastr.success('Saved successfully');
    }

    this.activeModal.close(true);

  } catch (error: any) {
    console.error(error);

    if (
      error.code === 'unavailable' ||
      error.code === 'failed-precondition'
    ) {
      this.toastr.info(
        'Saved offline. Will sync when connection is restored.'
      );
      this.activeModal.close(true);
    } else {
      this.toastr.error('Failed to save user');
    }
  } finally {
    this.isSaving = false;
  }
}

  /**
   * Creates the same customer on the MikroTik router and/or the ZalUltra
   * panel. Each target is independent: one failing does not stop the other,
   * and neither can undo the Firestore write that already happened.
   */
  private async provision(data: any, docId: string) {
    const cfg = data?.provisioning || {};
    if (!cfg.mikrotik_enabled && !cfg.zal_enabled) return;

    this.provisionLog = [];
    const username = String(data.internet_id || '').trim();

    if (cfg.mikrotik_enabled) {
      const server = Number(cfg.mikrotik_server || 1) as MikrotikServer;
      const label = this.mikrotikServers.find((s) => s.id === server)?.label || `server ${server}`;
      try {
        await firstValueFrom(
          this.mikrotikService.createPppSecret(
            username,
            cfg.mikrotik_password,
            cfg.mikrotik_profile || 'default',
            'pppoe',
            server,
            cfg.mikrotik_disabled ? 'yes' : 'no',
          ),
        );
        this.provisionLog.push({ target: 'mikrotik', ok: true, message: `Created on MikroTik ${label}` });
      } catch (err: any) {
        this.provisionLog.push({
          target: 'mikrotik',
          ok: false,
          message: `MikroTik ${label}: ${err?.message || 'failed'}`,
        });
      }
    }

    if (cfg.zal_enabled) {
      try {
        const result = await firstValueFrom(
          this.zalService.createSubscriber(this.zalPayload(data, cfg, username)),
        );
        const id = result?.data?.id ?? result?.id ?? null;
        this.provisionLog.push({
          target: 'zal',
          ok: true,
          message: id ? `Created in ZalUltra (id ${id})` : 'Created in ZalUltra',
        });
      } catch (err: any) {
        this.provisionLog.push({
          target: 'zal',
          ok: false,
          message: `ZalUltra: ${err?.message || 'failed'}`,
        });
      }
    }

    for (const entry of this.provisionLog) {
      if (entry.ok) this.toastr.success(entry.message);
      else this.toastr.error(entry.message, undefined, { timeOut: 8000 });
    }

    // Record what happened so a failed push is visible later.
    try {
      const stamp = { provisioning_result: this.provisionLog, provisioned_at: new Date() };
      await Promise.all([
        updateDoc(doc(this.firestore, 'newConnection', docId), stamp),
        updateDoc(doc(this.firestore, 'users', docId), stamp),
      ]);
    } catch {
      // The customer is saved; a missing audit stamp is not worth failing over.
    }
  }

  /** Maps the connection form onto the panel's create-subscriber fields. */
  private zalPayload(data: any, cfg: any, username: string): Record<string, any> {
    const payload: Record<string, any> = {
      username,
      fullname: data.user_name,
      password: cfg.zal_password,
      connection_password: cfg.zal_connection_password || cfg.mikrotik_password || '',
      package_id: cfg.zal_package_id,
      salesperson_id: cfg.zal_salesperson_id,
      nas_id: cfg.zal_nas_id,
      area: cfg.zal_area,
      phone: data.mobile_no,
      identity: data.cnic,
      address: data.address,
      expiration_date: this.toPanelDateTime(cfg.zal_expiry),
      // profile_status 2 = Active, connection_type 1 = PPPoE (0 is Hotspot on
      // this panel - 5556 of 5565 subscribers are 1), connection_status 1 =
      // internet enabled. Sent explicitly so a new subscriber never lands on a
      // panel default that cannot dial in.
      profile_status: 2,
      connection_type: 1,
      connection_status: 1,
    };

    // The panel stores the parent chain alongside the area.
    const area = this.zalAreas.find((a) => String(a?.id) === String(cfg.zal_area));
    if (area) {
      payload['country'] = area.country ?? undefined;
      payload['province'] = area.province ?? undefined;
      payload['city'] = area.city ?? undefined;
    }

    return payload;
  }

  // The panel wants 'YYYY-MM-DD HH:mm:ss'; datetime-local speaks 'YYYY-MM-DDTHH:mm'.
  private toPanelDateTime(value: string): string {
    if (!value) return '';
    const cleaned = String(value).replace('T', ' ').trim();
    return cleaned.length === 16 ? `${cleaned}:00` : cleaned;
  }

  ngOnDestroy() {
    this.closeCamera();
    this.backSub?.unsubscribe();
  }

  /**
   * Android back closes whatever is on top: the crop tool, the camera or the
   * photo viewer. Only when none of them is open does it reach the form
   * itself (priority 120 runs before the modal handler in BackButtonService).
   */
  private backSub?: Subscription;

  private watchBackButton() {
    this.backSub = this.platform.backButton.subscribeWithPriority(120, (processNextHandler) => {
      if (this.showCropOverlay) this.cancelCrop();
      else if (this.showCamera) this.closeCamera();
      else if (this.showImageModal) this.closeImageModal();
      else processNextHandler();
    });
  }

  openCamera(type: 'front' | 'back') {
    this.cameraTarget = type;
    this.capturedPhoto = null;
    this.cameraError = null;
    this.showCamera = true;
    setTimeout(() => this.startStream(), 80);
  }

  private async startStream() {
    try {
      this.cameraStream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 }, height: { ideal: 720 } },
      });
      if (this.cameraVideoRef?.nativeElement) {
        this.cameraVideoRef.nativeElement.srcObject = this.cameraStream;
      }
    } catch (err: any) {
      this.cameraError =
        err.name === 'NotAllowedError'
          ? 'Camera permission denied. Allow Camera for this app in phone Settings > Apps > Permissions, then try again.'
          : 'Camera not available on this device. Please upload an image instead.';
    }
  }

  capturePhoto() {
    const video = this.cameraVideoRef?.nativeElement;
    if (!video) return;
    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    canvas.getContext('2d')!.drawImage(video, 0, 0);
    this.capturedPhoto = canvas.toDataURL('image/jpeg', 0.85);
    this.cameraStream?.getTracks().forEach((t) => t.stop());
  }

  retakePhoto() {
    this.capturedPhoto = null;
    this.startStream();
  }

  usePhoto() {
    if (!this.capturedPhoto || !this.cameraTarget) return;
    const target = this.cameraTarget;
    const photo = this.capturedPhoto;
    this.closeCamera();
    this.openCrop(photo, target);
  }

  closeCamera() {
    this.cameraStream?.getTracks().forEach((t) => t.stop());
    this.cameraStream = null;
    this.showCamera = false;
    this.capturedPhoto = null;
    this.cameraError = null;
  }

  clearCnic(type: 'front' | 'back') {
    if (type === 'front') {
      this.cnicFrontPreview = null;
      this.extractionDone = false;
      this.userForm.patchValue({ cnic_front: '' });
    } else {
      this.cnicBackPreview = null;
      this.userForm.patchValue({ cnic_back: '' });
    }
  }

  async extractCnicData() {
    if (!this.cnicFrontPreview) return;
    this.isExtracting = true;
    this.extractionDone = false;
    try {
      // Use full-res source for file uploads; camera captures are already full-res
      const source = this.cnicFrontOcrSource ?? this.cnicFrontPreview;
      const processed = await this.preprocessForOcr(source);

      const { createWorker } = await import('tesseract.js');
      const worker = await createWorker('eng', 1, { logger: () => {} });
      const { data: { text } } = await worker.recognize(processed);
      await worker.terminate();

      console.log('=== CNIC OCR RAW TEXT ===');
      console.log(text);
      console.log('=========================');

      this.parseCnicText(text);
      this.extractionDone = true;
      this.toastr.success('Data extracted! Please verify the auto-filled fields.');
    } catch {
      this.toastr.warning('Could not extract data. Please fill fields manually.');
    } finally {
      this.isExtracting = false;
    }
  }

  private preprocessForOcr(base64: string): Promise<string> {
    return new Promise((resolve) => {
      const img = new Image();
      img.onload = () => {
        // Scale to at least 1400px wide — small images produce bad OCR
        const scale = Math.max(1, 1400 / img.width);
        const w = Math.round(img.width * scale);
        const h = Math.round(img.height * scale);
        const canvas = document.createElement('canvas');
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext('2d')!;
        ctx.drawImage(img, 0, 0, w, h);
        // Greyscale + contrast boost → sharper text for Tesseract
        const d = ctx.getImageData(0, 0, w, h);
        for (let i = 0; i < d.data.length; i += 4) {
          const g = Math.round(0.299 * d.data[i] + 0.587 * d.data[i + 1] + 0.114 * d.data[i + 2]);
          const c = Math.min(255, Math.max(0, (g - 128) * 1.6 + 128));
          d.data[i] = d.data[i + 1] = d.data[i + 2] = c;
          d.data[i + 3] = 255;
        }
        ctx.putImageData(d, 0, 0);
        resolve(canvas.toDataURL('image/png'));
      };
      img.src = base64;
    });
  }

  private parseCnicText(text: string) {
    const lines = text.split('\n').map((l) => l.trim()).filter((l) => l.length > 0);
    console.log('=== PARSING LINES ===');
    lines.forEach((l, i) => console.log(`[${i}] "${l}"`));

    // ── 1. CNIC Number ──────────────────────────────────────────────
    const fmtMatch = text.match(/(\d{5})[-–\s](\d{7})[-–\s](\d)/);
    if (fmtMatch) {
      this.userForm.patchValue({ cnic: `${fmtMatch[1]}-${fmtMatch[2]}-${fmtMatch[3]}` });
    } else {
      const d13 = text.replace(/[^0-9]/g, '').match(/\d{13}/);
      if (d13) {
        const n = d13[0];
        this.userForm.patchValue({ cnic: `${n.slice(0, 5)}-${n.slice(5, 12)}-${n[12]}` });
      }
    }

    // ── 2 & 3. Name / Father Name ────────────────────────────────────
    // Strategy A: label-based (when OCR reads labels clearly)
    let nameFound = false;
    let fatherFound = false;

    const nameIdx = lines.findIndex((l) => /^name$/i.test(l.replace(/[^a-zA-Z]/g, '')));
    if (nameIdx >= 0) {
      const val = this.nextValueLine(lines, nameIdx + 1,
        ['father', 'husband', 'gender', 'date', 'identity', 'country', 'male', 'female']);
      if (val) { this.userForm.patchValue({ user_name: val }); nameFound = true; }
    }

    const fatherIdx = lines.findIndex((l) => /father|husband/i.test(l));
    if (fatherIdx >= 0) {
      const val = this.nextValueLine(lines, fatherIdx + 1,
        ['gender', 'date', 'identity', 'country', 'male', 'female', 'name']);
      if (val) { this.userForm.patchValue({ father_name: val }); fatherFound = true; }
    }

    // Strategy B: positional fallback — when labels are garbled by OCR,
    // the Pakistani CNIC always places name first, father name second.
    if (!nameFound || !fatherFound) {
      const headerWords = ['pakistan', 'national', 'identity', 'islamic', 'republic', 'holder'];
      const nameBlocks: string[] = [];

      for (const line of lines) {
        const clean = line.replace(/["""''`«»*|\\\/\[\]{}()]/g, '').trim();
        const alphaWords = (clean.match(/[a-zA-Z]{3,}/g) || []);
        if (alphaWords.length < 2) continue;
        if (alphaWords.some((w) => headerWords.includes(w.toLowerCase()))) continue;
        const alphaRatio = (clean.match(/[a-zA-Z]/g) || []).length / clean.length;
        if (alphaRatio < 0.45) continue;
        // Longest run of 3+-char alpha words (≥2 words)
        const namePart = clean.match(/[A-Za-z]{3,}(?:\s+[A-Za-z]{3,})+/)?.[0];
        if (namePart && namePart.trim().split(/\s+/).length >= 2) {
          nameBlocks.push(namePart.trim());
        }
      }

      console.log('Positional name blocks:', nameBlocks);
      if (!nameFound && nameBlocks.length >= 1) this.userForm.patchValue({ user_name: nameBlocks[0] });
      if (!fatherFound && nameBlocks.length >= 2) this.userForm.patchValue({ father_name: nameBlocks[1] });
    }
  }

  private nextValueLine(lines: string[], from: number, skipKeywords: string[]): string | null {
    const skipRe = new RegExp(`^(${skipKeywords.join('|')})`, 'i');
    for (let j = from; j < Math.min(from + 3, lines.length); j++) {
      const clean = lines[j].replace(/[|\\\/\[\]{}]/g, '').trim();
      if (clean.length > 3 && /[a-zA-Z]{2,}/.test(clean) && !skipRe.test(clean)) {
        return clean;
      }
    }
    return null;
  }

  // ── Crop methods ──────────────────────────────────────────────────────────

  openCrop(source: string, target: 'front' | 'back') {
    this.cropSourceImage = source;
    this.cropTarget = target;
    this.cropBox = { x: 0.05, y: 0.05, w: 0.9, h: 0.9 };
    this.cropDrag = null;
    this.showCropOverlay = true;
  }

  cancelCrop() {
    this.showCropOverlay = false;
    this.cropSourceImage = null;
    this.cropDrag = null;
  }

  resetCrop() {
    this.cropBox = { x: 0.05, y: 0.05, w: 0.9, h: 0.9 };
  }

  get cropSelectionStyle(): Record<string, string> {
    return {
      left: (this.cropBox.x * 100) + '%',
      top: (this.cropBox.y * 100) + '%',
      width: (this.cropBox.w * 100) + '%',
      height: (this.cropBox.h * 100) + '%',
    };
  }

  get cropMaskTop(): Record<string, string> {
    return { position: 'absolute', top: '0', left: '0', right: '0', height: (this.cropBox.y * 100) + '%' };
  }
  get cropMaskBottom(): Record<string, string> {
    return { position: 'absolute', bottom: '0', left: '0', right: '0', height: ((1 - this.cropBox.y - this.cropBox.h) * 100) + '%' };
  }
  get cropMaskLeft(): Record<string, string> {
    return { position: 'absolute', top: (this.cropBox.y * 100) + '%', left: '0', width: (this.cropBox.x * 100) + '%', height: (this.cropBox.h * 100) + '%' };
  }
  get cropMaskRight(): Record<string, string> {
    return { position: 'absolute', top: (this.cropBox.y * 100) + '%', right: '0', width: ((1 - this.cropBox.x - this.cropBox.w) * 100) + '%', height: (this.cropBox.h * 100) + '%' };
  }

  onCropBoxMouseDown(event: MouseEvent) {
    event.stopPropagation();
    event.preventDefault();
    this.startCropDrag('move', event.clientX, event.clientY);
  }

  onHandleMouseDown(event: MouseEvent, mode: 'tl' | 'tr' | 'bl' | 'br') {
    event.stopPropagation();
    event.preventDefault();
    this.startCropDrag(mode, event.clientX, event.clientY);
  }

  onCropBoxTouchStart(event: TouchEvent) {
    event.stopPropagation();
    event.preventDefault();
    const t = event.touches[0];
    this.startCropDrag('move', t.clientX, t.clientY);
  }

  onHandleTouchStart(event: TouchEvent, mode: 'tl' | 'tr' | 'bl' | 'br') {
    event.stopPropagation();
    event.preventDefault();
    const t = event.touches[0];
    this.startCropDrag(mode, t.clientX, t.clientY);
  }

  private startCropDrag(mode: 'move' | 'tl' | 'tr' | 'bl' | 'br', x: number, y: number) {
    this.cropDrag = { mode, startX: x, startY: y, startBox: { ...this.cropBox } };
  }

  onCropMouseMove(event: MouseEvent) {
    if (!this.cropDrag) return;
    event.preventDefault();
    this.updateCropDrag(event.clientX, event.clientY);
  }

  onCropTouchMove(event: TouchEvent) {
    if (!this.cropDrag) return;
    event.preventDefault();
    this.updateCropDrag(event.touches[0].clientX, event.touches[0].clientY);
  }

  onCropPointerUp() {
    this.cropDrag = null;
  }

  @HostListener('document:mouseup')
  onDocumentMouseUp() {
    if (this.cropDrag) this.cropDrag = null;
  }

  private updateCropDrag(clientX: number, clientY: number) {
    const container = this.cropContainerRef?.nativeElement;
    if (!container || !this.cropDrag) return;
    const rect = container.getBoundingClientRect();
    const dx = (clientX - this.cropDrag.startX) / rect.width;
    const dy = (clientY - this.cropDrag.startY) / rect.height;
    const b = this.cropDrag.startBox;
    const MIN = 0.08;
    switch (this.cropDrag.mode) {
      case 'move':
        this.cropBox = { ...b, x: Math.max(0, Math.min(1 - b.w, b.x + dx)), y: Math.max(0, Math.min(1 - b.h, b.y + dy)) };
        break;
      case 'tl': {
        const nx = Math.max(0, Math.min(b.x + b.w - MIN, b.x + dx));
        const ny = Math.max(0, Math.min(b.y + b.h - MIN, b.y + dy));
        this.cropBox = { x: nx, y: ny, w: b.w + (b.x - nx), h: b.h + (b.y - ny) };
        break;
      }
      case 'tr': {
        const ny = Math.max(0, Math.min(b.y + b.h - MIN, b.y + dy));
        this.cropBox = { x: b.x, y: ny, w: Math.max(MIN, Math.min(1 - b.x, b.w + dx)), h: b.h + (b.y - ny) };
        break;
      }
      case 'bl': {
        const nx = Math.max(0, Math.min(b.x + b.w - MIN, b.x + dx));
        this.cropBox = { x: nx, y: b.y, w: b.w + (b.x - nx), h: Math.max(MIN, Math.min(1 - b.y, b.h + dy)) };
        break;
      }
      case 'br':
        this.cropBox = { x: b.x, y: b.y, w: Math.max(MIN, Math.min(1 - b.x, b.w + dx)), h: Math.max(MIN, Math.min(1 - b.y, b.h + dy)) };
        break;
    }
  }

  applyCrop() {
    if (!this.cropSourceImage || !this.cropTarget) return;
    const img = new Image();
    img.onload = () => {
      const sx = Math.round(this.cropBox.x * img.naturalWidth);
      const sy = Math.round(this.cropBox.y * img.naturalHeight);
      const sw = Math.round(this.cropBox.w * img.naturalWidth);
      const sh = Math.round(this.cropBox.h * img.naturalHeight);
      const canvas = document.createElement('canvas');
      canvas.width = sw;
      canvas.height = sh;
      canvas.getContext('2d')!.drawImage(img, sx, sy, sw, sh, 0, 0, sw, sh);
      const cropped = canvas.toDataURL('image/jpeg', 0.88);
      const target = this.cropTarget!;
      this.cancelCrop();
      if (target === 'front') {
        this.cnicFrontPreview = cropped;
        this.cnicFrontOcrSource = cropped;
        this.extractionDone = false;
        this.userForm.patchValue({ cnic_front: cropped });
      } else {
        this.cnicBackPreview = cropped;
        this.userForm.patchValue({ cnic_back: cropped });
      }
    };
    img.src = this.cropSourceImage;
  }

  // ─────────────────────────────────────────────────────────────────────────

  cnicFrontPreview: string | null = null;
  cnicBackPreview: string | null = null;

  onImageSelect(event: any, type: 'front' | 'back') {
    const file = event.target.files[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      this.toastr.error('Only image files allowed');
      return;
    }
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = () => { this.openCrop(reader.result as string, type); };
    event.target.value = '';
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

  imagePreview: string | null = null;
  showImageModal = false;

  selectedImage: string | null = null;

  openImageModal(type: 'front' | 'back') {
    if (type === 'front') {
      if (!this.cnicFrontPreview) return;
      this.selectedImage = this.cnicFrontPreview;
    } else {
      if (!this.cnicBackPreview) return;
      this.selectedImage = this.cnicBackPreview;
    }

    this.showImageModal = true;
  }

  closeImageModal() {
    this.showImageModal = false;
    this.selectedImage = null;
  }
}
