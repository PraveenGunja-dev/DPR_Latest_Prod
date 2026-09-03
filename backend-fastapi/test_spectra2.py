import asyncio
from app.services.spectra_service import fetch_available_dates, fetch_all_drone_data

async def main():
    try:
        dates = await fetch_available_dates(2)
        print("Dates response:", dates.get("dates")[-5:] if dates.get("dates") else "none")
        if dates.get("dates"):
            last_date = dates["dates"][-1]
            print(f"Fetching data for {last_date}")
            d = await fetch_all_drone_data(last_date, 2)
            for k, v in d.items():
                rows = v.get("rows", [])
                print(f"{k} row count:", len(rows))
                if rows:
                    print(f"{k} first row block_name:", rows[0].get("block_name") or rows[0].get("block"))
    except Exception as e:
        print("Error:", e)

if __name__ == "__main__":
    asyncio.run(main())
