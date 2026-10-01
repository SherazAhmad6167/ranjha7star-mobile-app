import { CommonModule } from '@angular/common';
import {
  ChangeDetectorRef,
  Component,
  ElementRef,
  HostListener,
  NgZone,
  OnDestroy,
  OnInit,
  TemplateRef,
  ViewChild,
} from '@angular/core';
import { NavigationEnd, Router, RouterLink, RouterOutlet } from '@angular/router';
import { NgbModal, NgbModalRef } from '@ng-bootstrap/ng-bootstrap';
import { Subscription, take } from 'rxjs';
import { ToastrService } from 'ngx-toastr';
import { BluetoothService } from '../../shared/bluetooth.service';
import { PageRefreshService } from '../../shared/page-refresh.service';
import { getWhatsappApp, setWhatsappApp, WhatsappApp } from '../../shared/whatsapp';

type PageMeta = {
  title: string;
  section: string;
  icon: string;
};

type DockItem = {
  path: string;
  label: string;
  icon: string;
  activeIcon: string;
  accent: string;
  accentAlt: string;
};

// Viewport shrink (px) treated as the soft keyboard being open.
const KEYBOARD_THRESHOLD = 120;

// Shortest refresh spin, so a fast reload still reads as having happened.
const MIN_REFRESH_MS = 600;

// Sign out anyway if the sheet's "hidden" event has not come by then (its
// close slide is 0.28s).
const SIGN_OUT_FALLBACK_MS = 700;

@Component({
  selector: 'app-applayout',
  imports: [CommonModule, RouterOutlet, RouterLink],
  templateUrl: './applayout.component.html',
  styleUrl: './applayout.component.scss',
})
export class ApplayoutComponent implements OnInit, OnDestroy {
  role: string | null = '';
  userName = '';
  userInitial = '';
  isOnline = navigator.onLine;
  keyboardOpen = false;
  refreshing = false;
  // Toggled off and on to rebuild a screen that has no refresh loader.
  showOutlet = true;
  currentPage: PageMeta = {
    title: 'Mobile Home',
    section: 'Ranjha7star',
    icon: 'ri-apps-2-line',
  };

  // Home sits in the middle slot and renders as the raised orb.
  readonly homeSlot = 2;
  readonly dockItems: DockItem[] = [
    { path: '/user-details', label: 'Users', icon: 'ri-user-3-line', activeIcon: 'ri-user-3-fill', accent: '#2563eb', accentAlt: '#0ea5e9' },
    { path: '/new-connection', label: 'New', icon: 'ri-add-circle-line', activeIcon: 'ri-add-circle-fill', accent: '#059669', accentAlt: '#10b981' },
    { path: '/home', label: 'Home', icon: 'ri-home-5-line', activeIcon: 'ri-home-5-fill', accent: '#0d9488', accentAlt: '#0ea5e9' },
    { path: '/user-collections', label: 'Collection', icon: 'ri-wallet-3-line', activeIcon: 'ri-wallet-3-fill', accent: '#ea580c', accentAlt: '#f59e0b' },
    { path: '/recovery-details', label: 'Recovery', icon: 'ri-hand-coin-line', activeIcon: 'ri-hand-coin-fill', accent: '#7c3aed', accentAlt: '#d946ef' },
  ];
  activeSlot = this.homeSlot;
  gliderSlot = this.homeSlot;
  activeAccent = this.dockItems[this.homeSlot].accent;

  private readonly pageMeta: Record<string, PageMeta> = {
    '/home': { title: 'Mobile Home', section: 'Ranjha7star', icon: 'ri-apps-2-line' },
    '/user-details': { title: 'User Details', section: 'Customers', icon: 'ri-user-line' },
    '/new-connection': { title: 'New Connection', section: 'Customers', icon: 'ri-add-circle-line' },
    '/user-collections': { title: 'User Collection', section: 'Customers', icon: 'ri-folders-line' },
    '/recovery-details': { title: 'Recovery Details', section: 'Finance', icon: 'ri-refund-2-line' },
    '/printer': { title: 'Printer', section: 'Settings', icon: 'ri-bluetooth-line' },
    // Reached from the home card only - deliberately not in the dock.
    '/zal-subscribers': { title: 'ZAL Ultra', section: 'Network', icon: 'ri-server-line' },
  };

  private logoutRef?: NgbModalRef;
  private signingOut = false;
  currentPath = '';
  private viewportBase = 0;
  private viewportWidth = 0;
  private routerSub?: Subscription;

  @ViewChild('logoutModal') logoutModal!: TemplateRef<any>;
  @ViewChild('whatsappModal') whatsappModal!: TemplateRef<any>;
  // Selection inside the WhatsApp sheet; only stored on Save.
  whatsappChoice: WhatsappApp | null = null;
  @ViewChild('topbar', { static: true }) topbar!: ElementRef<HTMLElement>;
  @ViewChild('scrollArea', { static: true }) scrollArea!: ElementRef<HTMLElement>;

  constructor(
    private router: Router,
    private modalService: NgbModal,
    private zone: NgZone,
    private cdr: ChangeDetectorRef,
    private toastr: ToastrService,
    private pageRefresh: PageRefreshService,
    public printer: BluetoothService,
  ) {
    this.routerSub = this.router.events.subscribe(event => {
      if (event instanceof NavigationEnd) {
        this.setCurrentPage(event.urlAfterRedirects || event.url);
      }
    });
  }

  ngOnInit() {
    document.body.classList.remove('dark-mode');
    localStorage.setItem('ranjha-theme', 'light');
    this.role = localStorage.getItem('role');
    this.userName =
      localStorage.getItem('name') || localStorage.getItem('username') || '';
    this.userInitial = (this.userName.trim().charAt(0) || '?').toUpperCase();
    this.setCurrentPage(this.router.url);

    // Scroll fires constantly - keep it out of change detection.
    this.zone.runOutsideAngular(() => {
      this.scrollArea.nativeElement.addEventListener('scroll', this.onContentScroll, { passive: true });
      window.visualViewport?.addEventListener('resize', this.onVisualViewportResize);
    });
    this.updateKeyboardState();
  }

  ngOnDestroy() {
    this.routerSub?.unsubscribe();
    this.scrollArea.nativeElement.removeEventListener('scroll', this.onContentScroll);
    window.visualViewport?.removeEventListener('resize', this.onVisualViewportResize);
  }

  @HostListener('window:online')
  @HostListener('window:offline')
  onConnectivityChange() {
    this.isOnline = navigator.onLine;
  }

  // Hide the dock while the soft keyboard is up, like tabBarHideOnKeyboard.
  @HostListener('window:resize')
  @HostListener('document:focusin')
  @HostListener('document:focusout')
  updateKeyboardState() {
    this.keyboardOpen = this.detectKeyboard();
  }

  /**
   * Top-bar refresh. Screens that registered a loader reload in place and
   * keep their search / filters; any other screen is rebuilt, which runs its
   * loading again.
   */
  async refreshPage() {
    if (this.refreshing) return;
    this.refreshing = true;

    if (!navigator.onLine) {
      this.toastr.info('You are offline - showing the data saved on this phone');
    }

    const minSpin = new Promise((resolve) => setTimeout(resolve, MIN_REFRESH_MS));
    try {
      const handled = await this.pageRefresh.refresh();
      if (!handled) {
        this.showOutlet = false;
        this.cdr.detectChanges();
        this.showOutlet = true;
      }
      await minSpin;
    } catch (err) {
      console.error('Refresh failed', err);
    } finally {
      this.refreshing = false;
    }
  }

  openLogoutModal() {
    // Bottom sheet on phones, floating card from 576px (see _mobile-kit.scss).
    this.logoutRef = this.modalService.open(this.logoutModal, { windowClass: 'mk-bottom-window' });
  }

  openWhatsappModal() {
    this.whatsappChoice = getWhatsappApp();
    this.modalService.open(this.whatsappModal, { windowClass: 'mk-bottom-window' });
  }

  saveWhatsappApp(modal: any) {
    if (!this.whatsappChoice) return;
    setWhatsappApp(this.whatsappChoice);
    this.toastr.success(
      `Messages will open in ${this.whatsappChoice === 'business' ? 'WhatsApp Business' : 'WhatsApp'}`,
    );
    modal.close();
  }

  logout(modal: any) {
    if (this.signingOut) return;
    this.signingOut = true;

    let signedOut = false;
    const signOut = () => {
      if (signedOut) return;
      signedOut = true;

      // The printer and WhatsApp choice belong to the phone, not the account: keep them.
      const printerDevice = localStorage.getItem('printer.device');
      const whatsappApp = localStorage.getItem('whatsappApp');
      localStorage.clear();
      localStorage.setItem('ranjha-theme', 'light');
      if (printerDevice) localStorage.setItem('printer.device', printerDevice);
      if (whatsappApp) localStorage.setItem('whatsappApp', whatsappApp);
      document.body.classList.remove('dark-mode');
      this.router.navigate(['/login'], { replaceUrl: true });
    };

    // Let the sheet finish sliding away before the login page renders and
    // the route transition starts, so the two animations never overlap.
    // Listen before closing: with animations off (Remove animations, battery
    // saver) the sheet is hidden inside close() itself, and a listener added
    // afterwards never fired - the tap did nothing and later taps were ignored.
    this.logoutRef?.hidden.pipe(take(1)).subscribe(signOut);
    modal.close();

    // Never leave someone signed in waiting on an animation event.
    setTimeout(signOut, SIGN_OUT_FALLBACK_MS);
  }

  private onContentScroll = () => {
    this.topbar.nativeElement.classList.toggle('is-scrolled', this.scrollArea.nativeElement.scrollTop > 4);
  };

  private onVisualViewportResize = () => {
    const open = this.detectKeyboard();
    if (open !== this.keyboardOpen) {
      this.zone.run(() => (this.keyboardOpen = open));
    }
  };

  private detectKeyboard(): boolean {
    const height = window.visualViewport?.height ?? window.innerHeight;
    if (window.innerWidth !== this.viewportWidth) {
      // Orientation / window width changed: re-baseline the full height.
      this.viewportWidth = window.innerWidth;
      this.viewportBase = height;
    }
    this.viewportBase = Math.max(this.viewportBase, height);
    return this.viewportBase - height > KEYBOARD_THRESHOLD && this.isTextField(document.activeElement);
  }

  private isTextField(el: Element | null): boolean {
    if (!el) return false;
    if (el instanceof HTMLTextAreaElement || el instanceof HTMLSelectElement) return true;
    if (el instanceof HTMLInputElement) {
      return !['button', 'checkbox', 'color', 'file', 'image', 'radio', 'range', 'reset', 'submit'].includes(el.type);
    }
    return (el as HTMLElement).isContentEditable === true;
  }

  private setCurrentPage(url: string) {
    const path = (url || '').split('?')[0].split('#')[0];
    this.currentPage = this.pageMeta[path] || this.pageMeta['/home'];

    this.activeSlot = this.dockItems.findIndex(item => item.path === path);
    this.gliderSlot = this.activeSlot < 0 ? this.homeSlot : this.activeSlot;
    this.activeAccent = this.dockItems[this.gliderSlot].accent;

    // Each tab is a fresh screen - start it at the top, like a native stack.
    if (this.currentPath && this.currentPath !== path) {
      this.scrollArea?.nativeElement.scrollTo({ top: 0 });
    }
    this.currentPath = path;
  }
}
