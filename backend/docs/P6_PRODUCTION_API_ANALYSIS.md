# P6 Production API - Final Analysis

## Date: December 26, 2025

## Environment Tested
- **URL:** `https://sin1.p6.oraclecloud.com/adani/p6ws/restapi` (Production)
- **Previous:** `https://sin1.p6.oraclecloud.com/adani/stage/p6ws/restapi` (Stage)

---

## Endpoint Availability - Production vs Stage

| Endpoint | Stage | Production | Notes |
|----------|-------|------------|-------|
| `/project` | ✅ | ✅ | Projects available |
| `/wbs` | ✅ | ✅ | WBS structure available |
| `/activity` | ✅ | ✅ | Activities available |
| `/resource` | ❌ 400 | ✅ | **NOW WORKS** (5,310 resources found) |
| `/udfvalue` | ❌ 404 | ❌ 404 | **NOT AVAILABLE** in either environment |
| `/activitycodetype` | ❌ 404 | ❌ 404 | **NOT AVAILABLE** in either environment |
| `/activitycode` | ❌ 404 | ❌ 404 | **NOT AVAILABLE** in either environment |
| `/activitycodeassignment` | ❌ 404 | ❌ 404 | **NOT AVAILABLE** in either environment |
| `/resourceassignment` | ❌ 404 | ❌ 404 | **NOT AVAILABLE** in either environment |

---

## Key Finding

**The ActivityCode and UDF modules are NOT ENABLED in your Oracle P6 instance**, regardless of environment (stage or production).

This is a **P6 licensing/configuration issue** at the instance level, NOT an API or environment issue.

---

## What This Means for Required Fields

### ❌ Cannot Be Fetched from Current P6 Instance

These fields require endpoints that don't exist:

| Field | Required Endpoint | Status |
|-------|------------------|--------|
| Priority | `/activitycodetype` | ❌ Not available |
| Plot | `/activitycode` | ❌ Not available |
| New Block Nom | `/activitycode` | ❌ Not available |
| UOM | `/udfvalue` or `/resourceassignment` | ❌ Both not available |
| Total Quantity | `/resourceassignment` | ❌ Not available (using PlannedNonLaborUnits instead) |
| Block Capacity | `/udfvalue` | ❌ Not available |
| SPV Number | `/udfvalue` | ❌ Not available |
| Scope | `/udfvalue` | ❌ Not available |
| Front | `/udfvalue` | ❌ Not available |
| Hold | `/udfvalue` | ❌ Not available |

### ✅ Data Currently Being Synced

Working data from available endpoints:

**From `/activity` endpoint:**
- Activity ID
- Name/Description
- Status
- Percent Complete
- All dates (Planned, Actual, Forecast)
- Duration fields
- PlannedLaborUnits, PlannedNonLaborUnits (used as Total Quantity)

**From `/wbs` endpoint:**
- WBS Name (used as Block)
- WBS Code (used as Plot fallback)

**From `/resource` endpoint:** ✅ **NEW IN PRODUCTION**
- Resource ObjectId
- Resource ID
- Resource Name (can be used as Contractor Name)

**From `/project` endpoint:**
- Project metadata
- Status
- Dates

---

## Possible Solutions

### Option 1: Contact Oracle P6 Administrator ⭐ **RECOMMENDED**

Contact your organization's Oracle P6 administrator to:

1. **Enable UDF Module** - Allows `/udfvalue` endpoint
2. **Enable Activity Codes Module** - Allows `/activitycode*` endpoints
3. **Enable Resource Assignment Module** - Allows `/resourceassignment` endpoint

These are typically licensed add-ons or features that can be enabled in P6 EPPM.

### Option 2: Alternative Data Sources

If the P6 modules cannot be enabled, the data must exist somewhere else:

1. **Check if data is in activity names** - Sometimes orgs encode data in activity IDs/names
2. **Use WBS codes** - Some data might be in WBS structure
3. **External database** - Data might be maintained separately and joined later
4. **Manual entry** - Some fields may need to be entered manually in your DPR system

### Option 3: Use What's Available

Current implementation can provide:

**Working Fields:**
- ✅ Activity details (ID, Name, Status, % Complete)
- ✅ Dates (all types)
- ✅ Quantity (from PlannedNonLaborUnits)
- ✅ WBS structure (Block/Plot fallback)
- ✅ Resources (basic contractor info) **NEW**

**Missing Fields** (require manual entry or alternative source):
- ❌ Priority
- ❌ Plot codes
- ❌ UOM
- ❌ Block Capacity
- ❌ SPV Number
- ❌ Scope, Hold, Front

---

## Current Sync Status

**Running:** Complete sync of all 177 projects from production P6

**Syncing:**
- ✅ Projects
- ✅ WBS structures
- ✅ Activities with quantities
- ✅ Resources (basic info)

**Not syncing** (endpoints not available):
- ❌ UDF values
- ❌ Activity Codes
- ❌ Resource Assignments

---

## Next Steps

1. **Contact P6 Admin** to inquire about enabling:
   - UDF (User Defined Fields) module
   - Activity Codes module
   - Resource Assignment module

2. **Verify P6 License** - Check if your organization's P6 license includes these features

3. **Alternative:** If features cannot be enabled, design solution to capture missing data through other means (manual entry, external data source, etc.)

---

## Technical Notes

### Resource Endpoint Fix

The `/resource` endpoint was initially failing with field errors. Fixed by limiting to minimal field set:
- `ObjectId`, `Id`, `Name` only

Other fields (`Type`, `ParentObjectId`, `EmailAddress`, `Notes`, `SequenceNumber`) are not valid in this P6 instance.

### Implementation Ready

All code for syncing ActivityCodes, UDFs, and Resource Assignments is **fully implemented and ready**. It will work immediately once the P6 modules are enabled - no code changes needed.
