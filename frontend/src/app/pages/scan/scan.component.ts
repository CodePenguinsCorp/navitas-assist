import { Component, DestroyRef, ElementRef, computed, inject, signal, viewChild } from '@angular/core';
import { Observable, finalize } from 'rxjs';
import { RMA_STATUS_FLOW } from '../../core/mock-data';
import { RmaResponse, RmaStatus, ScanSource } from '../../core/models';
import { AuthService } from '../../core/services/auth.service';
import { RmaService } from '../../core/services/rma.service';
import { ScanService } from '../../core/services/scan.service';
import { extractHttpErrorMessage, normalizeOptionalText } from '../../core/utils/catalog-ui';
import { looksLikeScanner } from '../../core/utils/scan-label';
import { formatDate, ownerLabel, priorityLabel, productSummary, statusLabel, trackableLabel } from '../../core/utils/rma-ui';

const RMA_CODE_PATTERN = /^RMA-\d{4}-\d+$/i;

interface DetectedBarcode {
  rawValue: string;
}

interface BarcodeDetectorLike {
  detect(source: HTMLVideoElement): Promise<DetectedBarcode[]>;
}

type BarcodeDetectorConstructor = new (options: { formats: string[] }) => BarcodeDetectorLike;

@Component({
  selector: 'app-scan',
  templateUrl: './scan.component.html',
  styles: [`
    :host {
      display: block;
    }

    .scan-entry {
      display: grid;
      grid-template-columns: minmax(0, 1fr) auto auto;
      gap: 0.6rem;
      align-items: end;
    }

    .scan-video {
      width: 100%;
      max-width: 420px;
      margin-top: 1rem;
      border-radius: 12px;
      background: #000000;
    }

    .scan-action {
      display: grid;
      grid-template-columns: minmax(0, 1fr) minmax(0, 2fr) auto;
      gap: 0.6rem;
      align-items: end;
      margin-top: 1rem;
    }

    .scan-confirm {
      display: flex;
      flex-wrap: wrap;
      gap: 0.5rem;
      align-items: center;
      margin-top: 0.75rem;
    }

    @media (max-width: 720px) {
      .scan-entry,
      .scan-action {
        grid-template-columns: 1fr;
      }
    }
  `]
})
export class ScanComponent {
  private readonly scanService = inject(ScanService);
  private readonly rmaService = inject(RmaService);
  private readonly authService = inject(AuthService);
  private readonly destroyRef = inject(DestroyRef);

  private readonly video = viewChild<ElementRef<HTMLVideoElement>>('cameraVideo');
  private keyTimestamps: number[] = [];
  private stream: MediaStream | null = null;
  private detectTimer: ReturnType<typeof setInterval> | null = null;

  protected readonly resolving = signal(false);
  protected readonly submitting = signal(false);
  protected readonly errorMessage = signal('');
  protected readonly successMessage = signal('');
  protected readonly rma = signal<RmaResponse | null>(null);
  protected readonly scannedCode = signal<string | null>(null);
  protected readonly source = signal<ScanSource>('MANUAL');
  protected readonly cameraActive = signal(false);
  protected readonly targetStatus = signal<RmaStatus | ''>('');
  protected readonly note = signal('');
  protected readonly confirming = signal(false);

  protected readonly cameraSupported = typeof window !== 'undefined' && 'BarcodeDetector' in window && Boolean(navigator.mediaDevices?.getUserMedia);
  // Extension point (NAV-38, PR #24): a quick custody move resolves the RMA here and then calls
  // POST /api/custody/rmas/{rmaId}/movements, keeping the same confirmation step and backend authorization.
  protected readonly canChangeStatus = computed(() => this.authService.hasAnyRole(['ADMIN', 'SERVICE_DESK', 'TECHNICIAN']));
  protected readonly statusOptions = computed(() => RMA_STATUS_FLOW.filter((status) => status !== this.rma()?.status));

  protected readonly statusLabel = statusLabel;
  protected readonly priorityLabel = priorityLabel;
  protected readonly dateLabel = formatDate;
  protected readonly ownerLabel = ownerLabel;
  protected readonly productSummary = productSummary;
  protected readonly trackableLabel = trackableLabel;

  constructor() {
    this.destroyRef.onDestroy(() => this.stopCamera());
  }

  protected trackKey(event: KeyboardEvent): void {
    if (event.key !== 'Enter') {
      this.keyTimestamps.push(event.timeStamp || performance.now());
    }
  }

  /** Handles keyboard-emulating scanners (they end with Enter) and manual typing in the same field. */
  protected submitTyped(input: HTMLInputElement): void {
    const source: ScanSource = looksLikeScanner(this.keyTimestamps) ? 'SCANNER' : 'MANUAL';
    this.keyTimestamps = [];
    const value = input.value;
    input.value = '';
    this.open(value, source);
  }

  protected open(value: string, source: ScanSource): void {
    const code = value.trim();
    if (!code || this.resolving()) {
      return;
    }

    // A typed RMA code is the manual fallback for a damaged label; anything else is treated as an opaque scan code.
    const byRmaCode = RMA_CODE_PATTERN.test(code);
    const request$: Observable<RmaResponse> = byRmaCode ? this.rmaService.getByCode(code) : this.scanService.resolve(code);

    this.resolving.set(true);
    this.clearMessages();
    this.resetAction();
    request$.pipe(
      finalize(() => this.resolving.set(false))
    ).subscribe({
      next: (rma) => {
        this.rma.set(rma);
        this.scannedCode.set(byRmaCode ? null : code);
        this.source.set(source);
      },
      error: () => {
        this.rma.set(null);
        this.scannedCode.set(null);
        this.errorMessage.set('Código não encontrado. Confira a etiqueta ou digite o código do RMA.');
      }
    });
  }

  protected async startCamera(): Promise<void> {
    if (!this.cameraSupported || this.cameraActive()) {
      return;
    }

    this.clearMessages();
    try {
      const Detector = (window as unknown as { BarcodeDetector: BarcodeDetectorConstructor }).BarcodeDetector;
      const detector = new Detector({ formats: ['qr_code', 'code_128'] });
      this.stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
      this.cameraActive.set(true);
      const video = this.video()?.nativeElement;
      if (!video) {
        this.stopCamera();
        return;
      }
      video.srcObject = this.stream;
      await video.play();
      this.detectTimer = setInterval(() => {
        detector.detect(video).then((codes) => {
          const rawValue = codes[0]?.rawValue;
          if (rawValue) {
            this.stopCamera();
            this.open(rawValue, 'CAMERA');
          }
        }).catch(() => undefined);
      }, 300);
    } catch {
      this.stopCamera();
      this.errorMessage.set('Não foi possível acessar a câmera. Use o leitor ou digite o código.');
    }
  }

  protected stopCamera(): void {
    if (this.detectTimer) {
      clearInterval(this.detectTimer);
      this.detectTimer = null;
    }
    this.stream?.getTracks().forEach((track) => track.stop());
    this.stream = null;
    this.cameraActive.set(false);
  }

  protected selectTarget(value: string): void {
    this.targetStatus.set(value as RmaStatus | '');
    this.confirming.set(false);
  }

  protected requestStatusChange(): void {
    if (!this.targetStatus()) {
      this.errorMessage.set('Escolha o novo status.');
      return;
    }
    this.errorMessage.set('');
    this.confirming.set(true);
  }

  /** Server re-checks permission, the explicit confirmation and that the RMA is still in the status shown here. */
  protected confirmStatusChange(): void {
    const rma = this.rma();
    const target = this.targetStatus();
    if (!rma || !target || this.submitting()) {
      return;
    }

    const note = normalizeOptionalText(this.note());
    const code = this.scannedCode();
    const request$ = code
      ? this.scanService.changeStatus(code, { expectedStatus: rma.status, status: target, note, source: this.source(), confirmed: true })
      : this.rmaService.updateStatusInBulk(rma.id, { expectedStatus: rma.status, status: target, note });

    this.submitting.set(true);
    request$.pipe(
      finalize(() => this.submitting.set(false))
    ).subscribe({
      next: (updated) => {
        this.rma.set(updated);
        this.successMessage.set(`Status de ${updated.code} alterado para ${statusLabel(updated.status)}.`);
        this.resetAction();
      },
      error: (error) => {
        this.confirming.set(false);
        this.errorMessage.set(extractHttpErrorMessage(error, 'Não foi possível alterar o status agora.'));
      }
    });
  }

  protected cancelStatusChange(): void {
    this.confirming.set(false);
  }

  private resetAction(): void {
    this.targetStatus.set('');
    this.note.set('');
    this.confirming.set(false);
  }

  private clearMessages(): void {
    this.errorMessage.set('');
    this.successMessage.set('');
  }
}
