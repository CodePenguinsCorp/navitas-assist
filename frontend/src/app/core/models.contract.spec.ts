import { RmaResponse, SessionResponse } from './models';
import { buildRma } from '../testing/rma-fixtures';

/**
 * Contract with the Java records: the backend always sends `repairHistory` (possibly empty) and `email` (possibly null).
 * The `@ts-expect-error` lines fail the type check, and so the build of the specs, if the keys become optional again.
 */
describe('core/models contract', () => {
  it('requires repairHistory in the RMA detail', () => {
    // @ts-expect-error repairHistory is always present
    const missing: Pick<RmaResponse, 'repairHistory'> = {};
    expect(missing).toEqual({});
    expect(buildRma().repairHistory).toEqual([]);
  });

  it('requires the nullable email in the session', () => {
    // @ts-expect-error email is always present, possibly null
    const missing: SessionResponse = { username: 'ana', fullName: 'Ana', profileName: null, permissions: [] };
    const complete: SessionResponse = { ...missing, email: null };
    expect(complete.email).toBeNull();
  });
});
