import { formatDocumentNumber } from './document';

describe('formatDocumentNumber', () => {
  it('formats 11 digits as CPF, with or without punctuation', () => {
    expect(formatDocumentNumber('12312312333')).toBe('123.123.123-33');
    expect(formatDocumentNumber('123.123.123-00')).toBe('123.123.123-00');
  });

  it('formats 14 digits as CNPJ, with or without punctuation', () => {
    expect(formatDocumentNumber('12345678000195')).toBe('12.345.678/0001-95');
    expect(formatDocumentNumber('12.345.678/0001-95')).toBe('12.345.678/0001-95');
  });

  it('keeps anything else as stored', () => {
    expect(formatDocumentNumber('12345')).toBe('12345');
    expect(formatDocumentNumber('AB-1234567')).toBe('AB-1234567');
    expect(formatDocumentNumber('')).toBe('');
    expect(formatDocumentNumber(null)).toBe('');
    expect(formatDocumentNumber(undefined)).toBe('');
  });
});
