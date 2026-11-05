import { Component, computed, inject, signal } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { finalize, switchMap } from 'rxjs';
import { RmaResponse, ScanCodeResponse } from '../../core/models';
import { AuthService } from '../../core/services/auth.service';
import { RmaService } from '../../core/services/rma.service';
import { ScanService } from '../../core/services/scan.service';
import { extractHttpErrorMessage } from '../../core/utils/catalog-ui';
import { DEFAULT_LABEL_FIELDS, LABEL_FIELD_OPTIONS, LabelFieldKey } from '../../core/utils/scan-label';
import { RmaLabelComponent } from '../../shared/rma-label/rma-label.component';

const FIELDS_STORAGE_KEY = 'navitas.label-fields';

@Component({
  selector: 'app-labels',
  imports: [RmaLabelComponent],
  templateUrl: './labels.component.html',
  styles: [`
    :host {
      display: block;
    }

    .label-search {
      display: grid;
      grid-template-columns: minmax(0, 1fr) auto;
      gap: 0.6rem;
      align-items: end;
    }

    .label-fields,
    .label-actions {
      display: flex;
      flex-wrap: wrap;
      gap: 0.75rem;
      align-items: center;
      margin: 1rem 0;
    }

    .label-preview {
      padding: 1rem;
      border: 1px dashed var(--line);
      border-radius: 12px;
      overflow-x: auto;
    }
  `]
})
export class LabelsComponent {
  private readonly rmaService = inject(RmaService);
  private readonly scanService = inject(ScanService);
  private readonly authService = inject(AuthService);
  private readonly route = inject(ActivatedRoute);

  protected readonly loading = signal(false);
  protected readonly errorMessage = signal('');
  protected readonly successMessage = signal('');
  protected readonly rma = signal<RmaResponse | null>(null);
  protected readonly scanCode = signal<ScanCodeResponse | null>(null);
  protected readonly fields = signal<LabelFieldKey[]>(loadFields());
  protected readonly confirmingRevoke = signal(false);

  protected readonly fieldOptions = LABEL_FIELD_OPTIONS;
  protected readonly canRevoke = computed(() => this.authService.hasAnyRole(['ADMIN', 'SERVICE_DESK']));

  constructor() {
    const code = this.route.snapshot.queryParamMap.get('code');
    if (code) {
      this.load(code);
    }
  }

  protected load(code: string): void {
    const value = code.trim();
    if (!value || this.loading()) {
      return;
    }

    this.loading.set(true);
    this.clearMessages();
    this.confirmingRevoke.set(false);
    this.rmaService.getByCode(value).pipe(
      switchMap((rma) => {
        this.rma.set(rma);
        return this.scanService.issue(rma.id);
      }),
      finalize(() => this.loading.set(false))
    ).subscribe({
      next: (scanCode) => this.scanCode.set(scanCode),
      error: (error) => {
        this.rma.set(null);
        this.scanCode.set(null);
        this.errorMessage.set(extractHttpErrorMessage(error, 'Não foi possível gerar a etiqueta deste RMA.'));
      }
    });
  }

  protected toggleField(key: LabelFieldKey): void {
    this.fields.update((fields) => fields.includes(key) ? fields.filter((field) => field !== key) : [...fields, key]);
    saveFields(this.fields());
  }

  protected print(): void {
    document.body.classList.add('printing-label');
    try {
      window.print();
    } finally {
      document.body.classList.remove('printing-label');
    }
  }

  /** Revoking invalidates printed labels immediately; a new code is issued for the reprint. */
  protected confirmRevoke(): void {
    const rma = this.rma();
    if (!rma || this.loading()) {
      return;
    }

    this.loading.set(true);
    this.clearMessages();
    this.scanService.revoke(rma.id).pipe(
      switchMap(() => this.scanService.issue(rma.id)),
      finalize(() => {
        this.loading.set(false);
        this.confirmingRevoke.set(false);
      })
    ).subscribe({
      next: (scanCode) => {
        this.scanCode.set(scanCode);
        this.successMessage.set('Código anterior revogado. Imprima a nova etiqueta.');
      },
      error: (error) => this.errorMessage.set(extractHttpErrorMessage(error, 'Não foi possível revogar o código agora.'))
    });
  }

  private clearMessages(): void {
    this.errorMessage.set('');
    this.successMessage.set('');
  }
}

function loadFields(): LabelFieldKey[] {
  try {
    const stored = JSON.parse(localStorage.getItem(FIELDS_STORAGE_KEY) ?? 'null') as unknown;
    if (Array.isArray(stored)) {
      return LABEL_FIELD_OPTIONS.map((option) => option.key).filter((key) => stored.includes(key));
    }
  } catch {
    // Storage may be unavailable; fall back to the defaults.
  }
  return [...DEFAULT_LABEL_FIELDS];
}

function saveFields(fields: LabelFieldKey[]): void {
  try {
    localStorage.setItem(FIELDS_STORAGE_KEY, JSON.stringify(fields));
  } catch {
    // Field choice is only a per-browser convenience.
  }
}
