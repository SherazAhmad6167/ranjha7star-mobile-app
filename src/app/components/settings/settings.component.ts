import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import {
  doc,
  Firestore,
  getDoc,
  deleteDoc,
  setDoc,
} from '@angular/fire/firestore';
import { FormsModule } from '@angular/forms';
import { ToastrModule, ToastrService } from 'ngx-toastr';
import {
  DEFAULT_RECOVERY_RECEIVED_TEMPLATE,
  DEFAULT_REVIEW_APPROVED_TEMPLATE,
  DEFAULT_REVIEW_DECLINED_TEMPLATE,
} from '../../shared/message-templates';

@Component({
  selector: 'app-settings',
  imports: [CommonModule, FormsModule, ToastrModule],
  templateUrl: './settings.component.html',
  styleUrl: './settings.component.scss',
})
export class SettingsComponent {
  templates: any[] = [
    { id: 'welcome', title: 'Welcome Message', message: '' },
    { id: 'complaint', title: 'Complaint Acknowledgment', message: '' },
    { id: 'paymentReminder', title: 'Payment Reminder', message: '' },
    { id: 'paymentReceived', title: 'Payment Received', message: '' },
    { id: 'overdue', title: 'Overdue Warning', message: '' },
    { id: 'maintenance', title: 'Maintenance Notice', message: '' },
    { id: 'upgrade', title: 'Upgrade Offer', message: '' },
    { id: 'restoration', title: 'Service Restoration', message: '' },
    { id: 'complainResolve', title: 'Complaint Resolved', message: '' },
    { id: 'birthday',  title: 'Birthday Wish',     message: '' },
    { id: 'recovery',  title: 'Recovery Details',  message: '' },
    {
      id: 'recoveryReceived',
      title: 'Recovery Received (Received By)',
      message: '',
      default: DEFAULT_RECOVERY_RECEIVED_TEMPLATE,
    },
    {
      id: 'reviewApproved',
      title: 'Website Review Approved',
      message: '',
      default: DEFAULT_REVIEW_APPROVED_TEMPLATE,
    },
    {
      id: 'reviewDeclined',
      title: 'Website Review Declined',
      message: '',
      default: DEFAULT_REVIEW_DECLINED_TEMPLATE,
    },
  ];

  constructor(
    private firestore: Firestore,
    private toastr: ToastrService,
  ) {}

  ngOnInit() {
    this.loadTemplates();
  }

  async loadTemplates() {
    for (let item of this.templates) {
      const ref = doc(this.firestore, `messageTemplates/${item.id}`);
      const snap = await getDoc(ref);

      if (snap.exists()) {
        item.message = snap.data()['message'];
      } else if (item.default) {
        // Show the built-in wording so it can be reviewed and saved as-is.
        item.message = item.default;
      }
    }
  }

  async saveTemplate(item: any) {
    const ref = doc(this.firestore, `messageTemplates/${item.id}`);

    await setDoc(ref, {
      title: item.title,
      message: item.message,
      updatedAt: new Date(),
    });
    this.loadTemplates();
    this.toastr.success('Saved successfully');
  }

  resetTemplate(item: any) {
    item.message = '';
  }

  getTemplateIcon(id: string): string {
    const map: Record<string, string> = {
      welcome:      'ri-hand-heart-line',
      complaint:    'ri-customer-service-2-line',
      paymentReminder: 'ri-notification-3-line',
      paymentReceived: 'ri-checkbox-circle-line',
      overdue:      'ri-error-warning-line',
      maintenance:  'ri-tools-line',
      upgrade:      'ri-rocket-line',
      restoration:     'ri-wifi-line',
      complainResolve: 'ri-checkbox-circle-line',
      birthday:        'ri-cake-line',
      recovery:         'ri-money-dollar-circle-line',
      recoveryReceived: 'ri-hand-coin-line',
      reviewApproved:   'ri-star-smile-line',
      reviewDeclined:   'ri-chat-delete-line',
    };
    return map[id] || 'ri-message-2-line';
  }

  async deleteTemplate(id: string) {
    const confirmDelete = confirm('Are you sure?');

    if (!confirmDelete) return;

    const ref = doc(this.firestore, `messageTemplates/${id}`);
    await deleteDoc(ref);

    this.toastr.success('Deleted successfully');
  }
}
