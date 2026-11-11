import React from 'react';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { 
  GripVertical, Settings, Copy, Trash2, Layers,
  UserCheck, FileText, ShieldCheck, StickyNote, PhoneCall, LogOut, Camera, BarChart3, MapPin, Package, MessageSquare, Cigarette, Store
} from 'lucide-react';

const ICON_MAP = {
  camera_checkin: UserCheck,
  bvt_cigarette_match: Cigarette,
  bvt_sampling_report: Package,
  mehram_supermarket_report: Store,
  brief_reader: FileText,
  advanced_checklist: ShieldCheck,
  daily_report: StickyNote,
  team_directory: PhoneCall,
  camera_checkout: LogOut,
  sales: BarChart3,
  photos: Camera,
  gps: MapPin,
  inventory: Package,
  feedback: MessageSquare
};

const SectionCard = ({ section, onEdit, onDuplicate, onDelete }) => {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: section.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    zIndex: isDragging ? 10 : 1,
  };

  const Icon = ICON_MAP[section.type] || Layers;
  
  return (
    <div 
      ref={setNodeRef} 
      style={{
        ...style,
        background: 'var(--bg-card)',
        borderColor: 'var(--border-color)',
      }}
      className={`group relative border rounded-2xl overflow-hidden shadow-sm hover:shadow-md transition-all duration-200 ${
        isDragging ? 'opacity-60 ring-2 ring-indigo-500 shadow-xl scale-[1.01]' : ''
      }`}
    >
      {/* Top Accent Gradient Line on Hover */}
      <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-indigo-500 via-purple-500 to-pink-500 opacity-0 group-hover:opacity-100 transition-opacity"></div>
      
      <div className="flex items-center p-2">
        {/* Drag Handle */}
        <div 
          {...attributes} 
          {...listeners}
          className="p-3 cursor-grab active:cursor-grabbing transition-colors rounded-xl flex items-center justify-center"
          style={{ color: 'var(--text-muted)' }}
          title="جابجایی ترتیب"
        >
          <GripVertical size={18} className="group-hover:text-indigo-500 transition-colors" />
        </div>

        {/* Content Body */}
        <div className="flex-1 py-2 pr-2 pl-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div 
                className="w-9 h-9 rounded-xl flex items-center justify-center shadow-xs border shrink-0"
                style={{ 
                  background: 'var(--primary-light)', 
                  borderColor: 'rgba(99, 102, 241, 0.2)',
                  color: 'var(--primary-color)' 
                }}
              >
                <Icon size={18} />
              </div>
              <div>
                <h3 className="font-bold text-sm flex items-center gap-2" style={{ color: 'var(--text-primary)' }}>
                  {section.title}
                  {section.required && (
                    <span className="text-[10px] bg-red-500/10 text-red-500 border border-red-500/20 px-2 py-0.5 rounded-full font-bold">
                      اجباری
                    </span>
                  )}
                </h3>
                <p className="text-[11px] font-medium mt-0.5" style={{ color: 'var(--text-muted)' }}>
                  نوع: {section.type.toUpperCase()}
                </p>
              </div>
            </div>
            
            {/* Quick Actions Bar */}
            <div className="flex items-center gap-1 opacity-80 group-hover:opacity-100 transition-opacity">
              <button 
                onClick={(e) => { e.stopPropagation(); onDuplicate(); }}
                className="p-2 rounded-xl transition-all hover:scale-105 active:scale-95"
                style={{ background: 'var(--bg-input)', color: 'var(--text-secondary)' }}
                title="کپی از بخش"
              >
                <Copy size={15} />
              </button>
              <button 
                onClick={(e) => { e.stopPropagation(); onDelete(); }}
                className="p-2 rounded-xl transition-all hover:scale-105 active:scale-95 text-red-500 hover:bg-red-500/10"
                style={{ background: 'var(--bg-input)' }}
                title="حذف بخش"
              >
                <Trash2 size={15} />
              </button>
              <button 
                onClick={(e) => { e.stopPropagation(); onEdit(); }}
                className="p-2 rounded-xl transition-all hover:scale-105 active:scale-95 text-white bg-indigo-600 hover:bg-indigo-700 shadow-xs"
                title="تنظیمات فیلدها"
              >
                <Settings size={15} />
              </button>
            </div>
          </div>

          {/* Section Summary Pill */}
          {section.description && (
            <p className="mt-2 text-xs leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
              {section.description}
            </p>
          )}
        </div>
      </div>
    </div>
  );
};

export default SectionCard;
