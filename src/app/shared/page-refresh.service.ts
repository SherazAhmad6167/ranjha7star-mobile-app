import { DestroyRef, Injectable, inject } from '@angular/core';

type Loader = () => Promise<unknown>;

/**
 * Backs the top-bar refresh button. The open screen registers how to reload
 * its data, so a refresh keeps its search and filters; screens that don't
 * register are simply rebuilt by the layout.
 */
@Injectable({ providedIn: 'root' })
export class PageRefreshService {
  private loader: Loader | null = null;

  register(loader: Loader): () => void {
    this.loader = loader;
    return () => {
      if (this.loader === loader) this.loader = null;
    };
  }

  /** Resolves false when the open screen has no loader of its own. */
  async refresh(): Promise<boolean> {
    if (!this.loader) return false;
    await this.loader();
    return true;
  }
}

/**
 * Call from a screen's constructor: registers `loader` for the refresh
 * button while the screen is open and drops it when the screen closes.
 */
export function registerPageRefresh(loader: Loader): void {
  const unregister = inject(PageRefreshService).register(loader);
  inject(DestroyRef).onDestroy(unregister);
}
