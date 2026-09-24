/**
 * Schema barrel. Drizzle's client and drizzle-kit both consume this. Order matters
 * only for readability — FKs are resolved by table object reference, not import order.
 */
export * from './_shared';
export * from './system';
export * from './identity';
export * from './authz';
export * from './catalog';
export * from './inventory';
export * from './shopping';
export * from './shipping';
export * from './orders';
export * from './payments';
export * from './promotions';
export * from './comms';
export * from './devices';
export * from './reviews';
