'use client';

import React from 'react';
import { usePathname } from 'next/navigation';
import { Header } from './Header';
import { Footer } from './Footer';
import { MobileNavigation } from './MobileNavigation';
import { CartDrawer } from './CartDrawer';

const AUTH_ROUTES = /^\/(login|register|forgot-password|verify)(\/|$)/;

/**
 * Chooses the chrome for the current surface:
 *  - Control Center (/control-center)     → bare frame; the admin layout owns the shell
 *  - Auth (login/register/forgot/verify)  → minimal centered frame, no store chrome
 *  - Home (/)                             → store chrome, full-bleed main (the page owns its containers)
 *  - Everything else (storefront/account) → store chrome inside the page container
 */
export const AppFrame: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const pathname = usePathname() || '/';
  const isAdmin = pathname.startsWith('/control-center');
  const isAuth = AUTH_ROUTES.test(pathname);
  const isHome = pathname === '/';

  if (isAdmin) {
    return <>{children}</>;
  }

  if (isAuth) {
    return (
      <>
        <main className="flex-1 flex flex-col">{children}</main>
      </>
    );
  }

  return (
    <>
      <Header />
      <main className={isHome ? 'flex-1' : 'flex-1 container-page py-6 md:py-8'}>{children}</main>
      <CartDrawer />
      <Footer />
      <MobileNavigation />
    </>
  );
};
