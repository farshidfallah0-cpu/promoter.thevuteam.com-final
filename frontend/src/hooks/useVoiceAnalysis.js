import { useState, useCallback } from 'react';

// Field mapping from API response to form fields
const FIELD_MAPPING = {
  store_name: 'storeName',
  seller_number: 'sellerNumber',
  discount_amount: 'discountAmount',
  online_shop_experience: 'onlineShopExperience',
  note: 'note',
  business_type: 'businessType',
  seller_role: 'sellerRole',
  selected_package: 'selectedPackage',
  transaction_amount: 'transactionAmount',
  address_floor: 'addressFloor'
};

// Format number with thousand separators
export const formatPrice = (value) => {
  if (!value) return '';
  const numStr = value.toString().replace(/[^\d]/g, '');
  return numStr.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
};

// Parse formatted price back to number
export const parsePrice = (value) => {
  if (!value) return '';
  return value.toString().replace(/,/g, '');
};

export const useVoiceAnalysis = (setFormData, setFilledFields) => {
  const [isAnimating, setIsAnimating] = useState(false);
  const [currentField, setCurrentField] = useState(null);

  // Animate field population one by one
  const animateFieldPopulation = useCallback(async (analysisResult) => {
    setIsAnimating(true);
    const filledFieldsList = [];
    
    const entries = Object.entries(analysisResult);
    
    for (let i = 0; i < entries.length; i++) {
      const [apiField, value] = entries[i];
      const formField = FIELD_MAPPING[apiField] || apiField;
      
      if (value && value !== '' && value !== null) {
        setCurrentField(formField);
        
        // Format transaction amount with thousand separators
        let formattedValue = value;
        if (apiField === 'transaction_amount' && value) {
          formattedValue = formatPrice(value);
        }
        
        // Update form data with animation delay
        await new Promise(resolve => setTimeout(resolve, 150));
        
        setFormData(prev => ({
          ...prev,
          [formField]: formattedValue
        }));
        
        filledFieldsList.push(formField);
        
        // Small delay between fields for visual effect
        await new Promise(resolve => setTimeout(resolve, 300));
      }
    }
    
    setCurrentField(null);
    setIsAnimating(false);
    
    if (setFilledFields) {
      setFilledFields(filledFieldsList);
    }
    
    return filledFieldsList;
  }, [setFormData, setFilledFields]);

  // Handle analysis complete
  const handleAnalysisComplete = useCallback((result) => {
    if (result && typeof result === 'object') {
      animateFieldPopulation(result);
    }
  }, [animateFieldPopulation]);

  // Handle location fetched
  const handleLocationFetched = useCallback((locationData) => {
    if (locationData) {
      const { street, address, latitude, longitude } = locationData;
      
      setFormData(prev => ({
        ...prev,
        addressFloor: street || address || prev.addressFloor,
        latitude: latitude || prev.latitude,
        longitude: longitude || prev.longitude
      }));
    }
  }, [setFormData]);

  return {
    isAnimating,
    currentField,
    handleAnalysisComplete,
    handleLocationFetched,
    formatPrice,
    parsePrice
  };
};

export default useVoiceAnalysis;
