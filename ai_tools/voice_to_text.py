"""
Voice to Text Analysis Module
Uses Google Gemini for transcription and extracting structured data from audio.
"""

import logging
import os
from typing import Optional, Dict, Any
import google.generativeai as genai
from dotenv import load_dotenv

load_dotenv()

# Configuration - required, no hardcoded fallback. Set GOOGLE_API_KEY in backend/.env
# when the AI voice-analysis feature is enabled.
GOOGLE_API_KEY = os.getenv("GOOGLE_API_KEY")

logger = logging.getLogger(__name__)


def analyze_voice(audio_base64: str, mime_type: str = "audio/webm") -> Dict[str, Any]:
    """
    Analyze voice recording and extract structured data.
    
    Args:
        audio_base64: Base64 encoded audio data
        mime_type: MIME type of the audio (audio/webm, audio/mp3, etc.)
    
    Returns:
        Dictionary with extracted fields from the voice recording
    """
    if not GOOGLE_API_KEY:
        raise Exception("GOOGLE_API_KEY is not set. Add it to backend/.env to enable voice analysis.")

    try:
        # Configure Gemini
        genai.configure(api_key=GOOGLE_API_KEY)
        model = genai.GenerativeModel('gemini-2.0-flash')
        
        # Create audio part for Gemini
        audio_part = {
            "inline_data": {
                "mime_type": mime_type,
                "data": audio_base64
            }
        }
        
        # Prompt for extracting structured data from voice
        prompt = """
تو یک دستیار هوشمند برای ثبت گزارش پروموتر هستی.
این فایل صوتی را گوش کن و اطلاعات زیر را استخراج کن.

لطفا خروجی را به صورت JSON با این فیلدها برگردان:
- customer_name: نام مشتری (اگر گفته شده)
- customer_phone: شماره تلفن مشتری (اگر گفته شده)
- product_name: نام محصول مورد نظر
- address: آدرس (اگر گفته شده)
- description: توضیحات اضافی یا خلاصه گفتگو
- selected_package: پکیج انتخاب شده (اگر ذکر شده)
- transaction_amount: مبلغ تراکنش (اگر ذکر شده)
- address_floor: طبقه یا واحد آدرس (اگر ذکر شده)

اگر هر فیلدی در صدا نبود، مقدار خالی "" برگردان.
فقط JSON برگردان، بدون هیچ توضیح اضافی.
"""
        
        # Generate response
        response = model.generate_content([prompt, audio_part])
        response_text = response.text.strip()
        
        # Clean up response - remove markdown code blocks if present
        if response_text.startswith("```json"):
            response_text = response_text[7:]
        if response_text.startswith("```"):
            response_text = response_text[3:]
        if response_text.endswith("```"):
            response_text = response_text[:-3]
        response_text = response_text.strip()
        
        # Parse JSON response
        import json
        try:
            result = json.loads(response_text)
        except json.JSONDecodeError:
            # If JSON parsing fails, return empty fields with description
            result = {
                "customer_name": "",
                "customer_phone": "",
                "product_name": "",
                "address": "",
                "description": response_text,
                "selected_package": "",
                "transaction_amount": "",
                "address_floor": ""
            }
        
        # Ensure all required fields exist
        default_fields = {
            "customer_name": "",
            "customer_phone": "",
            "product_name": "",
            "address": "",
            "description": "",
            "selected_package": "",
            "transaction_amount": "",
            "address_floor": ""
        }
        
        for key, default_value in default_fields.items():
            if key not in result:
                result[key] = default_value
        
        return result
        
    except Exception as e:
        logger.error(f"Error in voice analysis: {e}")
        raise Exception(f"Voice analysis failed: {str(e)}")


if __name__ == "__main__":
    # Test with a sample
    print("Voice to Text module loaded successfully.")
