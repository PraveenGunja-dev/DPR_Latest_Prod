import asyncio
import os
import sys

from app.services.p6_token_service import get_valid_p6_token, get_http_client

BASE_URL = "https://sin1.p6.oraclecloud.com/adani/p6ws/restapi"

async def test():
    token = await get_valid_p6_token()
    headers = {"Authorization": f"Bearer {token}", "Accept": "application/json"}
    
    async with get_http_client() as client:
        r = await client.get(f"{BASE_URL}/project?Filter=Name='Demo 25MW'&Fields=ObjectId,Id,Name,StartDate,FinishDate,ForecastStartDate,ForecastFinishDate", headers=headers)
        print("Demo 25MW API Response:", r.json())

if __name__ == "__main__":
    asyncio.run(test())
