from sqlalchemy import create_engine, text
engine = create_engine('postgresql://postgres:Nikitha@localhost/DPR')
with engine.connect() as conn:
    res = conn.execute(text("SELECT id, project_name FROM projects WHERE project_name ILIKE '%AHEJ5L PSS-05%'"))
    print(list(res))
