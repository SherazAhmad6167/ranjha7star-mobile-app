/**
 * Which WhatsApp app customer messages go out from, picked from the top-bar
 * avatar. Stored per phone: it depends on which apps that phone has.
 */
export type WhatsappApp = 'whatsapp' | 'business';

const STORAGE_KEY = 'whatsappApp';

/** null until the user picks one - Android then decides (asks once if both are installed). */
export function getWhatsappApp(): WhatsappApp | null {
  try {
    const value = localStorage.getItem(STORAGE_KEY);
    return value === 'whatsapp' || value === 'business' ? value : null;
  } catch {
    return null;
  }
}

export function setWhatsappApp(app: WhatsappApp) {
  try {
    localStorage.setItem(STORAGE_KEY, app);
  } catch {}
}
