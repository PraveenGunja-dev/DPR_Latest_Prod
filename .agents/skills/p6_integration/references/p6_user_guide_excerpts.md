# Primavera P6 Professional User Guide (Integration Excerpts)

This document contains the critical excerpts from the **Primavera P6 Professional User Guide** (Version 25) that inform our integration rules. 

> **Note:** Place the full `Primavera P6 Professional User Guide.pdf` file in this directory (`.agents/skills/p6_integration/references/`) for future agents to read if they need more context than what is summarized below.

## Resource Types (Page 63)
> "P6 Professional also enables you to distinguish between labor, material, and nonlabor resources. Labor and nonlabor resources are always time-based, and material resources, such as consumable items, use a unit of measure you can specify."

## Calculating Percent Complete (Page 114)
> "To specify that the activity's percent complete be calculated from the actual and remaining units, select Units. In this case, Activity % Complete = Units % Complete = (Actual Labor Units + Actual Nonlabor Units) / (Actual Labor Units + Actual Nonlabor Units + Remaining Labor Units + Remaining Nonlabor Units)."

## Top-down Estimation and Weightages (Pages 148-149)
> "Top-Down Estimation enables you to apply labor, nonlabor, and/or material resource units to activities in a top-down manner using assigned weights... P6 Professional distributes the total units to the selected activities, using the estimated weights assigned to the project's WBS elements and activities."

## Activity Dates and The Scheduler (Page 108)
> **Remaining Start:** "The earliest possible date the remaining work for the activity is scheduled to begin... Before the activity is started, the Remaining Start is the same as the Project Planned Start. Once the activity has started, the Remaining Start is equal to the Data Date." 

*(When progress is missing, P6 clears the 'Started' status and the scheduler pushes the activity forward to the Remaining Start date, causing user-entered dates to vanish unless anchored by Actual Units).*
