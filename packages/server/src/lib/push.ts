/**
 * Push notification delivery (§26). Provider-agnostic, mirroring lib/sms.ts. The default
 * adapter only logs (no external send) so the app boots without push credentials. A real
 * FCM adapter (Firebase Cloud Messaging HTTP v1, which also bridges APNs on iOS) is a
 * single class implementing `PushProvider`, enabled in worker boot when a service account
 * is configured. Failures never throw; a token the provider reports as unregistered is
 * returned in `invalidTokens` so the caller can prune it (§26 token rotation/cleanup).
 */
import { serverEnv } from '../config/env';
import { logger } from './logger';
import { FcmPushProvider, parseServiceAccount } from './push-fcm';

export interface PushMessage {
  tokens: string[];
  titleAr: string;
  titleEn: string;
  bodyAr: string;
  bodyEn: string;
  /** Deep-link + metadata delivered as FCM data payload (§25). */
  data?: Record<string, string>;
}

export interface PushResult {
  delivered: number;
  /** Tokens FCM rejected as unregistered/invalid — caller should delete these. */
  invalidTokens: string[];
}

export interface PushProvider {
  send(msg: PushMessage): Promise<PushResult>;
}

/** Default adapter: records the send in logs, delivers nothing. Swap for a real gateway. */
class LoggingPushProvider implements PushProvider {
  async send(msg: PushMessage): Promise<PushResult> {
    logger().child({ component: 'push' }).info({ tokens: msg.tokens.length }, 'push skipped (no provider configured)');
    return { delivered: 0, invalidTokens: [] };
  }
}

let provider: PushProvider | null = null;

export function setPushProvider(p: PushProvider): void {
  provider = p;
}

/**
 * Resolve the provider once: an explicitly set one, else FCM when a service account is
 * configured, else the logging no-op. Lazy so the API process and the worker both pick
 * it up from the environment without a separate boot hook.
 */
function currentProvider(): PushProvider {
  if (provider) return provider;
  const json = serverEnv().FCM_SERVICE_ACCOUNT_JSON;
  if (json) {
    try {
      provider = new FcmPushProvider(parseServiceAccount(json));
      logger().child({ component: 'push' }).info('push provider: fcm');
      return provider;
    } catch (e) {
      logger().child({ component: 'push' }).error({ err: e }, 'FCM_SERVICE_ACCOUNT_JSON is invalid; push disabled');
    }
  }
  provider = new LoggingPushProvider();
  return provider;
}

export async function sendPush(msg: PushMessage): Promise<PushResult> {
  if (msg.tokens.length === 0) return { delivered: 0, invalidTokens: [] };
  try {
    return await currentProvider().send(msg);
  } catch {
    return { delivered: 0, invalidTokens: [] };
  }
}
