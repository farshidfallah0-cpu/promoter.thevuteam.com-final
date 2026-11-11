// Convert Persian/Arabic numerals to English
export const toEnglishNumbers = (str) => {
  if (!str) return str;
  const persianNumbers = ['۰', '۱', '۲', '۳', '۴', '۵', '۶', '۷', '۸', '۹'];
  const arabicNumbers = ['٠', '١', '٢', '٣', '٤', '٥', '٦', '٧', '٨', '٩'];
  
  let result = String(str);
  
  for (let i = 0; i < 10; i++) {
    result = result.replace(new RegExp(persianNumbers[i], 'g'), i);
    result = result.replace(new RegExp(arabicNumbers[i], 'g'), i);
  }
  
  return result;
};

// Format date/time with English numerals
export const formatDateTime = (date) => {
  if (!date) return '';
  const d = new Date(date);
  const options = {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  };
  return d.toLocaleDateString('en-US', options);
};

// Format date only with English numerals
export const formatDate = (date) => {
  if (!date) return '';
  const d = new Date(date);
  return d.toLocaleDateString('en-US');
};

// Format time only with English numerals
export const formatTime = (date) => {
  if (!date) return '';
  const d = new Date(date);
  return d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
};
