
import asyncio
import os
import sys
import uvicorn

if __name__ == "__main__":
    if sys.platform == "win32":
        # psycop3's async mode requires SelectorEventLoop on Windows.
        import warnings
        with warnings.catch_warnings():
            warnings.simplefilter("ignore", DeprecationWarning)
            asyncio.set_event_loop_policy(asyncio.WindowsSelectorEventLoopPolicy())
        print("Applied WindowsSelectorEventLoopPolicy (Warnings Suppressed)")

    from dotenv import load_dotenv
    load_dotenv()
    port = int(os.getenv("PORT", 3316))
    
    # Production mode: multiple workers, no reload
    # Development mode: single worker with reload
    is_dev = os.getenv("ENV", "development").lower() == "development"
    
    if is_dev:
        uvicorn.run(
            "app.main:app",
            host="127.0.0.1",
            port=port,
            reload=True,
            log_level="info"
        )
    else:
        # Production: use multiple workers for horizontal scaling
        # workers = (2 * CPU cores) + 1 is a good starting point
        cpu_count = os.cpu_count() or 2
        workers = min((2 * cpu_count) + 1, 8)  # Cap at 8 workers
        print(f"Starting production server with {workers} workers on port {port}")
        uvicorn.run(
            "app.main:app",
            host="0.0.0.0",
            port=port,
            workers=workers,
            log_level="info",
            access_log=False,  # Disable access logs for performance
        )
