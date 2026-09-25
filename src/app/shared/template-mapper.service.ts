import { Injectable } from '@angular/core';

/**
 * Extra/context values a caller can supply to override or fill variables that
 * cannot be derived from the user record alone (maintenance window, area, etc).
 */
export interface TemplateContext {
  companyName?: string;
  supportNumber?: string;
  complaintNumber?: string;
  complaintDate?: any;
  resolvedDate?: any;
  amount?: any;
  overdueAmount?: any;
  dueDate?: any;
  paymentDate?: any;
  billingDate?: any;
  maintenanceDate?: any;
  startTime?: any;
  endTime?: any;
  areaName?: any;
  [key: string]: any;
}

@Injectable({ providedIn: 'root' })
export class TemplateMapperService {
  /** Fallback company name used when nothing is passed in context. */
  readonly defaultCompanyName = 'NASSTEC AIR NET NETWORK PVT.LTD';

  /** Default billing/due date wording used across the app. */
  readonly defaultDueDate = 'Before 5th of every Month';

  /** Support numbers shown when a template asks for a contact number. */
  readonly defaultSupportNumber = '0307-6801030';

  /**
   * Replaces every template variable with real data.
   *
   * Handles all three variable styles used by templates saved over time:
   *   {Customer Name}   – current format
   *   {{name}}          – legacy double-brace format
   *   [Customer Name]   – legacy bracket format
   */
  map(template: any, data: any = {}, ctx: TemplateContext = {}): string {
    if (!template || typeof template !== 'string') {
      console.error('Invalid template:', template);
      return '';
    }

    const d = data || {};

    const customerName = d.user_name || d.name || '';
    const customerId = d.internet_id || d.internetId || '';
    const packageName = d.select_package || d.package || '';
    const monthlyBill = this.num(d.internet_package_fee ?? d.package_fee);
    const connectionType = this.prettyConnection(d.connection_type || d.type);
    const connectionPayment = this.num(d.connection_payment);
    const companyName = ctx.companyName || this.defaultCompanyName;

    // Amount: caller wins, otherwise fall back through the bill shapes in use.
    const amount = this.num(
      ctx.amount ?? d.collected_amount ?? d.collectedAmount ?? d.amount
    );
    const overdueAmount = this.num(
      ctx.overdueAmount ?? d.remaining_amount ?? d.remainingAmount ?? d.amount
    );

    const dueDate = ctx.dueDate || this.defaultDueDate;
    const paymentDate =
      this.date(ctx.paymentDate ?? d.collected_date ?? d.date) ||
      this.date(new Date());
    const billingDate =
      ctx.billingDate || this.date(d.installation_date) || this.defaultDueDate;

    const complaintNo = ctx.complaintNumber || d.complain_no || customerId;
    const complaintDate = this.date(ctx.complaintDate ?? d.complain_date);
    const resolvedDate = this.date(ctx.resolvedDate ?? d.complain_close_date) || this.date(new Date());
    const complaintDetails = d.complain || d.complaint || '';
    const technicianName = d.operator_name || '';
    const technicianNumber = d.operator_phone_number || d.operator_phone || d.operator_no || '';

    const areaName =
      ctx.areaName || d.sublocality || d.area || d.sub_area || '';
    const maintenanceDate = this.date(ctx.maintenanceDate) || '';
    const startTime = ctx.startTime || '';
    const endTime = ctx.endTime || '';

    const month = d.month || '';
    const supportNumber = ctx.supportNumber || this.defaultSupportNumber;

    // Order matters only in that every pair below is independent — each token
    // is replaced globally against the original placeholder text.
    const pairs: [string, string][] = [
      ['Customer Name', customerName],
      ['Customer ID', String(customerId)],
      ['Company Name', companyName],
      ['Connection Type', connectionType],
      ['Connection Payment', connectionPayment],
      ['Package Name', packageName],
      ['Package', packageName],
      ['Monthly Bill', monthlyBill],
      ['Billing Date', billingDate],
      ['Amount', amount],
      ['Overdue Amount', overdueAmount],
      ['Due Date', dueDate],
      ['Payment Date', paymentDate],
      ['Complaint No', String(complaintNo)],
      ['Complaint Date', complaintDate],
      ['Resolved Date', resolvedDate],
      ['Complaint Details', complaintDetails],
      ['Technician Name', technicianName],
      ['Technician Number', technicianNumber],
      ['Operator Name', technicianName],
      ['Operator Phone', technicianNumber],
      ['Total Recovery', this.num(d.total_recovery)],
      ['Total Expenses', this.num(d.total_expenses)],
      ['Remaining Amount', this.num(d.remaining_amount ?? d.remainingAmount)],
      ['Received By', d.recieved_by || d.received_by || ''],
      ['Recovery Date', this.date(d.date) || String(d.date || '')],
      ['Maintenance Date', maintenanceDate],
      ['Start Time', startTime],
      ['End Time', endTime],
      ['Area Name', areaName],
      ['Area', areaName],
      ['Month', month],
      ['Number', supportNumber],
      ['Date', dueDate],
    ];

    let out = template;

    for (const [token, value] of pairs) {
      out = out.replace(this.tokenRegex(token), value ?? '');
    }

    // Legacy aliases that do not follow the "{Label}" naming.
    const legacy: [string, string][] = [
      ['XXXX', String(customerId)],
      ['AMOUNT', amount],
      ['DATE', dueDate],
      ['Issue Description', complaintDetails],
      ['Operator', technicianName],
      ['Installation Date', this.date(d.installation_date)],
      ['X dinon', '10 dinon'],
      ['name', customerName],
      ['id', String(customerId)],
      ['package', packageName],
      ['amount', amount],
      ['area', areaName],
      ['phone', d.phone_no || d.mobile_no || ''],
    ];

    for (const [token, value] of legacy) {
      out = out.replace(this.tokenRegex(token), value ?? '');
    }

    return out;
  }

  /** Matches {{token}}, {token} and [token] for a given label, case-insensitive. */
  private tokenRegex(token: string): RegExp {
    const escaped = token.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return new RegExp(`\\{\\{\\s*${escaped}\\s*\\}\\}|\\{\\s*${escaped}\\s*\\}|\\[\\s*${escaped}\\s*\\]`, 'gi');
  }

  /** Formats a number without trailing noise; returns '' for missing values. */
  private num(val: any): string {
    if (val === null || val === undefined || val === '') return '';
    const n = Number(val);
    return isNaN(n) ? String(val) : n.toLocaleString('en-PK');
  }

  /** Formats any date-ish value to dd/mm/yyyy; returns '' for missing values. */
  private date(val: any): string {
    if (!val) return '';
    const d = val?.toDate ? val.toDate() : new Date(val);
    return isNaN(d.getTime()) ? String(val) : d.toLocaleDateString('en-PK');
  }

  /** Turns stored connection_type codes into readable labels. */
  private prettyConnection(val: any): string {
    if (!val) return '';
    const map: Record<string, string> = {
      internet: 'Internet',
      tv_cable: 'TV Cable',
      both: 'Internet + TV Cable',
    };
    return map[String(val).toLowerCase()] || String(val);
  }
}
