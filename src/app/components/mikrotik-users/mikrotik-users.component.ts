import { Component, OnInit, TemplateRef, ViewChild } from '@angular/core';
import { CommonModule } from '@angular/common';
import {
  FormBuilder,
  FormGroup,
  FormsModule,
  ReactiveFormsModule,
  Validators,
} from '@angular/forms';
import { NgbModal, NgbModalRef } from '@ng-bootstrap/ng-bootstrap';
import { ToastrModule, ToastrService } from 'ngx-toastr';
import { Firestore, doc, getDoc } from '@angular/fire/firestore';
import { MikrotikService, MikrotikError, MikrotikServer } from '../../shared/mikrotik.service';
import { SearchSelectComponent } from '../../shared/search-select/search-select.component';

export interface ServerTab {
  id: MikrotikServer;
  label: string;
  ip: string;
}

@Component({
  selector: 'app-mikrotik-users',
  imports: [CommonModule, FormsModule, ReactiveFormsModule, ToastrModule, SearchSelectComponent],
  templateUrl: './mikrotik-users.component.html',
  styleUrl: './mikrotik-users.component.scss',
})
export class MikrotikUsersComponent implements OnInit {
  isLoading = false;
  isSaving = false;
  isDeleting = false;
  isBulkUpdating = false;
  bulkPendingAction: 'enable' | 'disable' | null = null;
  proxyError: string | null = null;
  proxyIsCors = false;

  users: any[] = [];
  filteredUsers: any[] = [];
  searchTerm = '';

  currentPage = 1;
  pageSize = 10;
  totalPages = 1;

  editMode = false;
  selectedUser: any = null;
  userToDelete: any = null;

  internetPackages: any[] = [];
  routerProfiles: string[] = [];
  profilesLoading = false;

  form!: FormGroup;
  readonly Math = Math;

  readonly servers: ServerTab[] = [
    { id: 1, label: '194.1002', ip: '103.66.149.194' },
    { id: 2, label: '195.9998', ip: '103.66.149.195' },
  ];
  activeServer: MikrotikServer = 1;

  @ViewChild('userModal') userModal!: TemplateRef<any>;
  @ViewChild('deleteModal') deleteModal!: TemplateRef<any>;
  @ViewChild('bulkModal') bulkModal!: TemplateRef<any>;

  private modalRef?: NgbModalRef;
  private deleteModalRef?: NgbModalRef;

  constructor(
    private fb: FormBuilder,
    private modalService: NgbModal,
    private mikrotikService: MikrotikService,
    private toastr: ToastrService,
    private firestore: Firestore,
  ) {}

  ngOnInit() {
    this.form = this.fb.group({
      name:     ['', [Validators.required, Validators.minLength(2)]],
      password: ['', [Validators.required, Validators.minLength(4)]],
      profile:  ['', Validators.required],
      service:  ['pppoe', Validators.required],
      comment:  [''],
      disabled: [true],
    });
    this.loadInternetPackages();
    this.loadRouterProfiles();
    this.loadUsers();
  }

  async loadInternetPackages() {
    try {
      const ref = doc(this.firestore, 'internetPackage', 'internetPackageDoc');
      const snap = await getDoc(ref);
      if (snap.exists()) {
        this.internetPackages = snap.data()?.['internetPackage'] || [];
      }
    } catch {
      // silently ignore
    }
  }

  loadRouterProfiles() {
    this.profilesLoading = true;
    this.routerProfiles = [];
    this.mikrotikService.getPppProfiles(this.activeServer).subscribe({
      next: (profiles) => {
        this.routerProfiles = profiles
          .map((p: any) => p.name)
          .filter((n: string) => n && n !== 'default')
          .sort();
        this.profilesLoading = false;
      },
      error: () => {
        this.profilesLoading = false;
      },
    });
  }

  switchServer(server: MikrotikServer) {
    if (this.activeServer === server) return;
    this.activeServer = server;
    this.searchTerm = '';
    this.currentPage = 1;
    this.loadRouterProfiles();
    this.loadUsers();
  }

  get activeServerTab(): ServerTab {
    return this.servers.find(s => s.id === this.activeServer)!;
  }

  loadUsers() {
    this.isLoading = true;
    this.proxyError = null;
    this.mikrotikService.getPppSecrets(this.activeServer).subscribe({
      next: (data) => {
        this.users = data;
        this.applyFilter();
        this.isLoading = false;
      },
      error: (err: MikrotikError) => {
        this.proxyError = err.message;
        this.proxyIsCors = err.isCors;
        this.isLoading = false;
      },
    });
  }

  applyFilter() {
    const term = this.searchTerm.toLowerCase();
    this.filteredUsers = term
      ? this.users.filter(
          (u) =>
            u.name?.toLowerCase().includes(term) ||
            u.profile?.toLowerCase().includes(term) ||
            u.comment?.toLowerCase().includes(term),
        )
      : [...this.users];
    this.currentPage = 1;
    this.updatePagination();
  }

  isDisabled(user: any): boolean {
    return user.disabled === 'true' || user.disabled === 'yes';
  }

  get totalCount()    { return this.users.length; }
  get activeCount()   { return this.users.filter((u) => !this.isDisabled(u)).length; }
  get disabledCount() { return this.users.filter((u) => this.isDisabled(u)).length; }

  get pagedUsers() {
    const start = (this.currentPage - 1) * this.pageSize;
    return this.filteredUsers.slice(start, start + this.pageSize);
  }

  updatePagination() {
    this.totalPages = Math.ceil(this.filteredUsers.length / this.pageSize) || 1;
    if (this.currentPage > this.totalPages) this.currentPage = 1;
  }

  get visiblePages(): number[] {
    const pages: number[] = [];
    const start = Math.floor((this.currentPage - 1) / 5) * 5 + 1;
    const end = Math.min(start + 4, this.totalPages);
    for (let i = start; i <= end; i++) pages.push(i);
    return pages;
  }

  prevPage() { if (this.currentPage > 1) this.currentPage--; }
  nextPage() { if (this.currentPage < this.totalPages) this.currentPage++; }
  goToPage(p: number) { this.currentPage = p; }
  onPageSizeChange() { this.currentPage = 1; this.updatePagination(); }

  openAddModal() {
    this.editMode = false;
    this.selectedUser = null;
    this.form.reset({ profile: '', service: 'pppoe', comment: '', disabled: true });
    this.form.get('password')?.setValidators([Validators.required, Validators.minLength(4)]);
    this.form.get('password')?.updateValueAndValidity();
    this.modalRef = this.modalService.open(this.userModal, { size: 'md', backdrop: 'static' });
  }

  openEditModal(user: any) {
    this.editMode = true;
    this.selectedUser = user;
    this.form.patchValue({
      name:     user.name,
      password: '',
      profile:  user.profile || '',
      service:  user.service || 'pppoe',
      comment:  user.comment || '',
      disabled: this.isDisabled(user),
    });
    this.form.get('password')?.clearValidators();
    this.form.get('password')?.updateValueAndValidity();
    this.modalRef = this.modalService.open(this.userModal, { size: 'md', backdrop: 'static' });
  }

  saveUser() {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }

    this.isSaving = true;
    const { name, password, profile, service, comment, disabled } = this.form.value;
    const disabledVal = disabled ? 'yes' : 'no';

    if (this.editMode && this.selectedUser) {
      const updates: Record<string, string> = { profile, service, comment, disabled: disabledVal };
      if (password) updates['password'] = password;

      this.mikrotikService.updatePppSecret(this.selectedUser['.id'], updates, this.activeServer).subscribe({
        next: () => {
          this.toastr.success(`User "${this.selectedUser.name}" updated`);
          this.isSaving = false;
          this.modalRef?.close();
          this.loadUsers();
        },
        error: (err: MikrotikError) => {
          this.toastr.error(err.message || 'Failed to update user');
          this.isSaving = false;
        },
      });
    } else {
      this.mikrotikService.createPppSecret(name, password, profile, service, this.activeServer, disabledVal).subscribe({
        next: () => {
          this.toastr.success(`User "${name}" created`);
          this.isSaving = false;
          this.modalRef?.close();
          this.loadUsers();
        },
        error: (err: MikrotikError) => {
          this.toastr.error(err.message || 'Failed to create user');
          this.isSaving = false;
        },
      });
    }
  }

  openDeleteModal(user: any) {
    this.userToDelete = user;
    this.deleteModalRef = this.modalService.open(this.deleteModal, { centered: true });
  }

  confirmDelete(modal: any) {
    if (!this.userToDelete) return;
    this.isDeleting = true;

    this.mikrotikService.deletePppSecret(this.userToDelete['.id'], this.activeServer).subscribe({
      next: () => {
        this.toastr.success(`User "${this.userToDelete.name}" deleted`);
        this.isDeleting = false;
        this.userToDelete = null;
        modal.close();
        this.loadUsers();
      },
      error: (err: MikrotikError) => {
        this.toastr.error(err.message || 'Failed to delete user');
        this.isDeleting = false;
      },
    });
  }

  openBulkModal(action: 'enable' | 'disable') {
    this.bulkPendingAction = action;
    this.modalService.open(this.bulkModal, { centered: true, size: 'sm', backdrop: 'static' });
  }

  confirmBulkAction(modal: any) {
    if (!this.bulkPendingAction) return;
    this.isBulkUpdating = true;

    const req$ = this.bulkPendingAction === 'enable'
      ? this.mikrotikService.bulkEnablePppSecrets(this.activeServer)
      : this.mikrotikService.bulkDisablePppSecrets(this.activeServer);

    req$.subscribe({
      next: (res) => {
        const action = this.bulkPendingAction === 'enable' ? 'enabled' : 'disabled';
        this.toastr.success(`${res.updated} users ${action} (${res.total} total) on ${this.activeServerTab.label}`);
        this.isBulkUpdating = false;
        this.bulkPendingAction = null;
        modal.close();
        this.loadUsers();
      },
      error: (err: MikrotikError) => {
        this.toastr.error(err.message || 'Bulk action failed');
        this.isBulkUpdating = false;
      },
    });
  }
}
