/**
 * Display-only mask for CPF (11 digits) and CNPJ (14 digits): keeps just the digits and formats by their count. Anything else
 * (empty, a foreign document, a partial value) is shown exactly as stored. The stored value is never changed.
 */
export function formatDocumentNumber(value: string | null | undefined): string {
  const raw = value?.trim() ?? '';
  const digits = raw.replace(/\D/g, '');
  if (digits.length === 11) return digits.replace(/^(\d{3})(\d{3})(\d{3})(\d{2})$/, '$1.$2.$3-$4');
  if (digits.length === 14) return digits.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, '$1.$2.$3/$4-$5');
  return raw;
}
