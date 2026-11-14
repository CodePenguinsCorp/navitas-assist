import { Component, DestroyRef, inject, input, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { finalize } from 'rxjs';
import { ReportService } from '../../core/services/report.service';
import { saveDownload } from '../../core/utils/download';
import { IconComponent } from '../icon/icon.component';

/** Discreet text link that downloads the final technical report (PDF) of one RMA. */
@Component({
  selector: 'app-rma-report-link',
  imports: [IconComponent],
  template: `
    <button type="button" class="link-button rma-report-link" [disabled]="busy() || disabled()"
      [attr.aria-label]="'Baixar laudo de ' + code()" (click)="download()">
      <app-icon name="download" [size]="14" />{{ label() }}
    </button>
    @if (error()) {
      <span class="rma-report-link__error" role="alert">{{ error() }}</span>
    }
  `,
  styles: [`
    :host { display: inline-flex; align-items: center; gap: var(--space-2); flex-wrap: wrap; }
    .rma-report-link { display: inline-flex; align-items: center; gap: var(--space-1); padding-inline: var(--space-1); }
    .rma-report-link__error { color: var(--danger-text); font-size: var(--font-size-sm); }
  `]
})
export class RmaReportLinkComponent {
  private readonly reportService = inject(ReportService);
  private readonly destroyRef = inject(DestroyRef);

  readonly rmaId = input.required<number>();
  readonly code = input.required<string>();
  readonly label = input('Laudo (PDF)');
  readonly disabled = input(false);
  protected readonly busy = signal(false);
  protected readonly error = signal('');

  protected download(): void {
    this.busy.set(true);
    this.error.set('');
    this.reportService.downloadTechnicalReport(this.rmaId())
      .pipe(takeUntilDestroyed(this.destroyRef), finalize(() => this.busy.set(false)))
      .subscribe({
        next: (response) => saveDownload(response, `laudo-${this.code().replace(/[^A-Za-z0-9_-]/g, '-')}.pdf`),
        error: () => this.error.set('Não foi possível baixar o laudo.')
      });
  }
}
