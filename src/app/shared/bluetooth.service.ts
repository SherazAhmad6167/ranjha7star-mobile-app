import { Injectable, NgZone } from '@angular/core';
import { Capacitor } from '@capacitor/core';
import { ToastrService } from 'ngx-toastr';
import { BehaviorSubject } from 'rxjs';

/*
 * Bluetooth thermal printing (ESC/POS over classic Bluetooth SPP).
 *
 * Native side: cordova-plugin-bluetooth-serial (window.bluetoothSerial) and
 * cordova-plugin-android-permissions (cordova.plugins.permissions), both run
 * by Capacitor. Everything happens inside the app: scan for nearby printers,
 * connect (Android shows its own PIN prompt when a printer needs pairing),
 * remember the printer and reconnect to it on the next print.
 *
 * Tuned for pocket 58 mm printers such as the Media Link G3 (also sold as
 * MTP-II / PT-210): 48 mm printable = 384 dots at 203 dpi = 32 characters
 * of the default 12x24 font. They have a small receive buffer and no flow
 * control, so data goes out in small chunks with a short pause between.
 */

// ─── ESC/POS ─────────────────────────────────────────────────────────────────
const ESC = 0x1b;
const GS = 0x1d;
const LF = 0x0a;

/** Characters per line on a 58 mm roll. */
const COLUMNS = 32;

const CHUNK_SIZE = 180;
const CHUNK_DELAY_MS = 25;

const CONNECT_TIMEOUT_MS = 15000;
/** A first secure connect may wait on Android's PIN prompt. */
const PAIRING_TIMEOUT_MS = 60000;
/** Classic discovery runs ~12 s; this only guards a stuck plugin. */
const DISCOVERY_TIMEOUT_MS = 30000;
const READY_TIMEOUT_MS = 4000;

const DEVICE_KEY = 'printer.device';

const PERMISSION = {
  connect: 'android.permission.BLUETOOTH_CONNECT',
  scan: 'android.permission.BLUETOOTH_SCAN',
  coarseLocation: 'android.permission.ACCESS_COARSE_LOCATION',
  fineLocation: 'android.permission.ACCESS_FINE_LOCATION',
};

export type PrinterStatus = 'idle' | 'connecting' | 'connected' | 'printing';

type LinkMethod = 'connect' | 'connectInsecure';

export interface PrinterDevice {
  name: string;
  address: string;
  /** Android Bluetooth device class (1664 = printer). */
  class?: number;
  /** Already paired in the phone's Bluetooth settings. */
  paired?: boolean;
  /** The socket type that last worked, tried first next time. */
  link?: 'secure' | 'insecure';
}

export interface PrintLine {
  text?: string;
  align?: 'left' | 'center' | 'right';
  bold?: boolean;
  /** large = 2x width + 2x height, wide = 2x width. */
  size?: 'normal' | 'large' | 'wide';
  /** A full-width rule: '-' or, with 'double', '='. */
  divider?: boolean | 'double';
  /** Label on the left, value on the right; wraps when it does not fit. */
  row?: [string, string | number | null | undefined];
  /** Blank lines to feed. */
  feed?: number;
}

export class PrinterError extends Error {
  constructor(
    message: string,
    readonly code: 'unsupported' | 'permission' | 'disabled' | 'no-printer' | 'connect' | 'write' | 'scan',
  ) {
    super(message);
  }
}

@Injectable({ providedIn: 'root' })
export class BluetoothService {
  readonly status$ = new BehaviorSubject<PrinterStatus>('idle');
  readonly isConnected$ = new BehaviorSubject<boolean>(false);
  readonly isScanning$ = new BehaviorSubject<boolean>(false);
  /** The remembered printer (also the one currently connected, if any). */
  readonly device$ = new BehaviorSubject<PrinterDevice | null>(this.readSavedDevice());

  private connectedAddress: string | null = null;
  private ready?: Promise<void>;

  constructor(
    private toastr: ToastrService,
    private zone: NgZone,
  ) {}

  // ── Capabilities ───────────────────────────────────────────────────────────

  /** Running inside the Android app (the plugin may still be loading). */
  get isAndroid(): boolean {
    return Capacitor.getPlatform() === 'android';
  }

  /** Classic Bluetooth printing needs the native Android app and its plugin. */
  get isSupported(): boolean {
    return this.isAndroid && !!this.serial;
  }

  get deviceName(): string | null {
    return this.device$.value?.name || null;
  }

  /** Characters per line (58 mm roll). */
  get columns(): number {
    return COLUMNS;
  }

  looksLikePrinter(device: PrinterDevice): boolean {
    return (
      device.class === 1664 ||
      /print|pos|mtp|mpt|rpp|xp-|pt-?\d|thermal|receipt|bt-?p|goojprt|zj-|media ?link|^g3\b|inner/i.test(
        device.name || '',
      )
    );
  }

  /**
   * Resolves once Cordova plugins are loaded. `deviceready` is sticky, so a
   * late listener still fires; the timeout covers the browser.
   */
  whenReady(): Promise<void> {
    if (!this.ready) {
      this.ready = new Promise<void>((resolve) => {
        if (!this.isAndroid || this.serial) {
          resolve();
          return;
        }
        const done = () => this.zone.run(() => resolve());
        document.addEventListener('deviceready', done, { once: true });
        setTimeout(done, READY_TIMEOUT_MS);
      });
    }
    return this.ready;
  }

  // ── Setup ──────────────────────────────────────────────────────────────────

  /**
   * Asks for Bluetooth permissions and makes sure Bluetooth is switched on.
   * `forScan` also asks for what discovering new devices needs.
   */
  async init(forScan = false): Promise<void> {
    await this.whenReady();
    this.assertSupported();

    if (!(await this.requestPermissions(forScan))) {
      throw new PrinterError(
        forScan
          ? 'Allow "Nearby devices" and location for this app to find printers.'
          : 'Allow "Nearby devices" for this app to use the printer.',
        'permission',
      );
    }

    if (!(await this.call<boolean>('isEnabled', [], true))) {
      await this.call('enable').catch(() => undefined);
      if (!(await this.call<boolean>('isEnabled', [], true))) {
        throw new PrinterError('Bluetooth is turned off. Turn it on to use the printer.', 'disabled');
      }
    }
  }

  /** Devices already paired with the phone, printers first. */
  async listPaired(): Promise<PrinterDevice[]> {
    await this.init();
    const devices = ((await this.call<any[]>('list')) || []).map((d) => this.toDevice(d, true));
    return this.sortDevices(devices);
  }

  /**
   * Scans for nearby Bluetooth devices (about 12 seconds). `onFound` gets each
   * named device as soon as it shows up; the promise resolves with them all.
   */
  async discover(onFound?: (device: PrinterDevice) => void): Promise<PrinterDevice[]> {
    if (this.isScanning$.value) return [];
    await this.init(true);

    this.isScanning$.next(true);
    const seen = new Map<string, PrinterDevice>();
    const add = (raw: any) => {
      const device = this.toDevice(raw, false);
      // Nameless entries are phones, watches and beacons, not printers.
      if (!device.address || !raw?.name || seen.has(device.address)) return;
      seen.set(device.address, device);
      onFound?.(device);
    };

    try {
      this.serial.setDeviceDiscoveredListener((raw: any) => this.zone.run(() => add(raw)));

      const all = await Promise.race([
        this.call<any[]>('discoverUnpaired'),
        new Promise<any[]>((resolve) => setTimeout(() => resolve([]), DISCOVERY_TIMEOUT_MS)),
      ]);
      (all || []).forEach(add);
      return this.sortDevices([...seen.values()]);
    } catch (err) {
      throw new PrinterError(this.errText(err) || 'Could not scan for printers.', 'scan');
    } finally {
      this.serial.clearDeviceDiscoveredListener?.();
      this.isScanning$.next(false);
    }
  }

  /** Fallback: Android's Bluetooth settings. */
  openBluetoothSettings() {
    if (!this.isSupported) return;
    this.call('showBluetoothSettings').catch(() => undefined);
  }

  // ── Connection ─────────────────────────────────────────────────────────────

  async connect(device: PrinterDevice): Promise<void> {
    await this.init();
    this.setStatus('connecting');

    // Only one SPP link at a time.
    await this.call('disconnect').catch(() => undefined);
    this.connectedAddress = null;

    /*
     * Order matters for budget printers:
     * - known device: the socket type that worked last time;
     * - paired: secure first, insecure as fallback;
     * - new (unpaired): insecure first, which many printers accept without
     *   pairing; secure next, which makes Android show its PIN prompt.
     */
    const order: LinkMethod[] =
      device.link === 'insecure' || (!device.link && !device.paired)
        ? ['connectInsecure', 'connect']
        : ['connect', 'connectInsecure'];

    let used: LinkMethod | null = null;
    let lastError: unknown = null;

    for (const method of order) {
      try {
        const pairing = method === 'connect' && !device.paired && device.link !== 'secure';
        await this.openLink(method, device, pairing ? PAIRING_TIMEOUT_MS : CONNECT_TIMEOUT_MS);
        used = method;
        break;
      } catch (err) {
        lastError = err;
        await this.call('disconnect').catch(() => undefined);
      }
    }

    if (!used) {
      this.markDisconnected();
      throw lastError instanceof PrinterError
        ? lastError
        : new PrinterError(`Could not connect to ${device.name}.`, 'connect');
    }

    this.connectedAddress = device.address;
    this.saveDevice({
      name: device.name,
      address: device.address,
      // A secure link means the phone and printer are paired now.
      paired: device.paired || used === 'connect',
      link: used === 'connect' ? 'secure' : 'insecure',
    });
    this.setStatus('connected');
  }

  /** Disconnects; `forget` also clears the remembered printer. */
  async disconnect(forget = false): Promise<void> {
    if (this.isSupported) await this.call('disconnect').catch(() => undefined);
    this.markDisconnected();
    if (forget) this.saveDevice(null);
  }

  async checkConnection(): Promise<boolean> {
    await this.whenReady();
    if (!this.isSupported) return false;
    const connected = await this.call<boolean>('isConnected', [], true);
    if (connected) {
      if (this.status$.value === 'idle') this.setStatus('connected');
    } else if (this.status$.value !== 'connecting') {
      this.markDisconnected();
    }
    return connected;
  }

  /** Connected already, or reconnects to the remembered printer. */
  async ensureConnected(): Promise<void> {
    await this.whenReady();
    this.assertSupported();
    if (await this.checkConnection()) return;

    const device = this.device$.value;
    if (!device) {
      throw new PrinterError('No printer connected. Tap the printer icon at the top to connect one.', 'no-printer');
    }
    await this.connect(device);
  }

  private openLink(method: LinkMethod, device: PrinterDevice, timeoutMs: number): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      let settled = false;
      const timer = setTimeout(() => {
        if (settled) return;
        settled = true;
        reject(new PrinterError(`Could not reach ${device.name}. Is it on and nearby?`, 'connect'));
      }, timeoutMs);

      this.serial[method](
        device.address,
        () =>
          this.zone.run(() => {
            if (settled) return;
            settled = true;
            clearTimeout(timer);
            resolve();
          }),
        (err: any) =>
          this.zone.run(() => {
            if (!settled) {
              settled = true;
              clearTimeout(timer);
              reject(new PrinterError(`Could not connect to ${device.name}. ${this.errText(err)}`.trim(), 'connect'));
              return;
            }
            // The same callback fires later when an open link drops.
            if (this.connectedAddress === device.address) this.markDisconnected();
          }),
      );
    });
  }

  // ── Printing ───────────────────────────────────────────────────────────────

  /**
   * Prints receipt lines and reports the outcome with a toast.
   * Resolves true when the data reached the printer.
   */
  async printLines(lines: PrintLine[]): Promise<boolean> {
    if (this.status$.value === 'printing' || this.status$.value === 'connecting') return false;

    let printing = false;
    try {
      await this.ensureConnected();
      this.setStatus('printing');
      printing = true;
      await this.write(this.buildReceipt(lines));
      this.toastr.success(`Sent to ${this.deviceName || 'printer'}`);
      return true;
    } catch (err) {
      this.reportError(err);
      return false;
    } finally {
      // Back to "connected" unless the link dropped while printing.
      if (printing && this.isConnected$.value) this.setStatus('connected');
    }
  }

  testPrint(): Promise<boolean> {
    const now = new Date();
    return this.printLines([
      { text: 'Ranjha7star', align: 'center', size: 'large', bold: true },
      { text: 'Printer test', align: 'center' },
      { divider: true },
      { row: ['Printer', this.deviceName || '-'] },
      { row: ['Paper', '58 mm roll'] },
      { row: ['Date', now.toLocaleDateString('en-GB')] },
      { row: ['Time', now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })] },
      { divider: true },
      // Should print on exactly one line.
      { text: 'Width check', bold: true },
      { text: '1234567890'.repeat(4).slice(0, COLUMNS) },
      { divider: true },
      { text: 'Normal text' },
      { text: 'Bold text', bold: true },
      { text: 'Wide text', size: 'wide' },
      { text: 'Big', size: 'large', bold: true },
      { text: 'Right aligned', align: 'right' },
      { divider: 'double' },
      { text: 'Printer is ready', align: 'center', bold: true },
    ]);
  }

  /** Writes raw bytes in small, paced chunks. */
  async write(data: Uint8Array | string): Promise<void> {
    const bytes = typeof data === 'string' ? this.encode(data) : data;
    try {
      for (let i = 0; i < bytes.length; i += CHUNK_SIZE) {
        if (i) await new Promise((resolve) => setTimeout(resolve, CHUNK_DELAY_MS));
        // slice(), not subarray(): the plugin sends the view's whole buffer.
        await this.call('write', [bytes.slice(i, i + CHUNK_SIZE)]);
      }
    } catch (err) {
      await this.checkConnection();
      throw new PrinterError(`Printing failed. ${this.errText(err)}`.trim(), 'write');
    }
  }

  /** Shows a toast for a failed print / connect / scan. */
  reportError(err: unknown) {
    const code = err instanceof PrinterError ? err.code : null;
    const message = err instanceof Error ? err.message : this.errText(err) || 'Printer error';

    if (code === 'unsupported') this.toastr.info(message);
    else if (code === 'no-printer' || code === 'disabled' || code === 'permission') this.toastr.warning(message);
    else this.toastr.error(message);
  }

  // ── ESC/POS builder ────────────────────────────────────────────────────────

  buildReceipt(lines: PrintLine[]): Uint8Array {
    const cols = COLUMNS;
    // ESC @ - initialise, ESC 2 - default line spacing.
    const out: number[] = [ESC, 0x40, ESC, 0x32];

    const align = (a: PrintLine['align']) => out.push(ESC, 0x61, a === 'center' ? 1 : a === 'right' ? 2 : 0);
    const text = (s: string) => {
      for (const ch of this.sanitize(s)) out.push(ch.charCodeAt(0));
      out.push(LF);
    };
    /**
     * Bold + size. Budget printers differ in which command they honour, so
     * the same state is set through ESC ! (print mode), GS ! (size) and
     * ESC E (bold); on printers that support all three they agree.
     */
    const mode = (bold = false, size: PrintLine['size'] = 'normal') => {
      const double = size === 'large' ? 0x30 : size === 'wide' ? 0x20 : 0x00;
      const gsSize = size === 'large' ? 0x11 : size === 'wide' ? 0x10 : 0x00;
      out.push(ESC, 0x21, double | (bold ? 0x08 : 0), GS, 0x21, gsSize, ESC, 0x45, bold ? 1 : 0);
    };

    for (const line of lines) {
      if (line.feed) {
        out.push(ESC, 0x64, Math.min(line.feed, 10)); // ESC d n - feed n lines
        continue;
      }

      if (line.divider) {
        mode();
        align('left');
        text((line.divider === 'double' ? '=' : '-').repeat(cols));
        continue;
      }

      if (line.row) {
        mode(line.bold);
        align('left');
        for (const l of this.formatRow(line.row[0], line.row[1], cols)) text(l);
        mode();
        continue;
      }

      const size = line.size || 'normal';
      mode(line.bold, size);
      align(line.align);
      // Double-width characters take two columns each.
      const width = size === 'normal' ? cols : Math.floor(cols / 2);
      for (const l of this.wrap(line.text ?? '', width)) text(l);
      mode();
    }

    // Feed the last line past the tear bar.
    out.push(ESC, 0x61, 0, ESC, 0x64, 3);
    return new Uint8Array(out);
  }

  /** "Label ....... value" padded to the line width (kept for older callers). */
  row(label: string, value: string, width: number = COLUMNS): string {
    return this.formatRow(label, value, width).join('\n');
  }

  private formatRow(label: string, value: unknown, cols: number): string[] {
    const l = this.sanitize(String(label ?? '')).trim();
    const v = this.sanitize(value === null || value === undefined || value === '' ? '-' : String(value)).trim();

    if (l.length + v.length + 1 <= cols) {
      return [l + ' '.repeat(cols - l.length - v.length) + v];
    }

    // Too long: label on its own line, the value right-aligned underneath.
    return [
      ...this.wrap(l, cols),
      ...this.wrap(v, cols).map((part) => ' '.repeat(Math.max(0, cols - part.length)) + part),
    ];
  }

  private wrap(input: string, width: number): string[] {
    const lines: string[] = [];
    for (const paragraph of this.sanitize(input).split('\n')) {
      let current = '';
      for (const word of paragraph.split(' ')) {
        let w = word;
        while (w.length > width) {
          if (current) {
            lines.push(current);
            current = '';
          }
          lines.push(w.slice(0, width));
          w = w.slice(width);
        }
        if (!current) current = w;
        else if (current.length + 1 + w.length <= width) current += ' ' + w;
        else {
          lines.push(current);
          current = w;
        }
      }
      lines.push(current);
    }
    return lines;
  }

  /** Thermal fonts are ASCII: map common symbols, drop the rest. */
  private sanitize(input: string): string {
    return String(input ?? '')
      .replace(/[–—−]/g, '-')
      .replace(/[‘’]/g, "'")
      .replace(/[“”]/g, '"')
      .replace(/…/g, '...')
      .replace(/[•·]/g, '*')
      .replace(/×/g, 'x')
      .replace(/[✓✔]/g, '')
      .replace(/ /g, ' ')
      .replace(/\t/g, ' ')
      .replace(/[^\x20-\x7E\n]/g, '?');
  }

  private encode(input: string): Uint8Array {
    const s = this.sanitize(input);
    const bytes = new Uint8Array(s.length);
    for (let i = 0; i < s.length; i++) bytes[i] = s.charCodeAt(i);
    return bytes;
  }

  // ── Plumbing ───────────────────────────────────────────────────────────────

  private get serial(): any {
    return (window as any).bluetoothSerial;
  }

  private assertSupported() {
    if (!this.isSupported) {
      throw new PrinterError('Bluetooth printing works in the Android app.', 'unsupported');
    }
  }

  /**
   * Promise wrapper for a plugin method. With `asBoolean`, success resolves
   * true and failure resolves false (isEnabled / isConnected report "no"
   * through the error callback).
   */
  private call<T = any>(method: string, args: any[] = [], asBoolean = false): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      this.serial[method](
        ...args,
        (result: any) => this.zone.run(() => resolve((asBoolean ? true : result) as T)),
        (err: any) => this.zone.run(() => (asBoolean ? resolve(false as T) : reject(err))),
      );
    });
  }

  private androidMajor(): number {
    return Number(/Android (\d+)/.exec(navigator.userAgent)?.[1] || 0);
  }

  /**
   * Runtime permissions:
   * - Android 12+: "Nearby devices" (BLUETOOTH_CONNECT, plus BLUETOOTH_SCAN to
   *   scan). The plugin also insists on coarse location before it scans.
   * - Android 6-11: Bluetooth is granted at install; scanning needs location.
   */
  private async requestPermissions(forScan: boolean): Promise<boolean> {
    const permissions = (window as any).cordova?.plugins?.permissions;
    if (!permissions) return true;

    const modern = this.androidMajor() === 0 || this.androidMajor() >= 12;
    const required = modern
      ? [PERMISSION.connect, ...(forScan ? [PERMISSION.scan, PERMISSION.coarseLocation] : [])]
      : forScan
        ? [PERMISSION.fineLocation]
        : [];
    if (!required.length) return true;

    const has = (name: string) =>
      new Promise<boolean>((resolve) =>
        permissions.checkPermission(
          name,
          (s: any) => resolve(!!s?.hasPermission),
          () => resolve(false),
        ),
      );

    const missing: string[] = [];
    for (const name of required) {
      if (!(await has(name))) missing.push(name);
    }
    if (!missing.length) return true;

    await new Promise<void>((resolve) =>
      permissions.requestPermissions(missing, () => resolve(), () => resolve()),
    );

    for (const name of missing) {
      if (!(await has(name))) return this.zone.run(() => false);
    }
    return this.zone.run(() => true);
  }

  private toDevice(raw: any, paired: boolean): PrinterDevice {
    const address = raw?.address || raw?.id || '';
    const saved = this.device$?.value ?? null;
    return {
      name: raw?.name || address || 'Unknown device',
      address,
      class: raw?.class,
      paired,
      // Reuse the socket type that worked last time for this printer.
      link: saved && saved.address === address ? saved.link : undefined,
    };
  }

  private sortDevices(devices: PrinterDevice[]): PrinterDevice[] {
    return devices.sort(
      (a, b) =>
        Number(this.looksLikePrinter(b)) - Number(this.looksLikePrinter(a)) || a.name.localeCompare(b.name),
    );
  }

  private markDisconnected() {
    this.connectedAddress = null;
    this.setStatus('idle');
  }

  private setStatus(status: PrinterStatus) {
    this.status$.next(status);
    this.isConnected$.next(status === 'connected' || status === 'printing');
  }

  private readSavedDevice(): PrinterDevice | null {
    try {
      const saved = JSON.parse(localStorage.getItem(DEVICE_KEY) || 'null');
      return saved?.address ? saved : null;
    } catch {
      return null;
    }
  }

  private saveDevice(device: PrinterDevice | null) {
    if (device) localStorage.setItem(DEVICE_KEY, JSON.stringify(device));
    else localStorage.removeItem(DEVICE_KEY);
    this.device$.next(device);
  }

  private errText(err: unknown): string {
    if (!err) return '';
    if (typeof err === 'string') return err;
    return (err as any).message || '';
  }
}
