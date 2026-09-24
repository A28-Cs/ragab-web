const fs = require('fs');
const file = 'packages/server/src/modules/catalog/service.ts';
let code = fs.readFileSync(file, 'utf8');

const startCat = code.indexOf('export async function listCategories(): Promise<Category[]> {');
const endCat = code.indexOf('export async function saveProduct', startCat);

if (startCat !== -1 && endCat !== -1) {
  const replacementCat = `export async function listCategories(): Promise<Category[]> {
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
}

  // ---- Admin mutations ----
  
  `;
  code = code.substring(0, startCat) + replacementCat + code.substring(endCat);
}

const startProd = code.indexOf('export async function getProducts(filters: ProductFiltersInput): Promise<Page<Product>> {');
const endProd = code.indexOf('export async function listProductsAdmin', startProd);

if (startProd !== -1 && endProd !== -1) {
  const replacementProd = `export async function getProducts(filters: ProductFiltersInput): Promise<Page<Product>> {
  const items = [
    {
      id: 'prod-1', slug: 'panadol',
      categoryId: 'cat-med', categoryNameAr: 'أدوية', categoryNameEn: 'Medications',
      nameAr: 'بنادول أدفانس 24 قرص', nameEn: 'Panadol Advance 24 Tab',
      price: 45, oldPrice: 50,
      inStock: true, stockQuantity: 100,
      image: 'https://placehold.co/400x400/14b8a6/FFF?text=Panadol',
      unitAr: 'علبة', unitEn: 'Box',
      isActive: true, isPopular: true, isEssential: true, variants: [], images: [],
      createdAt: new Date(), updatedAt: new Date(), storeId: 'default'
    },
    {
      id: 'prod-2', slug: 'sensodyne',
      categoryId: 'cat-care', categoryNameAr: 'عناية شخصية', categoryNameEn: 'Personal Care',
      nameAr: 'سنسوداين ترميم وحماية', nameEn: 'Sensodyne Repair & Protect',
      price: 120, oldPrice: 150,
      inStock: true, stockQuantity: 50,
      image: 'https://placehold.co/400x400/14b8a6/FFF?text=Sensodyne',
      unitAr: 'قطعة', unitEn: 'Piece',
      isActive: true, isPopular: true, isEssential: true, variants: [], images: [],
      createdAt: new Date(), updatedAt: new Date(), storeId: 'default'
    },
    {
      id: 'prod-3', slug: 'cetaphil',
      categoryId: 'cat-care', categoryNameAr: 'عناية شخصية', categoryNameEn: 'Personal Care',
      nameAr: 'غسول سيتافيل', nameEn: 'Cetaphil Cleanser',
      price: 350, oldPrice: 400,
      inStock: true, stockQuantity: 20,
      image: 'https://placehold.co/400x400/14b8a6/FFF?text=Cetaphil',
      unitAr: 'قطعة', unitEn: 'Piece',
      isActive: true, isPopular: true, isEssential: true, variants: [], images: [],
      createdAt: new Date(), updatedAt: new Date(), storeId: 'default'
    },
    {
      id: 'prod-4', slug: 'pampers',
      categoryId: 'cat-baby', categoryNameAr: 'مستلزمات أطفال', categoryNameEn: 'Baby Care',
      nameAr: 'بامبرز عناية فائقة مقاس 4', nameEn: 'Pampers Premium Care Size 4',
      price: 280, oldPrice: 320,
      inStock: true, stockQuantity: 30,
      image: 'https://placehold.co/400x400/14b8a6/FFF?text=Pampers',
      unitAr: 'عبوة', unitEn: 'Pack',
      isActive: true, isPopular: true, isEssential: true, variants: [], images: [],
      createdAt: new Date(), updatedAt: new Date(), storeId: 'default'
    }
  ];
  return { items: items as unknown as Product[], hasMore: false, nextCursor: null };
}

  /**
   * Control-center listing:`;
  code = code.substring(0, startProd) + replacementProd + code.substring(endProd + 28);
}


fs.writeFileSync(file, code, 'utf8');
console.log('Patched');
