import React, { useState } from 'react';
import { Camera, FileText, CheckCircle2, Phone, MessageSquare, ShieldCheck, User, Sparkles, X, Cloud } from 'lucide-react';

const MobilePreview = ({ sections }) => {
  const [showBriefModal, setShowBriefModal] = useState(false);
  const [selectedBriefText, setSelectedBriefText] = useState('');

  return (
    <div 
      className="hidden xl:flex flex-col items-center justify-center p-6 border-r transition-colors duration-300 select-none min-w-[340px] relative"
      style={{
        background: 'var(--bg-primary)',
        borderColor: 'var(--border-color)'
      }}
    >
      {/* Header Label */}
      <div className="flex items-center gap-2 mb-5 px-3.5 py-1.5 rounded-full border shadow-xs"
           style={{ background: 'var(--bg-card)', borderColor: 'var(--border-color)' }}>
        <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.7)] shrink-0"></span>
        <span className="text-xs font-bold" style={{ color: 'var(--text-primary)' }}>پیش‌نمایش زنده موبایل</span>
      </div>

      {/* Realistic iPhone 15 Pro Mockup Frame Container */}
      <div className="relative">
        
        {/* Left Side Buttons (Volume Up/Down) */}
        <div className="absolute -left-[9px] top-24 w-[3px] h-8 bg-zinc-600 dark:bg-zinc-700 rounded-l-md"></div>
        <div className="absolute -left-[9px] top-36 w-[3px] h-8 bg-zinc-600 dark:bg-zinc-700 rounded-l-md"></div>
        {/* Right Side Button (Power) */}
        <div className="absolute -right-[9px] top-28 w-[3px] h-12 bg-zinc-600 dark:bg-zinc-700 rounded-r-md"></div>

        {/* iPhone Chassis (Outer Frame) */}
        <div 
          className="relative w-[275px] h-[540px] bg-white rounded-[44px] shadow-[0_25px_60px_-15px_rgba(0,0,0,0.3)] border-[7px] border-zinc-800 dark:border-zinc-900 overflow-hidden flex flex-col transition-all duration-300"
        >
          {/* iOS Top Status Bar & Dynamic Island */}
          <div className="bg-white shrink-0 pt-2 px-5 pb-1 relative z-20 flex items-center justify-between">
            <span className="text-[10px] font-bold text-gray-900 font-mono tracking-tight">09:41</span>

            <div className="w-20 h-4 bg-black rounded-full flex items-center justify-between px-2 shadow-sm">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500/80"></span>
              <span className="w-2 h-2 rounded-full bg-zinc-800"></span>
            </div>

            <div className="flex items-center gap-1 text-gray-900">
              <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
                <path d="M2 11a1 1 0 011-1h2a1 1 0 011 1v5a1 1 0 01-1 1H3a1 1 0 01-1-1v-5zm6-4a1 1 0 011-1h2a1 1 0 011 1v9a1 1 0 01-1 1H9a1 1 0 01-1-1V7zm6-3a1 1 0 011-1h2a1 1 0 011 1v12a1 1 0 01-1 1h-2a1 1 0 01-1-1V4z" />
              </svg>
              <div className="w-4 h-2 border border-gray-900 rounded-sm p-0.5 flex items-center">
                <div className="w-full h-full bg-gray-900 rounded-2xs"></div>
              </div>
            </div>
          </div>
          
          {/* Mobile Header (App Style Navbar) */}
          <div className="bg-white border-b border-gray-100 px-3.5 py-2.5 shrink-0 relative z-10 flex items-center justify-between shadow-2xs">
            <div className="flex items-center gap-1.5">
              <img src="/images/vuLogo.png" alt="Logo" className="h-5 object-contain" />
            </div>
            <div className="flex items-center gap-2">
              <div className="flex flex-col text-right">
                <span className="text-[9px] font-bold text-gray-900">رویداد سمپلینگ</span>
                <span className="text-[7px] text-gray-400">پیش‌نمایش فرم</span>
              </div>
              <div className="w-6 h-6 rounded-full border border-indigo-200 overflow-hidden bg-indigo-50 flex items-center justify-center text-indigo-600 font-bold text-[9px]">
                PR
              </div>
            </div>
          </div>

          {/* Scrollable Form Content */}
          <div className="flex-1 overflow-y-auto bg-slate-50/90 p-3 space-y-3 relative">
            
            {/* Interactive Event Brief Modal inside Mobile */}
            {showBriefModal && (
              <div className="absolute inset-0 bg-black/60 backdrop-blur-xs z-30 p-3 flex items-center justify-center">
                <div className="bg-white rounded-2xl p-4 shadow-xl border border-gray-100 w-full text-right animate-in fade-in zoom-in duration-200">
                  <div className="flex justify-between items-center mb-2 pb-2 border-b border-gray-100">
                    <span className="text-xs font-bold text-gray-900 flex items-center gap-1">
                      <FileText size={14} className="text-indigo-600" /> دستورالعمل بریف رویداد
                    </span>
                    <button onClick={() => setShowBriefModal(false)} className="text-gray-400 hover:text-gray-600 p-1">
                      <X size={14} />
                    </button>
                  </div>
                  <div className="text-[10px] text-gray-600 leading-relaxed whitespace-pre-line mb-4 bg-indigo-50/50 p-2.5 rounded-xl border border-indigo-100/50">
                    {selectedBriefText || '۱. لبخند و آراستگی کامل پروموتر\n۲. معرفی ۳ ویژگی محصول\n۳. شمارش دقیق سمپل‌ها'}
                  </div>
                  <button 
                    onClick={() => setShowBriefModal(false)}
                    className="w-full py-2 bg-emerald-600 text-white rounded-xl font-bold text-xs shadow-xs flex items-center justify-center gap-1"
                  >
                    <CheckCircle2 size={13} /> متوجه شدم و مطالعه شد
                  </button>
                </div>
              </div>
            )}

            {sections.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center text-gray-400 opacity-60">
                <svg xmlns="http://www.w3.org/2000/svg" width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="mb-2"><path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z"/><polyline points="14 2 14 8 20 8"/></svg>
                <p className="text-xs font-medium">هنوز بخشی اضافه نشده</p>
              </div>
            ) : (
              sections.map((section, idx) => (
                <div key={section.id || idx} className="bg-white rounded-xl shadow-2xs border border-gray-100 p-3">
                  <h4 className="font-bold text-gray-800 mb-0.5 flex items-center gap-1 text-xs">
                    {section.title}
                    {section.required && <span className="text-red-500 font-bold">*</span>}
                  </h4>
                  {section.description && (
                    <p className="text-[10px] text-gray-400 mb-2 leading-tight">{section.description}</p>
                  )}
                  
                  {/* Mock fields based on section type */}
                  <div className="space-y-2 mt-2">
                    
                    {/* 1 & 6. Camera Check-in / Check-out */}
                    {(section.type === 'camera_checkin' || section.type === 'camera_checkout') && (
                      <div className="p-3 bg-white border border-slate-200 rounded-xl flex flex-col items-center justify-center text-center shadow-2xs">
                        <div className="w-8 h-8 rounded-full bg-slate-900 text-white flex items-center justify-center mb-1.5 shadow-2xs">
                          <Camera size={16} />
                        </div>
                        <span className="text-xs font-bold text-slate-900">
                          {section.type === 'camera_checkin' ? 'ثبت عکس ورود (خودکار)' : 'ثبت عکس خروج'}
                        </span>
                      </div>
                    )}

                    {/* 2. Event Brief Reader */}
                    {section.type === 'brief_reader' && (
                      <div 
                        onClick={() => {
                          setSelectedBriefText(section.briefText);
                          setShowBriefModal(true);
                        }}
                        className="p-3 bg-gradient-to-br from-indigo-50 to-purple-50 border border-indigo-100 rounded-xl flex items-center justify-between cursor-pointer hover:border-indigo-300 transition-all shadow-2xs"
                      >
                        <div className="flex items-center gap-2.5">
                          <div className="w-8 h-8 rounded-lg bg-indigo-600 text-white flex items-center justify-center shrink-0 shadow-xs">
                            <FileText size={16} />
                          </div>
                          <div>
                            <span className="text-xs font-bold text-gray-900 block">بریف و قوانین رویداد</span>
                          </div>
                        </div>
                        <span className="text-[9px] font-bold bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded-full flex items-center gap-1">
                          <CheckCircle2 size={10} /> مطالعه شد
                        </span>
                      </div>
                    )}

                    {/* 3. Advanced 3-Role Checklist (Matching Activation Checklist Reference Image) */}
                    {section.type === 'advanced_checklist' && (
                      <div className="space-y-2.5">
                        {/* Synced Badge & Role Filter */}
                        <div className="flex items-center justify-between px-0.5 mb-1">
                          <div className="flex items-center gap-1 bg-white border border-indigo-200 rounded-lg px-2 py-0.5 text-[9px] font-bold text-indigo-700 shadow-2xs">
                            <span>نقش:</span>
                            <span className="text-gray-900">همه نقش‌ها</span>
                            <span className="text-[8px] text-gray-400">▾</span>
                          </div>
                          <span className="text-[9px] font-semibold text-emerald-700 bg-emerald-50 border border-emerald-200/80 px-2 py-0.5 rounded-full flex items-center gap-1 shrink-0 shadow-2xs">
                            <Cloud size={10} className="text-emerald-600 shrink-0" /> Synced
                          </span>
                        </div>

                        {(section.checklistItems || [
                          { title: 'تحویل وسایل، استند و نمونه محصولات', role: 'supervisor', attachPhoto: true },
                          { title: 'حضور در لوکیشن و اعلام ورود به مدیر', role: 'supervisor', attachPhoto: false },
                          { title: 'چیدمان میز سمپلینگ و پرچم برند', role: 'setup', attachPhoto: true }
                        ]).map((item, i) => {
                          const getEffPerm = (roleKey) => {
                            if (item.permissions) return item.permissions[roleKey];
                            return item.role === roleKey ? 'edit' : 'view';
                          };
                          return (
                          <div key={i} className="bg-white rounded-xl border border-gray-200/90 p-2.5 shadow-2xs space-y-2">
                            <div className="flex items-start gap-2">
                              {/* Round Checkbox / Radio Circle */}
                              <div className="w-4 h-4 rounded-full border-2 border-gray-300 mt-0.5 shrink-0 flex items-center justify-center bg-white"></div>
                              <div className="flex-1">
                                <span className="text-[11px] font-bold text-gray-900 leading-snug block">
                                  {item.title}
                                </span>
                                
                                {/* Role Pill Badges — edit / view / hidden */}
                                <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                                  {/* کاپیتان */}
                                  {getEffPerm('supervisor') === 'hidden' ? (
                                    <span className="text-[8px] font-bold px-2 py-0.5 rounded-full shadow-2xs bg-rose-100 text-rose-700 flex items-center gap-0.5">
                                      <svg xmlns="http://www.w3.org/2000/svg" width="7" height="7" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94"/><path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19"/><line x1="1" y1="1" x2="23" y2="23"/></svg>
                                      کاپیتان
                                    </span>
                                  ) : getEffPerm('supervisor') === 'edit' ? (
                                    <span className="text-[8px] font-bold px-2 py-0.5 rounded-full shadow-2xs bg-amber-400 text-amber-950">
                                      کاپیتان (ویرایش)
                                    </span>
                                  ) : (
                                    <span className="text-[8px] font-bold px-2 py-0.5 rounded-full shadow-2xs bg-amber-100 text-amber-700">
                                      کاپیتان (مشاهده)
                                    </span>
                                  )}
                                  {/* ست‌آپ */}
                                  {getEffPerm('setup') === 'hidden' ? (
                                    <span className="text-[8px] font-bold px-2 py-0.5 rounded-full shadow-2xs bg-rose-100 text-rose-700 flex items-center gap-0.5">
                                      <svg xmlns="http://www.w3.org/2000/svg" width="7" height="7" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94"/><path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19"/><line x1="1" y1="1" x2="23" y2="23"/></svg>
                                      ست‌آپ
                                    </span>
                                  ) : getEffPerm('setup') === 'edit' ? (
                                    <span className="text-[8px] font-bold px-2 py-0.5 rounded-full shadow-2xs bg-amber-500 text-amber-950">
                                      ست‌آپ (ویرایش)
                                    </span>
                                  ) : (
                                    <span className="text-[8px] font-bold px-2 py-0.5 rounded-full shadow-2xs bg-amber-100 text-amber-700">
                                      ست‌آپ (مشاهده)
                                    </span>
                                  )}
                                  {/* پروموتر */}
                                  {getEffPerm('promoter') === 'hidden' ? (
                                    <span className="text-[8px] font-bold px-2 py-0.5 rounded-full shadow-2xs bg-rose-100 text-rose-700 flex items-center gap-0.5">
                                      <svg xmlns="http://www.w3.org/2000/svg" width="7" height="7" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94"/><path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19"/><line x1="1" y1="1" x2="23" y2="23"/></svg>
                                      پروموتر
                                    </span>
                                  ) : getEffPerm('promoter') === 'edit' ? (
                                    <span className="text-[8px] font-bold px-2 py-0.5 rounded-full shadow-2xs bg-sky-400 text-sky-950">
                                      پروموتر (ویرایش)
                                    </span>
                                  ) : (
                                    <span className="text-[8px] font-bold px-2 py-0.5 rounded-full shadow-2xs bg-sky-100 text-sky-700">
                                      پروموتر (مشاهده)
                                    </span>
                                  )}
                                </div>
                              </div>
                            </div>

                            {/* Add Photo Button if required */}
                            {item.attachPhoto && (
                              <div className="pt-1 pr-6">
                                <button className="bg-white border border-gray-200 hover:border-gray-300 text-gray-700 text-[9px] font-bold px-2.5 py-1 rounded-lg flex items-center gap-1 shadow-2xs">
                                  <Camera size={11} className="text-gray-600" /> افزودن عکس
                                </button>
                              </div>
                            )}
                          </div>
                          );
                        })}
                      </div>
                    )}

                    {/* 4. Structured Daily Report (2 Paragraphs) */}
                    {section.type === 'daily_report' && (
                      <div className="space-y-2">
                        <div>
                          <label className="text-[9px] font-bold text-gray-600 mb-1 block">📝 خلاصه عملکرد و گزارش روزانه:</label>
                          <div className="h-10 bg-slate-50 border border-slate-200 rounded-lg p-1.5 text-[9px] text-gray-400">
                            خلاصه فعالیت‌ها و تعداد سمپل‌های توزیع شده...
                          </div>
                        </div>
                        <div>
                          <label className="text-[9px] font-bold text-red-600 mb-1 block">⚠️ گزارش مشکلات و چالش‌ها:</label>
                          <div className="h-10 bg-red-50/50 border border-red-100 rounded-lg p-1.5 text-[9px] text-red-400">
                            موانع یا کمبودهای احتمالی امروز...
                          </div>
                        </div>
                      </div>
                    )}

                    {/* 5. Team Directory / Team Manifest (Matching Reference Image) */}
                    {section.type === 'team_directory' && (
                      <div className="space-y-2">
                        {(!section.teamMembers || section.teamMembers.length === 0) ? (
                          <div className="p-4 text-center rounded-xl border border-dashed text-xs text-gray-400">
                            (اعضای تیم پس از همگام‌سازی اضافه خواهند شد)
                          </div>
                        ) : (
                          section.teamMembers.map((member, mIdx) => {
                          const initials = member.name
                            .split(' ')
                            .map(n => n.charAt(0))
                            .join('')
                            .substring(0, 2);

                          return (
                            <div key={mIdx} className="bg-white rounded-2xl border border-gray-200/90 p-2.5 shadow-2xs flex items-center justify-between">
                              <div className="flex items-center gap-2.5">
                                {/* Avatar Circle with User Icon */}
                                <div className="w-8 h-8 rounded-full bg-slate-100 text-slate-700 border border-slate-200 flex items-center justify-center shrink-0">
                                  <User size={15} className="text-slate-600" />
                                </div>
                                <div>
                                  <span className="text-xs font-bold text-gray-900 block leading-tight">{member.name}</span>
                                  <span className="text-[8px] font-bold uppercase tracking-wider text-gray-400 block mt-0.5">
                                    {member.role || 'MEMBER'}
                                  </span>
                                </div>
                              </div>

                              {/* Call & SMS Buttons */}
                              <div className="flex items-center gap-1.5">
                                <a 
                                  href={`tel:${member.phone}`} 
                                  className="w-7 h-7 rounded-full border-2 border-indigo-600 bg-white text-indigo-600 flex items-center justify-center shadow-2xs hover:bg-indigo-50 transition-colors"
                                  title="تماس تلفنی"
                                >
                                  <Phone size={12} />
                                </a>
                                <a 
                                  href={`sms:${member.phone}`} 
                                  className="w-7 h-7 rounded-full bg-slate-100 text-slate-600 flex items-center justify-center hover:bg-slate-200 transition-colors"
                                  title="ارسال پیامک"
                                >
                                  <MessageSquare size={12} />
                                </a>
                              </div>
                            </div>
                          );
                        })
                        )}
                      </div>
                    )}

                    {/* Number field preview */}
                    {section.type === 'number' && (
                      <div className="flex items-center gap-2 h-9 bg-gray-50 border border-gray-200 rounded-lg px-3">
                        <svg xmlns="http://www.w3.org/2000/svg" width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#9ca3af" strokeWidth="2.5"><line x1="4" y1="9" x2="20" y2="9"/><line x1="4" y1="15" x2="20" y2="15"/><line x1="10" y1="3" x2="8" y2="21"/><line x1="16" y1="3" x2="14" y2="21"/></svg>
                        <span className="text-[9px] text-gray-400">{section.placeholder || 'تعداد (عدد)...'}</span>
                      </div>
                    )}

                    {/* Text field preview */}
                    {section.type === 'text' && (
                      <div className="h-9 bg-gray-50 border border-gray-200 rounded-lg px-3 flex items-center">
                        <span className="text-[9px] text-gray-400">{section.placeholder || 'متن کوتاه را وارد کنید...'}</span>
                      </div>
                    )}

                    {/* Textarea preview */}
                    {section.type === 'textarea' && (
                      <div className="bg-gray-50 border border-gray-200 rounded-lg p-2" style={{ minHeight: `${(section.rows || 4) * 18}px` }}>
                        <span className="text-[9px] text-gray-400">{section.placeholder || 'توضیحات...'}</span>
                      </div>
                    )}

                    {/* Rating preview */}
                    {section.type === 'rating' && (
                      <div className="flex items-center gap-1.5 justify-center py-1">
                        {[1,2,3,4,5].map(n => (
                          <span key={n} className="text-lg" style={{ opacity: n <= 3 ? 1 : 0.2 }}>⭐</span>
                        ))}
                      </div>
                    )}

                    {/* Expenses preview */}
                    {section.type === 'expenses' && (
                      <div className="space-y-1.5">
                        <div className="h-8 bg-gray-50 border border-gray-200 rounded-lg px-3 flex items-center">
                          <span className="text-[9px] text-gray-400">{section.placeholder || 'مبلغ هزینه (تومان)...'}</span>
                        </div>
                        <div className="h-8 bg-gray-50 border border-gray-200 rounded-lg px-3 flex items-center">
                          <span className="text-[9px] text-gray-400">بابت...</span>
                        </div>
                      </div>
                    )}

                    {/* BVT cigarette-match preview */}
                    {section.type === 'bvt_cigarette_match' && (
                      <div className="space-y-1.5">
                        <div className="h-8 bg-gray-50 border border-gray-200 rounded-lg px-3 flex items-center gap-1.5">
                          <svg xmlns="http://www.w3.org/2000/svg" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#9ca3af" strokeWidth="2.5"><circle cx="11" cy="11" r="7"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
                          <span className="text-[9px] text-gray-400">جستجوی سیگار مخاطب...</span>
                        </div>
                        <div className="grid grid-cols-4 gap-1">
                          {[0, 1, 2, 3].map(i => (
                            <div key={i} className={`h-9 rounded-md border ${i === 0 ? 'border-indigo-400 bg-indigo-50' : 'border-gray-200 bg-gray-50'}`}></div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* BVT sampling-report preview */}
                    {section.type === 'bvt_sampling_report' && (
                      <div className="grid grid-cols-2 gap-1.5">
                        {[0, 1, 2, 3].map(i => (
                          <div key={i} className="space-y-1">
                            <div className="h-9 rounded-md border border-gray-200 bg-gray-50"></div>
                            <div className="h-6 rounded-md border border-indigo-200 bg-indigo-50 flex items-center justify-between px-1.5">
                              <span className="text-[9px] text-indigo-500 font-bold">+</span>
                              <span className="text-[8px] text-gray-400">0</span>
                              <span className="text-[9px] text-indigo-500 font-bold">−</span>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}

                    {/* Mehram supermarket-report preview */}
                    {section.type === 'mehram_supermarket_report' && (
                      <div className="space-y-1.5">
                        <div className="h-8 rounded-md border border-indigo-300 bg-indigo-50 flex items-center justify-center text-[9px] font-bold text-indigo-500">ثبت گزارش سوپرمارکت</div>
                        <div className="h-7 rounded-md border border-gray-200 bg-gray-50"></div>
                        <div className="grid grid-cols-2 gap-1.5">
                          <div className="h-9 rounded-md border border-dashed border-gray-300 bg-gray-50"></div>
                          <div className="h-9 rounded-md border border-dashed border-gray-300 bg-gray-50"></div>
                        </div>
                      </div>
                    )}

                    {/* Feedback / notes / custom / sales / photos / gps / inventory / default */}
                    {!['camera_checkin', 'camera_checkout', 'brief_reader', 'advanced_checklist', 'daily_report', 'team_directory', 'number', 'text', 'textarea', 'rating', 'expenses', 'bvt_cigarette_match', 'bvt_sampling_report', 'mehram_supermarket_report'].includes(section.type) && (
                       <div className="h-8 bg-gray-50 rounded-md border border-gray-200"></div>
                    )}

                  </div>
                </div>
              ))
            )}
            
            {sections.length > 0 && (
              <div className="pt-2 pb-2">
                <div className="h-9 bg-indigo-600 hover:bg-indigo-700 rounded-xl flex items-center justify-center text-white font-bold text-xs shadow-xs">
                  ارسال گزارش
                </div>
              </div>
            )}
          </div>

          {/* iOS Bottom Home Indicator Bar */}
          <div className="bg-white py-1.5 flex justify-center shrink-0">
            <div className="w-24 h-1 bg-gray-300 rounded-full"></div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default MobilePreview;
