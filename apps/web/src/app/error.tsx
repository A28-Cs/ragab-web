'use client';

import React from 'react';
import { WifiOff } from 'lucide-react';
import { EmptyState } from '../components/ui/EmptyState';
import { useLanguage } from '../context/LanguageContext';

export default function RouteError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const { t } = useLanguage();

  return (
    <div className="py-8">
      <EmptyState
        icon={<WifiOff className="w-8 h-8 text-ragab-danger" />}
        title={t.common.errorTitle}
        description={t.common.errorDesc}
        actionLabel={t.common.tryAgain}
        onAction={reset}
      />
    </div>
  );
}
