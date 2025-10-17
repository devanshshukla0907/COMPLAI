from fastapi import APIRouter, HTTPException
from app.models.schemas import DashboardStats, DashboardCase
from app.services.supabase_client import supabase
import json

router = APIRouter()

@router.get("/dashboard/stats", response_model=DashboardStats)
async def get_dashboard_stats():
    # This function is working correctly, no changes needed here.
    try:
        open_complaints_res = supabase.table('jobs').select('*', count='exact').in_('status', ['PENDING', 'PROCESSING']).execute()
        at_risk_res = supabase.table('jobs').select('*', count='exact').ilike('report_data->predicted_fos_outcome->>outcome', '%Upheld%').execute()
        total_completed_res = supabase.table('jobs').select('*', count='exact').eq('status', 'COMPLETE').execute()
        at_risk_count = at_risk_res.count
        total_completed = total_completed_res.count
        predicted_uphold_percent = int((at_risk_count / total_completed) * 100) if total_completed > 0 else 0

        return {
            "open_complaints": open_complaints_res.count,
            "at_risk_fos": at_risk_count,
            "predicted_uphold": predicted_uphold_percent,
            "avg_frl_readability": "Grade 8.2",
            "avg_time_to_close": 14,
        }
    except Exception as e:
        print(f"Error fetching dashboard stats: {e}")
        raise HTTPException(status_code=500, detail="Could not fetch dashboard statistics.")

@router.get("/dashboard/cases", response_model=list[DashboardCase])
async def get_dashboard_cases():
    try:
        res = supabase.table('jobs').select('*').order('created_at', desc=True).limit(10).execute()
        db_jobs = res.data
        dashboard_cases = []

        for job in db_jobs:
            report_data_from_db = job.get('report_data')
            report = {}

            if report_data_from_db and isinstance(report_data_from_db, str):
                try:
                    report = json.loads(report_data_from_db)
                except json.JSONDecodeError:
                    pass
            elif report_data_from_db and isinstance(report_data_from_db, dict):
                report = report_data_from_db

            # --- THIS IS THE NEW, MORE ROBUST FIX ---
            predicted_outcome_value = report.get('predicted_fos_outcome', "")
            outcome = ""

            if isinstance(predicted_outcome_value, dict):
                # If it's a dictionary, get the 'outcome' key
                outcome = predicted_outcome_value.get('outcome', '')
            elif isinstance(predicted_outcome_value, str):
                # If it's already a string, just use it directly
                outcome = predicted_outcome_value
            # --- END OF FIX ---

            risk = "Low"
            if "Upheld" in outcome:
                risk = "High"
            elif "Rejected" not in outcome and outcome != '':
                 risk = "Medium"

            # This part now safely uses the 'report' dictionary and handles lists/strings
            recommendations = report.get('recommendations', [])
            risk_factors = report.get('key_risk_indicators', [])

            case = DashboardCase(
                id=job['job_id'][:8],
                customer="Customer",
                product="Product",
                risk=risk,
                due=job['status'],
                summary=report.get('case_summary', 'Awaiting analysis...'),
                riskFactors=[risk_factors] if isinstance(risk_factors, str) else risk_factors,
                topActions=[recommendations] if isinstance(recommendations, str) else recommendations
            )
            dashboard_cases.append(case)
            
        return dashboard_cases
    except Exception as e:
        print(f"Error fetching dashboard cases: {e}")
        raise HTTPException(status_code=500, detail="Could not fetch recent cases.")