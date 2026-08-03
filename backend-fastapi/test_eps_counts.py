import asyncio
import sys

sys.path.append("d:\\DPR\\Digitalized_DPR_Prod\\backend-fastapi")

import httpx
from app.config import settings
from app.services.p6_token_service import generate_p6_token

async def test():
    try:
        print("Generating P6 Token...")
        token = await generate_p6_token()
        print("Token generated successfully.")
        
        headers = {
            "Authorization": f"Bearer {token}",
            "Accept": "application/json"
        }
        
        api_url = settings.ORACLE_P6_BASE_URL
        print(f"Querying P6 Projects at {api_url}/project ...")
        
        async with httpx.AsyncClient(verify=False, timeout=30.0) as client:
            resp = await client.get(
                f"{api_url}/project?Fields=ObjectId,Id,Name,ParentEPSName",
                headers=headers
            )
            
            if resp.status_code == 200:
                data = resp.json()
                projects = data if isinstance(data, list) else data.get("Project", data)
                if not isinstance(projects, list):
                    print(f"Unknown response format: {data.keys() if isinstance(data, dict) else type(data)}")
                    return
                
                print(f"Total projects returned from P6: {len(projects)}")
                
                # Count Khavda
                khavda_count = 0
                for p in projects:
                    name = p.get("Name", "") or ""
                    eps = p.get("ParentEPSName", "") or ""
                    if 'khavda' in name.lower() or 'khavda' in eps.lower() or 'khavada' in name.lower() or 'khavada' in eps.lower():
                        khavda_count += 1
                
                print(f"Projects with Khavda in Name or EPS: {khavda_count}")
                
            else:
                print(f"Failed to fetch projects. Status: {resp.status_code}")
                print(resp.text)
                
    except Exception as e:
        print(f"Error: {e}")

if __name__ == "__main__":
    asyncio.run(test())
