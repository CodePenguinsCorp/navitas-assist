import { allowsFraction, quantityError } from './quantity-rules';

describe('Regras de quantidade', () => {
  it.each(['UN', 'und.', 'unid', 'unidade', 'pc', 'pç', 'peça', 'peca', 'par', 'jogo', 'kit', 'cx', 'caixa', 'rolo', '', 'desconhecida'])('trata %s como contável', unit => {
    expect(allowsFraction(unit)).toBe(false);
    expect(quantityError(3.5, unit)).toContain('Informe um número inteiro.');
    expect(quantityError(3, unit)).toBeNull();
  });
  it.each(['kg', 'G.', 'mg', 't', 'L', 'lt', 'litros', 'ml', 'm', 'metros', 'cm', 'mm', 'km', 'm2', 'm²', 'm3', 'm³', 'pol.', 'quilogramas', 'centímetro', 'polegadas'])('permite até 3 casas em %s', unit => {
    expect(allowsFraction(unit)).toBe(true);
    expect(quantityError(1.222, unit)).toBeNull();
    expect(quantityError(1.2222, unit)).toContain('3 casas');
  });
  it('valida limites, zero, nulos e valores não finitos', () => {
    for (const value of [0, -1, NaN, Infinity, 1000000000]) expect(quantityError(value, 'kg')).not.toBeNull();
    expect(quantityError(0, 'un', true)).toBeNull();
    expect(quantityError(0.1, 'un')).toBe('A unidade UN não aceita quantidade fracionada. Informe um número inteiro.');
    expect(allowsFraction(null)).toBe(false);
    expect(allowsFraction(undefined)).toBe(false);
  });
});
