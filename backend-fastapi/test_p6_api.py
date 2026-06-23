import asyncio
from app.services.p6_token_service import get_valid_p6_token, get_http_client
from app.database import get_pool

BASE_URL = "https://sin1.p6.oraclecloud.com/adani/p6ws/restapi"

async def main():
    pool = await get_pool()
    # Find a project ID to test with
    proj_id = await pool.fetchval("SELECT object_id FROM projects WHERE name ILIKE '%BESS%' LIMIT 1")
    if not proj_id:
        proj_id = await pool.fetchval("SELECT object_id FROM projects LIMIT 1")

    token = await get_valid_p6_token()
    headers = {"Authorization": f"Bearer {token}", "Accept": "application/json"}

    async with get_http_client(timeout=30.0) as client:
        # Test if WBSPath exists
        url = f"{BASE_URL}/activity?Filter=ProjectObjectId={proj_id}&Fields=ObjectId,Name,WBSName,WBSPath"
        print(f"Fetching from {url}")
        r = await client.get(url, headers=headers)
        if r.status_code == 200:
            data = r.json()
            for a in data[:5]:
                print(a)
        else:
            print("Error:", r.status_code, r.text)

if __name__ == '__main__':
    asyncio.run(main())
