import { Injectable } from '@angular/core';
import { Capacitor, registerPlugin } from '@capacitor/core';
import html2canvas from 'html2canvas';

interface FileSharePlugin {
  saveFile(options: { data: string; fileName: string; mimeType: string }): Promise<{ folder: string }>;
  shareToWhatsApp(options: {
    data: string;
    fileName: string;
    mimeType: string;
    text?: string;
    phone?: string;
  }): Promise<{ app: string }>;
  openWhatsApp(options: { phone?: string; text?: string }): Promise<{ app: string }>;
}

/** Native side: android/app/src/main/java/com/ranjha/internet/FileSharePlugin.java */
const FileShare = registerPlugin<FileSharePlugin>('FileShare');

export interface CaptureOptions {
  /** Layout width of the capture; defaults to the element's on-screen width. */
  width?: number;
  mimeType?: 'image/png' | 'image/jpeg';
  quality?: number;
}

/**
 * Turns an on-screen receipt / form into an image and saves or shares it:
 * through FileSharePlugin in the Android app, with browser APIs on the web.
 * The WebView ignores <a download> and has no Web Share, so the old
 * browser-only code silently did nothing in the app.
 */
@Injectable({ providedIn: 'root' })
export class FileShareService {
  /**
   * Renders `source` to an image. The element is copied into an off-screen
   * stage and html2canvas skips the rest of <body>: by default it reads the
   * computed style of every node on the page first, which with a list screen
   * behind the modal froze the app for seconds.
   */
  async capture(source: HTMLElement, options: CaptureOptions = {}): Promise<Blob> {
    const width = Math.ceil(options.width || source.getBoundingClientRect().width || 380);

    const stage = document.createElement('div');
    stage.style.cssText = `position:fixed;top:0;left:-10000px;width:${width}px;background:#fff;pointer-events:none;`;
    const clone = source.cloneNode(true) as HTMLElement;
    stage.appendChild(clone);
    document.body.appendChild(stage);

    try {
      // Let the copy lay out before it is measured.
      await new Promise((resolve) => requestAnimationFrame(resolve));

      const canvas = await html2canvas(clone, {
        scale: 2,
        useCORS: true,
        backgroundColor: '#ffffff',
        logging: false,
        width,
        windowWidth: width,
        height: clone.scrollHeight,
        windowHeight: clone.scrollHeight,
        // Keep <head> for the stylesheets, and the path down to the stage.
        ignoreElements: (el) =>
          !(el === stage || stage.contains(el) || el.contains(stage) || document.head.contains(el)),
      });

      return await new Promise<Blob>((resolve, reject) =>
        canvas.toBlob(
          (blob) => (blob ? resolve(blob) : reject(new Error('Could not render image'))),
          options.mimeType || 'image/png',
          options.quality ?? 0.92,
        ),
      );
    } finally {
      stage.remove();
    }
  }

  /** Images go to the gallery (Pictures/Ranjha7star); returns where the file went. */
  async save(blob: Blob, fileName: string): Promise<string> {
    if (Capacitor.isNativePlatform()) {
      const { folder } = await FileShare.saveFile({
        data: await this.toBase64(blob),
        fileName,
        mimeType: blob.type,
      });
      return folder;
    }

    this.download(blob, fileName);
    return 'Downloads';
  }

  /**
   * Sends the file to WhatsApp, straight into `phone`'s chat when given
   * (international digits, e.g. 923001234567). Resolves 'downloaded' on a
   * desktop browser, where the file has to be attached by hand.
   */
  async shareToWhatsApp(
    blob: Blob,
    fileName: string,
    options: { text?: string; phone?: string } = {},
  ): Promise<'shared' | 'downloaded'> {
    if (Capacitor.isNativePlatform()) {
      await FileShare.shareToWhatsApp({
        data: await this.toBase64(blob),
        fileName,
        mimeType: blob.type,
        text: options.text,
        phone: options.phone,
      });
      return 'shared';
    }

    // Mobile browsers: the share sheet lists WhatsApp.
    const file = new File([blob], fileName, { type: blob.type });
    if (navigator.canShare?.({ files: [file] })) {
      try {
        await navigator.share({ files: [file], text: options.text });
      } catch (err: any) {
        if (err?.name !== 'AbortError') throw err; // AbortError = user closed the sheet
      }
      return 'shared';
    }

    // Desktop: a wa.me link cannot carry a file.
    this.download(blob, fileName);
    const url = `https://wa.me/${options.phone || ''}?text=${encodeURIComponent(options.text || '')}`;
    window.open(url, '_blank');
    return 'downloaded';
  }

  /**
   * Opens `phone`'s WhatsApp chat (international digits, e.g. 923001234567)
   * with `text` typed in. In the app this goes through the native plugin so
   * WhatsApp Business opens directly too; a wa.me link sent Business-only
   * phones to the browser.
   */
  async openWhatsApp(phone: string, text: string): Promise<void> {
    if (Capacitor.isNativePlatform()) {
      try {
        await FileShare.openWhatsApp({ phone, text });
        return;
      } catch (err) {
        // An older APK without the method - fall back to the link.
        console.error('Native WhatsApp open failed', err);
      }
    }

    window.open(`https://wa.me/${phone}?text=${encodeURIComponent(text)}`, '_blank');
  }

  /** `receipt_ranjha123_1726640000000.png` - no spaces or characters a file system rejects. */
  fileName(prefix: string, name: unknown, extension: string): string {
    const slug = String(name ?? '')
      .trim()
      .replace(/[^a-zA-Z0-9_-]+/g, '_')
      .replace(/^_+|_+$/g, '');
    return `${prefix}_${slug ? slug + '_' : ''}${Date.now()}.${extension}`;
  }

  private download(blob: Blob, fileName: string) {
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = fileName;
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  private toBase64(blob: Blob): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result).split(',')[1] || '');
      reader.onerror = () => reject(reader.error);
      reader.readAsDataURL(blob);
    });
  }
}
