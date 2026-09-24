'use client';

import React from 'react';

/**
 * Root error boundary — renders without the app shell, so it defines
 * its own minimal html/body and uses no context providers.
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="ar" dir="rtl">
      <body style={{ fontFamily: 'Tajawal, sans-serif', background: '#FAF9F6', color: '#1F1F1F' }}>
        <div
          style={{
            minHeight: '100vh',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '12px',
            padding: '24px',
            textAlign: 'center',
          }}
        >
          <h1 style={{ fontSize: '1.5rem', fontWeight: 800 }}>حصلت مشكلة مؤقتة</h1>
          <p style={{ color: '#6B7280', maxWidth: '28rem' }}>
            تعذر تحميل الصفحة. حاول مرة أخرى، وإذا استمرت المشكلة تواصل معنا.
          </p>
          <button
            onClick={reset}
            style={{
              background: '#14b8a6',
              color: '#FFFFFF',
              fontWeight: 700,
              padding: '10px 24px',
              borderRadius: '8px',
              border: 'none',
              cursor: 'pointer',
            }}
          >
            حاول مرة أخرى
          </button>
        </div>
      </body>
    </html>
  );
}
