import requests
import time
import json

base_url = "http://127.0.0.1:3316"
email = "admin1@adani.com"
password = "Prvn@3315"
project_id = "7312"

print(f"Logging in as {email}...")
login_res = requests.post(f"{base_url}/api/auth/login", json={"email": email, "password": password})

if login_res.status_code == 200:
    token = login_res.json().get("accessToken")
    print("\n[SUCCESS] Login successful! Your Bearer Token is:\n")
    print(token)
    print("\n" + "="*50 + "\n")
    
    headers = {"Authorization": f"Bearer {token}"}
    
    endpoints_to_test = [
        f"/api/oracle-p6/manpower-timephased-data?projectId={project_id}",
        f"/api/oracle-p6/dp-qty-data?projectId={project_id}"
    ]
    
    for endpoint in endpoints_to_test:
        url = f"{base_url}{endpoint}"
        print(f"Testing GET {endpoint}...")
        start_time = time.time()
        
        res = requests.get(url, headers=headers)
        
        elapsed = time.time() - start_time
        if res.status_code == 200:
            data = res.json()
            rows = data.get("rowCount", 0)
            print(f"[OK] Fetched {rows} rows in {elapsed:.3f} seconds.")
        else:
            print(f"[FAIL] Status {res.status_code}: {res.text}")
        print("-" * 50)
else:
    print(f"Login failed! {login_res.status_code}: {login_res.text}")
