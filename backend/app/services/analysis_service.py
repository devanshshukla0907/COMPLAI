import fitz # PyMuPDF
import spacy
import google.generativeai as genai
from sentence_transformers import SentenceTransformer
from app.services.supabase_client import supabase
from app.core.config import settings
import json

# --- INITIALIZE MODELS AND API ---

_nlp = None
_embedding_model = None
def get_nlp_model():
    """Loads the spaCy model once and caches it."""
    global _nlp
    if _nlp is None:
        print("Loading spaCy model for the first time...")
        _nlp = spacy.load("en_core_web_sm")
        print("spaCy model loaded.")
    return _nlp

def get_embedding_model():
    """Loads the SentenceTransformer model once and caches it."""
    global _embedding_model
    if _embedding_model is None:
        print("Loading SentenceTransformer model for the first time...")
        _embedding_model = SentenceTransformer('all-MiniLM-L6-v2')
        print("SentenceTransformer model loaded.")
    return _embedding_model

def extract_text(file_data: bytes) -> str:
    """Extracts text from a file-like object (PDF)."""
    text = ""
    # PyMuPDF needs a file path or a bytes stream
    with fitz.open(stream=file_data, filetype="pdf") as doc:
        for page in doc:
            text += page.get_text()
    return text

def run_analysis_pipeline(job_id: str, complaint_file_data: bytes, frl_file_data: bytes):
    """The main AI analysis pipeline."""
    try:
        nlp = get_nlp_model()
        embedding_model = get_embedding_model()
        genai.configure(api_key=settings.GEMINI_API_KEY)


        # 1. Update job status to PROCESSING
        supabase.table('jobs').update({'status': 'PROCESSING'}).eq('job_id', job_id).execute()

        # 2. Extract text from documents
        complaint_text = extract_text(complaint_file_data)
        frl_text = extract_text(frl_file_data)

        supabase.table('jobs').update({
            'complaint_text': complaint_text,
            'frl_text': frl_text
        }).eq('job_id', job_id).execute()

        # 3. NLP: Extract keywords/entities for filtering
        doc = nlp(complaint_text)
        # Simplified extraction logic
        product_type = "Personal Loan" # Placeholder
        key_themes = ["Affordability"] # Placeholder
        # In a real app, you would have a more robust system for this.

        # 4. Generate embedding for the new complaint
        complaint_embedding = embedding_model.encode(complaint_text).tolist()

        # 5. Hybrid Search: Find top 5 similar precedents
        similar_cases = supabase.rpc('hybrid_search', {
            'query_embedding': complaint_embedding,
            'p_product_type': product_type,
            'p_key_themes': key_themes,
            'match_count': 5
        }).execute()
        
        precedent_context = "\n\n---\n\n".join([
            f"Precedent Case ID: {case['case_id']}\n\n{case['full_text']}"
            for case in similar_cases.data
        ])

        # ... (keep all the code before the master_prompt)

        # 6. Construct Master Prompt for Gemini
        master_prompt = f"""
        **Role:** You are an expert Financial Ombudsman Service (FOS) case analyst. Your task is to provide a detailed, structured compliance and risk assessment report.

        **Input Documents:**
        1.  **Customer Complaint:**
            ```
            {complaint_text}
            ```

        2.  **Firm's Final Response Letter (FRL):**
            ```
            {frl_text}
            ```

        3.  **Relevant Historical Precedents:**
            ```
            {precedent_context}
            ```

        **Task:**
        Analyze the provided documents and generate a JSON object with the following 8 keys. Do not include any text outside of the JSON object.

        1.  `case_summary`: A concise summary of the customer's complaint as a single string.
        2.  `frl_compliance_checks`: An array of objects, each with 'item' (e.g., "Clarity", "Timeliness"), 'compliant' (true/false), and a 'reason' string.
        3.  `historical_precedent_analysis`: **An array of strings.** Each string must be a single bullet point. For each point, you MUST cite the relevant Case ID (e.g., "DRN0060527") that supports your analysis.
        4.  `key_risk_indicators`: **An array of strings.** Each string must be a single, concise bullet point identifying a key compliance or conduct risk.
        5.  `predicted_fos_outcome`: **This field is MANDATORY.** You MUST provide a prediction. Generate an object with two keys: a 'outcome' string (e.g., "Likely to be Upheld", "Likely to be Rejected", "50/50 - Unclear") and a 'confidence' string (e.g., "85%", "70%", "50%"). Do NOT return "Not predicted" or "N/A".
        6.  `financial_impact_assessment`: An object with a 'low_estimate' and 'high_estimate' of the potential financial impact.
        7.  `recommendations`: A single string with specific, actionable steps the firm should take.
        8.  `executive_summary`: A high-level, 3-sentence summary as a single string.

        **Output Format:** Respond with only a valid JSON object.
        """
        
# ... (keep all the code after the master_prompt)
        
        # 7. Call Generative LLM
        model = genai.GenerativeModel('models/gemini-2.5-flash-preview-05-20')
        response = model.generate_content(master_prompt)
        
        # --- THIS IS THE FIX ---
        # Instead of a simple strip, find the start and end of the JSON object
        raw_text = response.text
        try:
            # Find the first '{' and the last '}'
            start_index = raw_text.find('{')
            end_index = raw_text.rfind('}') + 1
            
            # Slice the string to get only the JSON part
            json_response_text = raw_text[start_index:end_index]
            
            # Now, load the cleaned string
            report_data = json.loads(json_response_text)
        except (ValueError, json.JSONDecodeError) as e:
            # Handle cases where the response is completely broken
            print(f"!!! CRITICAL: Failed to parse JSON from AI response. Error: {e}")
            print(f"--- RAW AI RESPONSE --- \n{raw_text}\n-----------------------")
            raise Exception("AI response was not valid JSON.")
        # --- END OF FIX ---

        # 8. Save report and update job status to COMPLETE
        supabase.table('jobs').update({
            'status': 'COMPLETE',
            'report_data': report_data
        }).eq('job_id', job_id).execute()

    except Exception as e:
        print(f"Error in analysis pipeline for job {job_id}: {e}")
        # Update job status to ERROR
        supabase.table('jobs').update({'status': 'ERROR', 'error_message': str(e)}).eq('job_id', job_id).execute()