import React, { useRef, useState } from 'react';
import { Bold, Italic, List, ListOrdered, Link, Heading1, Palette, Eye, Edit2 } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import rehypeRaw from 'rehype-raw';

export default function MarkdownEditor({ value, onChange, placeholder, className, style }) {
  const textareaRef = useRef(null);
  const [mode, setMode] = useState('edit'); // 'edit' or 'preview'
  const [customColor, setCustomColor] = useState('#3b82f6');

  const insertText = (before, after = '') => {
    const textarea = textareaRef.current;
    if (!textarea) return;

    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const text = textarea.value;
    const selectedText = text.substring(start, end);

    const newText = text.substring(0, start) + before + selectedText + after + text.substring(end);
    onChange(newText);

    // Reset focus and selection
    setTimeout(() => {
      textarea.focus();
      textarea.setSelectionRange(start + before.length, start + before.length + selectedText.length);
    }, 0);
  };

  const wrapColor = (colorHex) => {
    insertText(`<span style="color: ${colorHex}">`, '</span>');
  };

  const colors = [
    { name: 'قرمز', hex: '#ef4444' },
    { name: 'آبی', hex: '#3b82f6' },
    { name: 'سبز', hex: '#22c55e' },
    { name: 'زرد', hex: '#eab308' },
    { name: 'بنفش', hex: '#a855f7' }
  ];

  return (
    <div className={`border rounded-xl flex flex-col overflow-hidden ${className || ''}`} style={{ borderColor: 'var(--border-color)', ...style }}>
      <div className="flex flex-wrap items-center gap-1 p-2 border-b bg-gray-50/50 dark:bg-zinc-800/50" style={{ borderColor: 'var(--border-color)' }}>
        <div className="relative flex items-center bg-white dark:bg-zinc-900 border border-gray-200 dark:border-zinc-700 rounded overflow-hidden">
          <div className="pl-1 pr-2 text-gray-500"><Heading1 size={14} /></div>
          <select 
            className="text-xs bg-transparent focus:outline-none py-1 pr-1 text-gray-700 dark:text-gray-300 cursor-pointer"
            onChange={(e) => {
              if (e.target.value) {
                insertText(e.target.value);
                e.target.value = '';
              }
            }}
          >
            <option value="">تیتر...</option>
            <option value="# ">تیتر ۱ (بزرگترین)</option>
            <option value="## ">تیتر ۲</option>
            <option value="### ">تیتر ۳</option>
            <option value="#### ">تیتر ۴</option>
            <option value="##### ">تیتر ۵</option>
            <option value="###### ">تیتر ۶ (کوچکترین)</option>
          </select>
        </div>
        <button type="button" onClick={() => insertText('**', '**')} className="p-1.5 rounded hover:bg-gray-200 dark:hover:bg-zinc-700 text-gray-700 dark:text-gray-300 transition-colors" title="ضخیم (Bold)">
          <Bold size={16} />
        </button>
        <button type="button" onClick={() => insertText('*', '*')} className="p-1.5 rounded hover:bg-gray-200 dark:hover:bg-zinc-700 text-gray-700 dark:text-gray-300 transition-colors" title="کج (Italic)">
          <Italic size={16} />
        </button>
        <div className="w-px h-5 bg-gray-300 dark:bg-zinc-600 mx-1"></div>
        <button type="button" onClick={() => insertText('- ')} className="p-1.5 rounded hover:bg-gray-200 dark:hover:bg-zinc-700 text-gray-700 dark:text-gray-300 transition-colors" title="لیست نقطه‌ای">
          <List size={16} />
        </button>
        <button type="button" onClick={() => insertText('1. ')} className="p-1.5 rounded hover:bg-gray-200 dark:hover:bg-zinc-700 text-gray-700 dark:text-gray-300 transition-colors" title="لیست عددی">
          <ListOrdered size={16} />
        </button>
        <div className="w-px h-5 bg-gray-300 dark:bg-zinc-600 mx-1"></div>
        <button type="button" onClick={() => insertText('[', '](https://)')} className="p-1.5 rounded hover:bg-gray-200 dark:hover:bg-zinc-700 text-gray-700 dark:text-gray-300 transition-colors" title="لینک">
          <Link size={16} />
        </button>
        <div className="w-px h-5 bg-gray-300 dark:bg-zinc-600 mx-1"></div>
        
        {/* Colors */}
        <div className="flex items-center gap-1 px-1">
          <Palette size={14} className="text-gray-400 mr-1" />
          <div className="relative group flex items-center">
             <input 
               type="color" 
               value={customColor}
               onChange={(e) => setCustomColor(e.target.value)}
               className="w-6 h-6 p-0 border-0 rounded cursor-pointer shrink-0"
               title="انتخاب رنگ سفارشی"
             />
             <button 
               type="button"
               onClick={() => wrapColor(customColor)}
               className="text-[10px] bg-gray-200 dark:bg-zinc-700 px-2 py-1 rounded mr-1 hover:bg-gray-300 dark:hover:bg-zinc-600 transition-colors whitespace-nowrap"
             >
               اعمال رنگ
             </button>
          </div>
        </div>
        
        <div className="flex-1"></div>
        <div className="flex items-center gap-1 bg-gray-200 dark:bg-zinc-900 rounded-lg p-0.5">
          <button 
            type="button" 
            onClick={() => setMode('edit')} 
            className={`flex items-center gap-1.5 px-3 py-1 text-xs rounded-md transition-colors ${mode === 'edit' ? 'bg-white dark:bg-zinc-700 shadow-sm text-indigo-600 dark:text-indigo-400 font-bold' : 'text-gray-500 dark:text-gray-400'}`}
          >
            <Edit2 size={12} /> ویرایش
          </button>
          <button 
            type="button" 
            onClick={() => setMode('preview')} 
            className={`flex items-center gap-1.5 px-3 py-1 text-xs rounded-md transition-colors ${mode === 'preview' ? 'bg-white dark:bg-zinc-700 shadow-sm text-indigo-600 dark:text-indigo-400 font-bold' : 'text-gray-500 dark:text-gray-400'}`}
          >
            <Eye size={12} /> پیش‌نمایش
          </button>
        </div>
      </div>
      
      {mode === 'edit' ? (
        <textarea
          ref={textareaRef}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="w-full p-4 text-sm focus:outline-none focus:ring-0 resize-y min-h-[200px]"
          style={{ background: 'var(--bg-input)', color: 'var(--text-primary)' }}
          placeholder={placeholder}
          dir="rtl"
        />
      ) : (
        <div className="w-full p-4 text-sm resize-y min-h-[200px] bg-white dark:bg-zinc-900 overflow-y-auto prose prose-sm dark:prose-invert max-w-none prose-p:leading-relaxed prose-ul:list-disc prose-ol:list-decimal prose-ul:pr-4 prose-ol:pr-4 [&_strong]:font-extrabold [&_strong]:text-black dark:[&_strong]:text-white [&_h1]:text-3xl [&_h1]:font-extrabold [&_h1]:mb-4 [&_h2]:text-2xl [&_h2]:font-bold [&_h2]:mb-3 [&_h3]:text-xl [&_h3]:font-bold [&_h3]:mb-2 [&_h4]:text-lg [&_h4]:font-bold [&_h5]:font-bold [&_h6]:font-bold" dir="rtl">
          {value ? (
            <ReactMarkdown rehypePlugins={[rehypeRaw]}>{value}</ReactMarkdown>
          ) : (
            <span className="text-gray-400">پیش‌نمایش (متنی وارد نشده است...)</span>
          )}
        </div>
      )}
    </div>
  );
}
