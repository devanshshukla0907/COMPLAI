from fastapi import APIRouter, UploadFile, File, HTTPException, Path, BackgroundTasks
from app.models.schemas import JobSubmissionResponse, ReportResponse # Uses the updated ReportResponse
from app.services.supabase_client import supabase
from app.services import analysis_service
import uuid
import google.generativeai as genai
from app.core.config import settings
router = APIRouter()

@router.post("/analyze", response_model=JobSubmissionResponse, status_code=202)
async def analyze_documents(
    background_tasks: BackgroundTasks,
    complaint_file: UploadFile = File(...), 
    frl_file: UploadFile = File(...)
):
    job_id = uuid.uuid4()
    complaint_data = await complaint_file.read()
    frl_data = await frl_file.read()

    try:
        supabase.table('jobs').insert({
            'job_id': str(job_id),
            'status': 'PENDING'
        }).execute()
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to create job: {e}")

    background_tasks.add_task(
        analysis_service.run_analysis_pipeline, 
        str(job_id), 
        complaint_data, 
        frl_data
    )
    
    return {"job_id": str(job_id), "status": "PENDING"}

@router.get("/report/{job_id}", response_model=ReportResponse)
async def get_report(job_id: str = Path(..., title="The ID of the analysis job")):
    try:
        result = supabase.table('jobs').select('*').eq('job_id', job_id).single().execute()
        job = result.data
        if not job:
            raise HTTPException(status_code=404, detail="Job not found")
        
        # This now matches the updated schema and frontend expectation
        return {
            "job_id": job['job_id'],
            "status": job['status'],
            "report": job.get('report_data') # Key changed from "report_data" to "report"
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
    


@router.post("/report/{job_id}/explain")
async def explain_report_prediction(job_id: str):
    try:
        # 1. Fetch the original job data, including texts and the report
        res = supabase.table('jobs').select('complaint_text, frl_text, report_data').eq('job_id', job_id).single().execute()
        job_data = res.data
        if not all([job_data.get('complaint_text'), job_data.get('frl_text'), job_data.get('report_data')]):
            raise HTTPException(status_code=404, detail="Required data for explanation not found.")

        # 2. Construct the explanation prompt
        explanation_prompt = f"""
        **Context:**
        An AI model previously analyzed a customer complaint and a firm's Final Response Letter (FRL).
        The model's final analysis was: {json.dumps(job_data['report_data'])}

        **Original Complaint:**
        {job_data['complaint_text']}

        **Original FRL:**
        {job_data['frl_text']}

        **Task:**
        Based on all the provided context, explain IN THREE CONCISE BULLET POINTS the primary reasons for the 'predicted_fos_outcome'. Focus on the most critical factors.
        Start each point with a hyphen (-).
        
        **Output:**
        Return ONLY the three bullet points as a single string, with each point separated by a newline character.
        """

        # 3. Call the Gemini API
        genai.configure(api_key=settings.GEMINI_API_KEY)
        model = genai.GenerativeModel('models/gemini-2.5-flash-preview-05-20') # Use your working model
        response = model.generate_content(explanation_prompt)
        
        # 4. Format and return the response
        explanation_points = [point.strip() for point in response.text.split('-') if point.strip()]
        
        return {"explanation": explanation_points}

    except Exception as e:
        print(f"Error generating explanation for job {job_id}: {e}")
        raise HTTPException(status_code=500, detail="Failed to generate explanation.")
    


# ... (keep all existing imports and endpoints at the top of the file)

# --- ADD THIS NEW ENDPOINT AT THE BOTTOM ---
@router.post("/report/{job_id}/explain-confidence")
async def explain_confidence_score(job_id: str):
    try:
        # 1. Fetch the original job data, including texts and the report
        res = supabase.table('jobs').select('complaint_text, frl_text, report_data').eq('job_id', job_id).single().execute()
        job_data = res.data
        if not all([job_data.get('complaint_text'), job_data.get('frl_text'), job_data.get('report_data')]):
            raise HTTPException(status_code=404, detail="Required data for explanation not found.")

        report = job_data['report_data']
        predicted_outcome = report.get('predicted_fos_outcome', {})
        outcome_text = predicted_outcome.get('outcome', 'N/A')
        confidence_score = predicted_outcome.get('confidence', 'N/A')

        # 2. Construct a specific prompt for the explanation
        explanation_prompt = f"""
        **Context:**
        An AI model previously analyzed a customer complaint and a firm's Final Response Letter (FRL).
        The model predicted the FOS outcome would be "{outcome_text}" with a confidence score of "{confidence_score}".

        **Original Complaint:**
        {job_data['complaint_text']}

        **Original FRL:**
        {job_data['frl_text']}

        **Task:**
        Based on all the provided context, explain in three concise bullet points the primary reasons you assigned the confidence score of "{confidence_score}". 
        Focus on factors of certainty or uncertainty (e.g., "Confidence is high because of a clear precedent match," or "Confidence is moderate due to conflicting evidence.").
        Start each point with a hyphen (-).
        
        **Output:**
        Return ONLY the three bullet points as a single string, with each point separated by a newline character.
        """

        # 3. Call the Gemini API
        genai.configure(api_key=settings.GEMINI_API_KEY)
        model = genai.GenerativeModel('models/gemini-2.5-flash-preview-05-20') # Use your working model
        response = model.generate_content(explanation_prompt)
        
        # 4. Format and return the response
        explanation_points = [point.strip() for point in response.text.split('-') if point.strip()]
        
        return {"explanation": explanation_points}

    except Exception as e:
        print(f"Error generating confidence explanation for job {job_id}: {e}")
        raise HTTPException(status_code=500, detail="Failed to generate explanation.")
