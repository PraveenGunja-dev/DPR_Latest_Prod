import psycopg
import pandas as pd
import os

DB_HOST="127.0.0.1"
DB_PORT="5431"
DB_NAME="postgres"
DB_USER="postgres"
DB_PASSWORD="Prvn@3315"
PROJECT_ID = 2532 # FY25-P13

conn_info = f"host={DB_HOST} port={DB_PORT} dbname={DB_NAME} user={DB_USER} password={DB_PASSWORD}"

with psycopg.connect(conn_info) as conn:
    print("Fetching Activities...")
    query_activities = f"""
        SELECT 
            wbs_name AS "WBS Name",
            activity_id AS "Activity ID",
            name AS "Activity Name",
            status AS "Status",
            activity_type AS "Activity Type",
            planned_start AS "Planned Start Date",
            planned_finish AS "Planned Finish Date",
            baseline_start AS "Baseline Start Date",
            baseline_finish AS "Baseline Finish Date",
            actual_start AS "Actual Start Date",
            actual_finish AS "Actual Finish Date",
            percent_complete AS "% Complete",
            total_quantity AS "Total Quantity",
            uom AS "UOM",
            cumulative AS "Actual Quantity",
            balance AS "Gap (Balance)"
        FROM solar_activities
        WHERE project_object_id = {PROJECT_ID}
        ORDER BY wbs_name, planned_start;
    """
    df_activities = pd.read_sql_query(query_activities, conn)
    
    print("Fetching Resources...")
    query_resources = f"""
        SELECT 
            sa.activity_id AS "Activity ID",
            sa.name AS "Activity Name",
            sra.resource_id AS "Resource ID",
            sra.resource_name AS "Resource Name",
            sra.resource_type AS "Resource Type",
            sra.planned_units AS "Planned Units",
            sra.actual_units AS "Actual Units",
            sra.remaining_units AS "Gap (Remaining Units)",
            sra.budget_at_completion_units AS "Budget at Completion",
            sra.percent_complete AS "% Complete",
            sa.planned_start AS "Planned Start Date",
            sa.planned_finish AS "Planned Finish Date",
            sa.baseline_start AS "Baseline Start Date",
            sa.baseline_finish AS "Baseline Finish Date",
            sra.actual_start AS "Actual Start Date",
            sra.actual_finish AS "Actual Finish Date"
        FROM solar_resource_assignments sra
        LEFT JOIN solar_activities sa ON sra.activity_object_id = sa.object_id
        WHERE sra.project_object_id = {PROJECT_ID}
        ORDER BY sa.activity_id, sra.resource_name;
    """
    df_resources = pd.read_sql_query(query_resources, conn)
    
    output_file = "FY25-P13_Project_Dump_v2.xlsx"
    print(f"Writing to {output_file}...")
    
    # Timezones in dataframe columns to timezone unaware so Excel can save them
    for df in [df_activities, df_resources]:
        for col in df.columns:
            if pd.api.types.is_datetime64tz_dtype(df[col]):
                df[col] = df[col].dt.tz_localize(None)
    
    with pd.ExcelWriter(output_file, engine='openpyxl') as writer:
        df_activities.to_excel(writer, sheet_name="Activities", index=False)
        df_resources.to_excel(writer, sheet_name="Resources & Manpower", index=False)
        
    print(f"Successfully generated {output_file}!")
