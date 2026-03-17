import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { portals } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import { encrypt } from '@/lib/crypto/encryption';

/**
 * POST /api/install
 *
 * Handles Bitrix24 app installation callback.
 * Bitrix24 sends a POST with FLAT auth data:
 *   AUTH_ID (access_token), REFRESH_ID (refresh_token), AUTH_EXPIRES,
 *   member_id, status, DOMAIN (in query), PLACEMENT, etc.
 *
 * Saves tokens, returns HTML that calls BX24.installFinish().
 */
export async function POST(request: NextRequest) {
  try {
    const contentType = request.headers.get('content-type') || '';
    let body: Record<string, string>;

    if (contentType.includes('application/json')) {
      body = await request.json();
    } else {
      const text = await request.text();
      const params = new URLSearchParams(text);
      body = Object.fromEntries(params.entries());
    }

    // Query params from Bitrix24
    const domain = request.nextUrl.searchParams.get('DOMAIN') || '';
    const appSid = request.nextUrl.searchParams.get('APP_SID') || ''; // THIS is the application_token

    // Flat fields from Bitrix24 install callback body
    const memberId = body.member_id || '';
    const authId = body.AUTH_ID || ''; // access_token
    const refreshId = body.REFRESH_ID || ''; // refresh_token
    const authExpires = body.AUTH_EXPIRES || '3600';
    const serverEndpoint = body.SERVER_ENDPOINT || '';
    const clientEndpoint = `https://${domain}/rest/`;

    console.log(`[install] Installation callback: domain=${domain}, member_id=${memberId}, has_auth=${!!authId}, app_sid=${appSid ? appSid.substring(0, 8) + '...' : 'none'}`);

    if (!memberId) {
      console.error('[install] Missing member_id in installation callback');
      return new NextResponse(getInstallHtml(), {
        status: 200,
        headers: { 'Content-Type': 'text/html; charset=utf-8' },
      });
    }

    // Find existing portal by memberId
    const existingPortal = db
      .select()
      .from(portals)
      .where(eq(portals.memberId, memberId))
      .get();

    if (existingPortal) {
      // Update portal with fresh tokens from installation
      const updates: Record<string, unknown> = {
        isActive: true,
        updatedAt: new Date().toISOString(),
      };

      // Clear appToken so trust-on-first-use saves the real application_token from webhook events
      updates.appToken = null;
      if (authId) {
        updates.accessToken = encrypt(authId);
        updates.tokenExpiresAt = new Date(Date.now() + parseInt(authExpires, 10) * 1000).toISOString();
      }
      if (refreshId) {
        updates.refreshToken = encrypt(refreshId);
      }
      if (domain) {
        updates.domain = domain;
      }
      if (clientEndpoint) {
        updates.clientEndpoint = clientEndpoint;
      }

      db.update(portals)
        .set(updates)
        .where(eq(portals.id, existingPortal.id))
        .run();

      console.log(`[install] Updated portal ${existingPortal.id} (${domain}) from install callback`);
    } else {
      console.log(`[install] No existing portal for member_id=${memberId}. Connect via OAuth first.`);
    }

    // Return HTML that calls BX24.installFinish() to complete installation
    return new NextResponse(getInstallHtml(), {
      status: 200,
      headers: { 'Content-Type': 'text/html; charset=utf-8' },
    });
  } catch (error) {
    console.error('[install] Error handling installation:', error);
    return new NextResponse(getInstallHtml(), {
      status: 200,
      headers: { 'Content-Type': 'text/html; charset=utf-8' },
    });
  }
}

/**
 * GET /api/install
 *
 * Serves the installation page when loaded in Bitrix24 iframe.
 */
export async function GET() {
  return new NextResponse(getInstallHtml(), {
    status: 200,
    headers: { 'Content-Type': 'text/html; charset=utf-8' },
  });
}

/**
 * HTML page that loads BX24 JS SDK and calls installFinish.
 */
function getInstallHtml(): string {
  return `<!DOCTYPE html>
<html lang="ru">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>TaskHub - Установка</title>
  <script src="https://api.bitrix24.com/api/v1/"></script>
  <style>
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      display: flex;
      align-items: center;
      justify-content: center;
      min-height: 100vh;
      margin: 0;
      background: #f5f7fa;
      color: #333;
    }
    .container { text-align: center; padding: 40px; }
    .spinner {
      width: 40px; height: 40px; margin: 0 auto 16px;
      border: 3px solid #e2e8f0; border-top-color: #2563eb;
      border-radius: 50%; animation: spin 0.8s linear infinite;
    }
    @keyframes spin { to { transform: rotate(360deg); } }
    h1 { font-size: 18px; font-weight: 600; margin: 0 0 8px; }
    p { font-size: 14px; color: #666; margin: 0; }
    .done { color: #16a34a; }
  </style>
</head>
<body>
  <div class="container">
    <div class="spinner" id="spinner"></div>
    <h1 id="title">Установка TaskHub...</h1>
    <p id="desc">Завершаем настройку приложения</p>
  </div>
  <script>
    BX24.init(function() {
      BX24.installFinish();
      document.getElementById('spinner').style.display = 'none';
      document.getElementById('title').textContent = 'TaskHub установлен';
      document.getElementById('title').classList.add('done');
      document.getElementById('desc').textContent = 'Приложение готово к работе.';
    });
  </script>
</body>
</html>`;
}
