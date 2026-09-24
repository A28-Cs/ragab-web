/**
 * defineRoute — the single choke point every API route flows through (§13 complete
 * mediation, §54). It performs, in order:
 *   1. build request context (correlation id, principal resolution)
 *   2. rate limit
 *   3. CSRF / same-origin check on mutating methods
 *   4. authentication requirement
 *   5. authorization (permission) requirement
 *   6. Zod validation of body + query + params (mass-assignment safe via .strict())
 *   7. idempotency claim/replay
 *   8. run the handler, serialize success, persist idempotent result
 *   9. map any error to a safe envelope + access log
 * A route literally cannot forget one of these — they are not the handler's concern.
 */
import { z, type ZodType, type ZodTypeAny } from 'zod';
import { publicEnv } from '../config/env';
import {
  AuthenticationError,
  AuthorizationError,
  ValidationError,
} from '../lib/errors';
import { buildContext, type RequestContext, type RequestLike } from './context';
import { mapError, successBody } from './responses';
import { enforceRateLimit, RATE_RULES, type RateLimitRule } from '../security/rateLimit';
import { CSRF_COOKIE, CSRF_HEADER, isSameOrigin, verifyDoubleSubmit } from '../security/csrf';
import { can, type Action, type Resource } from '../security/permissions';
import {
  claimIdempotencyKey,
  completeIdempotencyKey,
  type IdempotencyClaim,
} from '../lib/idempotency';

type Method = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
const MUTATING: Method[] = ['POST', 'PUT', 'PATCH', 'DELETE'];

/** Derive the parsed (OUTPUT) type of an optional schema; `undefined`/empty when absent. */
type Parsed<S> = S extends ZodTypeAny ? z.infer<S> : undefined;

export interface RouteInput<B, Q, P> {
  body: B;
  query: Q;
  params: P;
  ctx: RequestContext;
  /** Raw request bytes — populated only when the route sets rawBody:true (uploads). */
  rawBody?: Buffer;
}

export interface RouteConfig<BS extends ZodTypeAny | undefined, QS extends ZodTypeAny | undefined, PS extends ZodTypeAny | undefined> {
  method: Method;
  /** 'required' rejects anonymous; 'optional' resolves if present; 'none' ignores auth. */
  auth?: 'required' | 'optional' | 'none';
  /** Requiring a permission implies auth:'required' and a staff account. */
  permission?: { resource: Resource; action: Action };
  rateLimit?: RateLimitRule;
  /** Defaults: true for mutating methods, false for GET. Webhooks set false explicitly. */
  csrf?: boolean;
  bodySchema?: BS;
  querySchema?: QS;
  paramsSchema?: PS;
  /** Enables idempotency; requires an `Idempotency-Key` header. `scope` namespaces keys. */
  idempotent?: { scope: string };
  rawBody?: boolean;
  /** The handler receives the SCHEMA OUTPUT types (defaults applied, coercions done). */
  handler: (input: RouteInput<Parsed<BS>, Parsed<QS>, Parsed<PS>>) => Promise<unknown> | unknown;
  /** Override the success status (default 200). */
  successStatus?: number;
}

/** Next.js route-handler signature: (req, context) with context.params possibly a Promise. */
type NextHandler = (
  req: RequestLike,
  context?: { params?: Record<string, string> | Promise<Record<string, string>> },
) => Promise<Response>;

/**
 * The rule a route gets when it names none (P3-7): staff endpoints, every mutating
 * endpoint and every signed-in read are bounded by default; only a public GET that
 * chose no rule stays unlimited (those all set `readApi` today). An explicit rule wins.
 */
export function defaultRateRule(config: { method: Method; permission?: unknown; auth?: 'required' | 'optional' | 'none' }): RateLimitRule | null {
  if (config.permission) return RATE_RULES.admin;
  if (MUTATING.includes(config.method)) return RATE_RULES.writeApi;
  if (config.auth === 'required') return RATE_RULES.authenticated;
  return null;
}

export function defineRoute<
  BS extends ZodTypeAny | undefined = undefined,
  QS extends ZodTypeAny | undefined = undefined,
  PS extends ZodTypeAny | undefined = undefined,
>(config: RouteConfig<BS, QS, PS>): NextHandler {
  const csrfRequired = config.csrf ?? MUTATING.includes(config.method);
  const rateRule = config.rateLimit ?? defaultRateRule(config);

  return async function route(req, nextCtx): Promise<Response> {
    const ctx = await buildContext(req);
    const started = Date.now();
    let idem: IdempotencyClaim | null = null;

    try {
      // 2. Rate limit (explicit rule, else the default for the route's shape)
      if (rateRule) {
        await enforceRateLimit(rateRule, ctx.rateIdentity());
      }

      // 3. Same-origin + CSRF on mutating requests. The Origin check runs on EVERY
      // mutating route — even auth entry points with csrf:false — which blocks
      // login-CSRF from a foreign origin. The double-submit token is additionally
      // required unless the route opts out (csrf:false), e.g. pre-session endpoints.
      //
      // Native (mobile) clients are exempt: CSRF only exists for AMBIENT credentials the
      // browser attaches by itself. A Bearer token is not ambient — the app sends it
      // deliberately, so no cross-site page can ride it. The exemption is deliberately
      // NARROW: a request still carrying the ambient session cookie is NEVER exempt, even
      // if it sends `X-Ragab-Client: mobile` — otherwise a same-origin XSS/attacker who
      // could set that header would sidestep CSRF. So the only exemptions are (a) a
      // Bearer-authenticated request, and (b) a native pre-session request (login/register)
      // that carries no cookie at all. See docs/backend/threat-model.md.
      const csrfExempt =
        ctx.authTransport === 'bearer' ||
        (ctx.isNativeClient && ctx.authTransport !== 'cookie');
      if (MUTATING.includes(config.method) && !csrfExempt) {
        const allowed = [publicEnv().NEXT_PUBLIC_APP_URL, process.env.NEXT_PUBLIC_APP_URL].filter(
          (v): v is string => Boolean(v),
        );
        // A CSRF failure is a FORBIDDEN request (403), never "not signed in" (401): the
        // clients treat 401 as an expired session and would sign the customer out over a
        // stale token or a proxy that dropped the Origin header.
        if (!isSameOrigin(ctx.origin, ctx.referer, allowed)) {
          throw new AuthorizationError({
            code: 'CSRF_ORIGIN_MISMATCH',
            message: { ar: 'طلب غير موثوق المصدر.', en: 'Request origin could not be verified.' },
          });
        }
        if (csrfRequired) {
          // Double-submit: the readable CSRF cookie must match the echoed header.
          if (!verifyDoubleSubmit(ctx.cookie(CSRF_COOKIE), ctx.header(CSRF_HEADER))) {
            throw new AuthorizationError({
              code: 'CSRF_TOKEN_INVALID',
              message: { ar: 'رمز الحماية غير صالح. أعد تحميل الصفحة وحاول مجددًا.', en: 'Invalid CSRF token. Reload the page and try again.' },
            });
          }
        }
      }

      // 4. Authentication
      const needsAuth = config.auth === 'required' || Boolean(config.permission);
      if (needsAuth && !ctx.principal) {
        throw new AuthenticationError({
          message: { ar: 'يجب تسجيل الدخول.', en: 'Authentication required.' },
        });
      }

      // 5. Authorization
      if (config.permission) {
        const p = ctx.principal!;
        if (!p.isStaff || !can(p.permissions, config.permission.resource, config.permission.action)) {
          ctx.log.warn(
            { resource: config.permission.resource, action: config.permission.action },
            'authorization denied',
          );
          throw new AuthorizationError({
            message: { ar: 'ليس لديك صلاحية لهذا الإجراء.', en: 'You do not have permission for this action.' },
            meta: { permission: `${config.permission.resource}:${config.permission.action}` },
          });
        }
      }

      // 6. Validation (schemas produce the OUTPUT types the handler is typed against)
      const rawParams = nextCtx?.params ? await nextCtx.params : {};
      const params = parse(config.paramsSchema, rawParams, 'params');
      const url = new URL(req.url);
      const query = parse(config.querySchema, Object.fromEntries(url.searchParams), 'query');
      let body: unknown = undefined;
      let rawBody: Buffer | undefined;
      if (config.rawBody) {
        const withArrayBuffer = req as RequestLike & { arrayBuffer?: () => Promise<ArrayBuffer> };
        rawBody = withArrayBuffer.arrayBuffer ? Buffer.from(await withArrayBuffer.arrayBuffer()) : undefined;
      } else if (config.bodySchema) {
        body = parse(config.bodySchema, await readJson(req), 'body');
      }

      // 7. Idempotency claim (mutating + configured)
      if (config.idempotent) {
        const key = ctx.header('idempotency-key');
        if (!key) {
          throw new ValidationError({
            code: 'IDEMPOTENCY_KEY_REQUIRED',
            message: {
              ar: 'مطلوب مفتاح Idempotency-Key لهذه العملية.',
              en: 'An Idempotency-Key header is required for this operation.',
            },
          });
        }
        idem = await claimIdempotencyKey({
          userId: ctx.principal?.userId ?? null,
          key,
          scope: config.idempotent.scope,
          body,
        });
        if (idem.replay) {
          return json(idem.responseStatus ?? 200, idem.responseBody, ctx.requestId, {
            'Idempotent-Replay': 'true',
          }, ctx.outgoingCookies);
        }
      }

      // 8. Handler. body/query/params are the validated OUTPUT values; the cast bridges
      // the erased generics (parse returns `any` at runtime, typed at the config boundary).
      const data = await config.handler({ body, query, params, ctx, rawBody } as RouteInput<Parsed<BS>, Parsed<QS>, Parsed<PS>>);
      const status = config.successStatus ?? 200;
      const payload = successBody(data, ctx.requestId);

      if (idem) {
        await completeIdempotencyKey(idem, status, payload);
      }

      ctx.log.info({ status, durationMs: Date.now() - started }, 'request completed');
      return json(status, payload, ctx.requestId, undefined, ctx.outgoingCookies);
    } catch (err) {
      const mapped = mapError(err, ctx.requestId);
      ctx.log.warn(
        { status: mapped.status, code: mapped.body.error.code, durationMs: Date.now() - started },
        'request failed',
      );
      return json(mapped.status, mapped.body, ctx.requestId, mapped.headers, ctx.outgoingCookies);
    }
  };
}

function parse<T>(schema: ZodType<T> | undefined, value: unknown, where: string): T {
  if (!schema) return value as T;
  const result = schema.safeParse(value);
  if (!result.success) {
    throw new ValidationError({
      message: { ar: 'المدخلات غير صحيحة.', en: 'Invalid input.' },
      details: { where, issues: flattenZod(result.error) },
    });
  }
  return result.data;
}

function flattenZod(error: z.ZodError): { path: string; message: string }[] {
  return error.issues.map((i) => ({ path: i.path.join('.'), message: i.message }));
}

async function readJson(req: RequestLike): Promise<unknown> {
  const withBody = req as RequestLike & { json?: () => Promise<unknown>; text?: () => Promise<string> };
  try {
    if (withBody.json) return await withBody.json();
    if (withBody.text) return JSON.parse(await withBody.text());
    return {};
  } catch {
    throw new ValidationError({
      code: 'MALFORMED_JSON',
      message: { ar: 'صيغة البيانات غير صحيحة.', en: 'Request body is not valid JSON.' },
    });
  }
}

function json(
  status: number,
  body: unknown,
  requestId: string,
  extraHeaders?: Record<string, string>,
  cookies?: string[],
): Response {
  const headers = new Headers({
    'content-type': 'application/json; charset=utf-8',
    'x-request-id': requestId,
    'cache-control': 'no-store',
    ...extraHeaders,
  });
  if (cookies) for (const c of cookies) headers.append('set-cookie', c);
  return new Response(JSON.stringify(body), { status, headers });
}
