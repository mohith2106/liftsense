/**
 * Client-side error reporting.
 *
 * This is a local no-op replacement for a previously hosted error-tracking
 * service. Wire this up to Sentry, LogRocket, or your own backend endpoint
 * if you want production error tracking.
 */
export function reportClientError(error: Error, context?: Record<string, unknown>): void {
  console.error("[LiftSense] Unhandled error:", error, context);
}
