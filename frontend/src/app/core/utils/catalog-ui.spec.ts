import { extractHttpErrorMessage } from './catalog-ui';

describe('extractHttpErrorMessage', () => {
  const fallback = 'Não foi possível salvar agora.';

  it.each([
    null, undefined, false, 42, 'error', {}, new Error('unexpected'),
    { error: null }, { error: undefined }, { error: '<html>Bad gateway</html>' },
    { error: 17 }, { error: false }, { error: [] }, { error: {} },
    { error: { details: ['Detail without a message'] } }
  ])('uses the fallback for an unknown error shape: %j', (error) => {
    expect(extractHttpErrorMessage(error, fallback)).toBe(fallback);
  });

  it.each([42, true, {}, [], null, undefined, '', ' \t '].map((message) => ({ message })))(
    'uses the fallback for an unusable message: $message', ({ message }) => {
      expect(extractHttpErrorMessage({ error: { message, details: ['Detail'] } }, fallback)).toBe(fallback);
    }
  );

  it.each([false, 42, 'not an array', {}, null, undefined])(
    'keeps a valid message when details are not an array: %j', (details) => {
      expect(extractHttpErrorMessage({ error: { message: ' Saved failed ', details } }, fallback)).toBe('Saved failed');
    }
  );

  it('ignores nontext and blank details without losing valid entries or their order', () => {
    const error = { error: { message: 'Validation failed', details: ['first', null, 7, {}, false, '', '  ', ' second '] } };
    expect(extractHttpErrorMessage(error, fallback)).toBe('Validation failed: first |  second ');
  });

  it('trims a valid message with no details', () => {
    expect(extractHttpErrorMessage({ error: { message: '  Saving failed  ' } }, fallback)).toBe('Saving failed');
  });

  it('preserves the valid API message and ordered detail format', () => {
    const error = { error: { message: 'Validation failed', details: ['sku: required', 'name: required'] } };
    expect(extractHttpErrorMessage(error, fallback)).toBe('Validation failed: sku: required | name: required');
  });

  it('preserves an empty caller fallback for malformed responses', () => {
    expect(extractHttpErrorMessage({ error: { message: 500 } }, '')).toBe('');
  });

  it('preserves the exact conflict message consumed by bulk actions', () => {
    const conflict = 'RMA status changed. Refresh the item before trying again.';
    expect(extractHttpErrorMessage({ error: { message: conflict, details: [] } }, '')).toBe(conflict);
  });
});
