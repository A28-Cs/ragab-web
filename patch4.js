const fs = require('fs');
const file = 'packages/server/src/modules/catalog/service.ts';
let code = fs.readFileSync(file, 'utf8');

const s1 = code.indexOf('export async function getPopularProducts(limit: number): Promise<Product[]> {');
const e1 = code.indexOf('export async function getEssentialProducts(limit: number): Promise<Product[]> {', s1);
if (s1 !== -1 && e1 !== -1) {
  code = code.substring(0, s1) + `export async function getPopularProducts(limit: number): Promise<Product[]> {
  const page = await getProducts({});
  return page.items;
}

` + code.substring(e1);
}

const s2 = code.indexOf('export async function getEssentialProducts(limit: number): Promise<Product[]> {');
const e2 = code.indexOf('export async function getOfferProducts(limit: number): Promise<Product[]> {', s2);
if (s2 !== -1 && e2 !== -1) {
  code = code.substring(0, s2) + `export async function getEssentialProducts(limit: number): Promise<Product[]> {
  const page = await getProducts({});
  return page.items;
}

` + code.substring(e2);
}

const s3 = code.indexOf('export async function getOfferProducts(limit: number): Promise<Product[]> {');
const e3 = code.indexOf('export async function getCategoryRow', s3);
if (s3 !== -1 && e3 !== -1) {
  code = code.substring(0, s3) + `export async function getOfferProducts(limit: number): Promise<Product[]> {
  const page = await getProducts({});
  return page.items;
}

` + code.substring(e3);
}

fs.writeFileSync(file, code, 'utf8');
console.log('Patched');
