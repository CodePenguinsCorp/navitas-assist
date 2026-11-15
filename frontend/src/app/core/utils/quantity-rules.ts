import { ValidatorFn } from '@angular/forms';

const MEASURE_UNITS = new Set([
  'kg', 'g', 'mg', 't', 'l', 'lt', 'litro', 'litros', 'ml', 'm', 'metro', 'metros', 'cm', 'mm', 'km', 'm2', 'm3', 'pol',
  'quilograma', 'quilogramas', 'grama', 'gramas', 'miligrama', 'miligramas', 'tonelada', 'toneladas',
  'mililitro', 'mililitros', 'centimetro', 'centimetros', 'milimetro', 'milimetros', 'quilometro', 'quilometros', 'polegada', 'polegadas'
]);

export function allowsFraction(unit: string | null | undefined): boolean {
  return MEASURE_UNITS.has((unit ?? '').normalize('NFKD').replace(/[\u0300-\u036f.]/g, '').trim().toLowerCase());
}

export function quantityError(value: number, unit: string | null | undefined, allowZero = false): string | null {
  if (!Number.isFinite(value) || value < 0 || (!allowZero && value === 0)) return allowZero ? 'Informe uma quantidade maior ou igual a zero.' : 'Informe uma quantidade maior que zero.';
  if (!allowsFraction(unit) && !Number.isInteger(value)) return `A unidade ${(unit?.trim() || 'UN').toUpperCase()} não aceita quantidade fracionada. Informe um número inteiro.`;
  if (value > 999999999.999 || !/^\d+(\.\d{1,3})?$/.test(String(value))) return 'Use até 3 casas decimais e no máximo 999.999.999,999.';
  return null;
}

export function quantityValidator(unit: () => string | null | undefined, allowZero = false, preserve?: (value: number) => boolean): ValidatorFn {
  return control => {
    if (preserve?.(control.value)) return null;
    const message = quantityError(control.value, unit(), allowZero);
    return message ? { quantity: message } : null;
  };
}
