import * as Sentry from '@sentry/node';
import config from '../config';

let initialized = false;

/**
 * Initialize Sentry error tracking
 * Only initializes if SENTRY_DSN is set in environment
 */
export function initSentry(): void {
    if (initialized) return;

    if (!config.sentry.enabled || !config.sentry.dsn) {
        return;
    }

    Sentry.init({
        dsn: config.sentry.dsn,
        environment: config.sentry.environment,
        tracesSampleRate: config.sentry.tracesSampleRate,
        integrations: [
            Sentry.httpIntegration(),
        ],
        // Don't send PII
        sendDefaultPii: false,
    });

    initialized = true;
    console.log(`[Sentry] Initialized for environment: ${config.sentry.environment}`);

    // Send a test message to verify Sentry is working
    Sentry.captureMessage('Rijan WA Gateway started - Sentry initialized', 'info');
}

/**
 * Check if Sentry is enabled
 */
export function isSentryEnabled(): boolean {
    return config.sentry.enabled && initialized;
}

/**
 * Capture an exception to Sentry
 */
export function captureException(error: Error, context?: Record<string, any>): void {
    if (!isSentryEnabled()) return;

    Sentry.withScope((scope) => {
        if (context) {
            scope.setExtras(context);
        }
        Sentry.captureException(error);
    });
}

/**
 * Capture a message to Sentry
 */
export function captureMessage(message: string, level: Sentry.SeverityLevel = 'info', context?: Record<string, any>): void {
    if (!isSentryEnabled()) return;

    Sentry.withScope((scope) => {
        scope.setLevel(level);
        if (context) {
            scope.setExtras(context);
        }
        Sentry.captureMessage(message);
    });
}

/**
 * Set user context for Sentry
 */
export function setUser(user: { id?: string; email?: string; username?: string } | null): void {
    if (!isSentryEnabled()) return;
    Sentry.setUser(user);
}

/**
 * Set tag for Sentry context
 */
export function setTag(key: string, value: string): void {
    if (!isSentryEnabled()) return;
    Sentry.setTag(key, value);
}

/**
 * Flush Sentry events (call before process exit)
 */
export async function flushSentry(timeout = 2000): Promise<boolean> {
    if (!isSentryEnabled()) return true;
    return Sentry.close(timeout);
}

export { Sentry };
