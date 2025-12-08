# Oracle Primavera P6 API Integration Documentation

This document describes the API endpoints for integrating with Oracle Primavera P6 database for the Adani Flow project.

## Base URL
```
/api/oracle-p6
```

## Authentication
All endpoints require authentication using a JWT token in the Authorization header:
```
Authorization: Bearer <your-jwt-token>
```

## Endpoints

### 1. Fetch DP Qty Data
Fetches DP Qty data from Oracle P6 for a specific project and maps it to the DP Qty table format.

**Endpoint:** `GET /dp-qty-data`  
**Parameters:**
- `projectId` (required, integer) - The ID of the project to fetch data for

**Response:**
```json
{
  "message": "DP Qty data fetched successfully from Oracle P6",
  "projectId": 1,
  "rowCount": 5,
  "data": [
    {
      "slNo": "1",
      "description": "Foundation Design",
      "totalQuantity": "45",
      "uom": "Days",
      "basePlanStart": "2025-02-01",
      "basePlanFinish": "2025-03-15",
      "forecastStart": "2025-02-01",
      "forecastFinish": "2025-03-15",
      "blockCapacity": "",
      "phase": "Design Phase",
      "block": "",
      "spvNumber": "",
      "actualStart": "2025-02-01",
      "actualFinish": "",
      "remarks": "",
      "priority": "",
      "balance": "",
      "cumulative": ""
    }
  ]
}
```

### 2. Fetch Projects
Fetches all projects from Oracle P6.

**Endpoint:** `GET /projects`  
**Response:**
```json
{
  "message": "Projects fetched successfully from Oracle P6",
  "projects": [
    {
      "id": 1,
      "name": "Mundra Port Expansion",
      "location": "Gujarat, India"
    }
  ]
}
```

### 3. Get Activity Fields
Returns the list of available activity fields from Oracle P6.

**Endpoint:** `GET /activity-fields`  
**Response:**
```json
{
  "message": "Activity fields - Oracle P6 API equivalent",
  "fields": [
    "ObjectId",
    "Name",
    "ProjectId",
    "WBSObjectId",
    "PlannedStartDate",
    "PlannedFinishDate",
    "ActualStartDate",
    "ActualFinishDate",
    "BaselineStartDate",
    "BaselineFinishDate",
    "ForecastStartDate",
    "ForecastFinishDate",
    "PercentComplete",
    "PhysicalPercentComplete",
    "Duration",
    "RemainingDuration",
    "ActualDuration",
    "Status",
    "ActivityType",
    "Critical",
    "ResourceNames"
  ]
}
```

### 4. Sync Project
Initiates synchronization of project data from Oracle P6 to the local database.

**Endpoint:** `POST /sync-project`  
**Request Body:**
```json
{
  "projectId": 1
}
```

**Response:**
```json
{
  "message": "Project sync initiated with Oracle P6",
  "projectId": 1,
  "status": "pending",
  "details": "Sync process started. This may take a few minutes depending on the project size."
}
```

### 5. Fetch WBS Structure
Fetches the Work Breakdown Structure for a specific project from Oracle P6.

**Endpoint:** `GET /wbs/:projectId`  
**Parameters:**
- `projectId` (path parameter, integer) - The ID of the project

**Response:**
```json
{
  "message": "WBS structure fetched successfully from Oracle P6",
  "projectId": 1,
  "wbsItems": [
    {
      "object_id": 1001,
      "name": "Design Phase",
      "parent_wbs_object_id": null,
      "seq_num": 1
    }
  ]
}
```

### 6. Fetch Resources
Fetches resources for a specific project from Oracle P6.

**Endpoint:** `GET /resources/:projectId`  
**Parameters:**
- `projectId` (path parameter, integer) - The ID of the project

**Response:**
```json
{
  "message": "Resources fetched successfully from Oracle P6",
  "projectId": 1,
  "resources": [
    {
      "object_id": 2001,
      "name": "Engineer Team",
      "resource_type": "Labor",
      "units": "2.00"
    }
  ]
}
```

## Error Responses

All endpoints return standardized error responses:

**400 Bad Request:**
```json
{
  "message": "Project ID is required",
  "error": {
    "code": "MISSING_PROJECT_ID",
    "description": "Project ID parameter is required to fetch P6 data"
  }
}
```

**401 Unauthorized:**
```json
{
  "message": "Access token required",
  "error": {
    "code": "AUTH_TOKEN_MISSING",
    "description": "Authentication token is required"
  }
}
```

**500 Internal Server Error:**
```json
{
  "message": "Internal server error while fetching data from Oracle P6",
  "error": {
    "code": "P6_DATA_FETCH_ERROR",
    "description": "Failed to fetch data from Oracle P6 database"
  }
}
```

## Field Mapping

The following table shows how Oracle P6 fields are mapped to DP Qty table columns:

| DP Qty Table Column | Oracle P6 Field | Description |
|-------------------|----------------|-------------|
| Description | Name | Activity name from P6 |
| Total Quantity | Duration | Activity duration in days |
| UOM | - | Defaulted to "Days" |
| Base Plan Start | PlannedStartDate | Planned start date from P6 |
| Base Plan Finish | PlannedFinishDate | Planned finish date from P6 |
| Forecast Start | BaselineStartDate | Baseline start date from P6 |
| Forecast Finish | BaselineFinishDate | Baseline finish date from P6 |
| Phase | WBS Name | Work Breakdown Structure name |
| Actual Start | ActualStartDate | User-entered actual start date |
| Actual Finish | ActualFinishDate | User-entered actual finish date |
| Remarks | - | User-entered remarks |
| Priority | - | User-entered priority |
| Block | - | User-entered block information |
| SPV Number | - | User-entered SPV number |
| Block Capacity | - | User-entered block capacity |
| Balance | - | Auto-calculated balance |
| Cumulative | - | Auto-calculated cumulative value |

## Implementation Notes

1. **Data Population**: The DP Qty table automatically populates read-only fields from Oracle P6 when a project is selected.
2. **User Input**: Users can edit the fields marked as editable in the field mapping table.
3. **Auto-calculation**: Balance and Cumulative fields are auto-calculated based on other values.
4. **Sync Process**: The sync endpoint initiates a background process to synchronize data between Oracle P6 and the local database.