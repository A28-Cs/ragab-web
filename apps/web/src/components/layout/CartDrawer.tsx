'use client';

import React from 'react';
import Link from 'next/link';
import { ShoppingBag, ArrowLeft, CheckCircle2 } from 'lucide-react';
import { Drawer } from '../ui/Drawer';
import { useCart } from '../../context/CartContext';
import { useLanguage } from '../../context/LanguageContext';
import { Button } from '../ui/Button';
import { CartLineItem } from '../product/CartLineItem';

export const CartDrawer: React.FC = () => {
  const { t } = useLanguage();
  const {
    cart,
    isCartOpen,
    setIsCartOpen,
    subtotal,
    deliveryFee,
    total,
    freeDeliveryThreshold,
    freeDeliveryProgress,
    totalItems,
  } = useCart();

  const remainingForFreeDelivery = Math.max(0, freeDeliveryThreshold - subtotal);

  return (
    <Drawer
      isOpen={isCartOpen}
      onClose={() => setIsCartOpen(false)}
      title={`${t.navigation.cart} (${totalItems})`}
      size="md"
    >
      <div className="flex flex-col h-full justify-between">
        {/* Free delivery progress */}
        <div className="bg-ragab-cream/70 border border-ragab-brand-200 p-3 rounded-lg mb-4">
          <div className="text-caption font-bold text-ragab-ink-800 font-arabic mb-1.5">
            {remainingForFreeDelivery === 0 ? (
              <span className="flex items-center gap-1 text-ragab-success">
                <CheckCircle2 className="w-4 h-4" />
                {t.cart.freeDeliveryQualified}
              </span>
            ) : (
              <span>{t.cart.remaining.replace('{amount}', remainingForFreeDelivery.toFixed(2))}</span>
            )}
          </div>
          <div
            className="w-full h-2 bg-ragab-ink-200 rounded-full overflow-hidden"
            role="progressbar"
            aria-valuenow={Math.round(freeDeliveryProgress)}
            aria-valuemin={0}
            aria-valuemax={100}
          >
            <div
              className="h-full bg-ragab-brand-500 transition-all duration-300 rounded-full"
              style={{ width: `${freeDeliveryProgress}%` }}
            />
          </div>
        </div>

        {/* Items */}
        {cart.length === 0 ? (
          <div className="flex-1 flex flex-col items-center justify-center text-center p-6">
            <div className="w-16 h-16 rounded-full bg-ragab-cream flex items-center justify-center text-ragab-ink-800 mb-3">
              <ShoppingBag className="w-8 h-8" />
            </div>
            <h4 className="text-body font-bold text-ragab-ink-800 font-arabic mb-1">
              {t.cart.emptyTitle}
            </h4>
            <p className="text-caption text-ragab-ink-500 font-arabic mb-4 max-w-xs">
              {t.cart.emptyDesc}
            </p>
            <Button variant="primary" size="sm" onClick={() => setIsCartOpen(false)}>
              {t.cart.startShopping}
            </Button>
          </div>
        ) : (
          <div className="flex-1 overflow-y-auto divide-y divide-ragab-ink-100 pe-1">
            {cart.map((item) => (
              <CartLineItem
                key={item.product.id}
                item={item}
                variant="compact"
                onNavigate={() => setIsCartOpen(false)}
              />
            ))}
          </div>
        )}

        {/* Summary + checkout */}
        {cart.length > 0 && (
          <div className="pt-4 border-t border-ragab-ink-200 mt-4 flex flex-col gap-3 bg-white">
            <div className="space-y-1.5 text-body-sm font-arabic">
              <div className="flex justify-between text-ragab-ink-600">
                <span>{t.cart.subtotal}</span>
                <span>
                  {subtotal.toFixed(2)} {t.common.egp}
                </span>
              </div>
              <div className="flex justify-between text-ragab-ink-600">
                <span>{t.cart.deliveryFee}</span>
                <span>
                  {deliveryFee === 0 ? (
                    <span className="text-ragab-success font-bold">مجاناً</span>
                  ) : (
                    `${deliveryFee.toFixed(2)} ${t.common.egp}`
                  )}
                </span>
              </div>
              <div className="flex justify-between font-extrabold text-body text-ragab-ink-800 pt-2 border-t border-ragab-ink-100">
                <span>{t.cart.total}</span>
                <span>
                  {total.toFixed(2)} {t.common.egp}
                </span>
              </div>
            </div>

            <Link href="/checkout" onClick={() => setIsCartOpen(false)}>
              <Button variant="primary" fullWidth size="lg">
                <span>{t.cart.proceedToCheckout}</span>
                <ArrowLeft className="w-4 h-4 ltr:rotate-180" />
              </Button>
            </Link>
          </div>
        )}
      </div>
    </Drawer>
  );
};
