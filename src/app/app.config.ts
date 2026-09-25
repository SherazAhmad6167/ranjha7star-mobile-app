import {
  ApplicationConfig,
  provideZoneChangeDetection,
  isDevMode,
} from '@angular/core';
import { provideRouter, RouteReuseStrategy } from '@angular/router';
import { IonicRouteStrategy, provideIonicAngular } from '@ionic/angular';
import { routes } from './app.routes';
import { provideServiceWorker } from '@angular/service-worker';

import { provideFirebaseApp, initializeApp } from '@angular/fire/app';
import {
  initializeFirestore,
  persistentLocalCache,
  persistentMultipleTabManager,
  CACHE_SIZE_UNLIMITED,
  provideFirestore,
} from '@angular/fire/firestore';

import { environment } from '../environment/environment';
import { provideAnimations } from '@angular/platform-browser/animations';
import { provideToastr } from 'ngx-toastr';
import { ModernToastComponent } from './shared/modern-toast/modern-toast.component';
import { provideHttpClient } from '@angular/common/http';

export const appConfig: ApplicationConfig = {
  providers: [
    provideIonicAngular(),
    { provide: RouteReuseStrategy, useClass: IonicRouteStrategy },
    provideHttpClient(),
    provideZoneChangeDetection({ eventCoalescing: true }),
    provideRouter(routes),

    provideServiceWorker('ngsw-worker.js', {
      enabled: !isDevMode(),
      registrationStrategy: 'registerWhenStable:30000',
    }),

    provideFirebaseApp(() => initializeApp(environment.firebase)),

    provideFirestore(() =>
      initializeFirestore(initializeApp(environment.firebase), {
        localCache: persistentLocalCache({
          tabManager: persistentMultipleTabManager(),
          cacheSizeBytes: CACHE_SIZE_UNLIMITED,
        }),
      })
    ),

    provideAnimations(),
    // Every toastr.success / error / info / warning renders as ModernToastComponent.
    provideToastr({
      toastComponent: ModernToastComponent,
      toastClass: 'mk-toast',
      positionClass: 'mk-toast-stack',
      // Own class names, so the stock toastr.css colours and icons stay off.
      iconClasses: {
        error: 'mk-toast--error',
        info: 'mk-toast--info',
        success: 'mk-toast--success',
        warning: 'mk-toast--warning',
      },
      timeOut: 3000,
      extendedTimeOut: 1500,
      easeTime: 260,
      progressBar: true,
      closeButton: true,
      tapToDismiss: true,
      newestOnTop: true,
      maxOpened: 4,
      autoDismiss: true,
      preventDuplicates: true,
      resetTimeoutOnDuplicate: true,
      countDuplicates: true,
    }),
  ],
};
