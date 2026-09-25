import {
  Component, OnInit, OnDestroy,
  ViewChild, ElementRef, NgZone
} from '@angular/core';
import { CommonModule } from '@angular/common';
import {
  FormBuilder, FormGroup, Validators,
  ReactiveFormsModule, FormsModule
} from '@angular/forms';
import {
  Firestore, collection, doc, setDoc, updateDoc,
  getDocs, query, where
} from '@angular/fire/firestore';
import { ToastrService } from 'ngx-toastr';
import { NgbActiveModal } from '@ng-bootstrap/ng-bootstrap';

@Component({
  selector: 'app-router-modal',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, FormsModule],
  templateUrl: './router-modal.component.html',
  styleUrl: './router-modal.component.scss'
})
export class RouterModalComponent implements OnInit, OnDestroy {
  @ViewChild('videoEl') videoEl!: ElementRef<HTMLVideoElement>;

  editMode       = false;
  routerData: any = null;
  operators: { id: string; operator_name: string }[] = [];
  prefillBarcode = '';

  routerForm!: FormGroup;
  isSubmitting    = false;
  isDuplicateBarcode = false;

  cameraActive  = false;
  stream: MediaStream | null = null;

  private nativeInterval: any = null;
  private zxingControls: { stop: () => void } | null = null;
  private scanLoopId: any = null;

  // Region of interest, as a fraction of the source frame. Deliberately larger
  // than the on-screen green frame so anything the user aims at is included.
  private readonly ROI_W = 0.8;
  private readonly ROI_H = 0.5;

  // Cap on the width actually handed to the decoder. Decoding is synchronous and
  // scales with pixel count, so this bounds how long the main thread is blocked.
  // Raise it (e.g. 960) if small or dense labels fail to scan.
  private readonly MAX_SCAN_WIDTH = 640;

  // Consensus guard: the same value must decode N times in a row before we
  // accept it. Single-frame decodes are the main source of false positives.
  private lastCandidate = '';
  private candidateHits = 0;
  private readonly REQUIRED_HITS = 2;

  useNativeDetector = false;

  constructor(
    private fb: FormBuilder,
    private firestore: Firestore,
    private toastr: ToastrService,
    public activeModal: NgbActiveModal,
    private zone: NgZone
  ) {}

  ngOnInit() {
    this.useNativeDetector = 'BarcodeDetector' in window;
    this.initForm();
    if (this.editMode && this.routerData) {
      this.routerForm.patchValue({
        date:     this.routerData.date,
        status:   this.routerData.status   || 'Available',
        quantity: this.routerData.quantity || 1,
        barcode:  this.routerData.barcode,
        operator: this.routerData.operator,
        givenBy:  this.routerData.givenBy,
        notes:    this.routerData.notes    || ''
      });
    } else if (this.prefillBarcode) {
      this.routerForm.get('barcode')?.setValue(this.prefillBarcode);
    }
  }

  ngOnDestroy() {
    this.stopCamera();
  }

  initForm() {
    const today = new Date().toISOString().split('T')[0];
    this.routerForm = this.fb.group({
      date:     [today, Validators.required],
      status:   ['Available', Validators.required],
      quantity: [{value: 1, disabled: true}, [Validators.required, Validators.min(1)]],
      barcode:  ['',    Validators.required],
      operator: ['',    Validators.required],
      givenBy:  ['',    Validators.required],
      notes:    ['']
    });
  }

  // ── Camera ─────────────────────────────────────────────────────────────────

  async openCamera() {
    try {
      this.stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: { ideal: 'environment' },
          width:  { ideal: 1280 },
          height: { ideal: 720 }
        }
      });
      this.cameraActive = true;

      setTimeout(async () => {
        const video = this.videoEl?.nativeElement;
        if (!video) return;
        video.srcObject = this.stream;
        await video.play();

        if (this.useNativeDetector) {
          this.startNativeDetection(video);
        } else {
          this.startZXingDetection(video);
        }
      }, 200);

    } catch (err: any) {
      const msg = err.name === 'NotAllowedError'
        ? 'Camera access denied. Allow camera permission in your browser settings.'
        : 'Camera is not available on this device.';
      this.toastr.error(msg);
    }
  }

  // Native BarcodeDetector. Retail formats (EAN/UPC) are deliberately excluded —
  // router labels never use them and they are a common false-positive source.
  private startNativeDetection(video: HTMLVideoElement) {
    const BarcodeDetector = (window as any).BarcodeDetector;
    const detector = new BarcodeDetector({
      formats: ['code_128', 'code_39', 'qr_code', 'data_matrix']
    });
    this.zone.runOutsideAngular(() => {
      this.nativeInterval = setInterval(async () => {
        if (video.readyState < 2) return;
        try {
          const results = await detector.detect(video);
          if (results.length > 0) {
            const text = results[0].rawValue;
            this.zone.run(() => this.handleCandidate(text));
          }
        } catch {}
      }, 100);
    });
  }

  // ZXing fallback (Windows Chrome, Firefox, Safari) — pure JS, so cost scales
  // directly with pixels scanned. decodeFromVideoElement() binarises the WHOLE
  // frame (1280x720 ≈ 922k px) every attempt, which is what made desktop slow.
  // Instead we run our own loop over a cropped centre region.
  private async startZXingDetection(video: HTMLVideoElement) {
    try {
      const [{ BrowserMultiFormatReader }, { DecodeHintType, BarcodeFormat }] = await Promise.all([
        import('@zxing/browser') as any,
        import('@zxing/library') as any
      ]);

      const hints = new Map();
      // CODE_128 is what we generate; CODE_39 / QR / DataMatrix cover printed
      // router labels. No EAN/UPC — those misread partial 1D scans as valid codes.
      hints.set(DecodeHintType.POSSIBLE_FORMATS, [
        BarcodeFormat.CODE_128,
        BarcodeFormat.CODE_39,
        BarcodeFormat.QR_CODE,
        BarcodeFormat.DATA_MATRIX,
      ]);
      // TRY_HARDER is intentionally NOT set: it attempts rotated/inverted decodes,
      // which costs CPU per frame and raises the misread rate.
      const reader = new BrowserMultiFormatReader(hints);

      const canvas = document.createElement('canvas');
      // willReadFrequently keeps the canvas in CPU memory; without it Chrome
      // backs it on the GPU and every getImageData() stalls on readback.
      const ctx = canvas.getContext('2d', { willReadFrequently: true });
      if (!ctx) return;

      const scan = () => {
        if (!this.cameraActive) return;

        const vw = video.videoWidth;
        const vh = video.videoHeight;

        // Pace the next attempt off how long this one blocked the main thread.
        let elapsed = 0;

        if (vw && vh && video.readyState >= 2) {
          const started = performance.now();

          // Crop the centre region, then scale it down to MAX_SCAN_WIDTH.
          const cw = Math.round(vw * this.ROI_W);
          const ch = Math.round(vh * this.ROI_H);
          const sx = Math.round((vw - cw) / 2);
          const sy = Math.round((vh - ch) / 2);

          const scale = Math.min(1, this.MAX_SCAN_WIDTH / cw);
          const dw    = Math.round(cw * scale);
          const dh    = Math.round(ch * scale);

          if (canvas.width !== dw || canvas.height !== dh) {
            canvas.width  = dw;
            canvas.height = dh;
          }
          ctx.drawImage(video, sx, sy, cw, ch, 0, 0, dw, dh);

          try {
            const result = reader.decodeFromCanvas(canvas);
            if (result) {
              const text = result.getText();
              this.zone.run(() => this.handleCandidate(text));
            }
          } catch {
            // NotFoundException on every frame without a barcode — expected.
          }

          elapsed = performance.now() - started;
        }

        // Idle for at least as long as the decode took, so the main thread stays
        // ~50% free. Without this the loop saturates it: the browser hangs and
        // Chrome logs a "setTimeout handler took Nms" violation every tick.
        const delay = Math.min(400, Math.max(30, Math.round(elapsed)));
        this.scanLoopId = setTimeout(scan, delay);
      };

      // Outside Angular: otherwise every loop tick triggers change detection.
      this.zone.runOutsideAngular(() => scan());

    } catch (e) {
      console.warn('ZXing scan error:', e);
    }
  }

  /** Accept a value only after it decodes identically REQUIRED_HITS times. */
  private handleCandidate(raw: string) {
    const value = (raw ?? '').trim();
    if (!value) return;

    if (value === this.lastCandidate) {
      this.candidateHits++;
    } else {
      this.lastCandidate = value;
      this.candidateHits = 1;
    }

    if (this.candidateHits >= this.REQUIRED_HITS) {
      this.onDetected(value);
    }
  }

  private async onDetected(value: string) {
    this.stopCamera();

    const isDup = await this.checkDuplicate(value);
    if (isDup) return; // error already shown, don't fill field

    this.routerForm.get('barcode')?.setValue(value);
    this.toastr.success(`Barcode scanned: ${value}`);
  }

  stopCamera() {
    // cameraActive = false also breaks the ZXing scan loop on its next tick.
    this.cameraActive = false;
    if (this.scanLoopId)     { clearTimeout(this.scanLoopId);  this.scanLoopId = null; }
    if (this.nativeInterval) { clearInterval(this.nativeInterval); this.nativeInterval = null; }
    if (this.zxingControls)  { try { this.zxingControls.stop(); } catch {} this.zxingControls = null; }
    if (this.stream)         { this.stream.getTracks().forEach(t => t.stop()); this.stream = null; }
    this.cameraActive  = false;
    this.lastCandidate = '';
    this.candidateHits = 0;
  }

  // ── Duplicate Check ─────────────────────────────────────────────────────────

  async onBarcodeBlur() {
    const value = this.routerForm.get('barcode')?.value?.trim();
    if (value) await this.checkDuplicate(value);
  }

  private async checkDuplicate(barcode: string): Promise<boolean> {
    try {
      const snap = await getDocs(
        query(collection(this.firestore, 'router'), where('barcode', '==', barcode))
      );
      if (snap.empty) {
        this.isDuplicateBarcode = false;
        return false;
      }

      const match     = snap.docs[0];
      const matchData = match.data() as any;

      // Allow same record in edit mode
      if (this.editMode && this.routerData?.id === match.id) {
        this.isDuplicateBarcode = false;
        return false;
      }

      this.isDuplicateBarcode = true;
      const detail = [
        matchData.date     ? `Date: ${matchData.date}`         : '',
        matchData.operator ? `Operator: ${matchData.operator}` : '',
        matchData.givenBy  ? `Given by: ${matchData.givenBy}`  : '',
      ].filter(Boolean).join('  |  ');

      this.toastr.error(detail, 'Duplicate Barcode — Already Assigned!', {
        timeOut:        7000,
        extendedTimeOut: 2000,
        closeButton:    true,
      });
      return true;
    } catch {
      this.isDuplicateBarcode = false;
      return false;
    }
  }

  // ── Submit ──────────────────────────────────────────────────────────────────

  async onSubmit() {
    if (this.routerForm.invalid) {
      this.routerForm.markAllAsTouched();
      this.toastr.error('Please fill all required fields');
      return;
    }

    const barcode = this.routerForm.get('barcode')?.value?.trim();
    const isDup   = await this.checkDuplicate(barcode);
    if (isDup) return;

    this.isSubmitting = true;
    const payload = { ...this.routerForm.getRawValue(), updatedAt: new Date() };
    try {
      if (this.editMode && this.routerData?.id) {
        await updateDoc(doc(this.firestore, 'router', this.routerData.id), payload);
        this.toastr.success('Router record updated');
      } else {
        const ref = doc(collection(this.firestore, 'router'));
        await setDoc(ref, { ...payload, id: ref.id, createdAt: new Date() });
        this.toastr.success('Router record saved');
      }
      this.activeModal.close(true);
    } catch {
      this.toastr.error('Failed to save record');
    } finally {
      this.isSubmitting = false;
    }
  }

  isInvalid(name: string) {
    const c = this.routerForm.get(name);
    return c?.invalid && c?.touched;
  }
}
