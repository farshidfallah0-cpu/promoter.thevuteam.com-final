import React, { useState } from 'react';
import { 
  DndContext, 
  closestCenter, 
  KeyboardSensor, 
  PointerSensor, 
  useSensor, 
  useSensors 
} from '@dnd-kit/core';
import { 
  arrayMove, 
  SortableContext, 
  sortableKeyboardCoordinates, 
  verticalListSortingStrategy 
} from '@dnd-kit/sortable';
import SectionCard from './SectionCard';
import AddSectionModal from './AddSectionModal';
import { Plus } from 'lucide-react';
import { BVT_PRODUCTS } from '../BVTCigaretteMatch/cigaretteDatabase';

const CenterCanvas = ({ sections, setSections, onEditSection, onEditTemplate }) => {
  const [isModalOpen, setIsModalOpen] = useState(false);

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  const handleDragEnd = (event) => {
    const { active, over } = event;
    if (active.id !== over.id) {
      const oldIndex = sections.findIndex((s) => s.id === active.id);
      const newIndex = sections.findIndex((s) => s.id === over.id);
      setSections(arrayMove(sections, oldIndex, newIndex));
    }
  };

  const handleAddSection = (category) => {
    const newSection = {
      id: `section-${Date.now()}`,
      type: category.id,
      title: category.title,
      description: '',
      required: true,
      fields: [] // Sub-fields will go here
    };
    if (category.id === 'bvt_cigarette_match' || category.id === 'bvt_sampling_report') {
      newSection.bvtProducts = [...BVT_PRODUCTS];
    }
    setSections([...sections, newSection]);
  };

  const handleAddTemplate = (templateSections) => {
    const newSections = templateSections.map((sec, idx) => {
      const newSec = {
        ...sec,
        id: `section-${Date.now()}-${idx}`
      };
      if ((newSec.type === 'bvt_cigarette_match' || newSec.type === 'bvt_sampling_report') && !newSec.bvtProducts) {
        newSec.bvtProducts = [...BVT_PRODUCTS];
      }
      return newSec;
    });
    setSections([...sections, ...newSections]);
  };

  const handleDuplicate = (section) => {
    const index = sections.findIndex((s) => s.id === section.id);
    const newSection = {
      ...section,
      id: `section-${Date.now()}`,
      title: `${section.title} (Copy)`
    };
    const newSections = [...sections];
    newSections.splice(index + 1, 0, newSection);
    setSections(newSections);
  };

  const handleDelete = (id) => {
    setSections(sections.filter(s => s.id !== id));
  };

  return (
    <div 
      className="flex-1 overflow-y-auto p-6 md:p-10 relative transition-colors duration-300"
      style={{
        background: 'var(--bg-secondary)',
        backgroundImage: 'radial-gradient(var(--border-color) 1px, transparent 1px)',
        backgroundSize: '20px 20px'
      }}
    >
      <div className="max-w-2xl mx-auto">
        <div className="mb-8 text-center">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-semibold mb-3 border shadow-sm"
               style={{ background: 'var(--bg-input)', borderColor: 'var(--border-color)', color: 'var(--primary-color)' }}>
            <span>🎨 ساختار فرم داینامیک</span>
          </div>
          <h1 className="text-xl md:text-2xl font-bold mb-1.5" style={{ color: 'var(--text-primary)' }}>
            بخش‌های گزارش روزانه
          </h1>
          <p className="text-xs md:text-sm" style={{ color: 'var(--text-secondary)' }}>
            با افزودن و جابجایی ترتیبی بخش‌ها، ساختار فرم گزارش پروموتر را طراحی کنید.
          </p>
        </div>

        <DndContext 
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragEnd={handleDragEnd}
        >
          <div className="space-y-3 mb-6">
            <SortableContext 
              items={sections.map(s => s.id)}
              strategy={verticalListSortingStrategy}
            >
              {sections.map(section => (
                <SectionCard 
                  key={section.id} 
                  section={section} 
                  onEdit={() => onEditSection(section)}
                  onDuplicate={() => handleDuplicate(section)}
                  onDelete={() => handleDelete(section.id)}
                />
              ))}
            </SortableContext>
          </div>
        </DndContext>

        <button 
          onClick={() => setIsModalOpen(true)}
          className="w-full group flex flex-col items-center justify-center p-6 border-2 border-dashed rounded-2xl transition-all duration-300 shadow-sm hover:shadow-md"
          style={{
            background: 'var(--bg-card)',
            borderColor: 'var(--border-color)'
          }}
        >
          <div className="w-11 h-11 rounded-full flex items-center justify-center transition-all duration-300 mb-2.5 shadow-md"
               style={{ background: 'var(--primary-light)', color: 'var(--primary-color)' }}>
            <Plus size={22} className="group-hover:scale-110 transition-transform" />
          </div>
          <span className="text-sm font-bold transition-colors" style={{ color: 'var(--text-primary)' }}>
            افزودن بخش جدید
          </span>
          <span className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>
            انتخاب قالب آماده یا ایجاد بخش سفارشی
          </span>
        </button>
      </div>

      <AddSectionModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        onSelect={handleAddSection}
        onSelectTemplate={handleAddTemplate}
        onEditTemplate={(tpl) => { setIsModalOpen(false); onEditTemplate?.(tpl); }}
      />
    </div>
  );
};

export default CenterCanvas;
