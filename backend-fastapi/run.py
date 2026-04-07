
import asyncio
import sys
import uvicorn

if __name__ == "__main__":
    if sys.platform == "win32":
        # psycop3's async mode requires SelectorEventLoop on Windows.
        asyncio.set_event_loop_policy(asyncio.WindowsSelectorEventLoopPolicy())
        print("Applied WindowsSelectorEventLoopPolicy")

    uvicorn.run(
        "app.main:app",
        host="127.0.0.1",
        port=3316,
        reload=True,
        log_level="info"
    )
