/**
 * Provider registry. Maps the order's paymentMethod to a provider. `vodafone_cash` /
 * `instapay` route to Paymob when online payments are configured, else to manual
 * transfer — resolved by the payments service from store config.
 */
import type { PaymentProvider, ProviderKey } from '../provider';
import { CodProvider } from './cod';
import { PaymobProvider } from './paymob';
import { ManualTransferProvider } from './manual';

const providers: Record<ProviderKey, PaymentProvider> = {
  cod: new CodProvider(),
  paymob: new PaymobProvider(),
  manual_transfer: new ManualTransferProvider(),
};

export function getProvider(key: ProviderKey): PaymentProvider {
  return providers[key];
}

export { CodProvider, PaymobProvider, ManualTransferProvider };
export { computePaymobHmac } from './paymob';
