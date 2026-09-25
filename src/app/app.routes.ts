import { inject } from '@angular/core';
import { Router, Routes } from '@angular/router';
import { LoginComponent } from './components/login/login.component';
import { ApplayoutComponent } from './components/applayout/applayout.component';
import { UserDetailsComponent } from './components/user-details/user-details.component';
import { UsersCollectionsComponent } from './components/users-collections/users-collections.component';
import { NewConnectionComponent } from './components/new-connection/new-connection.component';
import { RecoveryDetailsComponent } from './components/recovery-details/recovery-details.component';
import { MobileHomeComponent } from './components/mobile-home/mobile-home.component';
import { PrinterComponent } from './components/printer/printer.component';
import { ZalSubscribersComponent } from './components/zal-subscribers/zal-subscribers.component';
import { AuthGuard } from './shared/auth.guard';
import { PageNotFoundComponent } from './components/page-not-found/page-not-found.component';

/** Same check LoginComponent and AuthGuard use. */
const isLoggedIn = () => !!(localStorage.getItem('username') && localStorage.getItem('role'));


// Mobile app surface: keep only the screens requested for the Ionic app.
// Other web/admin components are intentionally not registered in mobile routes.
export const routes: Routes = [
  // Signed-in users skip the login page entirely, so it never flashes on launch.
  {
    path: 'login',
    component: LoginComponent,
    canActivate: [() => (isLoggedIn() ? inject(Router).createUrlTree(['/home']) : true)],
  },
  { path: '', pathMatch: 'full', redirectTo: () => (isLoggedIn() ? '/home' : '/login') },
  {
    path: '',
    component: ApplayoutComponent,
    canActivate: [AuthGuard],
    canActivateChild: [AuthGuard],
    children: [
      { path: '', redirectTo: 'home', pathMatch: 'full' },
      { path: 'home', data: { roles: ['operator', 'admin'] }, component: MobileHomeComponent },
      { path: 'user-details', data: { roles: ['operator', 'admin'] }, component: UserDetailsComponent },
      { path: 'new-connection', data: { roles: ['admin', 'operator'] }, component: NewConnectionComponent },
      { path: 'user-collections', data: { roles: ['admin', 'operator'] }, component: UsersCollectionsComponent },
      { path: 'recovery-details', data: { roles: ['admin', 'operator'] }, component: RecoveryDetailsComponent },
      { path: 'printer', data: { roles: ['admin', 'operator'] }, component: PrinterComponent },
      // Open to every signed-in role (the parent AuthGuard still requires login).
      { path: 'zal-subscribers', component: ZalSubscribersComponent },
    ],
  },
  { path: 'not-found', component: PageNotFoundComponent },
  { path: '**', redirectTo: 'not-found' },
];
