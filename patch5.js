const fs = require('fs');
const file = 'packages/server/src/modules/catalog/service.ts';
let code = fs.readFileSync(file, 'utf8');

code = code.replace(/export async function getPopularProducts\(limit = 8\): Promise<Product\[\]> \{[\s\S]*?\}\n  export async function getEssentialProducts\(limit = 8\): Promise<Product\[\]> \{[\s\S]*?\}\n  export async function getOfferProducts\(limit = 8\): Promise<Product\[\]> \{[\s\S]*?\}/, `export async function getPopularProducts(limit = 8): Promise<Product[]> {
  const page = await getProducts({});
  return page.items;
}
export async function getEssentialProducts(limit = 8): Promise<Product[]> {
  const page = await getProducts({});
  return page.items;
}
export async function getOfferProducts(limit = 8): Promise<Product[]> {
  const page = await getProducts({});
  return page.items;
}`);

fs.writeFileSync(file, code, 'utf8');
console.log('Patched');
