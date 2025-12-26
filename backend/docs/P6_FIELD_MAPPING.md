# P6 to Local Database Field Mapping

This document describes how Oracle P6 API fields map to local database columns.

## p6_activities Table

| Local DB Column | P6 API Field | Data Type | Description |
|-----------------|--------------|-----------|-------------|
| `object_id` | `ObjectId` | INTEGER | P6 Activity unique identifier |
| `activity_id` | `Id` | VARCHAR | Activity ID code (e.g., "51Z2-CC-1000") |
| `name` | `Name` | VARCHAR | Activity name/description |
| `project_object_id` | `ProjectObjectId` | INTEGER | Parent project P6 ObjectId |
| `wbs_object_id` | `WBSObjectId` | INTEGER | Work Breakdown Structure ObjectId |
| `status` | `Status` | VARCHAR | Activity status (e.g., "Not Started", "In Progress", "Completed") |
| `percent_complete` | `PercentComplete` | DECIMAL | Completion percentage (0-100) |
| `start_date` | `StartDate` | TIMESTAMP | Current start date |
| `finish_date` | `FinishDate` | TIMESTAMP | Current finish date |
| `planned_start_date` | `PlannedStartDate` | TIMESTAMP | Baseline planned start |
| `planned_finish_date` | `PlannedFinishDate` | TIMESTAMP | Baseline planned finish |
| `actual_start_date` | `ActualStartDate` | TIMESTAMP | Actual start date |
| `actual_finish_date` | `ActualFinishDate` | TIMESTAMP | Actual finish date |
| `actual_duration` | `ActualDuration` | DECIMAL | Actual duration in days |
| `remaining_duration` | `RemainingDuration` | DECIMAL | Remaining duration in days |
| `total_quantity` | `PlannedNonLaborUnits` or `PlannedLaborUnits` | DECIMAL | Total quantity (from labor/non-labor units) |
| `uom` | N/A | VARCHAR | Unit of Measure (not directly available in API) |

---

## p6_projects Table

| Local DB Column | P6 API Field | Data Type | Description |
|-----------------|--------------|-----------|-------------|
| `object_id` | `ObjectId` | INTEGER | P6 Project unique identifier |
| `p6_id` | `Id` | VARCHAR | Project ID code |
| `name` | `Name` | VARCHAR | Project name |
| `status` | `Status` | VARCHAR | Project status |
| `start_date` | `StartDate` | TIMESTAMP | Project start date |
| `finish_date` | `FinishDate` | TIMESTAMP | Project finish date |

---

## p6_wbs Table

| Local DB Column | P6 API Field | Data Type | Description |
|-----------------|--------------|-----------|-------------|
| `object_id` | `ObjectId` | INTEGER | WBS unique identifier |
| `project_object_id` | `ProjectObjectId` | INTEGER | Parent project ObjectId |
| `parent_object_id` | `ParentObjectId` | INTEGER | Parent WBS ObjectId (for hierarchy) |
| `code` | `Code` | VARCHAR | WBS code (used as block/plot identifier) |
| `name` | `Name` | VARCHAR | WBS element name |
| `seq_num` | `SequenceNumber` | INTEGER | Sequence number for ordering |
| `status` | `Status` | VARCHAR | WBS status |

---

## Frontend Field Mapping (from `_mapToFrontendFormat`)

| Frontend Field | Source Column | Description |
|----------------|---------------|-------------|
| `activityId` | `activity_id` | Activity ID code |
| `objectId` | `object_id` | P6 ObjectId |
| `description` | `name` | Activity name |
| `activities` | `name` | Same as description |
| `status` | `status` | Activity status |
| `percentComplete` | `percent_complete` | Completion % as number |
| `completionPercentage` | `percent_complete` | Completion % as string |
| `basePlanStart` | `planned_start_date` | Baseline start date |
| `basePlanFinish` | `planned_finish_date` | Baseline finish date |
| `actualStart` | `actual_start_date` | Actual start date |
| `actualFinish` | `actual_finish_date` | Actual finish date |
| `forecastStart` | `start_date` | Current/forecast start |
| `forecastFinish` | `finish_date` | Current/forecast finish |
| `block` | `wbs_name` | WBS name (from join) |
| `plot` | `wbs_code` | WBS code (from join) |
| `totalQuantity` | `total_quantity` | Quantity from PlannedNonLaborUnits |
| `uom` | `uom` | Unit of measure |
| `phase` | `phase` or `wbs_name` | Phase name (fallback to WBS) |

---

## P6 REST API Endpoints Used

| Endpoint | Purpose | Key Fields |
|----------|---------|------------|
| `/project` | Fetch projects | ObjectId, Id, Name, Status, StartDate, FinishDate |
| `/wbs` | Fetch WBS structure | ObjectId, Name, Code, ProjectObjectId, ParentObjectId |
| `/activity` | Fetch activities | ObjectId, Id, Name, Status, PercentComplete, PlannedNonLaborUnits, PlannedLaborUnits, dates |
| `/resourceassignment` | Fetch resource assignments | ObjectId, ActivityObjectId, PlannedUnits, UnitOfMeasure (may return 404) |

---

## Notes

1. **Total Quantity Source**: Primarily from `PlannedNonLaborUnits` on activities. Falls back to `PlannedLaborUnits` if non-labor is empty.

2. **UOM**: The `/resourceassignment` endpoint contains `UnitOfMeasure`, but this endpoint returns 404 in the current P6 instance.

3. **UDF Endpoint**: The `/udfvalue` endpoint for custom fields returns 404 in this P6 instance.
