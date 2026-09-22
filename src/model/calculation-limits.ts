/** Shared watchdogs, not performance targets. User cancellation remains immediate. */
export const calculationTimeoutMs = 5 * 60_000;
/** A script may contain several sequential native calculations. */
export const scriptTimeoutMs = 15 * 60_000;
/** Transport must outlive the operation whose result or cancellation it carries. */
export const responseGraceMs = 15_000;
