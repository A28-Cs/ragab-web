const fs = require('fs');
const file = 'packages/server/src/modules/catalog/service.ts';
let code = fs.readFileSync(file, 'utf8');

const replacement = `export async function listCategories(): Promise<Category[]> {
  return [
    {
      id: 'cat-med', slug: 'medications',
      nameAr: 'أدوية', nameEn: 'Medications',
      iconName: 'pill', image: 'https://placehold.co/400x400/14b8a6/FFF?text=Meds', colorTheme: 'blue',
      featured: true, descriptionAr: '', descriptionEn: '', parentId: null, itemCount: 10,
      createdAt: new Date(), updatedAt: new Date(), storeId: 'default', isActive: true, sortOrder: 1
    },
    {
      id: 'cat-care', slug: 'personal-care',
      nameAr: 'عناية شخصية', nameEn: 'Personal Care',
      iconName: 'heart', image: 'https://placehold.co/400x400/14b8a6/FFF?text=Care', colorTheme: 'teal',
      featured: true, descriptionAr: '', descriptionEn: '', parentId: null, itemCount: 15,
      createdAt: new Date(), updatedAt: new Date(), storeId: 'default', isActive: true, sortOrder: 2
    },
    {
      id: 'cat-baby', slug: 'baby-care',
      nameAr: 'مستلزمات أطفال', nameEn: 'Baby Care',
      iconName: 'baby', image: 'https://placehold.co/400x400/14b8a6/FFF?text=Baby', colorTheme: 'pink',
      featured: true, descriptionAr: '', descriptionEn: '', parentId: null, itemCount: 5,
      createdAt: new Date(), updatedAt: new Date(), storeId: 'default', isActive: true, sortOrder: 3
    }
  ] as unknown as Category[];
}`;

code = code.replace(/export async function listCategories\(\): Promise<Category\[\]> \{[\s\S]*?_categoriesCache = \{ data: result, ts: now \};\n    return result;\n  \}/, replacement);

const productsReplacement = `export async function getProducts(filters: ProductFiltersInput): Promise<Page<Product>> {
  const items = [
    {
      id: 'prod-1', slug: 'panadol',
      categoryId: 'cat-med', categoryNameAr: 'أدوية', categoryNameEn: 'Medications',
      nameAr: 'بنادول أدفانس 24 قرص', nameEn: 'Panadol Advance 24 Tab',
      price: 45, oldPrice: 50,
      inStock: true, stockQuantity: 100,
      image: 'https://placehold.co/400x400/14b8a6/FFF?text=Panadol',
      unitAr: 'علبة', unitEn: 'Box',
      isActive: true, isPopular: true, isEssential: true
    },
    {
      id: 'prod-2', slug: 'sensodyne',
      categoryId: 'cat-care', categoryNameAr: 'عناية شخصية', categoryNameEn: 'Personal Care',
      nameAr: 'سنسوداين ترميم وحماية', nameEn: 'Sensodyne Repair & Protect',
      price: 120, oldPrice: 150,
      inStock: true, stockQuantity: 50,
      image: 'https://placehold.co/400x400/14b8a6/FFF?text=Sensodyne',
      unitAr: 'قطعة', unitEn: 'Piece',
      isActive: true, isPopular: true, isEssential: true
    }
  ];
  return { items: items as unknown as Product[], hasMore: false, nextCursor: null };
}`;

code = code.replace(/export async function getProducts\(filters: ProductFiltersInput\): Promise<Page<Product>> \{[\s\S]*?return \{\n      items,\n      hasMore: useCursor \? hasMore : false,\n      nextCursor: useCursor && hasMore && last \? encodeProductCursor\(\{ id: last\.id, createdAt: last\.createdAtRaw \}\) : null,\n    \};\n  \}/, productsReplacement);

fs.writeFileSync(file, code, 'utf8');
