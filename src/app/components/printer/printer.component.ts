import { CommonModule } from '@angular/common';
import { Component, OnDestroy, OnInit } from '@angular/core';
import { IonRippleEffect, IonSkeletonText, IonSpinner } from '@ionic/angular';
import { Subscription } from 'rxjs';
import {
  BluetoothService,
  PrinterDevice,
  PrinterStatus,
} from '../../shared/bluetooth.service';

@Component({
  selector: 'app-printer',
  imports: [CommonModule, IonRippleEffect, IonSkeletonText, IonSpinner],
  templateUrl: './printer.component.html',
  styleUrl: './printer.component.scss',
})
export class PrinterComponent implements OnInit, OnDestroy {
  /** Plugins loaded (or known to be unavailable). */
  ready = false;

  paired: PrinterDevice[] = [];
  nearby: PrinterDevice[] = [];
  isLoadingPaired = false;
  isScanning = false;
  hasScanned = false;
  error = '';

  /** Address of the device a connect was started for. */
  pendingAddress: string | null = null;
  /** Connecting to a new printer: Android may show its PIN prompt. */
  pairingHint = false;
  status: PrinterStatus = 'idle';
  savedDevice: PrinterDevice | null = null;

  readonly skeletonRows = [0, 1];

  private subs = new Subscription();

  constructor(public printer: BluetoothService) {}

  async ngOnInit() {
    this.subs.add(this.printer.status$.subscribe((s) => (this.status = s)));
    this.subs.add(this.printer.device$.subscribe((d) => (this.savedDevice = d)));
    this.subs.add(this.printer.isScanning$.subscribe((s) => (this.isScanning = s)));

    await this.printer.whenReady();
    this.ready = true;
    if (!this.printer.isSupported) return;

    this.printer.checkConnection();
    await this.loadPaired();

    // First visit: go straight to looking for the printer.
    if (!this.savedDevice && !this.error) this.scan();
  }

  ngOnDestroy() {
    this.subs.unsubscribe();
  }

  get isConnected(): boolean {
    return this.status === 'connected' || this.status === 'printing';
  }

  get isBusy(): boolean {
    return this.status === 'connecting' || this.status === 'printing';
  }

  /** Android 11 and older only find devices while Location is on. */
  get needsLocationHint(): boolean {
    const major = Number(/Android (\d+)/.exec(navigator.userAgent)?.[1] || 0);
    return major > 0 && major < 12;
  }

  isCurrent(device: PrinterDevice): boolean {
    return this.isConnected && this.savedDevice?.address === device.address;
  }

  async loadPaired() {
    this.isLoadingPaired = true;
    this.error = '';
    try {
      this.paired = await this.printer.listPaired();
    } catch (err) {
      this.paired = [];
      this.error = this.message(err, 'Could not read Bluetooth devices.');
    } finally {
      this.isLoadingPaired = false;
    }
  }

  async scan() {
    if (this.isScanning || this.isBusy) return;
    this.error = '';
    this.nearby = [];

    const pairedAddresses = new Set(this.paired.map((d) => d.address));
    try {
      await this.printer.discover((device) => {
        // Paired devices are already listed above.
        if (pairedAddresses.has(device.address)) return;
        this.nearby = [...this.nearby, device].sort(
          (a, b) => Number(this.printer.looksLikePrinter(b)) - Number(this.printer.looksLikePrinter(a)),
        );
      });
    } catch (err) {
      this.error = this.message(err, 'Could not scan for printers.');
    } finally {
      this.hasScanned = true;
    }
  }

  async connect(device: PrinterDevice) {
    if (this.isBusy || this.isScanning) return;
    this.pendingAddress = device.address;
    this.pairingHint = !device.paired;

    try {
      await this.printer.connect(device);
      // A newly paired printer moves from "nearby" to "paired".
      if (!device.paired) {
        this.nearby = this.nearby.filter((d) => d.address !== device.address);
        this.loadPaired();
      }
    } catch (err) {
      this.printer.reportError(err);
    } finally {
      this.pendingAddress = null;
      this.pairingHint = false;
    }
  }

  async reconnect() {
    if (this.savedDevice) await this.connect(this.savedDevice);
  }

  disconnect() {
    this.printer.disconnect();
  }

  forget() {
    this.printer.disconnect(true);
  }

  testPrint() {
    this.printer.testPrint();
  }

  openSettings() {
    this.printer.openBluetoothSettings();
  }

  trackByAddress(_: number, device: PrinterDevice) {
    return device.address;
  }

  private message(err: unknown, fallback: string): string {
    return err instanceof Error && err.message ? err.message : fallback;
  }
}
