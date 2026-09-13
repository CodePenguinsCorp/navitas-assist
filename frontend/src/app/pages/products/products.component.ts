import { Component, computed, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Observable, finalize } from 'rxjs';
import { ProductRequest, ProductResponse } from '../../core/models';
import { CatalogService } from '../../core/services/catalog.service';
import {
  countDistinct,
  extractHttpErrorMessage,
  formatDateTime,
  includesQuery,
  normalizeOptionalText
} from '../../core/utils/catalog-ui';

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

const PRODUCT_PREVIEW_LIMITS = {
  category: 32,
  technicalNotes: 64
} as const;

@Component({
  selector: 'app-products',
  imports: [ReactiveFormsModule],
  templateUrl: './products.component.html',
  styles: [`
    :host {
      display: block;
    }

    .product-actions {
      display: flex;
      gap: 0.45rem;
    }

    .product-sku {
      display: inline-block;
      max-width: 20ch;
      overflow-wrap: anywhere;
    }

    .product-preview {
      display: block;
      max-width: 32ch;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .button-secondary--danger {
      border-color: #efc7cf;
      color: var(--danger-text);
    }

    .button-secondary--danger:hover {
      background: var(--danger-bg);
    }

    .button-primary--danger {
      background: var(--danger-text);
    }

    .button-primary--danger:hover {
      background: #7f3441;
    }

    .delete-confirmation {
      margin: 0 0 1.25rem;
      color: var(--muted);
      line-height: 1.55;
    }

    .delete-confirmation strong {
      color: var(--brand-blue-deep);
    }

    .modal-feedback {
      margin-bottom: 1rem;
    }
  `]
})
export class ProductsComponent {
  private readonly formBuilder = inject(FormBuilder);
  private readonly catalogService = inject(CatalogService);

  protected readonly loading = signal(true);
  protected readonly submitting = signal(false);
  protected readonly deletingProductId = signal<number | null>(null);
  protected readonly errorMessage = signal('');
  protected readonly modalErrorMessage = signal('');
  protected readonly deleteModalErrorMessage = signal('');
  protected readonly successMessage = signal('');
  protected readonly searchTerm = signal('');
  protected readonly activeModal = signal<ProductModalMode | null>(null);
  protected readonly limits = PRODUCT_LIMITS;

  private readonly productsSignal = signal<ProductResponse[]>([]);
  private readonly editingProductSignal = signal<ProductResponse | null>(null);
  private readonly deletingProductSignal = signal<ProductResponse | null>(null);

  protected readonly products = this.productsSignal.asReadonly();
  protected readonly editingProduct = this.editingProductSignal.asReadonly();
  protected readonly deletingProduct = this.deletingProductSignal.asReadonly();

  protected readonly filteredProducts = computed(() =>
    [...this.productsSignal()]
      .sort((left, right) => left.name.localeCompare(right.name, 'pt-BR', { sensitivity: 'base' }))
      .filter((product) =>
        includesQuery(
          this.searchTerm(),
          product.sku,
          product.name,
          product.category,
          product.hardwareVersion,
          product.firmwareVersion
        )
      )
  );

  protected readonly totalProducts = computed(() => this.productsSignal().length);
  protected readonly categoryCount = computed(() =>
    countDistinct(this.productsSignal().map((product) => product.category))
  );
  protected readonly productsWithFirmware = computed(
    () =>
      this.productsSignal().filter((product) => Boolean(normalizeOptionalText(product.firmwareVersion))).length
  );
  protected readonly averageWarrantyMonths = computed(() => {
    const products = this.productsSignal();
    if (products.length === 0) {
      return 0;
    }

    const totalMonths = products.reduce((sum, product) => sum + product.defaultWarrantyMonths, 0);
    return Math.round(totalMonths / products.length);
  });

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
    this.loadProducts();
  }

  protected updateSearch(value: string): void {
    this.searchTerm.set(value);
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
    this.activeModal.set(null);
    this.modalErrorMessage.set('');
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
        this.closeModal();
        this.loadProducts();
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
        this.productsSignal.update((products) =>
          products.filter((currentProduct) => currentProduct.id !== product.id)
        );
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

  protected categoryPreview(product: ProductResponse): string {
    return previewText(product.category, 'Não informada', PRODUCT_PREVIEW_LIMITS.category);
  }

  protected skuPreview(product: ProductResponse): string {
    return previewText(product.sku, 'Não informado', PRODUCT_LIMITS.sku);
  }

  protected technicalNotesPreview(product: ProductResponse): string {
    return previewText(
      product.technicalNotes,
      'Sem observação técnica',
      PRODUCT_PREVIEW_LIMITS.technicalNotes
    );
  }

  protected versionLabel(product: ProductResponse): string {
    const hardwareVersion = normalizeOptionalText(product.hardwareVersion);
    const firmwareVersion = normalizeOptionalText(product.firmwareVersion);

    if (hardwareVersion && firmwareVersion) {
      return `HW ${hardwareVersion} · FW ${firmwareVersion}`;
    }

    if (hardwareVersion) {
      return `HW ${hardwareVersion}`;
    }

    if (firmwareVersion) {
      return `FW ${firmwareVersion}`;
    }

    return 'Não informado';
  }

  private loadProducts(): void {
    this.loading.set(true);
    this.errorMessage.set('');

    this.catalogService.listProducts().pipe(
      finalize(() => this.loading.set(false))
    ).subscribe({
      next: (products) => this.productsSignal.set(products),
      error: (error) => {
        this.errorMessage.set(extractHttpErrorMessage(error, 'Não foi possível carregar os produtos.'));
      }
    });
  }

  private clearMessages(): void {
    this.errorMessage.set('');
    this.modalErrorMessage.set('');
    this.deleteModalErrorMessage.set('');
    this.successMessage.set('');
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

function previewText(value: string | null, emptyText: string, maxLength: number): string {
  const normalizedValue = normalizeOptionalText(value);

  if (!normalizedValue) {
    return emptyText;
  }

  if (normalizedValue.length <= maxLength) {
    return normalizedValue;
  }

  return `${normalizedValue.slice(0, maxLength).trimEnd()}…`;
}
