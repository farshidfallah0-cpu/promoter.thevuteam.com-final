import React from 'react';

const PhoneInput = ({
  value,
  onChange,
  name,
  placeholder = "شماره تماس",
  className = "",
  filled = false,
  required = false
}) => {
  const handleChange = (e) => {
    const rawValue = e.target.value.replace(/[^\d]/g, '');
    
    // Limit to 11 digits for Iranian phone numbers
    if (rawValue.length > 11) return;
    
    if (onChange) {
      onChange({
        target: {
          name: name,
          value: rawValue
        }
      });
    }
  };

  return (
    <input
      type="tel"
      inputMode="numeric"
      name={name}
      value={value || ''}
      onChange={handleChange}
      placeholder={placeholder}
      className={`input-field phone-input no-spinner ${className} ${filled ? 'filled' : ''}`}
      maxLength={11}
      dir="ltr"
      required={required}
    />
  );
};

export default PhoneInput;
