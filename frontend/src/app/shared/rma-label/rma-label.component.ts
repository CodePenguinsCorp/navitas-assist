import { Component, computed, inject, input } from '@angular/core';
import { RmaResponse, ScanCodeResponse } from '../../core/models';
import { ScanService } from '../../core/services/scan.service';
import { LabelFieldKey, buildLabelModel } from '../../core/utils/scan-label';

/**
 * RMA label. The same component is the on-screen preview and the printed label.
 */
@Component({
  selector: 'app-rma-label',
  template: `
    @if (model(); as label) {
      <article class="rma-label" [attr.aria-label]="'Etiqueta ' + label.rmaCode">
        <img class="rma-label__qr" [src]="qrUrl()" alt="QR Code da etiqueta" />
        <div class="rma-label__body">
          <strong class="rma-label__code">{{ label.rmaCode }}</strong>
          <span class="rma-label__product">{{ label.product }}</span>
          @for (line of label.lines; track line.label) {
            <span class="rma-label__line"><b>{{ line.label }}:</b> {{ line.value }}</span>
          }
        </div>
        <img class="rma-label__barcode" [src]="barcodeUrl()" alt="Código de barras da etiqueta" />
      </article>
    }
  `,
  styles: [`
    .rma-label {
      display: grid;
      grid-template-columns: 30mm 1fr;
      gap: 3mm;
      width: 100mm;
      min-height: 50mm;
      padding: 3mm;
      border: 1px solid #1d2a36;
      border-radius: 2mm;
      background: #ffffff;
      color: #000000;
      font-family: Arial, sans-serif;
      box-sizing: border-box;
    }

    .rma-label__qr {
      width: 30mm;
      height: 30mm;
    }

    .rma-label__body {
      display: grid;
      align-content: start;
      gap: 1mm;
      min-width: 0;
    }

    .rma-label__code {
      font-size: 14pt;
    }

    .rma-label__product,
    .rma-label__line {
      font-size: 8pt;
      overflow-wrap: anywhere;
    }

    /* Full label width keeps Code 128 modules printable at 203 dpi. */
    .rma-label__barcode {
      grid-column: 1 / -1;
      width: 100%;
      height: 12mm;
    }
  `]
})
export class RmaLabelComponent {
  private readonly scanService = inject(ScanService);

  readonly rma = input.required<RmaResponse>();
  readonly scanCode = input.required<ScanCodeResponse>();
  readonly fields = input.required<readonly LabelFieldKey[]>();

  protected readonly model = computed(() => buildLabelModel(this.rma(), this.fields()));
  protected readonly qrUrl = computed(() => this.scanService.imageUrl(this.scanCode(), 'qr'));
  protected readonly barcodeUrl = computed(() => this.scanService.imageUrl(this.scanCode(), 'barcode'));
}
