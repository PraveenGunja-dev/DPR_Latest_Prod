import asyncio
import os
import sys

# Ensure app is in path
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app.database import create_pool, get_pool, close_pool

async def apply_bess_fix():
    print("Connecting to database...")
    await create_pool()
    pool = await get_pool()
    try:
        print("Dropping old constraint (if exists)...")
        await pool.execute("ALTER TABLE dpr_supervisor_entries DROP CONSTRAINT IF EXISTS dpr_supervisor_entries_sheet_type_check")
        
        print("Adding new constraint with BESS sheets...")
        await pool.execute("""
            ALTER TABLE dpr_supervisor_entries ADD CONSTRAINT dpr_supervisor_entries_sheet_type_check
            CHECK (sheet_type IN (
                'dp_qty', 'dp_block', 'ac_sheet', 'dc_sheet',
                'manpower_details', 'manpower_details_2',
                'testing_commissioning',
                'switchyard', 'transmission_line', 'infra_works',
                'wind_summary', 'wind_progress', 'wind_manpower',
                'pss_summary', 'pss_progress', 'pss_manpower',
                'wind_tower_lot', 'wind_crane_pad', 'wind_precast',
                'wind_33kv', 'wind_33kv_oh', 'wind_33kv_ug', 'wind_pss', 'wind_ehv',
                'wind_equipment_mob', 'wind_machinery', 'wind_rain_fall',
                'wind_productivity', 'wind_erection', 'wind_stone_column',
                'pss_dpr', 'pss_manpower_machinery', 'pss_tower_erection',
                'pss_tl_visual', 'pss_tl_stringing', 'pss_tl_erection', 'pss_tl_foundation',
                'pss_civil_peb', 'pss_electrical', 'pss_transmission',
                'other_general', 'resource', 'issues', 'summary',
                'bess_summary', 'bess_civil', 'bess_electrical', 'bess_bop', 'bess_testing', 'bess_dp_qty', 'bess_manpower', 'bess_productivity'
            ))
        """)
        print("Database constraints successfully updated for BESS!")
    except Exception as e:
        print(f"Error applying fix: {e}")
    finally:
        await close_pool()

if __name__ == "__main__":
    if sys.platform == "win32":
        asyncio.set_event_loop_policy(asyncio.WindowsSelectorEventLoopPolicy())
    asyncio.run(apply_bess_fix())
