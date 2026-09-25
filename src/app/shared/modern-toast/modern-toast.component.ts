import { animate, state, style, transition, trigger } from '@angular/animations';
import { NgIf } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  HostListener,
  ViewEncapsulation,
  inject,
  signal,
} from '@angular/core';
import { Toast } from 'ngx-toastr';

type ToastKind = 'success' | 'error' | 'warning' | 'info';

const ICONS: Record<ToastKind, string> = {
  success: 'ri-checkbox-circle-fill',
  error: 'ri-close-circle-fill',
  warning: 'ri-error-warning-fill',
  info: 'ri-information-fill',
};

/** Swipe distance that dismisses the toast: sideways, or flicked up. */
const SWIPE_X = 72;
const SWIPE_UP = 28;

/**
 * App-wide toast for ngx-toastr, registered in app.config.ts through
 * `provideToastr({ toastComponent })`, so every existing
 * `toastr.success / error / info / warning` call renders with it.
 *
 * Tap or swipe to dismiss; touching it pauses the timer.
 */
@Component({
  selector: '[mk-toast-component]',
  imports: [NgIf],
  templateUrl: './modern-toast.component.html',
  styleUrl: './modern-toast.component.scss',
  // The container is created by ngx-toastr outside this component.
  encapsulation: ViewEncapsulation.None,
  changeDetection: ChangeDetectionStrategy.OnPush,
  animations: [
    trigger('flyInOut', [
      state('inactive', style({ opacity: 0, transform: 'translateY(-18px) scale(0.94)' })),
      state('active', style({ opacity: 1, transform: 'none', height: '*', marginBottom: '8px' })),
      state(
        'removed',
        style({ opacity: 0, transform: 'translateY(-14px) scale(0.94)', height: '0px', marginBottom: '0px' }),
      ),
      transition('inactive => active', animate('420ms cubic-bezier(0.2, 0.9, 0.25, 1.15)')),
      transition('active => removed', animate('240ms cubic-bezier(0.4, 0, 1, 1)')),
    ]),
  ],
})
export class ModernToastComponent extends Toast {
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);

  readonly kind: ToastKind = this.resolveKind(this.toastPackage.toastType);
  readonly icon = ICONS[this.kind];

  readonly dragX = signal(0);
  readonly dragY = signal(0);
  dragging = false;
  private startX = 0;
  private startY = 0;

  get dragTransform(): string | null {
    const x = this.dragX();
    const y = this.dragY();
    return x || y ? `translate3d(${x}px, ${y}px, 0)` : null;
  }

  get dragOpacity(): number | null {
    const x = Math.abs(this.dragX());
    return x ? Math.max(0.35, 1 - x / 220) : null;
  }

  close(event: Event) {
    event.stopPropagation();
    this.remove();
  }

  @HostListener('pointerdown', ['$event'])
  onPointerDown(event: PointerEvent) {
    if ((event.target as HTMLElement).closest('.mk-toast-close')) return;
    this.dragging = true;
    this.startX = event.clientX;
    this.startY = event.clientY;
    this.host.nativeElement.setPointerCapture?.(event.pointerId);
    // Hold the toast while a finger is on it, as hover does on desktop.
    this.stickAround();
  }

  @HostListener('pointermove', ['$event'])
  onPointerMove(event: PointerEvent) {
    if (!this.dragging) return;
    this.dragX.set(event.clientX - this.startX);
    // Only upward drags move it; downward ones stay put.
    this.dragY.set(Math.min(0, event.clientY - this.startY));
  }

  @HostListener('pointerup')
  @HostListener('pointercancel')
  onPointerUp() {
    if (!this.dragging) return;
    this.dragging = false;

    if (Math.abs(this.dragX()) > SWIPE_X || this.dragY() < -SWIPE_UP) {
      this.remove();
      return;
    }

    this.dragX.set(0);
    this.dragY.set(0);
    this.delayedHideToast();
  }

  private resolveKind(type: string): ToastKind {
    if (type.includes('success')) return 'success';
    if (type.includes('error')) return 'error';
    if (type.includes('warning')) return 'warning';
    return 'info';
  }
}
