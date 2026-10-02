import { CommonModule } from '@angular/common';
import { Component, Input } from '@angular/core';
import { doc, Firestore, getDoc } from '@angular/fire/firestore';
import { NgbActiveModal } from '@ng-bootstrap/ng-bootstrap';
import { carriedToLabel, isCarried } from '../../shared/bill-carry';

@Component({
  selector: 'app-user-collection-modal',
  imports: [CommonModule],
  templateUrl: './user-collection-modal.component.html',
  styleUrl: './user-collection-modal.component.scss'
})
export class UserCollectionModalComponent {
  @Input() docId!: string;
  user: any = null;
  isLoading = false;

  constructor(public activeModal: NgbActiveModal, private firestore: Firestore) {}

  /** Unpaid, but its balance is now collected on a later bill. */
  isCarriedOpen(bill: any): boolean {
    return isCarried(bill) && bill.status !== 'paid';
  }

  /** Where a carried balance went, e.g. "Paid with October 2026 bill". */
  carryNote(bill: any): string {
    if (!isCarried(bill)) return '';
    const label = carriedToLabel(bill);
    return bill.settled_with ? `Paid with ${label} bill` : `Added to ${label} bill`;
  }

  async ngOnInit() {
    if (!this.docId) return;
    this.isLoading = true;

    try {
      const userRef = doc(this.firestore, 'users', this.docId);
      const userSnap = await getDoc(userRef);

      if (userSnap.exists()) {
        this.user = userSnap.data();
      } else {
        this.user = null;
        console.error('User not found:', this.docId);
      }
    } catch (err) {
      this.isLoading = false;
      console.error('Error fetching user details', err);
    } finally {
      this.isLoading = false;
    }
  }

  getAdvanceMonthsString(adv: any) {
  if (!adv.advance_months) return '';
  return adv.advance_months
    .map((m: any) => `${this.titleCase(m.month)} ${m.year}`)
    .join(', ');
}

// simple titleCase helper
titleCase(str: string) {
  if (!str) return '';
  return str.charAt(0).toUpperCase() + str.slice(1).toLowerCase();
}

}
