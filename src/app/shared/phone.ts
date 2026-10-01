/**
 * A customer's phone as WhatsApp's international digits (923001234567), or
 * '' when there are none.
 *
 * Accepts '+92 300-1234567', '0300 1234567', '3001234567', '0092...' and
 * dirty imported text such as "03187685280 - 0". Stripping non-digits used to
 * glue that trailing 0 onto the number (9231876852800), which WhatsApp
 * rejects as "not a valid phone number"; only the number itself is kept now.
 */
export function toWhatsappNumber(value: unknown): string {
  let digits = String(value ?? '').replace(/\D/g, '');
  if (digits.startsWith('0092')) digits = digits.slice(2);

  if (digits.startsWith('03') && digits.length >= 11) return '92' + digits.slice(1, 11);
  if (digits.startsWith('92') && digits.length >= 12) return digits.slice(0, 12);
  if (digits.startsWith('3') && digits.length >= 10) return '92' + digits.slice(0, 10);

  // Anything else (foreign / too short) is passed on as typed, like before.
  return digits;
}
