import { formatDate } from '@angular/common';
import { PrintLine } from './bluetooth.service';

/*
 * Receipt layouts for the Bluetooth thermal printer. Each builder takes the
 * same data its on-screen receipt uses, so the printout matches the sheet.
 *
 * Laid out for a 58 mm roll / 48 mm printable width (Media Link G3):
 * 32 characters per line, 16 for large text. Labels stay at 12 characters
 * or less so most "label ... value" rows fit on one line; longer values wrap
 * onto the next line right-aligned (see BluetoothService.formatRow).
 */

const BRAND = 'Ranjha7star';
/** Large text is double width: half the 58 mm line. */
const LARGE_MAX = 16;

function titleCase(value: unknown): string {
  return String(value ?? '')
    .toLowerCase()
    .replace(/\b\w/g, (c) => c.toUpperCase())
    .trim();
}

function rs(value: unknown): string {
  const n = Number(value);
  return `Rs ${Number.isFinite(n) ? n.toLocaleString('en-US') : value ?? 0}`;
}

function toDate(value: any): Date | null {
  if (!value) return null;
  const date = typeof value?.toDate === 'function' ? value.toDate() : new Date(value);
  return isNaN(date.getTime()) ? null : date;
}

function dateText(value: any, format = 'dd MMM yyyy'): string {
  const date = toDate(value);
  return date ? formatDate(date, format, 'en-US') : String(value || '-');
}

/** Big centred heading; a long name falls back to bold so it does not break mid-word. */
function heading(name: string): PrintLine {
  const text = (name || BRAND).trim();
  return text.length <= LARGE_MAX
    ? { text, align: 'center', size: 'large', bold: true }
    : { text, align: 'center', bold: true };
}

function complainLines(company: any): PrintLine[] {
  const numbers = [company?.complain_no1, company?.complain_no2].filter(Boolean);
  if (!numbers.length) return [];
  return [
    { text: 'Complaints', align: 'center' },
    ...numbers.map((n) => ({ text: String(n), align: 'center', bold: true }) as PrintLine),
  ];
}

/** Users > Collections: payment / advance receipt (`receiptData`). */
export function collectionReceiptLines(r: any, company: any): PrintLine[] {
  const isAdvance = !!r?.advance;
  const period = [titleCase(r?.month), r?.year].filter(Boolean).join(' ');

  return [
    heading(company?.companyName),
    { text: isAdvance ? 'Advance Receipt' : 'Payment Receipt', align: 'center' },
    ...(period ? [{ text: period, align: 'center', bold: true } as PrintLine] : []),
    { divider: true },
    { row: ['Name', r?.name] },
    { row: ['Internet ID', r?.internetId] },
    ...(r?.installationDate ? [{ row: ['Installed', dateText(r.installationDate)] } as PrintLine] : []),
    ...(r?.address ? [{ text: r.address } as PrintLine] : []),
    ...(r?.area ? [{ row: ['Area', titleCase(r.area)] } as PrintLine] : []),
    { divider: true },
    ...(r?.previousAmount
      ? ([
          { row: [r.previousMonth ? `${titleCase(r.previousMonth).slice(0, 3)} balance` : 'Prev balance', rs(r.previousAmount)] },
          { row: ['Current', rs(r.currentAmount)] },
        ] as PrintLine[])
      : []),
    { row: ['Total', rs(r?.totalAmount)] },
    { row: ['Paid', rs(r?.collectedAmount)], bold: true },
    { row: ['Remaining', rs(r?.remainingAmount || 0)] },
    ...(r?.extraAmount > 0 ? [{ row: ['Extra (adv)', rs(r.extraAmount)], bold: true } as PrintLine] : []),
    ...(r?.advanceBalance > 0 ? [{ row: ['Adv balance', rs(r.advanceBalance)] } as PrintLine] : []),
    { divider: true },
    { row: ['Method', titleCase(r?.method) || '-'] },
    ...(r?.method === 'bank' ? [{ row: ['Bank', r?.bank] } as PrintLine] : []),
    { row: ['By', r?.collectedBy] },
    { row: ['Date', dateText(r?.date, 'dd/MM/yy hh:mm a')] },
    { divider: 'double' },
    ...complainLines(company),
    { text: 'Payment Successful', align: 'center', bold: true },
    { text: 'Thank you!', align: 'center' },
  ];
}

/** Users > User details: customer receipt (`receiptData`). */
export function userReceiptLines(r: any, company: any, total: number): PrintLine[] {
  const period = [titleCase(r?.month), r?.year].filter(Boolean).join(' ');
  const pkg = [titleCase(r?.select_package), titleCase(r?.pkg_cable)].filter(Boolean).join(' + ');

  return [
    heading(company?.companyName),
    { text: 'Customer Receipt', align: 'center' },
    ...(period ? [{ text: period, align: 'center', bold: true } as PrintLine] : []),
    { divider: true },
    { row: ['Name', r?.name] },
    { row: ['Internet ID', r?.internetId] },
    ...(r?.installationDate ? [{ row: ['Installed', dateText(r.installationDate)] } as PrintLine] : []),
    ...(r?.address ? [{ text: r.address } as PrintLine] : []),
    ...(r?.area ? [{ row: ['Area', titleCase(r.area)] } as PrintLine] : []),
    { row: ['Package', pkg || '-'] },
    { divider: true },
    { row: ['Installation', rs(r?.installation_amount || 0)] },
    { row: ['Total', rs(total)], bold: true },
    ...(r?.advanceBalance > 0 ? [{ row: ['Adv balance', rs(r.advanceBalance)] } as PrintLine] : []),
    { divider: 'double' },
    ...complainLines(company),
    { text: 'Internet Connection', align: 'center', bold: true },
    { text: formatDate(new Date(), 'dd/MM/yy hh:mm a', 'en-US'), align: 'center' },
  ];
}

/** Customers > New connection: installation slip (a `newConnection` record). */
export function connectionSlipLines(u: any): PrintLine[] {
  const area = [titleCase(u?.sublocality), titleCase(u?.sub_area)].filter(Boolean).join(', ');
  const freeOrOffer = u?.connection_payment === 'Free' || u?.connection_payment === 'Offer';
  // Received over the installation fee
  const extra = Number(u?.recieved_amount || 0) - Number(u?.installation_amount || 0);

  return [
    heading('RANJHA 7 STAR'),
    { text: 'Cable TV & Internet', align: 'center' },
    { text: 'NEW CONNECTION SLIP', align: 'center', bold: true },
    { divider: true },
    { row: ['App No', u?.internet_id] },
    { row: ['Date', dateText(u?.createdAt, 'dd/MM/yyyy')] },
    { divider: true },
    { text: 'CUSTOMER', bold: true },
    { row: ['Name', u?.user_name] },
    { row: ['Father', u?.father_name] },
    { row: ['CNIC', u?.cnic] },
    { row: ['Mobile', u?.mobile_no] },
    ...(u?.alter_mobile_no ? [{ row: ['Alt mobile', u.alter_mobile_no] } as PrintLine] : []),
    ...(u?.address ? [{ text: u.address } as PrintLine] : []),
    ...(area ? [{ row: ['Area', area] } as PrintLine] : []),
    { divider: true },
    { text: 'PAYMENT', bold: true },
    { row: ['Package', u?.package_label || u?.package_name] },
    { row: ['Monthly fee', rs(u?.monthly_fee || 0)] },
    { row: ['Install fee', rs(u?.installation_amount || 0)] },
    { row: ['Advance', rs(u?.advance_paid || 0)] },
    { row: ['Balance', rs(u?.balance || 0)] },
    { row: ['Method', u?.payment_method] },
    { row: ['Type', u?.connection_payment] },
    { row: ['Received', u?.isRecieved ? rs(u?.recieved_amount || 0) : 'Pending'], bold: true },
    ...(u?.isRecieved && extra > 0 ? [{ row: ['Extra', rs(extra)], bold: true } as PrintLine] : []),
    ...(u?.isRecieved && u?.recieved_by ? [{ row: ['By', u.recieved_by] } as PrintLine] : []),
    { divider: true },
    { text: 'INSTALLATION', bold: true },
    { row: ['Installed', dateText(u?.installation_date)] },
    { row: ['Technician', titleCase(u?.operator_name) || '-'] },
    ...(u?.remarks ? [{ text: `Note: ${u.remarks}` } as PrintLine] : []),
    ...(freeOrOffer
      ? [
          { divider: true } as PrintLine,
          { text: 'Modem & wire are company property; return them on disconnection.' } as PrintLine,
        ]
      : []),
    { divider: 'double' },
    { text: 'Complaint / WhatsApp', align: 'center' },
    { text: '0307-6801030', align: 'center', bold: true },
    { text: '0307-6801094', align: 'center', bold: true },
    { text: '0300-8800263', align: 'center', bold: true },
    { feed: 2 },
    { text: '____________________', align: 'center' },
    { text: 'Authorized Signature', align: 'center' },
  ];
}
