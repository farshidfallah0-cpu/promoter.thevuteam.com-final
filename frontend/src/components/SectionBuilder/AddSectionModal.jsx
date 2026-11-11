import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  BarChart3, Camera, MapPin, CheckSquare, Package,
  Users, MessageSquare, Receipt, StickyNote, Star, Settings,
  Store, ShoppingBag, LayoutTemplate, BoxSelect,
  UserCheck, FileText, ShieldCheck, PhoneCall, LogOut, CheckCircle2,
  Hash, Type, AlignLeft, Cigarette, Pencil, Trash2
} from 'lucide-react';

const CATEGORIES = [
  { id: 'camera_checkin', title: 'اعلام ورود تصویری', icon: UserCheck, desc: 'ثبت عکس فقط از طریق دوربین مستقیم گوشی' },
  { id: 'bvt_cigarette_match', title: 'تطبیق سیگار BVT', icon: Cigarette, desc: 'سرچ سیگار مخاطب و پیشنهاد محصول متناسب بر اساس قطران/نیکوتین + تاریخچه توزیع و لوکیشن' },
  { id: 'bvt_sampling_report', title: 'گزارش سمپلینگ BVT', icon: Package, desc: 'کارت ۴ سیگار Pall Mall با باکس شمارنده جدا برای تعداد سمپل هر محصول (+/− یا تایپ)' },
  { id: 'brief_reader', title: 'مطالعه پروتکل رویداد', icon: FileText, desc: 'باز شدن مودال پروتکل و تایید مطالعه' },
  { id: 'advanced_checklist', title: 'چک‌لیست ۳ سطحی', icon: ShieldCheck, desc: 'سطح دسترسی پروموتر/کاپیتان/ست‌آپ و پیوست عکس' },
  { id: 'daily_report', title: 'ریپورت روزانه', icon: StickyNote, desc: 'پاراگراف خلاصه روزانه + پاراگراف مشکلات' },
  { id: 'team_directory', title: 'تیم رویداد', icon: PhoneCall, desc: 'نمایش اعضای تیم با دکمه تماس و SMS' },
  { id: 'camera_checkout', title: 'اعلام خروج تصویری', icon: LogOut, desc: 'ثبت عکس خروج پایان شیفت با دوربین گوشی' },
  { id: 'number', title: 'فیلد عدد', icon: Hash, desc: 'ورودی عددی — مثل تعداد سمپل، موجودی یا فروش' },
  { id: 'text', title: 'متن کوتاه', icon: Type, desc: 'یک خط متن آزاد — مثل نام محصول یا کد مغازه' },
  { id: 'textarea', title: 'متن بلند', icon: AlignLeft, desc: 'چند خط متن آزاد — برای توضیحات و یادداشت' },
  { id: 'rating', title: 'امتیازدهی ستاره‌ای', icon: Star, desc: 'امتیاز ۱ تا ۵ ستاره — رضایت مشتری یا کیفیت' },
  { id: 'expenses', title: 'ثبت هزینه', icon: Receipt, desc: 'ورودی مبلغ + توضیح هزینه' },
  { id: 'sales', title: 'فروش', icon: BarChart3, desc: 'رهگیری محصولات، تعداد و درآمد' },
  { id: 'photos', title: 'تصاویر چیدمان', icon: Camera, desc: 'دریافت عکس عمومی از پروموترها' },
  { id: 'gps', title: 'مکان‌یابی GPS', icon: MapPin, desc: 'ثبت مختصات دقیق جغرافیایی' },
  { id: 'inventory', title: 'موجودی انبار', icon: Package, desc: 'ردیابی سطح موجودی و سمپل‌ها' },
  { id: 'sampling_counter', title: 'تعداد سمپلینگ محصول', icon: Package, desc: 'شمارنده تعاملی سمپل با نمایش تعداد کل' },
  { id: 'feedback', title: 'بازخورد مشتری', icon: MessageSquare, desc: 'جمع‌آوری نظرات و فیدبک‌ها' },
  { id: 'custom', title: 'بخش سفارشی', icon: Settings, desc: 'ساخت بخش اختصاصی از صفر' }
];

const TEMPLATES = [
  { 
    id: 'tpl_sampling', 
    title: 'سمپلینگ اختصاصی (Sampling PRO)', 
    icon: Package, 
    desc: 'قالب پیشرفته سمپلینگ شامل اعلام ورود/خروج دوربین مستقیم، پروتکل تعاملی، چک‌لیست ۳ سطحی، ریپورت دوگانه و تیم رویداد.',
    sections: [
      { 
        type: 'camera_checkin', 
        title: 'اعلام ورود تصویری (دوربین مستقیم)', 
        required: true, 
        cameraOnly: true, 
        description: 'ثبت تصویر پروموتر تنها با دوربین مستقیم گوشی (انتخاب از گالری غیرفعال است).' 
      },
      { 
        type: 'brief_reader', 
        title: 'مطالعه و تایید پروتکل رویداد', 
        required: true, 
        description: 'پروتکل اختصاصی رویداد سمپلینگ و قوانین برند.',
        briefText: 'به رویداد سمپلینگ محصول خوش آمدید. نکات مهم:\n۱. پروموترها باید با لبخند و آراستگی کامل حضور داشته باشند.\n۲. نحوه پرزنت محصول: معرفی ۳ ویژگی اصلی و پخش سمپل.\n۳. حفظ نظافت استند و شمارش دقیق سمپل‌های توزیع شده.'
      },
      { 
        type: 'advanced_checklist', 
        title: 'چک‌لیست آماده‌سازی و کنترل کیفیت', 
        required: true, 
        description: 'وظایف تفکیک شده پروموتر، کاپیتان و تیم ست‌آپ همراه با پیوست عکس.',
        checklistItems: [
          { id: 1, title: 'تحویل استند و نمونه محصولات', permissions: { promoter: 'view', supervisor: 'view', setup: 'edit' }, attachPhoto: true, checked: false },
          { id: 2, title: 'چیدمان اولیه سمپل‌ها و پرچم‌ها', permissions: { promoter: 'edit', supervisor: 'edit', setup: 'view' }, attachPhoto: false, checked: false },
          { id: 3, title: 'تایید نهایی غرفه و پوشش پروموتر', permissions: { promoter: 'view', supervisor: 'edit', setup: 'view' }, attachPhoto: true, checked: false }
        ]
      },
      { 
        type: 'sampling_counter', 
        title: 'تعداد سمپلینگ محصول', 
        required: true, 
        description: 'شمارش و ثبت تعداد سمپل‌های توزیع شده.' 
      },
      {
        type: 'photos',
        title: 'تصاویر چیدمان',
        required: true,
        description: 'ثبت تصاویر مربوط به چیدمان و غرفه.'
      },
      { 
        type: 'daily_report', 
        title: 'ریپورت روزانه (خلاصه و مشکلات)', 
        required: true, 
        description: 'شامل پاراگراف خلاصه عملکرد روزانه و پاراگراف گزارش مشکلات.' 
      },
      { 
        type: 'team_directory', 
        title: 'تیم رویداد و ارتباط مستقیم', 
        required: false, 
        description: 'تماس تلفنی و پیامکی مستقیم با مدیر، کاپیتان و تیم ست‌آپ.',
        teamMembers: []
      },
      { 
        type: 'camera_checkout', 
        title: 'اعلام خروج تصویری (دوربین مستقیم)', 
        required: true, 
        cameraOnly: true, 
        description: 'ثبت تصویر پایان شیفت کاری تنها از طریق دوربین مستقیم گوشی.' 
      }
    ]
  },
  {
    id: 'tpl_bvt',
    title: 'BVT (تطبیق سیگار)',
    icon: Cigarette,
    desc: 'اعلام ورود دوربین مستقیم، تطبیق هوشمند سیگار مخاطب با محصولات BVT بر اساس قطران/نیکوتین، تاریخچه توزیع، لوکیشن هر توزیع و اعلام خروج.',
    sections: [
      {
        type: 'camera_checkin',
        title: 'اعلام ورود تصویری (دوربین مستقیم)',
        required: true,
        cameraOnly: true,
        description: 'ثبت تصویر پروموتر تنها با دوربین مستقیم گوشی (انتخاب از گالری غیرفعال است).'
      },
      {
        type: 'bvt_cigarette_match',
        title: 'تطبیق سیگار مخاطب با BVT',
        required: true,
        description: 'سیگار فعلی مخاطب را جستجو کن؛ سیستم بر اساس قطران و نیکوتین، مناسب‌ترین محصول BVT را پیشنهاد می‌دهد.'
      },
      {
        type: 'camera_checkout',
        title: 'اعلام خروج تصویری (دوربین مستقیم)',
        required: true,
        cameraOnly: true,
        description: 'ثبت تصویر پایان شیفت کاری تنها از طریق دوربین مستقیم گوشی.'
      }
    ]
  },
  {
    id: 'tpl_bvt_sampling',
    title: 'گزارش سمپلینگ BVT',
    icon: Cigarette,
    desc: 'اعلام ورود تصویری، ثبت تعداد سمپل هر یک از ۴ سیگار Pall Mall با باکس شمارنده جدا، گالری تصاویر (دوربین یا آپلود)، گزارش‌ها و مشکلات و اعلام خروج تصویری.',
    sections: [
      {
        type: 'camera_checkin',
        title: 'اعلام ورود تصویری (دوربین مستقیم)',
        required: true,
        cameraOnly: true,
        description: 'ثبت تصویر پروموتر تنها با دوربین مستقیم گوشی (انتخاب از گالری غیرفعال است).'
      },
      {
        type: 'bvt_sampling_report',
        title: 'گزارش سمپلینگ BVT',
        required: true,
        description: 'تعداد سمپل توزیع‌شده از هر سیگار را زیر همان محصول ثبت کنید؛ با دکمه‌های + و − یا با تایپ عدد.'
      },
      {
        type: 'photos',
        title: 'گالری تصاویر',
        required: true,
        photoSource: 'both',
        description: 'تصاویر غرفه و سمپلینگ را با دوربین بگیرید یا از گالری گوشی آپلود کنید.'
      },
      {
        type: 'daily_report',
        title: 'گزارش‌ها و مشکلات',
        required: true,
        description: 'خلاصه عملکرد روزانه و گزارش مشکلات و چالش‌ها.'
      },
      {
        type: 'camera_checkout',
        title: 'اعلام خروج تصویری (دوربین مستقیم)',
        required: true,
        cameraOnly: true,
        description: 'ثبت تصویر پایان شیفت کاری تنها از طریق دوربین مستقیم گوشی.'
      }
    ]
  },
  {
    id: 'tpl_mehram_supermarket',
    title: 'گزارش سوپرمارکت (مهرام)',
    icon: Store,
    desc: 'گزارش سوپرمارکت (انتخاب شهر و سوپرمارکت، تماس اجباری با فروشنده، سلفی با سردر فروشگاه، عکس پوستر و شلف قبل/بعد فقط با دوربین، سوالات چندگزینه‌ای شلف، وضعیت گروه محصولات با عکس) و گزارش‌ها و مشکلات.',
    sections: [
      {
        type: 'mehram_supermarket_report',
        title: 'گزارش سوپرمارکت (مهرام)',
        required: true,
        description: 'شهر و سوپرمارکت را انتخاب کنید، ابتدا با فروشنده تماس بگیرید، سلفی با سردر فروشگاه بگیرید، عکس پوستر پشت محصولات و شلف قبل/بعد از مرتب‌سازی را بگیرید، به سوالات شلف پاسخ دهید و وضعیت گروه محصولات را همراه با عکس ثبت کنید.'
      },
      {
        type: 'daily_report',
        title: 'گزارش‌ها و مشکلات',
        required: true,
        description: 'خلاصه عملکرد روزانه و گزارش مشکلات و چالش‌ها.'
      }
    ]
  },
  {
    id: 'tpl_merchandising',
    title: 'مرچندایزینگ (Merchandising)', 
    icon: Store, 
    desc: 'گزارش چیدمان فروشگاهی، چک کردن موجودی شلف و لیبل قیمت‌ها.',
    sections: [
      { type: 'gps', title: 'موقعیت فروشگاه', required: true },
      { type: 'photos', title: 'عکس‌های قبل و بعد از چیدمان', required: true },
      { type: 'advanced_checklist', title: 'بررسی شلف و لیبل‌ها', required: true, description: 'آیا قیمت‌ها درست است؟ آیا محصول رقبا کنار ماست؟' },
      { type: 'inventory', title: 'کسری موجودی در شلف', required: true },
      { type: 'notes', title: 'گزارش تعامل با مدیر فروشگاه', required: false }
    ]
  },
  { 
    id: 'tpl_sales', 
    title: 'فروش مستقیم (Direct Sales)', 
    icon: ShoppingBag, 
    desc: 'گزارش فروش مویرگی یا فروش در نقطه خرید با ثبت فاکتور.',
    sections: [
      { type: 'camera_checkin', title: 'اعلام ورود پروموتر', required: true },
      { type: 'sales', title: 'گزارش فروش ریالی / تعدادی', required: true },
      { type: 'daily_report', title: 'گزارش روزانه و چالش‌ها', required: true },
      { type: 'camera_checkout', title: 'اعلام خروج پروموتر', required: true }
    ]
  }
];

const API_URL = import.meta.env.VITE_API_URL || "http://localhost:8000";

const AddSectionModal = ({ isOpen, onClose, onSelect, onSelectTemplate, onEditTemplate }) => {
  const [activeTab, setActiveTab] = React.useState('templates'); // 'templates' or 'sections'
  const [customTemplates, setCustomTemplates] = React.useState([]);

  const fetchCustomTemplates = React.useCallback(async () => {
    try {
      const token = localStorage.getItem('token');
      const res = await fetch(`${API_URL}/admin/templates`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        const mapped = data.map(t => ({
          id: `tpl_custom_${t.id}`,
          dbId: t.id,
          title: t.name,
          icon: LayoutTemplate,
          desc: t.description || 'قالب اختصاصی ذخیره شده',
          rawDescription: t.description || '',
          sections: t.sections,
          isCustom: true
        }));
        setCustomTemplates(mapped);
      }
    } catch (e) {
      console.error("Error fetching custom templates:", e);
    }
  }, []);

  React.useEffect(() => {
    if (isOpen && activeTab === 'templates') {
      fetchCustomTemplates();
    }
  }, [isOpen, activeTab, fetchCustomTemplates]);

  const handleDeleteTemplate = async (e, tpl) => {
    e.stopPropagation();
    if (!confirm(`آیا از حذف قالب «${tpl.title}» مطمئن هستید؟`)) return;
    try {
      const token = localStorage.getItem('token');
      const res = await fetch(`${API_URL}/admin/templates/${tpl.dbId}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) {
        setCustomTemplates(prev => prev.filter(t => t.dbId !== tpl.dbId));
      }
    } catch (e) {
      console.error("Error deleting template:", e);
    }
  };

  const handleEditTemplate = (e, tpl) => {
    e.stopPropagation();
    onEditTemplate?.({ id: tpl.dbId, name: tpl.title, description: tpl.rawDescription, sections: tpl.sections });
  };

  const ALL_TEMPLATES = [...customTemplates, ...TEMPLATES];

  if (!isOpen) return null;

  return (
    <AnimatePresence>
      <motion.div 
        initial={{ opacity: 0 }} 
        animate={{ opacity: 1 }} 
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-[99999] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
        onClick={onClose}
      >
        <motion.div 
          initial={{ scale: 0.95, opacity: 0, y: 20 }}
          animate={{ scale: 1, opacity: 1, y: 0 }}
          exit={{ scale: 0.95, opacity: 0, y: 20 }}
          onClick={(e) => e.stopPropagation()}
          className="border shadow-2xl rounded-2xl w-full max-w-4xl max-h-[85vh] overflow-hidden flex flex-col transition-colors duration-300"
          style={{
            background: 'var(--bg-secondary)',
            borderColor: 'var(--border-color)'
          }}
        >
          <div className="p-6 border-b flex justify-between items-center" style={{ borderColor: 'var(--border-color)' }} dir="rtl">
            <div>
              <h2 className="text-lg font-bold" style={{ color: 'var(--text-primary)' }}>افزودن به گزارش</h2>
              <p className="text-xs mt-1" style={{ color: 'var(--text-secondary)' }}>یک قالب آماده انتخاب کنید یا بخش‌های تکی را بسازید.</p>
            </div>
            <div className="flex items-center gap-4">
              {/* Tabs */}
              <div className="flex p-1 rounded-xl border" style={{ background: 'var(--bg-input)', borderColor: 'var(--border-color)' }}>
                <button
                  onClick={() => setActiveTab('templates')}
                  className={`flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                    activeTab === 'templates' 
                      ? 'bg-indigo-600 text-white shadow-sm' 
                      : 'hover:opacity-80'
                  }`}
                  style={activeTab !== 'templates' ? { color: 'var(--text-secondary)' } : {}}
                >
                  <LayoutTemplate size={14} />
                  قالب‌های آماده
                </button>
                <button
                  onClick={() => setActiveTab('sections')}
                  className={`flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                    activeTab === 'sections' 
                      ? 'bg-indigo-600 text-white shadow-sm' 
                      : 'hover:opacity-80'
                  }`}
                  style={activeTab !== 'sections' ? { color: 'var(--text-secondary)' } : {}}
                >
                  <BoxSelect size={14} />
                  بخش‌های تکی
                </button>
              </div>

              <button 
                onClick={onClose}
                className="w-8 h-8 rounded-full flex items-center justify-center transition-colors text-xs"
                style={{ background: 'var(--bg-input)', color: 'var(--text-secondary)' }}
              >
                ✕
              </button>
            </div>
          </div>

          <div className="p-6 overflow-y-auto" dir="rtl">
            {activeTab === 'templates' ? (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {ALL_TEMPLATES.map((tpl) => {
                  const Icon = tpl.icon;
                  return (
                    <div 
                      key={tpl.id}
                      onClick={() => {
                        onSelectTemplate(tpl.sections);
                        onClose();
                      }}
                      className="group flex flex-col p-5 rounded-2xl border cursor-pointer transition-all duration-200 relative overflow-hidden shadow-xs hover:shadow-md hover:border-indigo-500"
                      style={{
                        background: 'var(--bg-card)',
                        borderColor: 'var(--border-color)'
                      }}
                    >
                      <div className="absolute -left-4 -bottom-4 opacity-5 transform rotate-12 scale-150" style={{ color: 'var(--text-primary)' }}>
                        <Icon size={120} />
                      </div>
                      {tpl.isCustom && (
                        <div className="absolute top-3 left-3 z-20 flex gap-1.5 opacity-0 group-hover:opacity-100 transition-opacity">
                          <button
                            onClick={(e) => handleEditTemplate(e, tpl)}
                            title="ویرایش قالب"
                            className="w-7 h-7 rounded-lg bg-indigo-500/10 text-indigo-500 hover:bg-indigo-500/20 flex items-center justify-center transition-colors"
                          >
                            <Pencil size={13} />
                          </button>
                          <button
                            onClick={(e) => handleDeleteTemplate(e, tpl)}
                            title="حذف قالب"
                            className="w-7 h-7 rounded-lg bg-red-500/10 text-red-500 hover:bg-red-500/20 flex items-center justify-center transition-colors"
                          >
                            <Trash2 size={13} />
                          </button>
                        </div>
                      )}
                      <div className="flex items-center gap-3.5 mb-2 relative z-10">
                        <div className="w-11 h-11 rounded-xl flex items-center justify-center transition-colors shadow-xs"
                             style={{ background: 'var(--primary-light)', color: 'var(--primary-color)' }}>
                          <Icon size={22} />
                        </div>
                        <div>
                          <h3 className="font-bold text-base" style={{ color: 'var(--text-primary)' }}>{tpl.title}</h3>
                          <span className="text-[10px] px-2 py-0.5 rounded-full mt-1 inline-block border font-medium"
                                style={{ background: 'var(--bg-input)', borderColor: 'var(--border-color)', color: 'var(--text-muted)' }}>
                            {tpl.sections.length} فیلد آماده
                          </span>
                        </div>
                      </div>
                      <p className="text-xs leading-relaxed relative z-10 mt-1" style={{ color: 'var(--text-secondary)' }}>{tpl.desc}</p>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3.5">
                {CATEGORIES.map((cat) => {
                  const Icon = cat.icon;
                  return (
                    <div 
                      key={cat.id}
                      onClick={() => {
                        onSelect(cat);
                        onClose();
                      }}
                      className="group flex flex-col p-4 rounded-2xl border cursor-pointer transition-all duration-200 shadow-xs hover:shadow-md hover:border-indigo-500"
                      style={{
                        background: 'var(--bg-card)',
                        borderColor: 'var(--border-color)'
                      }}
                    >
                      <div className="w-9 h-9 rounded-xl flex items-center justify-center mb-3 transition-colors"
                           style={{ background: 'var(--primary-light)', color: 'var(--primary-color)' }}>
                        <Icon size={18} />
                      </div>
                      <h3 className="font-bold text-sm mb-1" style={{ color: 'var(--text-primary)' }}>{cat.title}</h3>
                      <p className="text-xs leading-relaxed" style={{ color: 'var(--text-muted)' }}>{cat.desc}</p>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
};

export default AddSectionModal;
