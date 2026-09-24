const fs = require('fs');
const file = 'packages/server/src/modules/catalog/service.ts';
let code = fs.readFileSync(file, 'utf8');

const s1 = code.indexOf('export async function getPopularProducts');
const e3 = code.indexOf('export async function getProductsByIds', s1);

if (s1 !== -1 && e3 !== -1) {
  const replacement = `export async function getPopularProducts(limit = 8): Promise<Product[]> {
  const page = await getProducts({} as any);
  return page.items;
}
export async function getEssentialProducts(limit = 8): Promise<Product[]> {
  const page = await getProducts({} as any);
  return page.items;
}
export async function getOfferProducts(limit = 8): Promise<Product[]> {
  const page = await getProducts({} as any);
  return page.items;
}

/** Batch-fetch products by IDs (for recently-viewed, cart, etc). Storefront-visible only. */
`;
  code = code.substring(0, s1) + replacement + code.substring(e3);
  fs.writeFileSync(file, code, 'utf8');
  console.log("Patched successfully!");
} else {
  console.log("Could not find boundaries!", s1, e3);
}
