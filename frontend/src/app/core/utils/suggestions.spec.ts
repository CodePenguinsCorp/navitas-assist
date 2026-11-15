import { of, throwError } from 'rxjs';
import { lazySuggestions, mergeSuggestions } from './suggestions';

describe('mergeSuggestions', () => {
  it('soma as sugestões fixas às já usadas, sem repetir por caixa ou acento, em ordem alfabética', () => {
    expect(mergeSuggestions(['Fonte de alimentação', 'Display', 'Mecânica'], ['display', 'Fonte de alimentacao', 'Placa trincada', ' ']))
      .toEqual(['Display', 'Fonte de alimentação', 'Mecânica', 'Placa trincada']);
  });

  it('mantém só as fixas quando nada foi usado ainda', () => {
    expect(mergeSuggestions(['Sensor', 'PWM'], [])).toEqual(['PWM', 'Sensor']);
  });
});

describe('lazySuggestions', () => {
  it('só busca as já usadas na primeira chamada de load e soma às iniciais', () => {
    const fetchUsed = vi.fn(() => of(['limpeza', 'Troca de conector']));
    const field = lazySuggestions(['Limpeza', 'Ressolda'], fetchUsed);
    expect(field.list()).toEqual(['Limpeza', 'Ressolda']);
    expect(fetchUsed).not.toHaveBeenCalled();
    field.load(); field.load();
    expect(fetchUsed).toHaveBeenCalledTimes(1);
    expect(field.list()).toEqual(['Limpeza', 'Ressolda', 'Troca de conector']);
  });

  it('tenta de novo no próximo foco quando a busca falha e mantém as iniciais', () => {
    const fetchUsed = vi.fn(() => throwError(() => new Error('falhou')));
    const field = lazySuggestions(['Ressolda'], fetchUsed);
    field.load(); field.load();
    expect(fetchUsed).toHaveBeenCalledTimes(2);
    expect(field.list()).toEqual(['Ressolda']);
  });
});
