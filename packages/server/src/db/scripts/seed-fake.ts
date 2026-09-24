import { db, closeDb } from '../client';
import * as s from '../schema';
import { v4 as uuidv4 } from 'uuid'; // I don't know if uuid is available.
// wait, server uses ulid
import { ulid } from 'ulid';

async function seedFake() {
  const d = db();
  
  const cat1 = ulid();
  const cat2 = ulid();

  await d.insert(s.categories).values([
    {
      id: cat1,
      slug: 'medications',
      nameAr: 'أدوية',
      nameEn: 'Medications',
      featured: true,
      displayOrder: 1,
    },
    {
      id: cat2,
      slug: 'personal-care',
      nameAr: 'عناية شخصية',
      nameEn: 'Personal Care',
      featured: true,
      displayOrder: 2,
    }
  ]).onConflictDoNothing();

  await d.insert(s.products).values([
    {
      id: ulid(),
      slug: 'panadol-advance',
      categoryId: cat1,
      nameAr: 'بنادول أدفانس 500 مجم 24 قرص',
      nameEn: 'Panadol Advance 500mg 24 Tablets',
      descriptionAr: 'مسكن للآلام وخافض للحرارة',
      descriptionEn: 'Pain reliever and fever reducer',
      price: '45.00',
      oldPrice: '50.00',
      inStock: true,
      stockQuantity: 100,
      image: 'https://placehold.co/400x400/14b8a6/FFF?text=Panadol',
      unitAr: 'علبة',
      unitEn: 'Box',
      isActive: true,
    },
    {
      id: ulid(),
      slug: 'panadol-extra',
      categoryId: cat1,
      nameAr: 'بنادول إكسترا 24 قرص',
      nameEn: 'Panadol Extra 24 Tablets',
      price: '55.00',
      inStock: true,
      stockQuantity: 50,
      image: 'https://placehold.co/400x400/14b8a6/FFF?text=Panadol+Extra',
      unitAr: 'علبة',
      unitEn: 'Box',
      isActive: true,
    },
    {
      id: ulid(),
      slug: 'sensodyne-repair',
      categoryId: cat2,
      nameAr: 'معجون أسنان سنسوداين ترميم وحماية 75 مل',
      nameEn: 'Sensodyne Repair & Protect Toothpaste 75ml',
      price: '120.00',
      inStock: true,
      stockQuantity: 30,
      image: 'https://placehold.co/400x400/14b8a6/FFF?text=Sensodyne',
      unitAr: 'قطعة',
      unitEn: 'Piece',
      isActive: true,
    },
    {
      id: ulid(),
      slug: 'cetaphil-cleanser',
      categoryId: cat2,
      nameAr: 'غسول سيتافيل اللطيف للبشرة 250 مل',
      nameEn: 'Cetaphil Gentle Skin Cleanser 250ml',
      price: '350.00',
      oldPrice: '400.00',
      inStock: true,
      stockQuantity: 15,
      image: 'https://placehold.co/400x400/14b8a6/FFF?text=Cetaphil',
      unitAr: 'قطعة',
      unitEn: 'Piece',
      isActive: true,
    }
  ]).onConflictDoNothing();

  console.log('Fake products inserted successfully!');
}

seedFake()
  .then(() => closeDb())
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
