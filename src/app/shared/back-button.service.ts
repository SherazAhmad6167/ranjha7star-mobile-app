import { Location } from '@angular/common';
import { Injectable, NgZone } from '@angular/core';
import { NavigationEnd, NavigationStart, Router } from '@angular/router';
import { App } from '@capacitor/app';
import { Capacitor } from '@capacitor/core';
import { Platform } from '@ionic/angular';
import { NgbModal, NgbModalRef } from '@ng-bootstrap/ng-bootstrap';
import { ToastrService } from 'ngx-toastr';

/*
 * Android hardware / gesture back button.
 *
 * Capacitor only forwards the back button to the web layer while something is
 * listening for it - otherwise it closes the app. With a listener attached,
 * Ionic dispatches `ionBackButton`, where handlers run highest priority first:
 *
 *   110  this service   close the top ng-bootstrap modal (forms, logout),
 *                       unless a sheet is showing on top of it
 *   100  Ionic          dismiss the top sheet (ion-modal)
 *    10  this service   go back one screen, or ask before leaving the app
 *     0  Ionic          default router outlet handling (not used here)
 */

const MODAL_PRIORITY = 110;
const NAV_PRIORITY = 10;
/** Second back press within this window exits the app. */
const EXIT_WINDOW_MS = 2000;
/** Screens with nothing to go back to. */
const ROOT_PATHS = ['/home', '/login'];

@Injectable({ providedIn: 'root' })
export class BackButtonService {
  private stack: string[] = [];
  private pending: { trigger: string; replace: boolean } | null = null;
  private openModals: NgbModalRef[] = [];
  private lastBackAt = 0;
  private started = false;

  constructor(
    private router: Router,
    private location: Location,
    private platform: Platform,
    private modalService: NgbModal,
    private toastr: ToastrService,
    private zone: NgZone,
  ) {}

  /** Called once from AppComponent. */
  init() {
    if (this.started) return;
    this.started = true;

    this.trackNavigation();
    this.trackModals();

    if (Capacitor.isNativePlatform()) {
      // Presence of this listener is what stops Android from closing the app.
      App.addListener('backButton', () => undefined);
    }

    this.platform.backButton.subscribeWithPriority(MODAL_PRIORITY, (processNextHandler) => {
      const top = this.openModals[this.openModals.length - 1];
      // A visible sheet always renders above ng-bootstrap modals (z-index
      // 20000+ vs 1055) - e.g. a picker opened from a form - so it goes first.
      if (!top || document.querySelector('ion-modal:not(.overlay-hidden)')) {
        processNextHandler();
        return;
      }
      this.zone.run(() => top.dismiss('backButton'));
    });

    this.platform.backButton.subscribeWithPriority(NAV_PRIORITY, () => this.zone.run(() => this.goBack()));
  }

  private goBack() {
    // A sheet that refuses to be dismissed (mid-delete) is still on screen.
    if (document.querySelector('ion-modal:not(.overlay-hidden)')) return;

    const current = this.clean(this.router.url);
    if (ROOT_PATHS.includes(current)) {
      this.confirmExit();
      return;
    }

    const previous = this.stack.length > 1 ? this.stack[this.stack.length - 2] : null;
    // Never step back into the login screen: that is a sign-out, not a back.
    if (previous && previous !== '/login') {
      this.location.back();
      return;
    }

    this.router.navigateByUrl('/home', { replaceUrl: true });
  }

  private confirmExit() {
    if (!Capacitor.isNativePlatform()) return;

    const now = Date.now();
    if (now - this.lastBackAt < EXIT_WINDOW_MS) {
      App.exitApp();
      return;
    }

    this.lastBackAt = now;
    this.toastr.info('Press back again to exit');
  }

  /** Mirrors the browser history, so we know what "back" would land on. */
  private trackNavigation() {
    this.router.events.subscribe((event) => {
      if (event instanceof NavigationStart) {
        this.pending = {
          trigger: event.navigationTrigger || 'imperative',
          replace: !!this.router.getCurrentNavigation()?.extras.replaceUrl,
        };
        return;
      }

      if (!(event instanceof NavigationEnd)) return;

      const url = this.clean(event.urlAfterRedirects);
      const nav = this.pending;
      this.pending = null;

      if (nav?.trigger === 'popstate') {
        // Back / forward: cut the stack at the entry we landed on.
        const index = this.stack.lastIndexOf(url);
        this.stack = index >= 0 ? this.stack.slice(0, index + 1) : [url];
      } else if (!this.stack.length) {
        this.stack = [url];
      } else if (nav?.replace || this.stack[this.stack.length - 1] === url) {
        this.stack[this.stack.length - 1] = url;
      } else {
        this.stack.push(url);
      }
    });
  }

  private trackModals() {
    this.modalService.activeInstances.subscribe((refs) => (this.openModals = refs));
  }

  private clean(url: string): string {
    return (url || '').split('?')[0].split('#')[0] || '/';
  }
}
