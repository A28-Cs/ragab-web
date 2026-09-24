/**
 * SMS delivery (§23). Provider-agnostic interface with a logging adapter used until a
 * real Egyptian SMS gateway (e.g. Twilio, Vodafone, SMSMisr) is configured. Wiring a
 * real provider is a single adapter that implements `SmsProvider`. Failures never throw.
 */
import { serverEnv } from '../config/env';
import { logger } from './logger';
import { HttpSmsProvider } from './sms-http';

export interface SmsProvider {
  send(to: string, message: string): Promise<{ delivered: boolean }>;
}

/** Default adapter: records the SMS in logs (no external send). Swap for a real gateway. */
class LoggingSmsProvider implements SmsProvider {
  async send(to: string, _message: string): Promise<{ delivered: boolean }> {
    logger().child({ component: 'sms' }).info({ to: '[redacted]' }, 'sms skipped (no gateway configured)');
    return { delivered: false };
  }
}

let provider: SmsProvider | null = null;

export function setSmsProvider(p: SmsProvider): void {
  provider = p;
}

/** True when a real gateway is configured — phone OTP can actually be delivered. */
export function smsConfigured(): boolean {
  const env = serverEnv();
  return Boolean(env.SMS_GATEWAY_KIND && env.SMS_GATEWAY_URL);
}

/** Resolve once from the environment (see lib/push.ts for the same pattern). */
function currentProvider(): SmsProvider {
  if (provider) return provider;
  const env = serverEnv();
  if (env.SMS_GATEWAY_KIND && env.SMS_GATEWAY_URL) {
    provider = new HttpSmsProvider({
      kind: env.SMS_GATEWAY_KIND,
      url: env.SMS_GATEWAY_URL,
      username: env.SMS_GATEWAY_USERNAME,
      password: env.SMS_GATEWAY_PASSWORD,
      token: env.SMS_GATEWAY_TOKEN,
      senderId: env.SMS_SENDER_ID,
    });
    logger().child({ component: 'sms' }).info({ kind: env.SMS_GATEWAY_KIND }, 'sms provider configured');
    return provider;
  }
  provider = new LoggingSmsProvider();
  return provider;
}

export async function sendSms(to: string, message: string): Promise<{ delivered: boolean }> {
  try {
    return await currentProvider().send(to, message);
  } catch {
    return { delivered: false };
  }
}

export function otpSms(code: string): string {
  return `رمز التحقق الخاص بك في رجب هو: ${code} — Ragab code: ${code}`;
}
