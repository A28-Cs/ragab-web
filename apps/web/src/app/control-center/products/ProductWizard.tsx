'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { X, Tag, Package, ImagePlus as ImagePlusIcon, Check } from 'lucide-react';
import { cn } from '@ragab/utils';
import { useLanguage } from '../../../context/LanguageContext';
import { Category, Product, ProductVariant } from '../../../types';
import { Button } from '../../../components/ui/Button';
import { Input } from '../../../components/ui/Input';
import { Textarea } from '../../../components/ui/Textarea';
import { FormField } from '../../../components/ui/FormField';
import { Chip } from '../../../components/ui/Chip';
import { Switch } from '../../../components/ui/Switch';
import { ImageUpload } from '../../../components/ui/ImageUpload';
import { ImageGalleryUpload } from '../../../components/ui/ImageGalleryUpload';
import { categoryEmoji } from '../../../lib/categoryPresentation';

interface Section {
  id: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
}

interface ProductWizardProps {
  isOpen: boolean;
  onClose: () => void;
  isEdit: boolean;
  form: Product;
  set: (patch: Partial<Product>) => void;
  categories: Category[];
  nameError: string;
  saving: boolean;
  onSave: (finalProduct: Product) => void;
}

export const ProductWizard: React.FC<ProductWizardProps> = ({
  isOpen, onClose, isEdit, form, set, categories,
  nameError, saving, onSave,
}) => {
  const { t, language } = useLanguage();
  const ar = language === 'ar';

  // State for packaging and pricing
  const [packageCount, setPackageCount] = useState<number | ''>('');
  const [calcMethod, setCalcMethod] = useState<'piece' | 'weight'>('piece');
  const [unitsPerPackage, setUnitsPerPackage] = useState<number | ''>('');
  const [isWholesaleOnly, setIsWholesaleOnly] = useState(false);
  const [packagePrice, setPackagePrice] = useState<number | ''>('');
  const [unitPrice, setUnitPrice] = useState<number | ''>('');
  const [halfKiloPrice, setHalfKiloPrice] = useState<number | ''>('');
  const [quarterKiloPrice, setQuarterKiloPrice] = useState<number | ''>('');
  const [packageOldPrice, setPackageOldPrice] = useState<number | ''>('');
  const [unitOldPrice, setUnitOldPrice] = useState<number | ''>('');
  const [halfKiloOldPrice, setHalfKiloOldPrice] = useState<number | ''>('');
  const [quarterKiloOldPrice, setQuarterKiloOldPrice] = useState<number | ''>('');
  const [showEnglishName, setShowEnglishName] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    if (isEdit && form.variants && form.variants.length > 0) {
       const defVariant = form.variants.find(v => v.isDefault) || form.variants[0];
       const pieceVariant = form.variants.find(v => !v.isDefault && v.unitMeasure === 'pc');
       const weightVariant = form.variants.find(v => !v.isDefault && v.unitMeasure === 'kg');

       if (weightVariant) {
         setCalcMethod('weight');
         setPackageCount(defVariant.stockQuantity);
         setPackagePrice(defVariant.price);
         setUnitPrice(weightVariant.price);
         setUnitsPerPackage(defVariant.unitValue || '');
         setIsWholesaleOnly(false);
         
         const halfV = form.variants.find(v => !v.isDefault && v.unitMeasure === 'kg' && v.unitValue === 0.5);
         const quarterV = form.variants.find(v => !v.isDefault && v.unitMeasure === 'kg' && v.unitValue === 0.25);
         setHalfKiloPrice(halfV ? halfV.price : '');
         setQuarterKiloPrice(quarterV ? quarterV.price : '');
         
         setPackageOldPrice(defVariant.oldPrice || '');
         setUnitOldPrice(weightVariant.oldPrice || '');
         setHalfKiloOldPrice(halfV?.oldPrice || '');
         setQuarterKiloOldPrice(quarterV?.oldPrice || '');
       } else if (pieceVariant) {
         setCalcMethod('piece');
         setPackageCount(defVariant.stockQuantity);
         setPackagePrice(defVariant.price);
         setUnitPrice(pieceVariant.price);
         const stockRatio = defVariant.stockQuantity > 0 ? Math.round(pieceVariant.stockQuantity / defVariant.stockQuantity) : 0;
         setUnitsPerPackage(stockRatio || defVariant.unitValue || '');
         setIsWholesaleOnly(false);
         
         setPackageOldPrice(defVariant.oldPrice || '');
         setUnitOldPrice(pieceVariant.oldPrice || '');
         setHalfKiloOldPrice('');
         setQuarterKiloOldPrice('');
       } else {
         setCalcMethod(defVariant.unitMeasure === 'kg' ? 'weight' : 'piece');
         setPackageCount(defVariant.stockQuantity);
         setPackagePrice(defVariant.price);
         setUnitPrice('');
         setUnitsPerPackage(defVariant.unitValue || '');
         setIsWholesaleOnly(true);
         
         setPackageOldPrice(defVariant.oldPrice || '');
         setUnitOldPrice('');
         setHalfKiloOldPrice('');
         setQuarterKiloOldPrice('');
       }
    } else if (!isEdit) {
      setPackageCount('');
      setCalcMethod('piece');
      setUnitsPerPackage('');
      setIsWholesaleOnly(false);
      setPackagePrice('');
      setUnitPrice('');
      setPackageOldPrice('');
      setUnitOldPrice('');
      setHalfKiloOldPrice('');
      setQuarterKiloOldPrice('');
    } else {
       setCalcMethod('piece');
       setPackageCount(form.stockQuantity || '');
       setPackagePrice(form.price || '');
       setUnitPrice('');
       setUnitsPerPackage('');
       setIsWholesaleOnly(true);
       
       setPackageOldPrice(form.oldPrice || '');
       setUnitOldPrice('');
       setHalfKiloOldPrice('');
       setQuarterKiloOldPrice('');
    }
    
    if (form.nameEn) {
       setShowEnglishName(true);
    } else {
       setShowEnglishName(false);
    }
  }, [isOpen, isEdit, form]);

  const handleUnitPriceChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    const num = val ? Number(val) : '';
    setUnitPrice(num);
    if (calcMethod === 'weight' && typeof num === 'number') {
      setHalfKiloPrice(num / 2);
      setQuarterKiloPrice(num / 4);
    } else if (val === '') {
      setHalfKiloPrice('');
      setQuarterKiloPrice('');
    }
  };

  const handleUnitOldPriceChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    const num = val ? Number(val) : '';
    setUnitOldPrice(num);
    if (calcMethod === 'weight' && typeof num === 'number') {
      setHalfKiloOldPrice(num / 2);
      setQuarterKiloOldPrice(num / 4);
    } else if (val === '') {
      setHalfKiloOldPrice('');
      setQuarterKiloOldPrice('');
    }
  };

  const handleSave = () => {
    let variants: ProductVariant[] | undefined = undefined;
    
    const count = Number(packageCount) || 0;
    const units = Number(unitsPerPackage) || 1;
    const pPrice = Number(packagePrice) || 0;
    const uPrice = Number(unitPrice) || 0;
    const pOldPrice = Number(packageOldPrice) || undefined;
    const uOldPrice = Number(unitOldPrice) || undefined;
    const hOldPrice = Number(halfKiloOldPrice) || undefined;
    const qOldPrice = Number(quarterKiloOldPrice) || undefined;

    const baseSku = `${(form.nameEn || 'UNIT').toUpperCase().replace(/[^A-Z0-9]+/g, '-').slice(0, 20)}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;

    const oldVariants = form.variants || [];
    const getOldId = (idx: number) => oldVariants[idx]?.id || '';

    if (isWholesaleOnly) {
       variants = [{
         id: getOldId(0),
         sku: baseSku + '-PKG',
         nameAr: 'عبوة',
         nameEn: 'Package',
         unitAr: 'عبوة',
         unitEn: 'pkg',
         unitValue: 1,
         unitMeasure: 'pc',
         price: pPrice,
           oldPrice: pOldPrice,
         stockQuantity: count,
         inStock: true,
         isActive: true,
         isDefault: true,
         sortOrder: 0
       }];
    } else if (calcMethod === 'piece') {
       variants = [
         {
           id: getOldId(0),
           sku: baseSku + '-PKG',
           nameAr: `عبوة ${units} قطعة`,
           nameEn: `${units} pc Package`,
           unitAr: 'عبوة',
           unitEn: 'pkg',
           unitValue: units,
           unitMeasure: 'pc',
           price: pPrice,
           oldPrice: pOldPrice,
           stockQuantity: count,
           inStock: true,
           isActive: true,
           isDefault: true,
           sortOrder: 0
         },
         {
           id: getOldId(1),
           sku: baseSku + '-PC',
           nameAr: 'قطعة واحدة',
           nameEn: '1 Piece',
           unitAr: 'قطعة',
           unitEn: 'pc',
           unitValue: 1,
           unitMeasure: 'pc',
           price: uPrice,
           oldPrice: uOldPrice,
           stockQuantity: count * units,
           inStock: true,
           isActive: true,
           isDefault: false,
           sortOrder: 1
         }
       ];
    } else if (calcMethod === 'weight') {
       variants = [
         {
           id: getOldId(0),
           sku: baseSku + '-PKG',
           nameAr: `عبوة ${units} كجم`,
           nameEn: `${units} kg Package`,
           unitAr: 'عبوة',
           unitEn: 'pkg',
           unitValue: units,
           unitMeasure: 'kg',
           price: pPrice,
           oldPrice: pOldPrice,
           stockQuantity: count,
           inStock: true,
           isActive: true,
           isDefault: true,
           sortOrder: 0
         },
         {
           id: getOldId(1),
           sku: baseSku + '-1KG',
           nameAr: '1 كيلو جرام',
           nameEn: '1 kg',
           unitAr: 'كيلو',
           unitEn: 'kg',
           unitValue: 1,
           unitMeasure: 'kg',
           price: uPrice,
           oldPrice: uOldPrice,
           stockQuantity: count * units,
           inStock: true,
           isActive: true,
           isDefault: false,
           sortOrder: 1
         }
       ];

       const hPrice = Number(halfKiloPrice);
       if (hPrice > 0) {
         variants.push({
           id: getOldId(2),
           sku: baseSku + '-HALF',
           nameAr: 'نصف كيلو جرام',
           nameEn: '0.5 kg',
           unitAr: 'كيلو',
           unitEn: 'kg',
           unitValue: 0.5,
           unitMeasure: 'kg',
           price: hPrice,
           oldPrice: hOldPrice,
           stockQuantity: count * units,
           inStock: true,
           isActive: true,
           isDefault: false,
           sortOrder: 2
         });
       }

       const qPrice = Number(quarterKiloPrice);
       if (qPrice > 0) {
         variants.push({
           id: getOldId(3),
           sku: baseSku + '-QUARTER',
           nameAr: 'ربع كيلو جرام',
           nameEn: '0.25 kg',
           unitAr: 'كيلو',
           unitEn: 'kg',
           unitValue: 0.25,
           unitMeasure: 'kg',
           price: qPrice,
           oldPrice: qOldPrice,
           stockQuantity: count * units,
           inStock: true,
           isActive: true,
           isDefault: false,
           sortOrder: 3
         });
       }
    }

    const def = variants ? variants.find(v => v.isDefault)! : undefined;
    const finalProduct = {
      ...form,
      price: def ? def.price : pPrice,
      oldPrice: def ? def.oldPrice : pOldPrice,
      stockQuantity: def ? def.stockQuantity : count,
      unitAr: def ? def.unitAr! : (calcMethod === 'weight' ? 'كيلو' : 'قطعة'),
      unitEn: def ? def.unitEn! : (calcMethod === 'weight' ? 'kg' : 'pc'),
      variants
    };

    onSave(finalProduct);
  };

  const parentCategories = useMemo(() => {
    return categories
      .filter((c) => !c.parentId)
      .sort((a, b) => (b.itemCount ?? 0) - (a.itemCount ?? 0));
  }, [categories]);

  const [selectedParentId, setSelectedParentId] = useState<string>(() => {
    if (!form.categoryId) return '';
    const current = categories.find((c) => c.id === form.categoryId);
    return current?.parentId || current?.id || '';
  });

  useEffect(() => {
    if (form.categoryId) {
      const current = categories.find((c) => c.id === form.categoryId);
      if (current) {
        setSelectedParentId(current.parentId || current.id);
      }
    } else if (parentCategories.length > 0 && !selectedParentId) {
      setSelectedParentId(parentCategories[0].id);
    }
  }, [form.categoryId, categories, parentCategories, selectedParentId]);

  const selectedParentCategory = useMemo(() => {
    return categories.find((c) => c.id === selectedParentId);
  }, [categories, selectedParentId]);

  const subcategories = useMemo(() => {
    if (!selectedParentId) return [];
    return categories
      .filter((c) => c.parentId === selectedParentId)
      .sort((a, b) => (b.itemCount ?? 0) - (a.itemCount ?? 0));
  }, [categories, selectedParentId]);

  const sections: Section[] = [
    { id: 'basic', label: t.adminProducts.sectionBasic, icon: Tag },
    { id: 'price', label: ar ? 'التعبئة والتسعير' : 'Packaging & Pricing', icon: Package },
    { id: 'media', label: t.adminProducts.sectionMedia, icon: ImagePlusIcon },
  ];
  const [activeSection, setActiveSection] = useState(sections[0]!.id);
  const [mounted, setMounted] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const sectionRefs = useRef<Record<string, HTMLDivElement | null>>({});

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!isOpen) return;
    document.body.style.overflow = 'hidden';
    document.body.classList.add('has-modal-open');
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = '';
      document.body.classList.remove('has-modal-open');
      document.removeEventListener('keydown', onKey);
    };
  }, [isOpen, onClose]);

  useEffect(() => {
    if (!isOpen) return;
    const root = scrollRef.current;
    if (!root) return;
    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries.filter((e) => e.isIntersecting).sort((a, b) => b.intersectionRatio - a.intersectionRatio);
        const id = visible[0]?.target.getAttribute('data-section');
        if (id) setActiveSection(id);
      },
      { root, rootMargin: '-8% 0px -70% 0px', threshold: [0, 0.25, 0.5, 0.75, 1] }
    );
    Object.values(sectionRefs.current).forEach((el) => el && observer.observe(el));
    return () => observer.disconnect();
  }, [isOpen]);

  const scrollTo = (id: string) => sectionRefs.current[id]?.scrollIntoView({ behavior: 'smooth', block: 'start' });

  const progress = useMemo(() => {
    const checks = [
      !!form.nameAr.trim(),
      !!form.categoryId,
      Number(packagePrice) > 0,
      !!form.image,
      !!form.descriptionAr.trim(),
    ];
    return Math.round((checks.filter(Boolean).length / checks.length) * 100);
  }, [form.nameAr, form.categoryId, packagePrice, form.image, form.descriptionAr]);

  if (!isOpen || !mounted) return null;

  const modalContent = (
    <div
      className="fixed inset-0 z-[80] flex items-center justify-center p-2 sm:p-4"
      role="dialog"
      aria-modal="true"
      data-modal-open="true"
    >
      <div className="fixed inset-0 bg-black/50 backdrop-blur-[2px] animate-in fade-in duration-200" onClick={onClose} />

      <div className="relative w-full max-w-4xl bg-white rounded-2xl shadow-popover z-10 flex flex-col max-h-[95vh] sm:max-h-[90vh] animate-in zoom-in-95 duration-200">
        <div className="flex items-start justify-between gap-3 p-5 pb-4 shrink-0">
          <div className="text-start">
            <h2 className="text-h3 font-bold text-ragab-ink-800">{isEdit ? t.adminProducts.editProduct : t.adminProducts.createProduct}</h2>
            <p className="text-caption text-ragab-ink-500 mt-0.5">{t.adminProducts.wizardSubtitle}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label={t.common.close}
            className="p-1.5 -m-1.5 text-ragab-ink-400 hover:text-ragab-ink-800 rounded-lg hover:bg-ragab-ink-100 transition-colors focus-ring shrink-0"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="px-5 pb-4 shrink-0">
          <p className="text-caption font-semibold text-ragab-ink-500 mb-1.5">{progress}%</p>
          <div className="h-1.5 rounded-full bg-ragab-ink-100 overflow-hidden">
            <div className="h-full bg-ragab-brand-500 rounded-full transition-all duration-300" style={{ width: `${progress}%` }} />
          </div>
        </div>
        <div className="border-t border-ragab-ink-100" />

        <div className="flex-1 flex overflow-hidden">
          <div ref={scrollRef} className="flex-1 overflow-y-auto p-5 space-y-7">
            <div ref={(el) => { sectionRefs.current.basic = el; }} data-section="basic" className="space-y-3.5">
              <h3 className="flex items-center gap-2 text-h3 text-ragab-ink-800">
                <Tag className="w-4 h-4 text-ragab-brand-700" />
                {t.adminProducts.sectionBasic}
              </h3>
              <div className="space-y-3">
                <FormField label={ar ? 'اسم المنتج' : 'Product Name'} error={nameError || undefined} required>
                  <Input value={form.nameAr} placeholder={ar ? 'مثال: عصير جهينة برتقال' : 'Ex: Juhayna Orange Juice'} onChange={(e) => set({ nameAr: e.target.value })} invalid={!!nameError} />
                </FormField>

                {showEnglishName ? (
                  <FormField label={ar ? 'اسم المنتج بالإنجليزية' : 'Product Name (English)'}>
                    <Input dir="ltr" value={form.nameEn ?? ''} placeholder={t.adminProducts.nameEnPlaceholder} onChange={(e) => set({ nameEn: e.target.value })} />
                  </FormField>
                ) : (
                  <button type="button" onClick={() => setShowEnglishName(true)} className="text-body-sm font-bold text-ragab-brand-600 hover:text-ragab-brand-700 transition-colors focus-ring rounded">
                    + {ar ? 'إضافة اسم بالإنجليزية (اختياري)' : 'Add English Name (Optional)'}
                  </button>
                )}
              </div>
              <FormField label={t.adminProducts.category}>
                <div className="space-y-3">
                  <div className="flex flex-wrap items-center gap-2">
                    {parentCategories.map((c) => {
                      const isParentActive = selectedParentId === c.id;
                      return (
                        <Chip
                          key={c.id}
                          selected={isParentActive}
                          onClick={() => {
                            setSelectedParentId(c.id);
                            set({ categoryId: c.id });
                          }}
                          className={cn(
                            isParentActive &&
                              'bg-ragab-brand-500 text-ragab-ink-900 border-ragab-brand-600 font-bold shadow-sm'
                          )}
                        >
                          <span aria-hidden="true" className="text-base">
                            {categoryEmoji(c)}
                          </span>
                          <span>{ar ? c.nameAr : c.nameEn || c.nameAr}</span>
                        </Chip>
                      );
                    })}
                  </div>

                  {subcategories.length > 0 && (
                    <div className="p-3.5 bg-ragab-cream-soft/80 rounded-2xl border border-ragab-brand-300/80 space-y-2.5 animate-in fade-in slide-in-from-top-1 duration-150 shadow-subtle">
                      <div className="flex items-center gap-1.5 text-caption font-bold text-ragab-ink-700">
                        <span className="text-ragab-brand-700 font-extrabold text-sm">↳</span>
                        <span>
                          {ar
                            ? `فروع قسم (${selectedParentCategory?.nameAr}):`
                            : `Subcategories of (${selectedParentCategory?.nameEn || selectedParentCategory?.nameAr}):`}
                        </span>
                      </div>
                      <div className="flex flex-wrap items-center gap-2">
                        <Chip
                          selected={form.categoryId === selectedParentId}
                          onClick={() => set({ categoryId: selectedParentId })}
                          className={cn(
                            form.categoryId === selectedParentId &&
                              'bg-ragab-ink-800 text-white border-ragab-ink-800'
                          )}
                        >
                          <span>
                            {ar
                              ? `كل ${selectedParentCategory?.nameAr}`
                              : `All ${selectedParentCategory?.nameEn || selectedParentCategory?.nameAr}`}
                          </span>
                        </Chip>
                        {subcategories.map((sub) => {
                          const isSubSelected = form.categoryId === sub.id;
                          return (
                            <Chip
                              key={sub.id}
                              selected={isSubSelected}
                              onClick={() => set({ categoryId: sub.id })}
                              className={cn(
                                isSubSelected &&
                                  'bg-ragab-ink-800 text-white border-ragab-ink-800'
                              )}
                            >
                              <span>{ar ? sub.nameAr : sub.nameEn || sub.nameAr}</span>
                            </Chip>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>
              </FormField>
            </div>

            <div ref={(el) => { sectionRefs.current.price = el; }} data-section="price" className="space-y-3.5">
              <h3 className="flex items-center gap-2 text-h3 text-ragab-ink-800">
                <Package className="w-4 h-4 text-ragab-brand-700" />
                {ar ? 'التعبئة والتسعير' : 'Packaging & Pricing'}
              </h3>
              
              <div className="rounded-xl border border-ragab-ink-200 p-4 space-y-4">
                
                <div className="flex items-center justify-between gap-3 p-3 bg-ragab-cream-soft rounded-lg border border-ragab-ink-100">
                  <div className="text-start">
                    <p className="text-body-sm font-bold text-ragab-ink-800">{ar ? 'جملة فقط (لا تباع مكوناتها منفردة)' : 'Wholesale only (cannot sell individual items)'}</p>
                    <p className="text-caption text-ragab-ink-500 mt-0.5">{ar ? 'إذا تم التفعيل، ستباع العبوة كاملة ولن يطلب منك تحديد عدد قطع العبوة.' : 'If enabled, package is sold as a whole unit.'}</p>
                  </div>
                  <Switch checked={isWholesaleOnly} onChange={(v) => setIsWholesaleOnly(v)} label="Wholesale only" />
                </div>

                <FormField label={ar ? 'عدد العبوات الموجودة حالياً في المخزون' : 'Number of packages in stock'} required>
                  <Input type="number" dir="ltr" min={0} value={packageCount} onChange={(e) => setPackageCount(e.target.value ? Number(e.target.value) : '')} placeholder={ar ? "مثال: 20" : "Ex: 20"} />
                </FormField>

                {!isWholesaleOnly && (
                  <>
                    <div className="space-y-2">
                      <span className="text-body-sm font-bold text-ragab-ink-700">{ar ? 'طريقة الاحتساب' : 'Calculation Method'}:</span>
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => setCalcMethod('piece')}
                          className={cn(
                            'h-9 px-4 rounded-full border text-body-sm font-bold transition-colors focus-ring',
                            calcMethod === 'piece'
                              ? 'bg-ragab-brand-500 border-ragab-brand-500 text-ragab-ink-800'
                              : 'bg-white border-ragab-ink-200 text-ragab-ink-600 hover:border-ragab-ink-400'
                          )}
                        >
                          {ar ? 'بالقطعة' : 'By Piece'}
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                             setCalcMethod('weight');
                             if (typeof unitPrice === 'number' && unitPrice > 0) {
                               setHalfKiloPrice(unitPrice / 2);
                               setQuarterKiloPrice(unitPrice / 4);
                             }
                             if (typeof unitOldPrice === 'number' && unitOldPrice > 0) {
                               setHalfKiloOldPrice(unitOldPrice / 2);
                               setQuarterKiloOldPrice(unitOldPrice / 4);
                             }
                          }}
                          className={cn(
                            'h-9 px-4 rounded-full border text-body-sm font-bold transition-colors focus-ring',
                            calcMethod === 'weight'
                              ? 'bg-ragab-brand-500 border-ragab-brand-500 text-ragab-ink-800'
                              : 'bg-white border-ragab-ink-200 text-ragab-ink-600 hover:border-ragab-ink-400'
                          )}
                        >
                          {ar ? 'بالكيلو' : 'By Weight'}
                        </button>
                      </div>
                    </div>

                    <FormField label={calcMethod === 'weight' ? (ar ? 'وزن العبوة بالكيلو جرام' : 'Package weight in kg') : (ar ? 'عدد القطع داخل العبوة' : 'Pieces per package')} required>
                      <Input type="number" dir="ltr" min={0} step={calcMethod === 'weight' ? 0.1 : 1} value={unitsPerPackage} onChange={(e) => setUnitsPerPackage(e.target.value ? Number(e.target.value) : '')} placeholder={calcMethod === 'weight' ? (ar ? 'مثال: 5' : 'Ex: 5') : (ar ? 'مثال: 12' : 'Ex: 12')} />
                    </FormField>
                  </>
                )}

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <FormField label={ar ? (isWholesaleOnly ? 'سعر العبوة (ج.م)' : 'سعر بيع العبوة (سعر الجملة)') : 'Package Price (EGP)'} required>
                    <Input type="number" dir="ltr" min={0} value={packagePrice} onChange={(e) => setPackagePrice(e.target.value ? Number(e.target.value) : '')} placeholder={ar ? "مثال: 120" : "Ex: 120"} />
                  </FormField>
                  <FormField label={ar ? 'السعر قبل الخصم للعبوة (اختياري)' : 'Package Old Price (Optional)'}>
                    <Input type="number" dir="ltr" min={0} value={packageOldPrice} onChange={(e) => setPackageOldPrice(e.target.value ? Number(e.target.value) : '')} placeholder={ar ? "مثال: 150" : "Ex: 150"} />
                  </FormField>
                  
                  {!isWholesaleOnly && (
                    <>
                      <FormField label={calcMethod === 'weight' ? (ar ? 'سعر بيع 1 كجم (سعر القطاعي)' : '1 kg Price (Retail)') : (ar ? 'سعر بيع القطعة (سعر القطاعي)' : 'Piece Price (Retail)')} required>
                        <Input type="number" dir="ltr" min={0} value={unitPrice} onChange={handleUnitPriceChange} placeholder={ar ? "مثال: 12" : "Ex: 12"} />
                      </FormField>
                      <FormField label={ar ? 'السعر قبل الخصم (اختياري)' : 'Old Price (Optional)'}>
                        <Input type="number" dir="ltr" min={0} value={unitOldPrice} onChange={handleUnitOldPriceChange} placeholder={ar ? "مثال: 15" : "Ex: 15"} />
                      </FormField>
                    </>
                  )}

                  {!isWholesaleOnly && calcMethod === 'weight' && (
                    <>
                      <FormField label={ar ? 'سعر نصف كيلو (اختياري)' : '0.5 kg Price (Optional)'}>
                        <Input type="number" dir="ltr" min={0} value={halfKiloPrice} onChange={(e) => setHalfKiloPrice(e.target.value ? Number(e.target.value) : '')} placeholder={ar ? "مثال: 6" : "Ex: 6"} />
                      </FormField>
                      <FormField label={ar ? 'سعر نصف كيلو قبل الخصم' : '0.5 kg Old Price'}>
                        <Input type="number" dir="ltr" min={0} value={halfKiloOldPrice} onChange={(e) => setHalfKiloOldPrice(e.target.value ? Number(e.target.value) : '')} placeholder={ar ? "مثال: 8" : "Ex: 8"} />
                      </FormField>

                      <FormField label={ar ? 'سعر ربع كيلو (اختياري)' : '0.25 kg Price (Optional)'}>
                        <Input type="number" dir="ltr" min={0} value={quarterKiloPrice} onChange={(e) => setQuarterKiloPrice(e.target.value ? Number(e.target.value) : '')} placeholder={ar ? "مثال: 3" : "Ex: 3"} />
                      </FormField>
                      <FormField label={ar ? 'سعر ربع كيلو قبل الخصم' : '0.25 kg Old Price'}>
                        <Input type="number" dir="ltr" min={0} value={quarterKiloOldPrice} onChange={(e) => setQuarterKiloOldPrice(e.target.value ? Number(e.target.value) : '')} placeholder={ar ? "مثال: 4" : "Ex: 4"} />
                      </FormField>
                    </>
                  )}
                </div>
              </div>
            </div>

            <div ref={(el) => { sectionRefs.current.media = el; }} data-section="media" className="space-y-3.5">
              <h3 className="flex items-center gap-2 text-h3 text-ragab-ink-800">
                <ImagePlusIcon className="w-4 h-4 text-ragab-brand-700" />
                {t.adminProducts.sectionMedia}
              </h3>
              <FormField label={t.adminProducts.image}>
                <ImageUpload value={form.image} onChange={(v) => set({ image: v })} />
              </FormField>
              <FormField label={t.adminProducts.gallery} hint={t.adminProducts.galleryHint}>
                <ImageGalleryUpload value={form.images ?? []} onChange={(images) => set({ images })} />
              </FormField>
              <FormField label={t.adminProducts.descriptionAr}>
                <Textarea value={form.descriptionAr} placeholder={t.adminProducts.descriptionArPlaceholder} onChange={(e) => set({ descriptionAr: e.target.value })} />
              </FormField>
              <div className="grid grid-cols-1 xs:grid-cols-2 gap-3">
                <div className="flex items-center justify-between gap-3 rounded-xl border border-ragab-ink-200 p-3">
                  <div className="text-start">
                    <p className="text-body-sm font-bold text-ragab-ink-800">{t.adminProducts.essential}</p>
                    <p className="text-caption text-ragab-ink-500">{t.adminProducts.essentialHint}</p>
                  </div>
                  <Switch checked={!!form.isEssential} onChange={(v) => set({ isEssential: v })} label={t.adminProducts.essential} />
                </div>
                <div className="flex items-center justify-between gap-3 rounded-xl border border-ragab-ink-200 p-3">
                  <div className="text-start">
                    <p className="text-body-sm font-bold text-ragab-ink-800">{t.adminProducts.popular}</p>
                    <p className="text-caption text-ragab-ink-500">{t.adminProducts.popularHint}</p>
                  </div>
                  <Switch checked={!!form.isPopular} onChange={(v) => set({ isPopular: v })} label={t.adminProducts.popular} />
                </div>
              </div>
            </div>
          </div>

          <div className="hidden lg:block w-56 shrink-0 border-s border-ragab-ink-100 p-4">
            <nav className="flex flex-col gap-1 sticky top-4">
              {sections.map((s) => {
                const Icon = s.icon;
                const active = activeSection === s.id;
                return (
                  <button
                    key={s.id}
                    type="button"
                    onClick={() => scrollTo(s.id)}
                    className={cn(
                      'flex items-center gap-2.5 rounded-xl px-2.5 py-2.5 text-body-sm font-bold transition-colors focus-ring',
                      active ? 'bg-ragab-brand-100 text-ragab-ink-800' : 'text-ragab-ink-500 hover:bg-ragab-ink-50'
                    )}
                  >
                    <span
                      className={cn(
                        'flex items-center justify-center w-8 h-8 rounded-full shrink-0 transition-colors',
                        active ? 'bg-ragab-brand-500 text-ragab-ink-800' : 'bg-ragab-ink-100 text-ragab-ink-400'
                      )}
                    >
                      <Icon className="w-4 h-4" />
                    </span>
                    <span>{s.label}</span>
                  </button>
                );
              })}
            </nav>
          </div>
        </div>

        <div className="flex items-center gap-3 p-4 border-t border-ragab-ink-100 shrink-0 pb-[calc(1rem+env(safe-area-inset-bottom))] sm:pb-4">
          <Button variant="primary" className="flex-1" onClick={handleSave} isLoading={saving} leftIcon={<Check className="w-4 h-4" />}>
            {t.common.saveChanges}
          </Button>
          <Button variant="outline" onClick={onClose} disabled={saving}>
            {t.common.cancel}
          </Button>
        </div>
      </div>
    </div>
  );

  return typeof document !== 'undefined' ? createPortal(modalContent, document.body) : null;
};
