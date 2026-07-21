from fastapi import APIRouter, HTTPException, Depends
from typing import List, Dict, Any
from pydantic import BaseModel

from app.database import get_pool
from app.auth.dependencies import get_current_user

router = APIRouter(
    prefix="/api/projects/{project_id}/solar-overrides",
    tags=["Solar Dashboard Overrides"]
)

class SolarOverrideItem(BaseModel):
    activity_name: str
    asking_rate_baseline: float | None = None
    asking_rate_forecast: float | None = None
    last_3_days_average: float | None = None

class SolarOverridesRequest(BaseModel):
    overrides: List[SolarOverrideItem]

@router.get("")
async def get_solar_overrides(project_id: int, current_user: dict = Depends(get_current_user)):
    pool = await get_pool()
    try:
        rows = await pool.fetch("""
            SELECT activity_name, asking_rate_baseline, asking_rate_forecast, last_3_days_average
            FROM solar_dashboard_overrides
            WHERE project_id = $1
        """, project_id)
        
        result = []
        for r in rows:
            result.append({
                "activity_name": r["activity_name"],
                "asking_rate_baseline": float(r["asking_rate_baseline"]) if r["asking_rate_baseline"] is not None else None,
                "asking_rate_forecast": float(r["asking_rate_forecast"]) if r["asking_rate_forecast"] is not None else None,
                "last_3_days_average": float(r["last_3_days_average"]) if r["last_3_days_average"] is not None else None
            })
        return result
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.post("")
async def save_solar_overrides(project_id: int, data: SolarOverridesRequest, current_user: dict = Depends(get_current_user)):
    pool = await get_pool()
    try:
        # Upsert logic
        for item in data.overrides:
            await pool.execute("""
                INSERT INTO solar_dashboard_overrides (project_id, activity_name, asking_rate_baseline, asking_rate_forecast, last_3_days_average)
                VALUES ($1, $2, $3, $4, $5)
                ON CONFLICT (project_id, activity_name) DO UPDATE SET
                    asking_rate_baseline = EXCLUDED.asking_rate_baseline,
                    asking_rate_forecast = EXCLUDED.asking_rate_forecast,
                    last_3_days_average = EXCLUDED.last_3_days_average
            """, project_id, item.activity_name, item.asking_rate_baseline, item.asking_rate_forecast, item.last_3_days_average)
            
        return {"success": True, "message": "Overrides saved successfully"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
