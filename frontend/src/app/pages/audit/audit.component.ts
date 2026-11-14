import { Component, inject, signal } from '@angular/core';
import { ReactiveFormsModule, FormBuilder } from '@angular/forms';
import { AuditService } from '../../core/services/audit.service';
import { AuditEventResponse } from '../../core/models';
import { PagedList } from '../../core/utils/paged-list';
import { extractHttpErrorMessage } from '../../core/utils/catalog-ui';
import { formatBusinessDateTime } from '../../core/utils/date';
import { PageHeaderComponent } from '../../shared/page-header/page-header.component';
import { PaginationComponent } from '../../shared/pagination/pagination.component';
import { ResultCountComponent } from '../../shared/result-count/result-count.component';
import { CustomSelectComponent } from '../../shared/form-controls/custom-select/custom-select.component';
import { DatePickerComponent } from '../../shared/form-controls/date-picker/date-picker.component';
import { IconComponent } from '../../shared/icon/icon.component';

@Component({
  selector: 'app-audit',
  imports: [ReactiveFormsModule, PageHeaderComponent, PaginationComponent, ResultCountComponent, CustomSelectComponent, DatePickerComponent, IconComponent],
  templateUrl: './audit.component.html',
  styleUrl: './audit.component.css'
})
export class AuditComponent {
  private readonly service = inject(AuditService);
  protected readonly error = signal('');
  protected readonly filters = inject(FormBuilder).nonNullable.group({ from: '', to: '', actor: '', action: '', entityType: '' });
  private appliedFilters = this.filters.getRawValue();
  protected readonly dateTime = formatBusinessDateTime;
  protected readonly list = new PagedList<AuditEventResponse>(
    page => {
      this.error.set('');
      return this.service.search({ ...page, ...this.appliedFilters });
    },
    error => this.error.set(extractHttpErrorMessage(error, 'Não foi possível carregar a auditoria.'))
  );
  protected readonly actionLabels: Partial<Record<string, string>> = {
    CREATE: 'Criação', UPDATE: 'Edição', DELETE: 'Exclusão', STATUS_NOTE_UPDATE: 'Observação alterada',
    WARRANTY_UPDATE: 'Garantia ajustada', REPAIR_VOID: 'Reparo anulado', RULE_UPDATE: 'Regra alterada',
    EMAIL_RETRY: 'Reenvio de e-mail', EMAIL_TEST: 'Teste de e-mail', CSV_IMPORT: 'Importação CSV'
  };
  protected readonly entityLabels: Partial<Record<string, string>> = {
    USER: 'Usuário', ACCESS_PROFILE: 'Perfil de acesso', CLIENT: 'Cliente', PRODUCT: 'Produto',
    RMA_STATUS_NOTE: 'Observação do RMA', RMA_ITEM: 'Item do RMA', EXTERNAL_COMPONENT: 'Componente externo',
    INTERVENTION: 'Intervenção', NOTIFICATION_RULE: 'Regra de notificação', NOTIFICATION: 'Notificação',
    EMAIL: 'E-mail', CATALOG_IMPORT: 'Importação'
  };
  protected readonly actionOptions = [{ value: '', label: 'Todas as ações' }, ...Object.entries(this.actionLabels).map(([value, label]) => ({ value, label: label! }))];
  protected readonly entityOptions = [{ value: '', label: 'Todos os tipos' }, ...Object.entries(this.entityLabels).map(([value, label]) => ({ value, label: label! }))];

  constructor() { this.list.reload(); }

  protected applyFilters(): void {
    this.appliedFilters = this.filters.getRawValue();
    this.list.firstPage();
  }

  protected clearFilters(): void {
    this.filters.reset();
    this.applyFilters();
  }

  protected recordLabel(event: AuditEventResponse): string {
    return event.entityLabel || `${this.entityLabels[event.entityType] ?? event.entityType}${event.entityId === null ? '' : ' #' + event.entityId}`;
  }
}
