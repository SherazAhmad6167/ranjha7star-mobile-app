import { CommonModule } from '@angular/common';
import { Component, OnInit } from '@angular/core';
import {
  collection,
  Firestore,
  getDocs,
  query,
  where,
} from '@angular/fire/firestore';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { ToastrModule, ToastrService } from 'ngx-toastr';

@Component({
  selector: 'app-login',
  imports: [FormsModule, CommonModule, ToastrModule],
  templateUrl: './login.component.html',
  styleUrl: './login.component.scss',
})
export class LoginComponent implements OnInit {
  username = '';
  password = '';
  loading = false;
  errorMessage = '';
  showPassword = false;

  constructor(
    private firestore: Firestore,
    private router: Router,
    private toastr: ToastrService,
  ) {}

  ngOnInit() {
    const username = localStorage.getItem('username');
    const role = localStorage.getItem('role');
    if (username && role) {
      this.router.navigate(['/home']);
    }
  }

  togglePassword() {
    this.showPassword = !this.showPassword;
  }

  async login() {
    if (!this.username || !this.password) {
      this.toastr.error('Username aur password required hai');
      return;
    }

    this.loading = true;

    try {
      const ref = collection(this.firestore, 'recoveryOfficer');

      const q = query(
        ref,
        where('user_name', '==', this.username),
        where('password', '==', this.password),
      );

      const snapshot = await getDocs(q);

      if (snapshot.empty) {
        this.toastr.error('Invalid username or password');
        this.errorMessage = 'Invalid username or password';
        this.loading = false;
        return;
      }

      const user = snapshot.docs[0].data();

      if (user['status'] !== 'activated') {
        this.toastr.error('Account is not activated, please contact admin');
        this.errorMessage = 'Account is not activated, please contact admin';
        this.loading = false;
        return;
      }

      localStorage.setItem('username', user['user_name']);
      localStorage.setItem('name', user['name'] || '');
      localStorage.setItem('role', user['role']);
      localStorage.setItem('userId', snapshot.docs[0].id);
      localStorage.setItem('sublocality', JSON.stringify(user['sublocality'] || []));

      this.toastr.success('Login successful');
      this.router.navigate(['/home']);
    } catch (err) {
      console.error(err);
      this.toastr.error('Something went wrong');
      this.errorMessage = 'Something went wrong';
    } finally {
      this.loading = false;
    }
  }
}
