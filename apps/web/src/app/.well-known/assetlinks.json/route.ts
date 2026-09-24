/**
 * Android App Links verification (§25). Serves /.well-known/assetlinks.json so tapping a
 * https://<app-url> link opens the app instead of the browser. Fingerprints come from the
 * release signing cert(s) via MOBILE_ANDROID_SHA256 (comma-separated); empty until the app
 * is published, in which case an empty array is served (valid, just verifies nothing yet).
 */
import { NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export function GET() {
  const pkg = process.env.MOBILE_ANDROID_PACKAGE || 'sa.nextdigital.ragab';
  const fingerprints = (process.env.MOBILE_ANDROID_SHA256 || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);

  const body = fingerprints.length
    ? [
        {
          relation: ['delegate_permission/common.handle_all_urls'],
          target: { namespace: 'android_app', package_name: pkg, sha256_cert_fingerprints: fingerprints },
        },
      ]
    : [];

  return NextResponse.json(body, {
    headers: { 'content-type': 'application/json', 'cache-control': 'public, max-age=3600' },
  });
}
