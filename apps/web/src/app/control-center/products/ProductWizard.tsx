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
import {
  buildVariants,
  contentLabel,
  CONTENT_UNIT_ORDER,
  CONTENT_UNITS,
  EMPTY_PACKAGING,
  PACKAGE_TYPES,
  packageLabel,
  readPackaging,
  type PackageType,
  type PackagingState,
} from './pharmacyPackaging';

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

  // Pharmacy packaging & pricing — see ./pharmacyPackaging.ts.
  const [pkg, setPkg] = useState<PackagingState>(EMPTY_PACKAGING);
  const setP = (patch: Partial<PackagingState>) => setPkg((prev) => ({ ...prev, ...patch }));
  const num = (v: string): number | '' => (v === '' ? '' : Number(v));
  const [showEnglishName, setShowEnglishName] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    setPkg(isEdit ? readPackaging(form) : EMPTY_PACKAGING);
    setShowEnglishName(!!form.nameEn);
    // Re-seed only when the wizard opens or switches product, not on every keystroke.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, isEdit, form.id]);

  const selectPackageType = (type: PackageType) => {
    const def = PACKAGE_TYPES.find((t) => t.id === type)!.defaultContent;
    setP({ packageType: type, contentUnit: def, ...(type !== 'box' ? { sellByStrip: false } : {}) });
  };

  const handleSave = () => {
    const baseSku = `${(form.nameEn || 'UNIT').toUpperCase().replace(/[^A-Z0-9]+/g, '-').slice(0, 20)}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
    const variants = buildVariants(pkg, form.variants ?? [], baseSku);
    const def = variants[0]!;
    onSave({
      ...form,
      price: def.price,
      oldPrice: def.oldPrice,
      stockQuantity: def.stockQuantity,
      unitAr: def.unitAr!,
      unitEn: def.unitEn!,
      variants,
    });
  };

  const contentPreview = contentLabel(pkg.contentValue, pkg.contentUnit, ar ? 'ar' : 'en');
  const packagePreview = [packageLabel(pkg.packageType, ar ? 'ar' : 'en'), contentPreview].filter(Boolean).join(' ');
  const suggestedStripPrice =
    Number(pkg.price) > 0 && Number(pkg.stripsPerBox) > 1 ? Math.ceil((Number(pkg.price) / Number(pkg.stripsPerBox)) * 2) / 2 : null;

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
      Number(pkg.price) > 0,
      !!form.image,
      !!form.descriptionAr.trim(),
    ];
    return Math.round((checks.filter(Boolean).length / checks.length) * 100);
  }, [form.nameAr, form.categoryId, pkg.price, form.image, form.descriptionAr]);

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
                <div className="space-y-2">
                  <span className="text-body-sm font-bold text-ragab-ink-700">{ar ? 'نوع العبوة' : 'Package type'}</span>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                    {PACKAGE_TYPES.map((p) => {
                      const active = pkg.packageType === p.id;
                      return (
                        <button
                          key={p.id}
                          type="button"
                          onClick={() => selectPackageType(p.id)}
                          aria-pressed={active}
                          className={cn(
                            'rounded-xl border px-3 py-2 text-start transition-colors focus-ring',
                            active
                              ? 'bg-ragab-brand-100 border-ragab-brand-500 ring-1 ring-ragab-brand-500'
                              : 'bg-white border-ragab-ink-200 hover:border-ragab-ink-400'
                          )}
                        >
                          <span className="block text-body-sm font-bold text-ragab-ink-800">{ar ? p.ar : p.en}</span>
                          <span className="block text-caption text-ragab-ink-500 truncate">{ar ? p.hintAr : p.hintEn}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>

                <FormField
                  label={ar ? 'محتوى العبوة' : 'Package contents'}
                  hint={ar ? 'زي: 20 قرص، 120 مل شراب، 30 جم كريم — بيظهر للعميل تحت اسم المنتج' : 'e.g. 20 tablets, 120 ml syrup, 30 g cream — shown under the product name'}
                >
                  <div className="flex flex-col sm:flex-row gap-2">
                    <Input
                      type="number"
                      dir="ltr"
                      min={0}
                      className="sm:w-32"
                      value={pkg.contentValue}
                      onChange={(e) => setP({ contentValue: num(e.target.value) })}
                      placeholder={ar ? 'مثال: 20' : 'Ex: 20'}
                    />
                    <div className="flex flex-wrap gap-1.5">
                      {CONTENT_UNIT_ORDER.map((u) => (
                        <Chip key={u} selected={pkg.contentUnit === u} onClick={() => setP({ contentUnit: u })}>
                          {ar ? CONTENT_UNITS[u].ar : CONTENT_UNITS[u].en}
                        </Chip>
                      ))}
                    </div>
                  </div>
                </FormField>

                <p className="text-caption text-ragab-ink-600">
                  {ar ? 'هيظهر في المتجر:' : 'Shown in the store:'}{' '}
                  <span className="font-bold text-ragab-ink-800">{packagePreview}</span>
                </p>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <FormField label={ar ? 'عدد العبوات في المخزون' : 'Packages in stock'} required>
                    <Input type="number" dir="ltr" min={0} value={pkg.stock} onChange={(e) => setP({ stock: num(e.target.value) })} placeholder={ar ? 'مثال: 20' : 'Ex: 20'} />
                  </FormField>
                  <FormField label={ar ? `سعر ال${packageLabel(pkg.packageType, 'ar')} (ج.م)` : 'Package price (EGP)'} required>
                    <Input type="number" dir="ltr" min={0} value={pkg.price} onChange={(e) => setP({ price: num(e.target.value) })} placeholder={ar ? 'مثال: 120' : 'Ex: 120'} />
                  </FormField>
                  <FormField label={ar ? 'السعر قبل الخصم (اختياري)' : 'Old price (optional)'}>
                    <Input type="number" dir="ltr" min={0} value={pkg.oldPrice} onChange={(e) => setP({ oldPrice: num(e.target.value) })} placeholder={ar ? 'مثال: 150' : 'Ex: 150'} />
                  </FormField>
                </div>

                {pkg.packageType === 'box' && (
                  <div className="rounded-lg border border-ragab-ink-100 bg-ragab-cream-soft p-3 space-y-3">
                    <div className="flex items-center justify-between gap-3">
                      <div className="text-start">
                        <p className="text-body-sm font-bold text-ragab-ink-800">{ar ? 'بيع بالشريط كمان' : 'Also sell by strip'}</p>
                        <p className="text-caption text-ragab-ink-500 mt-0.5">
                          {ar
                            ? 'لو العلبة فيها أكتر من شريط والعميل يقدر يشتري شريط واحد.'
                            : 'When the box holds several strips and a single strip can be bought.'}
                        </p>
                      </div>
                      <Switch checked={pkg.sellByStrip} onChange={(v) => setP({ sellByStrip: v })} label={ar ? 'بيع بالشريط' : 'Sell by strip'} />
                    </div>

                    {pkg.sellByStrip && (
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                        <FormField label={ar ? 'عدد الشرائط في العلبة' : 'Strips per box'} required>
                          <Input type="number" dir="ltr" min={2} step={1} value={pkg.stripsPerBox} onChange={(e) => setP({ stripsPerBox: num(e.target.value) })} placeholder={ar ? 'مثال: 2' : 'Ex: 2'} />
                        </FormField>
                        <FormField
                          label={ar ? 'سعر الشريط (ج.م)' : 'Strip price (EGP)'}
                          hint={suggestedStripPrice ? (ar ? `العلبة ÷ الشرائط = ${suggestedStripPrice}` : `Box ÷ strips = ${suggestedStripPrice}`) : undefined}
                          required
                        >
                          <Input
                            type="number"
                            dir="ltr"
                            min={0}
                            value={pkg.stripPrice}
                            onChange={(e) => setP({ stripPrice: num(e.target.value) })}
                            placeholder={suggestedStripPrice ? String(suggestedStripPrice) : ar ? 'مثال: 60' : 'Ex: 60'}
                          />
                        </FormField>
                        <FormField label={ar ? 'سعر الشريط قبل الخصم' : 'Strip old price'}>
                          <Input type="number" dir="ltr" min={0} value={pkg.stripOldPrice} onChange={(e) => setP({ stripOldPrice: num(e.target.value) })} placeholder={ar ? 'اختياري' : 'Optional'} />
                        </FormField>
                      </div>
                    )}
                  </div>
                )}
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
