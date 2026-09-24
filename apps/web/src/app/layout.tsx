import type { Metadata, Viewport } from 'next';
import { Cairo, Poppins } from 'next/font/google';
import './globals.css';
import { LanguageProvider } from '../context/LanguageContext';
import { AuthProvider } from '../context/AuthContext';
import { CartProvider } from '../context/CartContext';
import { FavoritesProvider } from '../context/FavoritesContext';
import { OrderEventsProvider } from '../context/OrderEventsContext';
import { AppFrame } from '../components/layout/AppFrame';
import { ToastProvider } from '../components/ui/Toast';

const cairo = Cairo({
  subsets: ['arabic', 'latin'],
  weight: ['400', '500', '600', '700', '800', '900'],
  variable: '--font-cairo',
  display: 'swap',
});

const poppins = Poppins({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
  variable: '--font-poppins',
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'صيدلية رجب — اطلب أدويتك أونلاين وتوصيل سريع',
  description: 'صيدلية رجب. اطلب أونلاين جميع احتياجاتك من الأدوية والمستلزمات الطبية والمنتجات الصحية بأفضل أسعار وتوصيل سريع لباب بيتك.',
  keywords: 'صيدلية رجب, أدوية, مستحضرات تجميل, عناية شخصية, صيدلية أونلاين, توصيل أدوية',
  openGraph: {
    title: 'صيدلية رجب - Ragab Pharmacy',
    description: 'صيدلية رجب للرعاية الصحية والأدوية.',
    type: 'website',
    locale: 'ar_EG',
  },
};

export const viewport: Viewport = {
  themeColor: '#14b8a6',
  width: 'device-width',
  initialScale: 1,
};

/**
 * Applies the persisted language direction before first paint so an
 * English-preferring returning visitor never sees an RTL flash.
 */
const langInitScript = `
try {
  var l = localStorage.getItem('ragab_lang');
  if (l === 'en') {
    document.documentElement.lang = 'en';
    document.documentElement.dir = 'ltr';
  }
} catch (e) {}
`;

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html
      lang="ar"
      dir="rtl"
      className={`h-full scroll-smooth ${cairo.variable} ${poppins.variable}`}
      suppressHydrationWarning
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: langInitScript }} />
      </head>
      <body className="flex flex-col min-h-full bg-ragab-bg text-ragab-ink-800 selection:bg-ragab-brand-500 selection:text-ragab-ink-800">
        <LanguageProvider>
          <ToastProvider>
            <AuthProvider>
              <OrderEventsProvider>
                <CartProvider>
                  <FavoritesProvider>
                    <AppFrame>{children}</AppFrame>
                  </FavoritesProvider>
                </CartProvider>
              </OrderEventsProvider>
            </AuthProvider>
          </ToastProvider>
        </LanguageProvider>
      </body>
    </html>
  );
}
