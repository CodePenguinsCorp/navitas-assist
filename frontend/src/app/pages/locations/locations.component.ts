import { Component, computed, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Observable, finalize } from 'rxjs';
import { StorageLocationRequest, StorageLocationResponse, StorageLocationType } from '../../core/models';
import { CustodyService } from '../../core/services/custody.service';
import { extractHttpErrorMessage, includesQuery, normalizeOptionalText } from '../../core/utils/catalog-ui';
import { STORAGE_LOCATION_TYPE_LABELS, STORAGE_LOCATION_TYPE_OPTIONS } from '../../core/utils/custody-ui';
import { formatBusinessDateTime } from '../../core/utils/date';
import { CustomSelectComponent, CustomSelectOption } from '../../shared/form-controls/custom-select/custom-select.component';

type LocationFormControlName = 'code' | 'name' | 'type' | 'description';
type ActiveFilter = 'all' | 'active' | 'inactive';

const LOCATION_LIMITS = {
  code: 40,
  name: 120,
  description: 500
} as const;

@Component({
  selector: 'app-locations',
  imports: [ReactiveFormsModule, CustomSelectComponent],
  templateUrl: './locations.component.html',
  styles: [`
    :host {
      display: block;
    }

    .location-code {
      display: inline-block;
      max-width: 20ch;
      overflow-wrap: anywhere;
    }

    .checkbox-field {
      display: flex;
      align-items: center;
      gap: 0.5rem;
    }

    .modal-feedback {
      margin-bottom: 1rem;
    }
  `]
})
export class LocationsComponent {
  private readonly formBuilder = inject(FormBuilder);
  private readonly custodyService = inject(CustodyService);

  protected readonly loading = signal(true);
  protected readonly submitting = signal(false);
  protected readonly errorMessage = signal('');
  protected readonly modalErrorMessage = signal('');
  protected readonly successMessage = signal('');
  protected readonly searchTerm = signal('');
  protected readonly typeFilter = signal<StorageLocationType | ''>('');
  protected readonly activeFilter = signal<ActiveFilter>('all');
  protected readonly modalOpen = signal(false);
  protected readonly limits = LOCATION_LIMITS;

  private readonly locationsSignal = signal<StorageLocationResponse[]>([]);
  private readonly editingLocationSignal = signal<StorageLocationResponse | null>(null);

  protected readonly locations = this.locationsSignal.asReadonly();
  protected readonly editingLocation = this.editingLocationSignal.asReadonly();

  protected readonly typeOptions: ReadonlyArray<CustomSelectOption<StorageLocationType>> = STORAGE_LOCATION_TYPE_OPTIONS.map((type) => ({ value: type, label: STORAGE_LOCATION_TYPE_LABELS[type] }));
  protected readonly typeFilterOptions: ReadonlyArray<CustomSelectOption<StorageLocationType | ''>> = [{ value: '', label: 'Todos' }, ...this.typeOptions];
  protected readonly activeFilterOptions: ReadonlyArray<CustomSelectOption<ActiveFilter>> = [
    { value: 'all', label: 'Todos' },
    { value: 'active', label: 'Ativos' },
    { value: 'inactive', label: 'Inativos' }
  ];

  protected readonly parentOptions = computed<ReadonlyArray<CustomSelectOption<number | null>>>(() => {
    const editingId = this.editingLocationSignal()?.id ?? null;
    return [
      { value: null, label: 'Nenhum' },
      ...this.locationsSignal()
        .filter((location) => location.id !== editingId)
        .map((location) => ({ value: location.id, label: `${location.code} · ${location.name}` }))
    ];
  });

  protected readonly filteredLocations = computed(() =>
    this.locationsSignal().filter((location) =>
      includesQuery(this.searchTerm(), location.code, location.name, location.parentName, location.description) &&
      (!this.typeFilter() || location.type === this.typeFilter()) &&
      (this.activeFilter() === 'all' || location.active === (this.activeFilter() === 'active'))
    )
  );

  protected readonly activeCount = computed(() => this.locationsSignal().filter((location) => location.active).length);
  protected readonly inactiveCount = computed(() => this.locationsSignal().length - this.activeCount());

  protected readonly form = this.formBuilder.nonNullable.group({
    code: ['', [Validators.required, Validators.maxLength(LOCATION_LIMITS.code)]],
    name: ['', [Validators.required, Validators.maxLength(LOCATION_LIMITS.name)]],
    type: ['AREA' as StorageLocationType, [Validators.required]],
    parentId: [null as number | null],
    description: ['', [Validators.maxLength(LOCATION_LIMITS.description)]],
    active: [true]
  });

  constructor() {
    this.loadLocations();
  }

  protected updateSearch(value: string): void {
    this.searchTerm.set(value);
  }

  protected updateTypeFilter(value: StorageLocationType | ''): void {
    this.typeFilter.set(value);
  }

  protected updateActiveFilter(value: ActiveFilter): void {
    this.activeFilter.set(value);
  }

  protected openCreateModal(): void {
    this.editingLocationSignal.set(null);
    this.form.reset({ code: '', name: '', type: 'AREA', parentId: null, description: '', active: true });
    this.modalOpen.set(true);
    this.clearMessages();
  }

  protected openEditModal(location: StorageLocationResponse): void {
    this.editingLocationSignal.set(location);
    this.form.reset({
      code: location.code,
      name: location.name,
      type: location.type,
      parentId: location.parentId,
      description: location.description ?? '',
      active: location.active
    });
    this.modalOpen.set(true);
    this.clearMessages();
  }

  protected closeModal(): void {
    this.modalOpen.set(false);
    this.modalErrorMessage.set('');
  }

  protected saveLocation(): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      this.modalErrorMessage.set('Revise os campos destacados antes de salvar o local.');
      return;
    }

    const payload = buildLocationPayload(this.form.getRawValue());
    const currentLocation = this.editingLocationSignal();
    const request$: Observable<StorageLocationResponse> = currentLocation
      ? this.custodyService.updateLocation(currentLocation.id, payload)
      : this.custodyService.createLocation(payload);

    this.submitting.set(true);
    this.clearMessages();

    request$.pipe(finalize(() => this.submitting.set(false))).subscribe({
      next: (location) => {
        this.successMessage.set(currentLocation ? `Local ${location.code} atualizado com sucesso.` : `Local ${location.code} cadastrado com sucesso.`);
        this.closeModal();
        this.loadLocations();
      },
      error: (error) => {
        this.modalErrorMessage.set(extractHttpErrorMessage(error, 'Não foi possível salvar o local agora.'));
      }
    });
  }

  protected hasError(controlName: LocationFormControlName): boolean {
    const control = this.form.controls[controlName];
    return control.invalid && (control.dirty || control.touched);
  }

  protected typeLabel(type: StorageLocationType): string {
    return STORAGE_LOCATION_TYPE_LABELS[type];
  }

  protected updatedAtLabel(location: StorageLocationResponse): string {
    return formatBusinessDateTime(location.updatedAt);
  }

  private loadLocations(): void {
    this.loading.set(true);
    this.errorMessage.set('');

    this.custodyService.listLocations().pipe(finalize(() => this.loading.set(false))).subscribe({
      next: (locations) => this.locationsSignal.set(locations),
      error: (error) => this.errorMessage.set(extractHttpErrorMessage(error, 'Não foi possível carregar os locais.'))
    });
  }

  private clearMessages(): void {
    this.errorMessage.set('');
    this.modalErrorMessage.set('');
    this.successMessage.set('');
  }
}

function buildLocationPayload(raw: ReturnType<LocationsComponent['form']['getRawValue']>): StorageLocationRequest {
  return {
    code: raw.code.trim().toUpperCase(),
    name: raw.name.trim(),
    type: raw.type,
    parentId: raw.parentId,
    description: normalizeOptionalText(raw.description),
    active: raw.active
  };
}
