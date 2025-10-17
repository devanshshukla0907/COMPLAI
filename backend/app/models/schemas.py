from pydantic import BaseModel, EmailStr
from typing import List, Optional, Dict, Any

# --- Auth Schemas (Unchanged) ---
class UserCreate(BaseModel):
    email: EmailStr
    password: str

class UserLogin(BaseModel):
    email: EmailStr
    password: str

class Token(BaseModel):
    access_token: str
    token_type: str

# --- Analysis Schemas (Unchanged) ---
class JobSubmissionResponse(BaseModel):
    job_id: str
    status: str

class ReportResponse(BaseModel):
    job_id: str
    status: str
    report: Optional[Dict[str, Any]] = None

# --- Dashboard Schemas (Updated for real data) ---
class DashboardStats(BaseModel):
    open_complaints: int
    at_risk_fos: int
    avg_frl_readability: str # Note: This will remain a placeholder
    predicted_uphold: int
    avg_time_to_close: int # Note: This will remain a placeholder

class DashboardCase(BaseModel):
    id: str
    customer: str
    product: str
    risk: str
    due: str
    summary: Optional[str] = "Not yet analyzed."
    riskFactors: Optional[List[str]] = []
    topActions: Optional[List[str]] = [] # This field was missing