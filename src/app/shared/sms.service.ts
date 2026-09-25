import { Injectable } from '@angular/core';
import { Firestore, addDoc, collection } from '@angular/fire/firestore';

/**
 * The SMS gateway polls the `sms` collection for `pending` documents, so
 * queueing a message is just a write.
 */
@Injectable({ providedIn: 'root' })
export class SmsService {
  constructor(private firestore: Firestore) {}

  /** Normalises a local number to +92XXXXXXXXXX; null when it cannot be read. */
  format(phone: string): string | null {
    if (!phone) return null;
    const cleaned = phone.toString().trim().replace(/[\s\-()]/g, '');
    if (cleaned.startsWith('+92') && cleaned.length === 13) return cleaned;
    if (cleaned.startsWith('92') && cleaned.length === 12) return '+' + cleaned;
    if (cleaned.startsWith('0') && cleaned.length === 11) return '+92' + cleaned.slice(1);
    if (cleaned.length === 10) return '+92' + cleaned;
    return null;
  }

  /**
   * Not awaited by design - the app is used offline in the field, where the
   * write lands in the Firestore cache and syncs later.
   */
  queue(phone: string, message: string) {
    addDoc(collection(this.firestore, 'sms'), {
      phone,
      message,
      status: 'pending',
      createdAt: new Date().toISOString(),
    });
  }
}
