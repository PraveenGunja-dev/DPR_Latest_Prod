import logging
from app.database import get_pool
from app.services.p6_token_service import get_valid_p6_token, get_http_client
from sync_all_p6_data import sync_data, PROJECT_FIELDS, BASE_URL, fetch_all_retry, update_sync_progress

logger = logging.getLogger("adani-flow.auto_sync")

async def auto_sync_new_projects():
    """
    Checks for new projects in P6 and fully syncs them into the local DB.
    Runs daily at 1 AM.
    """
    logger.info("[AutoSync] Starting auto-sync check for new P6 projects...")
    try:
        pool = await get_pool()
        if not pool:
            logger.error("[AutoSync] Database pool not available.")
            return

        # Set initial global status
        await update_sync_progress(pool, "-1", 5, "Initializing background scan...")

        # 1. Get existing project ObjectIds from local DB
        existing_rows = await pool.fetch('SELECT "ObjectId" FROM p6_projects')
        existing_oids = {int(row["ObjectId"]) for row in existing_rows}

        # 2. Fetch project list from P6
        await update_sync_progress(pool, "-1", 20, "Fetching project list from P6...")
        token = await get_valid_p6_token()
        headers = {"Authorization": f"Bearer {token}", "Accept": "application/json"}
        
        async with get_http_client(timeout=120.0) as client:
            projects = await fetch_all_retry(
                client, f"{BASE_URL}/project?Fields={PROJECT_FIELDS}", headers, "Projects"
            )
        
        if not projects:
            logger.warning("[AutoSync] No projects fetched from P6. Aborting sync.")
            await update_sync_progress(pool, "-1", 100, "Scan aborted: no projects found.", is_syncing=False)
            return

        # 3. Identify new projects
        await update_sync_progress(pool, "-1", 50, "Analyzing project list for new entries...")
        new_projects = []
        for p in projects:
            oid = int(p["ObjectId"])
            if oid not in existing_oids:
                new_projects.append(p)

        if not new_projects:
            logger.info("[AutoSync] No new projects found in P6.")
            await update_sync_progress(pool, "-1", 100, "Scan complete: no new projects found.", is_syncing=False)
            return

        logger.info(f"[AutoSync] Found {len(new_projects)} new project(s). Starting sync...")
        await update_sync_progress(pool, "-1", 60, f"Found {len(new_projects)} new project(s). Starting sync...")

        # 4. Sync each new project
        total_new = len(new_projects)
        for idx, p in enumerate(new_projects):
            oid = int(p["ObjectId"])
            name = p.get("Name", "Unknown")
            logger.info(f"[AutoSync] Syncing new project: {name} (ObjectId: {oid})")
            
            # Update global progress dynamically
            prog = 60 + int(40 * (idx / total_new))
            await update_sync_progress(pool, "-1", prog, f"Syncing {idx+1}/{total_new}: {name}")
            
            try:
                await sync_data(target_project_id=str(oid), full_sync=False, pool=pool)
                logger.info(f"[AutoSync] Successfully synced new project: {name}")
            except Exception as e:
                logger.error(f"[AutoSync] Failed to sync project {name} (ObjectId: {oid}): {e}")

        logger.info("[AutoSync] Auto-sync for new projects completed.")
        await update_sync_progress(pool, "-1", 100, "Sync complete!", is_syncing=False)

    except Exception as e:
        logger.error(f"[AutoSync] Error during auto-sync: {e}")
        # Attempt to reset status on failure
        try:
            pool = await get_pool()
            if pool:
                await update_sync_progress(pool, "-1", 0, f"Sync failed: {e}", is_syncing=False)
        except Exception:
            pass
