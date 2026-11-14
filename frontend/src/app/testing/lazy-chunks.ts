/**
 * RmasComponent loads some chunks on demand (the protocols tab through a dynamic import and the
 * repair and parts panels through @defer). A spec that opens the detail view and ends right away
 * leaves those imports pending, and when the test environment is torn down the loader rejects with
 * EnvironmentTeardownError, which Vitest reports as an unhandled rejection (exit code 1).
 * Awaiting the same imports here lets them finish before the teardown, without hiding any error.
 */
export async function settleRmaLazyChunks(): Promise<void> {
  await Promise.all([
    import('../shared/rma-protocols/rma-protocols.component'),
    import('../shared/rma-repair-panel/rma-repair-panel.component'),
    import('../shared/rma-parts-panel/rma-parts-panel.component')
  ]);
  await new Promise<void>((resolve) => setTimeout(resolve));
}
