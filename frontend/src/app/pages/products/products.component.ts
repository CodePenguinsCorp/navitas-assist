import { IconComponent } from '../../shared/icon/icon.component';
import { Component, DestroyRef, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Observable, Subject, debounceTime, filter, finalize } from 'rxjs';
import { ProductRequest, ProductResponse, ProductSummaryResponse } from '../../core/models';
import { CatalogService } from '../../core/services/catalog.service';
import {
  extractHttpErrorMessage,
  formatDateTime,
  PRESENCE_FILTER_OPTIONS,
  PresenceFilter,
  normalizeOptionalText
} from '../../core/utils/catalog-ui';
import { PagedList } from '../../core/utils/paged-list';
import { SEARCH_DEBOUNCE_MS, presenceToFlag } from '../../core/utils/pagination';
import { CustomSelectComponent, CustomSelectOption } from '../../shared/form-controls/custom-select/custom-select.component';
import { SuggestInputComponent } from '../../shared/form-controls/suggest-input/suggest-input.component';
import { ModalFocusDirective } from '../../shared/modal-focus/modal-focus.directive';
import { PageHeaderComponent } from '../../shared/page-header/page-header.component';
import { PaginationComponent } from '../../shared/pagination/pagination.component';
import { RowActionComponent } from '../../shared/row-action/row-action.component';

type ProductModalMode = 'create' | 'edit';
type ProductFormControlName =
  | 'sku'
  | 'name'
  | 'category'
  | 'hardwareVersion'
  | 'firmwareVersion'
  | 'defaultWarrantyMonths'
  | 'technicalNotes';

const PRODUCT_LIMITS = {
  sku: 20,
  name: 120,
  category: 80,
  hardwareVersion: 40,
  firmwareVersion: 40,
  technicalNotes: 1000
} as const;

@Component({
  selector: 'app-products',
  imports: [IconComponent, ReactiveFormsModule, CustomSelectComponent, ModalFocusDirective, PaginationComponent, PageHeaderComponent, RowActionComponent, SuggestInputComponent],
  templateUrl: './products.component.html',
  styles: [`
    :host {
      display: block;
    }

    .product-sku {
      white-space: nowrap;
    }

    .product-version {
      display: block;
      white-space: nowrap;
    }

    .product-version .table-subtitle {
      display: inline;
    }

    .product-preview {
      display: block;
      max-width: 32ch;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
  `]
})
export class ProductsComponent {
  private readonly formBuilder = inject(FormBuilder);
  private readonly catalogService = inject(CatalogService);

  private readonly destroyRef = inject(DestroyRef);

  protected readonly submitting = signal(false);
  protected readonly deletingProductId = signal<number | null>(null);
  protected readonly errorMessage = signal('');
  protected readonly modalErrorMessage = signal('');
  protected readonly deleteModalErrorMessage = signal('');
  protected readonly successMessage = signal('');
  protected readonly searchTerm = signal('');
  protected readonly categoryFilter = signal('');
  protected readonly firmwareFilter = signal<PresenceFilter>('all');
  protected readonly presenceFilterOptions = PRESENCE_FILTER_OPTIONS;
  protected readonly activeModal = signal<ProductModalMode | null>(null);
  protected readonly limits = PRODUCT_LIMITS;
  /** Last list query failed; independent of the cached page and of form messages. */
  protected readonly loadFailed = signal(false);

  private readonly searchChanges = new Subject<'search' | 'cancel'>();
  private readonly productList = new PagedList<ProductResponse>(
    (pageQuery) => this.catalogService.listProducts({
      ...pageQuery,
      query: this.searchTerm(),
      category: this.categoryFilter(),
      hasFirmware: presenceToFlag(this.firmwareFilter())
    }),
    (error) => {
      this.loadFailed.set(true);
      this.errorMessage.set(extractHttpErrorMessage(error, 'Não foi possível carregar os produtos.'));
    },
    () => this.loadFailed.set(false)
  );
  private readonly summarySignal = signal<ProductSummaryResponse>({ total: 0, withFirmware: 0, averageWarrantyMonths: 0, categories: [] });
  private readonly editingProductSignal = signal<ProductResponse | null>(null);
  private readonly deletingProductSignal = signal<ProductResponse | null>(null);

  protected readonly products = this.productList.items;
  protected readonly loading = this.productList.loading;
  protected readonly page = this.productList.page;
  protected readonly pageSize = this.productList.size;
  protected readonly totalElements = this.productList.totalElements;
  protected readonly totalPages = this.productList.totalPages;
  protected readonly summary = this.summarySignal.asReadonly();
  protected readonly editingProduct = this.editingProductSignal.asReadonly();
  protected readonly deletingProduct = this.deletingProductSignal.asReadonly();
  protected readonly hasLoaded = computed(() => this.productList.result() !== null);

  protected readonly categoryFilterOptions = computed<ReadonlyArray<CustomSelectOption<string>>>(() => [
    { value: '', label: 'Todas' },
    ...this.summarySignal().categories.map((category) => ({ value: category, label: category }))
  ]);

  protected readonly form = this.formBuilder.nonNullable.group({
    sku: ['', [Validators.required, Validators.maxLength(PRODUCT_LIMITS.sku)]],
    name: ['', [Validators.required, Validators.maxLength(PRODUCT_LIMITS.name)]],
    category: ['', [Validators.maxLength(PRODUCT_LIMITS.category)]],
    hardwareVersion: ['', [Validators.maxLength(PRODUCT_LIMITS.hardwareVersion)]],
    firmwareVersion: ['', [Validators.maxLength(PRODUCT_LIMITS.firmwareVersion)]],
    defaultWarrantyMonths: [12, [Validators.required, Validators.min(1)]],
    technicalNotes: ['', [Validators.maxLength(PRODUCT_LIMITS.technicalNotes)]]
  });

  constructor() {
    this.searchChanges.pipe(
      debounceTime(SEARCH_DEBOUNCE_MS),
      filter((kind) => kind === 'search'),
      takeUntilDestroyed(this.destroyRef)
    ).subscribe(() => this.productList.firstPage());
    this.loadProducts();
    this.loadSummary();
  }

  protected get hasActiveFilters(): boolean {
    return Boolean(this.searchTerm().trim()) || Boolean(this.categoryFilter()) || this.firmwareFilter() !== 'all';
  }

  protected updateSearch(value: string): void {
    this.searchTerm.set(value);
    this.searchChanges.next('search');
  }

  protected clearFilters(): void {
    this.searchChanges.next('cancel');
    this.searchTerm.set('');
    this.categoryFilter.set('');
    this.firmwareFilter.set('all');
    this.productList.firstPage();
  }

  protected retryLoad(): void {
    this.productList.reload();
  }

  protected updateCategoryFilter(value: string): void {
    this.categoryFilter.set(value);
    this.productList.firstPage();
  }

  protected updateFirmwareFilter(value: PresenceFilter): void {
    this.firmwareFilter.set(value);
    this.productList.firstPage();
  }

  protected goToPage(page: number): void {
    this.productList.goToPage(page);
  }

  protected changePageSize(size: number): void {
    this.productList.changeSize(size);
  }

  protected openCreateModal(): void {
    this.editingProductSignal.set(null);
    this.form.reset(emptyProductForm());
    this.activeModal.set('create');
    this.clearMessages();
  }

  protected openEditModal(product: ProductResponse): void {
    this.editingProductSignal.set(product);
    this.form.reset({
      sku: product.sku,
      name: product.name,
      category: product.category ?? '',
      hardwareVersion: product.hardwareVersion ?? '',
      firmwareVersion: product.firmwareVersion ?? '',
      defaultWarrantyMonths: product.defaultWarrantyMonths,
      technicalNotes: product.technicalNotes ?? ''
    });
    this.activeModal.set('edit');
    this.clearMessages();
  }

  protected closeModal(): void {
    if (this.submitting()) {
      return;
    }

    this.resetModal();
  }

  protected saveProduct(): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      this.modalErrorMessage.set('Revise os campos destacados antes de salvar o produto.');
      return;
    }

    const payload = buildProductPayload(this.form.getRawValue());
    const currentProduct = this.editingProductSignal();
    const request$: Observable<ProductResponse> = currentProduct
      ? this.catalogService.updateProduct(currentProduct.id, payload)
      : this.catalogService.createProduct(payload);

    this.submitting.set(true);
    this.clearMessages();

    request$.pipe(
      finalize(() => this.submitting.set(false))
    ).subscribe({
      next: (product) => {
        this.successMessage.set(
          currentProduct
            ? `Produto ${product.name} atualizado com sucesso.`
            : `Produto ${product.name} cadastrado com sucesso.`
        );
        this.resetModal();
        this.loadProducts();
        this.loadSummary();
      },
      error: (error) => {
        this.modalErrorMessage.set(
          extractHttpErrorMessage(error, 'Não foi possível salvar o produto agora.')
        );
      }
    });
  }

  protected openDeleteModal(product: ProductResponse): void {
    this.deletingProductSignal.set(product);
    this.clearMessages();
  }

  protected closeDeleteModal(): void {
    if (this.deletingProductId() !== null) {
      return;
    }

    this.resetDeleteModal();
  }

  protected confirmDeleteProduct(): void {
    const product = this.deletingProductSignal();

    if (!product || this.deletingProductId() !== null) {
      return;
    }

    this.deletingProductId.set(product.id);
    this.clearMessages();

    this.catalogService.deleteProduct(product.id).pipe(
      finalize(() => this.deletingProductId.set(null))
    ).subscribe({
      next: () => {
        this.loadProducts();
        this.loadSummary();
        this.successMessage.set(`Produto ${product.name} excluído com sucesso.`);
        this.resetDeleteModal();
      },
      error: (error) => {
        this.deleteModalErrorMessage.set(
          extractHttpErrorMessage(error, 'Não foi possível excluir o produto agora.')
        );
      }
    });
  }

  protected hasError(controlName: ProductFormControlName): boolean {
    const control = this.form.controls[controlName];
    return control.invalid && (control.dirty || control.touched);
  }

  protected updatedAtLabel(product: ProductResponse): string {
    return formatDateTime(product.updatedAt);
  }

  protected warrantyLabel(months: number): string {
    return months === 1 ? '1 mês' : `${months} meses`;
  }

  private loadProducts(): void {
    this.errorMessage.set('');
    this.productList.reload();
  }

  private loadSummary(): void {
    this.catalogService.getProductSummary().subscribe({
      next: (summary) => {
        this.summarySignal.set(summary);
        this.syncCategoryFilter();
      },
      error: () => undefined
    });
  }

  private clearMessages(): void {
    this.errorMessage.set('');
    this.modalErrorMessage.set('');
    this.deleteModalErrorMessage.set('');
    this.successMessage.set('');
  }

  private syncCategoryFilter(): void {
    const selected = this.categoryFilter();
    if (!selected) {
      return;
    }

    const matchingOption = this.categoryFilterOptions().find(
      (option) => option.value.toLocaleLowerCase('pt-BR') === selected.toLocaleLowerCase('pt-BR')
    );
    const next = matchingOption?.value ?? '';

    if (next !== selected) {
      this.categoryFilter.set(next);
      this.productList.firstPage();
    }
  }

  private resetModal(): void {
    this.activeModal.set(null);
    this.modalErrorMessage.set('');
  }

  private resetDeleteModal(): void {
    this.deletingProductSignal.set(null);
    this.deleteModalErrorMessage.set('');
  }
}

function emptyProductForm() {
  return {
    sku: '',
    name: '',
    category: '',
    hardwareVersion: '',
    firmwareVersion: '',
    defaultWarrantyMonths: 12,
    technicalNotes: ''
  };
}

function buildProductPayload(raw: ReturnType<ProductsComponent['form']['getRawValue']>): ProductRequest {
  return {
    sku: raw.sku.trim(),
    name: raw.name.trim(),
    category: normalizeOptionalText(raw.category),
    hardwareVersion: normalizeOptionalText(raw.hardwareVersion),
    firmwareVersion: normalizeOptionalText(raw.firmwareVersion),
    defaultWarrantyMonths: raw.defaultWarrantyMonths,
    technicalNotes: normalizeOptionalText(raw.technicalNotes)
  };
}
