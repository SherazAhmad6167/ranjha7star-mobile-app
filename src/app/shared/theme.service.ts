import { Injectable, signal } from '@angular/core';

@Injectable({ providedIn: 'root' })
export class ThemeService {
  private readonly storageKey = 'ranjha-theme';

  isDark = signal(false);

  constructor() {
    this.applyLightMode();
  }

  toggle() {
    this.applyLightMode();
  }

  private applyLightMode() {
    this.isDark.set(false);
    localStorage.setItem(this.storageKey, 'light');
    document.body.classList.remove('dark-mode');
  }
}
