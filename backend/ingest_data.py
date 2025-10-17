import os
import fitz  # PyMuPDF
import spacy
from sentence_transformers import SentenceTransformer
from app.services.supabase_client import supabase
from dotenv import load_dotenv

load_dotenv()

# --- CONFIGURATION ---
KNOWLEDGE_BASE_DIR = "knowledge_base"
MODEL_NAME = 'all-MiniLM-L6-v2'

# --- INITIALIZE MODELS ---
print("Loading NLP and embedding models...")
nlp = spacy.load("en_core_web_sm")
model = SentenceTransformer(MODEL_NAME)
print("Models loaded successfully.")

def extract_text_from_pdf(file_path):
    """Extracts text from a PDF file."""
    doc = fitz.open(file_path)
    text = ""
    for page in doc:
        text += page.get_text()
    return text

def extract_metadata_from_text(text, filename):
    """
    Extracts metadata using spaCy and rule-based logic.
    
    NOTE: This is a simplified placeholder. A real implementation would require
    sophisticated regex, keyword matching, and potentially a trained NER model
    to reliably extract these fields from unstructured text.
    """
    doc = nlp(text)
    
    # Example placeholder logic
    product_type = "Personal Loan" # Default, find in text
    key_themes = ["Affordability", "Customer Service"] # Extract from common phrases
    fos_outcome = "Upheld" if "upheld" in text.lower() else "Not Upheld"
    
    # Dummy values for demonstration
    metadata = {
        'case_id': os.path.splitext(filename)[0],
        'firm_name': 'Example Bank PLC',
        'product_type': product_type,
        'key_themes': key_themes,
        'fos_outcome': fos_outcome,
        'compensation_awarded': 500.00,
        'redress_amount': 250.00,
        'remedial_action': ['Apology', 'System Update']
    }
    return metadata

def process_and_ingest():
    """
    Processes all documents in the knowledge base directory, generates embeddings,
    and inserts them into the Supabase 'precedents' table.
    """
    print(f"Starting ingestion from '{KNOWLEDGE_BASE_DIR}' directory...")
    files_processed = 0
    for filename in os.listdir(KNOWLEDGE_BASE_DIR):
        file_path = os.path.join(KNOWLEDGE_BASE_DIR, filename)
        text = ""
        
        try:
            if filename.lower().endswith(".pdf"):
                text = extract_text_from_pdf(file_path)
            elif filename.lower().endswith(".txt"):
                with open(file_path, 'r', encoding='utf-8') as f:
                    text = f.read()
            else:
                continue # Skip unsupported files

            if not text:
                print(f"Warning: Could not extract text from {filename}. Skipping.")
                continue

            # 1. Extract Metadata
            metadata = extract_metadata_from_text(text, filename)
            
            # 2. Generate Embedding
            # We embed a concatenated string of key info for better retrieval
            embedding_text = f"Case: {metadata['case_id']}. Product: {metadata['product_type']}. Themes: {', '.join(metadata['key_themes'])}. Outcome: {metadata['fos_outcome']}"
            embedding = model.encode(embedding_text).tolist()

            # 3. Prepare data for Supabase
            data_to_insert = {
                **metadata,
                'full_text': text,
                'embedding': embedding
            }

            # 4. Insert into Supabase
            # Using upsert to avoid duplicate case_id entries if script is run multiple times
            data, count = supabase.table('precedents').upsert(data_to_insert, on_conflict='case_id').execute()

            print(f"Successfully processed and ingested: {filename}")
            files_processed += 1

        except Exception as e:
            print(f"Error processing file {filename}: {e}")
            
    print(f"\nIngestion complete. Total files processed: {files_processed}")

if __name__ == "__main__":
    process_and_ingest()