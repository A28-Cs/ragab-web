'use client';

import React, { useEffect, useState } from 'react';
import { useLanguage } from '../../context/LanguageContext';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../components/ui/Toast';
import { saveProduct } from '../../services/productService';
import { getCategories } from '../../services/categoryService';
import { Category, Product, ProductVariant } from '../../types';
import { ProductWizard } from '../../app/control-center/products/ProductWizard';

interface CreateProductModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: (product: Product) => void;
}

const blank: Product = {
  id: '',
  slug: '',
  nameAr: '',
  nameEn: '',
  categoryId: '',
  categoryNameAr: '',
  categoryNameEn: '',
  unitAr: 'قطعة',
  unitEn: 'pc',
  price: 0,
  inStock: true,
  stockQuantity: 0,
  image: '',
  images: [],
  descriptionAr: '',
};

export const CreateProductModal: React.FC<CreateProductModalProps> = ({
  isOpen,
  onClose,
  onSuccess,
}) => {
  const { t, isRTL } = useLanguage();
  const { permissions } = useAuth();
  const { showToast } = useToast();

  const [categories, setCategories] = useState<Category[]>([]);
  const [form, setForm] = useState<Product>(blank);
  const [nameError, setNameError] = useState('');
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    if (isOpen) {
      setForm(blank);
      setNameError('');
      getCategories().then(setCategories).catch(() => {});
    }
  }, [isOpen]);

  const set = (patch: Partial<Product>) => setForm((f) => ({ ...f, ...patch }));

  const onSave = async (finalProduct: Product) => {
    if (!finalProduct.nameAr.trim()) {
      setNameError(t.adminProducts?.nameRequired || (isRTL ? 'اسم المنتج بالعربي مطلوب' : 'Product name in Arabic is required'));
      return;
    }
    const cat = categories.find((c) => c.id === finalProduct.categoryId) ?? categories[0];
    setSaving(true);
    try {
      const saved = await saveProduct(
        {
          ...finalProduct,
          categoryId: cat?.id ?? '',
          categoryNameAr: cat?.nameAr ?? '',
          categoryNameEn: cat?.nameEn ?? '',
        },
        permissions,
      );
      showToast(isRTL ? 'تمت إضافة المنتج بنجاح' : 'Product added successfully', 'success');
      onSuccess?.(saved);
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('ragab:product_created', { detail: saved }));
      }
      onClose();
    } catch (e: any) {
      showToast(e?.message || (isRTL ? 'فشل إضافة المنتج' : 'Failed to add product'), 'error');
    } finally {
      setSaving(false);
    }
  };

  if (!isOpen) return null;

  return (
    <ProductWizard
      isOpen={isOpen}
      onClose={onClose}
      isEdit={false}
      form={form}
      set={set}
      categories={categories}
      nameError={nameError}
      saving={saving}
      onSave={onSave}
    />
  );
};
