---
name: Oracle Primavera P6 Integration Rules
description: Guidelines and rules for pushing data to Oracle Primavera P6, specifically around dates, resources, and progress anchoring.
---

# Oracle Primavera P6 Integration Rules

When developing or modifying features that integrate with Oracle Primavera P6 (such as the `p6_push_service.py`), strictly adhere to the following rules based on the P6 Professional User Guide.

## 1. Resource Types in P6
P6 categorizes resources into three types:
- **Material**: Physical, consumable things like concrete or cable. Tracked by quantities.
- **Labor**: Human effort (e.g., Engineers, Welders). Tracked in hours/days. *This directly feeds manpower reporting.*
- **Nonlabor**: Equipment/machinery or abstract measures (like "Weightage distribution").

## 2. The "Vanishing Dates" Problem
P6 relies on actual progress to lock in dates. If an activity is updated with an `Actual Start` or `Actual Finish` date but has **0 Actual Units** recorded across its resources, the P6 scheduler assumes no work actually happened. When the schedule is recalculated (F9), the scheduler will revert the activity to a "not started" state and push the start date to the `Remaining Early Start` date, causing the user's dates to "vanish."

## 3. Anchoring Dates Safely
To permanently lock in dates for an activity in P6, there must be a physical record of progress (Actual Units > 0) on at least one of its resources.

For activities that do not have any mapped **Material** resources (like Testing or Clearance activities):
- You must push a small actual unit value (e.g., based on % complete) to a **Nonlabor** resource assigned to that activity.
- **CRITICAL RULE**: Do **NOT** push dummy actual units to a **Labor** resource. Doing so will corrupt the project's manpower tracking and timesheet data. 
- Always explicitly filter by `resource_type = 'Nonlabor'` when attempting to anchor dates. In P6, planners typically assign a "Weightage distribution" Nonlabor resource for exactly this purpose.

## 4. Progress Calculation
When an activity's percent complete is set to "Units" type, P6 calculates progress using the formula:
`Activity % Complete = (Actual Labor Units + Actual Nonlabor Units) / (Total Units)`

By updating the `Actual Units` of the Nonlabor (Weightage) resource, the DPR application correctly aligns with P6's internal math, ensuring that the overall project progress rolls up accurately without inflating actual material quantities or labor hours.
