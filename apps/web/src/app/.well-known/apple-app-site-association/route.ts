/**
 * iOS Universal Links association (§25). Serves /.well-known/apple-app-site-association
 * (no extension, application/json) so https://<app-url> links open the app. The app id is
 * TEAMID.bundleId via MOBILE_IOS_APP_ID; empty until registered, serving an empty apps list.
 */
import { NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export function GET() {
  const appId = (process.env.MOBILE_IOS_APP_ID || '').trim();
  const appIDs = appId ? [appId] : [];

  const body = {
    applinks: {
      apps: [],
      details: appIDs.length ? [{ appIDs, paths: ['/product/*', '/category/*', '/offers*', '/account/*', '/order-success*'] }] : [],
    },
  };

  return NextResponse.json(body, {
    headers: { 'content-type': 'application/json', 'cache-control': 'public, max-age=3600' },
  });
}
