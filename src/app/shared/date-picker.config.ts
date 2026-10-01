import { Injectable } from '@angular/core';
import {
  NgbDateAdapter,
  NgbDateParserFormatter,
  NgbDateStruct,
} from '@ng-bootstrap/ng-bootstrap';

const pad = (value: number) => String(value).padStart(2, '0');

/**
 * Keeps the form value as the 'yyyy-mm-dd' string the app has always stored,
 * so replacing <input type="date"> changes nothing in Firestore.
 */
@Injectable()
export class IsoDateAdapter extends NgbDateAdapter<string> {
  fromModel(value: string | null): NgbDateStruct | null {
    if (!value) return null;

    const [datePart] = value.toString().split('T');
    const [year, month, day] = datePart.split('-').map(Number);

    if (!year || !month || !day) return null;

    return { year, month, day };
  }

  toModel(date: NgbDateStruct | null): string {
    // '' rather than null, matching what the native date input left behind.
    return date ? `${date.year}-${pad(date.month)}-${pad(date.day)}` : '';
  }
}

/**
 * Shows and accepts dd/mm/yyyy on every device. The native date input follows
 * the phone's locale instead, which is why Android showed mm/dd/yyyy while
 * desktop showed dd/mm/yyyy for the same field.
 */
@Injectable()
export class DdMmYyyyDateFormatter extends NgbDateParserFormatter {
  parse(value: string): NgbDateStruct | null {
    if (!value) return null;

    const [day, month, year] = value.trim().split(/[\/\-.\s]+/).map(Number);

    if (!day || !month || !year) return null;

    return { year, month, day };
  }

  format(date: NgbDateStruct | null): string {
    return date ? `${pad(date.day)}/${pad(date.month)}/${date.year}` : '';
  }
}

/** Add to a component's `providers` to make its datepickers read dd/mm/yyyy. */
export const DD_MM_YYYY_DATE_PROVIDERS = [
  { provide: NgbDateAdapter, useClass: IsoDateAdapter },
  { provide: NgbDateParserFormatter, useClass: DdMmYyyyDateFormatter },
];

/**
 * Form value for an OPTIONAL datepicker field. ngbDatepicker validates its
 * control itself and treats '' as an invalid date (only null counts as
 * empty), so a blank optional date left as '' blocked the whole form.
 * Returns the stored 'yyyy-mm-dd', or null when blank or unreadable.
 */
export function optionalDateValue(value: any): string | null {
  if (value?.toDate) {
    const date: Date = value.toDate(); // Firestore Timestamp
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
  }
  if (typeof value !== 'string' || !value.trim()) return null;
  return new IsoDateAdapter().fromModel(value) ? value : null;
}

/**
 * What to store for an optional date on save: the picked date, else '' as
 * before - except an old value the picker couldn't read (so it showed blank)
 * is kept as it was rather than wiped.
 */
export function storedOptionalDate(formValue: any, original: any): any {
  if (formValue) return formValue;
  return original && optionalDateValue(original) === null ? original : '';
}
