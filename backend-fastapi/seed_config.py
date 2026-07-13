import asyncio
import os
import sys

# Ensure app is in path
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app.database import create_pool, get_pool, close_pool

async def seed_config():
    await create_pool()
    pool = await get_pool()
    
    try:
        # Seed Project Configurations
        projects_to_seed = [
            # Drone eligible projects
            ("FY25-P10", True, "standard"),
            ("FY25-P11", True, "standard"),
            ("FY25-P12", True, "standard"),
            ("FY25-P13", True, "standard"),
        ]
        
        print("Seeding project configurations...")
        for p6_id, drone, layout in projects_to_seed:
            await pool.execute(
                """
                INSERT INTO project_configurations (p6_id, enable_drone_integration, dashboard_layout_type) 
                VALUES ($1, $2, $3)
                ON CONFLICT (p6_id) DO UPDATE SET 
                enable_drone_integration = $2, dashboard_layout_type = $3
                """,
                p6_id, drone, layout
            )

        # Seed WBS Sheet Mappings
        wbs_patterns = [
            ("switchyard", "SWITCHYARD", False),
            ("switchyard", "33KV", False),
            ("switchyard", "POOLING SUBSTATION", False),
            ("switchyard", "PSS", False),
            ("switchyard", "EHV", False),
            ("switchyard", "TRANSMISSION", False),
            ("switchyard", "TL", False),
            ("infra_works", "INFRA", False),
            ("infra_works", "ROAD", False),
            ("infra_works", "DRAIN", False),
            ("infra_works", "BOUNDARY", False),
            ("infra_works", "FENCING", False),
        ]
        
        print("Seeding WBS Mappings...")
        # Clear existing first to avoid duplicate seeds during testing
        await pool.execute("TRUNCATE TABLE wbs_sheet_mappings RESTART IDENTITY")
        
        for sheet, pattern, is_regex in wbs_patterns:
            await pool.execute(
                """
                INSERT INTO wbs_sheet_mappings (sheet_identifier, match_pattern, is_regex) 
                VALUES ($1, $2, $3)
                """,
                sheet, pattern, is_regex
            )

        # Seed Activity Master Lists
        print("Seeding Activity Master Lists...")
        await pool.execute("TRUNCATE TABLE activity_master_lists RESTART IDENTITY")

        dc_activities = [
            "Piling - MMS (Marking, Auguring & Concreting)", "Pile Capping", "Piling - LT Cable Hanger System", "Piling - Inverters",
            "Piling - Robotic Docking System", "Array Earthing", "MMS Erection - Torque Tube/Raftar", "MMS Erection - Transmission Shaft/Bracing",
            "MMS Erection - Purlin", "MMS - RFI Completion", "Module Installation", "Module - RFI Completion", "DC Cable Laying",
            "Module Interconnection & MC4 Termination", "VOC Testing", "Robotic Structure - Docking Station Installation",
            "Robotic Structure - Reverse Station Installation", "Robotic Structure - Bridges Installation", "Robot Installation"
        ]

        ac_activities = [
            "IDT Foundation Up To Rail", "IDT Foundation Up To Plinth", "HT & LT Station - Slab", "HT LT Station - Staircase",
            "HT & LT Station - Shed Installation", "HT & LT Station - Sheeting Installation", "IDT Foundation - Grade Slab Casting & Dyke Wall",
            "NIFPS Foundation", "BOT Foundation", "Aux Transformer Foundation", "IDT Area - Fencing", "IDT Area - Gate Installation",
            "IDT Area - Gravel Filling", "Cable Hanger - Structure & Messenger Wire Erection", "LT Cable Laying", "HT Cable Laying",
            "FO Cable Laying", "Control Cable Laying", "HT Panel Erection", "LT Panel Erection", "IDT Erection", "Inverter Installation",
            "SCADA & SACU Installation", "ACDB Installation", "Aux Transformer - Installation", "NIFPS - Installation",
            "HT Cable Terminations - IDT Side", "LT Cable Terminations - LT Panel To IDT", "LT Cable Terminations - Inverter To LT Panel",
            "LT Cable Terminations - IDT Side", "LT Cable Terminations - Inverter Side"
        ]

        test_comm_activities = [
            "IDT Filtration", "IDT Testing", "HT Panel Testing", "LT Panel Testing", "Inspection Offer To Asset Commissioning Team",
            "Punch Point Identification By Asset Commissioning Team", "Punch Point Rectification And Pre Charging Sign Off",
            "CEA Application", "CEA Inspection", "CEA Compliance & Approval", "First Time Charging - Application",
            "First Time Charging - Approval", "First Time Charging", "Robot Commissioning - SCADA", "Trial Operation",
            "Trial Run Certificate", "COD"
        ]

        for order, name in enumerate(dc_activities, 1):
            await pool.execute("INSERT INTO activity_master_lists (sheet_type, activity_name, display_order) VALUES ($1, $2, $3)", "dc_sheet", name, order)
        for order, name in enumerate(ac_activities, 1):
            await pool.execute("INSERT INTO activity_master_lists (sheet_type, activity_name, display_order) VALUES ($1, $2, $3)", "ac_sheet", name, order)
        for order, name in enumerate(test_comm_activities, 1):
            await pool.execute("INSERT INTO activity_master_lists (sheet_type, activity_name, display_order) VALUES ($1, $2, $3)", "testing_commissioning", name, order)


        print("Configuration successfully seeded!")
        
    finally:
        await close_pool()

if __name__ == "__main__":
    if sys.platform == "win32":
        asyncio.set_event_loop_policy(asyncio.WindowsSelectorEventLoopPolicy())
    asyncio.run(seed_config())
