/*
 * Unpaid balances roll forward. When a month's bill is created, the bill
 * creator adds the previous bill's balance to it and marks that previous bill
 * as carried into the new one:
 *
 *   carried_to                         bill_id of the bill now holding the balance
 *   carried_to_month / carried_to_year shown in the billing history
 *   carried_amount                     the balance that was moved forward
 *
 * A carried balance is collected on the newer bill only. Once that bill is
 * paid in full, every bill carried into it is closed as well (`settled_with`).
 */

const MONTHS = [
  'january', 'february', 'march', 'april', 'may', 'june',
  'july', 'august', 'september', 'october', 'november', 'december',
];

/** The bill's balance now lives on a later bill. */
export function isCarried(bill: any): boolean {
  return !!bill?.carried_to;
}

/** "November 2026" - the bill a carried balance was moved to. */
export function carriedToLabel(bill: any): string {
  const month = String(bill?.carried_to_month || '');
  return `${month.charAt(0).toUpperCase()}${month.slice(1)} ${bill?.carried_to_year || ''}`.trim();
}

/** Records that `amount` of `prev`'s balance was added to `next`. */
export function markCarried(prev: any, next: any, amount: number): void {
  prev.carried_to = next.bill_id;
  prev.carried_to_month = next.month;
  prev.carried_to_year = next.year;
  prev.carried_amount = amount;
}

/**
 * Call once the bill `billId` is paid in full: closes the bills carried into
 * it, and the ones carried into those.
 */
export function settleCarried(bills: any[], billId: string): void {
  if (!billId) return;

  for (const prev of bills) {
    if (prev?.carried_to !== billId || prev.settled_with) continue;

    prev.settled_with = billId;
    prev.status = 'paid';
    prev.remaining_amount = 0;
    settleCarried(bills, prev.bill_id);
  }
}

/** Undoes settleCarried when the payment on `billId` is reverted. */
export function unsettleCarried(bills: any[], billId: string): void {
  if (!billId) return;

  for (const prev of bills) {
    if (prev?.settled_with === billId) reopen(bills, prev);
  }
}

/**
 * Gives bills carried into any of `billIds` their own balance back - for when
 * those bills are deleted or their carried balance is taken off.
 */
export function releaseCarried(bills: any[], billIds: Set<string>): void {
  for (const prev of bills) {
    if (!prev?.carried_to || !billIds.has(prev.carried_to)) continue;

    if (prev.settled_with) reopen(bills, prev);
    delete prev.carried_to;
    delete prev.carried_to_month;
    delete prev.carried_to_year;
    delete prev.carried_amount;
  }
}

function reopen(bills: any[], prev: any): void {
  delete prev.settled_with;
  prev.remaining_amount = Number(prev.carried_amount) || 0;
  // Part-paid before it was carried, so it keeps its collection
  prev.status = Number(prev.collected_amount) > 0 ? 'paid' : 'unpaid';
  unsettleCarried(bills, prev.bill_id);
}

/** Balance the bill creator would add to the next bill (0 when nothing is owed). */
function carryableBalance(bill: any): number {
  if (isCarried(bill)) return 0;
  const owed =
    bill?.status === 'unpaid' ||
    (bill?.status === 'paid' && Number(bill?.remaining_amount) > 0);
  return owed ? Number(bill.remaining_amount ?? bill.amount ?? 0) : 0;
}

function period(bill: any): number {
  const month = MONTHS.indexOf(String(bill?.month || '').toLowerCase());
  return Number(bill?.year || 0) * 12 + Math.max(month, 0);
}

/**
 * For bills created before carrying was tracked: links an owed bill to the
 * next bill of its type when that bill's amount is exactly the monthly fee
 * plus this balance - the bill creator already added it there. Anything else
 * is left alone and counted as unmatched, to be checked by hand.
 *
 * `fees` is the user's current fee per bill type ('cable', 'internet').
 * `onlyInto` limits it to balances included in those bills (by bill_id).
 */
export function linkUntrackedCarries(
  bills: any[],
  fees: Record<string, number>,
  onlyInto?: Set<string>,
): { linked: number; unmatched: string[] } {
  let linked = 0;
  const unmatched: string[] = [];

  for (const type of Object.keys(fees)) {
    const fee = Number(fees[type]) || 0;
    const ofType = bills
      .filter((b: any) => b?.type === type && b.bill_id)
      .sort((a: any, b: any) => period(a) - period(b));

    for (let i = 0; i < ofType.length - 1; i++) {
      const prev = ofType[i];
      const next = ofType[i + 1];
      if (onlyInto && !onlyInto.has(next.bill_id)) continue;

      const balance = carryableBalance(prev);
      if (balance <= 0) continue;

      const included =
        Number(next.amount) === fee + balance ||
        Number(next.previous_remaining) === balance;

      if (!included) {
        unmatched.push(`${prev.month} ${prev.year}`);
        continue;
      }

      markCarried(prev, next, balance);
      linked++;

      const nextOwed =
        next.status === 'unpaid' || Number(next.remaining_amount) > 0;

      if (!nextOwed) {
        settleCarried(bills, next.bill_id);
      } else if (!next.previous_remaining) {
        // Lets the receipt and the Update form show the carried balance
        next.previous_remaining = balance;
        next.previous_remaining_month = prev.month;
      }
    }
  }

  return { linked, unmatched };
}
