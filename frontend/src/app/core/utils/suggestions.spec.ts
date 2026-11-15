import { mergeSuggestions } from './suggestions';

describe('mergeSuggestions', () => {
  it('soma as sugestões fixas às já usadas, sem repetir por caixa ou acento, em ordem alfabética', () => {
    expect(mergeSuggestions(['Fonte de alimentação', 'Display', 'Mecânica'], ['display', 'Fonte de alimentacao', 'Placa trincada', ' ']))
      .toEqual(['Display', 'Fonte de alimentação', 'Mecânica', 'Placa trincada']);
  });

  it('mantém só as fixas quando nada foi usado ainda', () => {
    expect(mergeSuggestions(['Sensor', 'PWM'], [])).toEqual(['PWM', 'Sensor']);
  });
});
