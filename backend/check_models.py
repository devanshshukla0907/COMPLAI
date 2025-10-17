import google.generativeai as genai
import os
from dotenv import load_dotenv

# Load environment variables from your .env file
load_dotenv()

# Get the API key
api_key = os.getenv("GEMINI_API_KEY")

if not api_key:
    print("❌ ERROR: GEMINI_API_KEY not found in the .env file.")
else:
    try:
        print("🔑 API Key found. Attempting to configure...")
        genai.configure(api_key=api_key)
        print("✅ Successfully configured with API key.")
        print("-" * 30)
        print("🔍 Checking for available models...")
        
        model_found = False
        # List all models that support the 'generateContent' method
        for m in genai.list_models():
            if 'generateContent' in m.supported_generation_methods:
                print(f"  - {m.name}")
                model_found = True
        
        if not model_found:
            print("🚫 No generative models found for your API key.")
            print("\nRECOMMENDATION: Please generate a new API key from Google AI Studio and ensure your project is set up correctly.")

    except Exception as e:
        print(f"\n❌ An error occurred: {e}")
        print("\nThis usually means the API key is invalid or not configured correctly.")
        print("\n## PLEASE CHECK THE FOLLOWING: ##")
        print("1. Your GEMINI_API_KEY in the .env file is correct (no typos, no extra spaces).")
        print("2. You have enabled the 'Generative Language API' in your Google Cloud project.")
        print("3. Your Google Cloud project has a billing account attached (this is often required even for free use).")