from datetime import timedelta
import copy

def extract_to_history_array(data, entry_date):
    """
    Converts flat UI date fields (todayValue, yesterdayValue, historyValues)
    into a structured 'history' array format for database storage.
    """
    if isinstance(data, str):
        import json
        try:
            data = json.loads(data)
        except Exception:
            return data

    if not data or not isinstance(data.get("rows"), list):
        return data

    new_data = copy.deepcopy(data)
    
    # Calculate today and yesterday string formats based on the entry date
    if hasattr(entry_date, "strftime"):
        today_iso = entry_date.strftime("%Y-%m-%d")
        yest_date = entry_date - timedelta(days=1)
        yest_iso = yest_date.strftime("%Y-%m-%d")
    else:
        # Fallback if entry_date is somehow a string
        today_iso = str(entry_date).split("T")[0]
        # Not ideal but handles strings if passed
        yest_iso = today_iso 

    for row in new_data["rows"]:
        history_map = {}
        
        # Extract any dynamic actual_YYYY-MM-DD fields (from manpower) FIRST
        # This ensures that if both exist, explicit historyValues (UI edits) take precedence
        keys_to_remove = []
        for k, v in row.items():
            if k.startswith("actual_") and len(k) == 17: # actual_YYYY-MM-DD
                date_iso = k.replace("actual_", "")
                if v is not None:
                    history_map[date_iso] = str(v).strip()
                keys_to_remove.append(k)
                
        for k in keys_to_remove:
            row.pop(k, None)

        # Extract from historyValues object (explicit edits take priority)
        if isinstance(row.get("historyValues"), dict):
            for d_str, v_str in row["historyValues"].items():
                if v_str is not None:
                    history_map[d_str] = str(v_str).strip()
            row.pop("historyValues", None)

        # Extract yesterdayValue
        if "yesterdayValue" in row and row["yesterdayValue"] is not None:
            history_map[yest_iso] = str(row["yesterdayValue"]).strip()
            row.pop("yesterdayValue", None)
            
        # Extract todayValue
        if "todayValue" in row and row["todayValue"] is not None:
            history_map[today_iso] = str(row["todayValue"]).strip()
            row.pop("todayValue", None)

        # Build the final history array
        if history_map:
            history_array = [{"date": k, "actual": v} for k, v in history_map.items()]
            # merge with existing history array if present
            if isinstance(row.get("history"), list):
                existing = {h["date"]: h["actual"] for h in row["history"] if "date" in h}
                existing.update(history_map)
                row["history"] = [{"date": k, "actual": v} for k, v in existing.items()]
            else:
                row["history"] = history_array

    return new_data


def flatten_history_array(data, entry_date):
    """
    Converts the structured 'history' array back into flat UI fields 
    (todayValue, yesterdayValue, historyValues) so the React components don't break.
    """
    if isinstance(data, str):
        import json
        try:
            data = json.loads(data)
        except Exception:
            return data

    if not data or not isinstance(data.get("rows"), list):
        return data

    new_data = copy.deepcopy(data)
    
    if hasattr(entry_date, "strftime"):
        today_iso = entry_date.strftime("%Y-%m-%d")
        yest_date = entry_date - timedelta(days=1)
        yest_iso = yest_date.strftime("%Y-%m-%d")
    else:
        today_iso = str(entry_date).split("T")[0]
        yest_iso = today_iso 

    for row in new_data["rows"]:
        if isinstance(row.get("history"), list):
            history_values = {}
            for h in row["history"]:
                d_str = h.get("date")
                v_str = h.get("actual")
                if not d_str:
                    continue
                
                if d_str == today_iso:
                    row["todayValue"] = str(v_str)
                elif d_str == yest_iso:
                    row["yesterdayValue"] = str(v_str)
                
                row[f"actual_{d_str}"] = str(v_str)
                history_values[d_str] = str(v_str)
            
            row["historyValues"] = history_values
            
    return new_data
