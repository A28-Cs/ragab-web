const fs = require('fs');
const file = 'packages/server/src/modules/catalog/service.ts';
let code = fs.readFileSync(file, 'utf8');

const popularReplacement = `export async function getPopularProducts(limit: number): Promise<Product[]> {
  const { items } = await getProducts({});
  return items;
}`;
code = code.replace(/export async function getPopularProducts\(limit: number\): Promise<Product\[\]> \{[\s\S]*?return attachImages\(rows, db\(\)\);\n  \}/, popularReplacement);

const essentialReplacement = `export async function getEssentialProducts(limit: number): Promise<Product[]> {
  const { items } = await getProducts({});
  return items;
}`;
code = code.replace(/export async function getEssentialProducts\(limit: number\): Promise<Product\[\]> \{[\s\S]*?return attachImages\(rows, db\(\)\);\n  \}/, essentialReplacement);

const offerReplacement = `export async function getOfferProducts(limit: number): Promise<Product[]> {
  const { items } = await getProducts({});
  return items;
}`;
code = code.replace(/export async function getOfferProducts\(limit: number\): Promise<Product\[\]> \{[\s\S]*?return attachImages\(rows, db\(\)\);\n  \}/, offerReplacement);

fs.writeFileSync(file, code, 'utf8');
