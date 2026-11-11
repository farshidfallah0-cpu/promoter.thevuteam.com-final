import React, { useState } from 'react';
import CenterCanvas from './CenterCanvas';
import MobilePreview from './MobilePreview';
import SettingsDrawer from './SettingsDrawer';

const SectionBuilder = ({ activeFields, setActiveFields, eventId, onEditTemplate }) => {
  // activeFields is now treated as an array of Sections
  const [editingSection, setEditingSection] = useState(null);

  const handleUpdateSection = (updatedSection) => {
    setActiveFields(prev =>
      prev.map(s => s.id === updatedSection.id ? updatedSection : s)
    );
    if (editingSection?.id === updatedSection.id) {
      setEditingSection(updatedSection);
    }
  };

  const handleDeleteSection = (id) => {
    setActiveFields(prev => prev.filter(s => s.id !== id));
    if (editingSection?.id === id) {
      setEditingSection(null);
    }
  };

  return (
    <div 
      className="flex h-full w-full overflow-hidden rounded-2xl border shadow-xl"
      style={{
        background: 'var(--bg-primary)',
        borderColor: 'var(--border-color)'
      }}
    >

      {/* Main Canvas */}
      <CenterCanvas
        sections={activeFields}
        setSections={setActiveFields}
        onEditSection={setEditingSection}
        onEditTemplate={onEditTemplate}
      />

      {/* Right Sidebar - Mobile Preview */}
      <MobilePreview sections={activeFields} />

      {/* Settings Drawer */}
      <SettingsDrawer
        isOpen={!!editingSection}
        section={editingSection}
        onClose={() => setEditingSection(null)}
        onUpdate={handleUpdateSection}
        onDelete={handleDeleteSection}
        eventId={eventId}
      />

    </div>
  );
};

export default SectionBuilder;
