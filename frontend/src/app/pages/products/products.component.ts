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

@Component({
  selector: 'app-products',
  imports: [ReactiveFormsModule],
  templateUrl: './products.component.html',
  styles: [':host { display: block; }']
})
export class ProductsComponent {
  private readonly formBuilder = inject(FormBuilder);
  private readonly catalogService = inject(CatalogService);

  protected readonly loading = signal(true);
  protected readonly submitting = signal(false);
  protected readonly errorMessage = signal('');
  protected readonly successMessage = signal('');
  protected readonly searchTerm = signal('');
  protected readonly activeModal = signal<ProductModalMode | null>(null);

  private readonly productsSignal = signal<ProductResponse[]>([]);
  private readonly editingProductSignal = signal<ProductResponse | null>(null);

  protected readonly products = this.productsSignal.asReadonly();
  protected readonly editingProduct = this.editingProductSignal.asReadonly();

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
    sku: ['', [Validators.required, Validators.maxLength(60)]],
    name: ['', [Validators.required, Validators.maxLength(120)]],
    category: ['', [Validators.maxLength(80)]],
    hardwareVersion: ['', [Validators.maxLength(40)]],
    firmwareVersion: ['', [Validators.maxLength(40)]],
    defaultWarrantyMonths: [12, [Validators.required, Validators.min(1)]],
    technicalNotes: ['', [Validators.maxLength(1000)]]
  });

  constructor() {
    this.loadProducts();
  }

  protected refresh(): void {
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
  }

  protected saveProduct(): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      this.errorMessage.set('Preencha os campos obrigatórios do produto.');
      this.successMessage.set('');
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
        this.errorMessage.set(extractHttpErrorMessage(error, 'Não foi possível salvar o produto agora.'));
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
    this.successMessage.set('');
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
