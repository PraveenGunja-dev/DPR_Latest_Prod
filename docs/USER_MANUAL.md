# Digitalized DPR — User Manual

**Integrated Project Management System — Adani Renewables**

This manual explains how to use the Digitalized DPR application end to end, from your first login through daily data entry, review, approval, and publishing progress back to Oracle P6.

It is written from the user's point of view. Wherever the screen shows a button or label, this manual uses the same wording so you can match it on screen. **Sections 9 to 12 document every sheet of every project type — Solar, Wind, PSS and BESS — column by column.**

---

## Table of Contents

1. [What This Application Does](#1-what-this-application-does)
2. [Roles — Who Does What](#2-roles--who-does-what)
3. [Getting Access and Signing In](#3-getting-access-and-signing-in)
4. [The Projects Screen](#4-the-projects-screen)
5. [The Top Navigation Bar](#5-the-top-navigation-bar)
6. [The Daily Progress Report Lifecycle](#6-the-daily-progress-report-lifecycle)
7. [Supervisor Guide — Entering Daily Progress](#7-supervisor-guide--entering-daily-progress)
8. [Working Inside a Sheet (The Grid)](#8-working-inside-a-sheet-the-grid)
9. [**Sheet Reference — Solar Projects**](#9-sheet-reference--solar-projects)
10. [**Sheet Reference — Wind Projects**](#10-sheet-reference--wind-projects)
11. [**Sheet Reference — PSS Projects**](#11-sheet-reference--pss-projects)
12. [**Sheet Reference — BESS Projects**](#12-sheet-reference--bess-projects)
13. [Logging Issues and Hindrances](#13-logging-issues-and-hindrances)
14. [Site PM Guide — Reviewing and Approving](#14-site-pm-guide--reviewing-and-approving)
15. [PMAG Guide — Final Approval and Push to P6](#15-pmag-guide--final-approval-and-push-to-p6)
16. [Super Admin Guide — Administration Console](#16-super-admin-guide--administration-console)
17. [Shared Tools Available to Everyone](#17-shared-tools-available-to-everyone)
18. [Automatic Behaviour You Should Know About](#18-automatic-behaviour-you-should-know-about)
19. [Troubleshooting](#19-troubleshooting)
20. [Glossary](#20-glossary)

---

## 1. What This Application Does

Digitalized DPR replaces the daily progress report spreadsheets that site teams used to email around. Instead of separate Excel files, everybody works on the same live data:

- **Activities come from Oracle P6.** The application syncs the project schedule — activities, WBS structure, planned and baseline dates — so you enter progress against the same activity list the planners use.
- **Supervisors record daily progress** in Excel-like sheets tailored to the project type (Solar, Wind, PSS, BESS).
- **Site PMs review and approve** what supervisors submit, correcting or rejecting individual rows and cells where needed.
- **PMAG gives final approval and pushes progress back into Oracle P6**, so the schedule stays current without manual re-keying.
- **Everyone sees dashboards, charts, and exports** built from the same data, and can raise issues/hindrances that follow the activity they relate to.

Because the whole chain is in one system, a number entered at site in the morning can be reviewed, approved, and reflected in P6 the same day.

---

## 2. Roles — Who Does What

| Role | Landing screen | What you can do |
|---|---|---|
| **Supervisor** | Projects → Supervisor Dashboard | Enter daily progress on assigned sheets, log issues, submit sheets to the Site PM, sync a project from P6, export sheets |
| **Site PM** | Projects → PM Dashboard | Everything a Supervisor can see, plus: review submitted sheets, edit them, approve or reject with a reason, create Supervisor accounts, assign projects to supervisors |
| **PMAG** | Projects → PMAG Dashboard | Review PM-approved sheets, give final approval, **push progress to Oracle P6**, view push history and analytics, send delay alerts, request access to more projects/EPS, manage projects |
| **Super Admin** | Super Admin Console | Full administration: users, access requests, all projects, all sheet entries, roles, workflow overrides, analytics, system logs |

### Who can create whom

- **PMAG** can create **Site PM** and **PMAG** users.
- **Site PM** can create **Supervisor** users.
- **Supervisors** cannot create users.

### The project assignment rule

**A project is assigned to a user at the moment the user is created, and cannot be reassigned afterwards.** If a project needs to move to a different person, create a new user for that person. You will see this warning repeated in the user-creation screens — it is not a bug, it is the designed behaviour.

(Super Admins have an additional **Assign Project** action on the Users tab for administrative corrections, and PMAG users can be granted access to a whole **EPS** — a group of projects — through the EPS assignment action.)

---

## 3. Getting Access and Signing In

### 3.1 Opening the application

Open the application URL in your browser. You land on the **Digitalized DPR** welcome screen with two ways to sign in.

### 3.2 Signing in with SSO (recommended)

1. Click **SSO LOGIN**.
2. You are redirected to the Adani single sign-on page. Sign in with your corporate account.
3. You are returned to the application, already signed in.

This is the normal route for Adani staff. You do not need a separate password.

### 3.3 Signing in with email and password

1. Click **EMAIL ACCESS**.
2. Enter your **email address** and **password**.
3. Click **LOGIN**.

Use **GO BACK** to return to the sign-in choice.

After a successful login, **Super Admin** users go straight to the Super Admin Console; everyone else goes to the **Projects** screen.

### 3.4 First time in — requesting access

If you sign in with SSO but have never been granted a role, you land on the **Welcome to Digitalized DPR!** screen instead of the Projects list. This is expected.

1. Confirm the email shown is yours.
2. **Select your role** by clicking one of the three cards:
   - **Supervisor** — daily data entry, sheet submission and field operations
   - **Site PM** — review, modify and approve project workflows
   - **PMAG (Admin)** — advanced analytics, dashboards and final approvals
3. Optionally type a **Justification** — a sentence about why you need access and which project or team you are on.
4. Click **Request Access**.

You then see the **Request Submitted!** screen, which re-checks your status every 30 seconds. **Check Status** forces an immediate check; **Sign Out** logs you out.

Once approved, the screen changes to **Access Granted!**. Click **Enter Platform** to sign in again and pick up your new permissions.

> **Note:** You must sign in again after approval. The token issued before approval does not carry your new role.

### 3.5 Signing out

Click the **circular avatar** at the top right of any screen, then **Log out**.

---

## 4. The Projects Screen

After signing in you see the projects you have access to. Supervisors and Site PMs see only projects assigned to them; PMAG and Super Admin see the projects in their scope.

### 4.1 Finding a project

| Control | What it does |
|---|---|
| **Search** | Filters by project name as you type |
| **Type** | Filter by project type — Solar, Wind, PSS, BESS |
| **Year** | Filter by financial year (FY25, FY26 …), derived from the P6 ID or the planned start date |
| **EPS** | Filter by the parent EPS group the project belongs to |

The list is paginated at **10 projects per page**, with a "Showing X to Y of Z projects" line underneath. Changing any filter resets you to page 1.

**Recently viewed projects float to the top** and carry a violet **Recent** badge.

### 4.2 Reading a project card

- **Project name** and its **ID** (the Oracle P6 ID)
- **Project type** badge — Solar, Wind, PSS or BESS
- **On Hold** badge if an administrator has paused the project
- For supervisors: badges listing the **sheets you are permitted to work on**, or **All Access**
- **Sync Date** — when the application last pulled data from P6
- **P6 Updated** — when the schedule was last changed in P6. Hover to see **who** last edited it and the full timestamp

### 4.3 Actions on a project card

| Button | Who sees it | What it does |
|---|---|---|
| **Assign** | Site PM, PMAG, Super Admin | Opens the project assignment dialog |
| **Sync** | All roles | Pulls the latest activities and schedule from Oracle P6. A progress dialog shows the sync running |
| **Summary** | Site PM, PMAG, Super Admin | Read-only project summary with an **Activity Table** view and a **Charts** view |
| **Click the card / ›** | All roles | Opens the project in the dashboard for your role |

### 4.4 PMAG only — Request Project Access

PMAG users see a **Request Project Access** button above the list. In the dialog, choose whether you are requesting an **EPS** (a whole group of projects) or individual **projects** (searchable, multi-select). Submitted requests appear in the same dialog so you can track their status.

---

## 5. The Top Navigation Bar

| Element | What it does |
|---|---|
| **Adani logo** | Branding; the current **project name** and **P6 ID** appear beside it once you are inside a project |
| **Theme toggle** | Switches between light and dark mode |
| **🔔 Bell** | Notifications. The red badge is your unread count. Expand an item to read it, click through to the relevant sheet, or **Mark all as read** |
| **⚠ Issues bell** (Site PM & PMAG) | Opens the project's issue log. The orange badge counts new issues |
| **Date filter** (Wind projects only) | **Last 7 days**, **Last 30 days** or **Delayed Activities**. When set to Delayed Activities the button turns red — and the Wind Progress Sheet swaps in a delay column (see [10.2](#102-progress-sheet--data-entry)) |
| **E&D Sheets** | Engineering & Delivery tracker — tabs for **Summary**, **Engineering**, **Ordering**, **Delivery** |
| **Live Sheets** | Jumps to the live data-entry sheets for the current project |
| **Avatar menu** | Your name and role, role-specific shortcuts (Home, View Issues, Add Issue, Dashboard, Manage Projects, Snapshot Filter), **Projects**, and **Log out** |

---

## 6. The Daily Progress Report Lifecycle

Every sheet, for every day, moves through the same stages. The **workflow stepper** (three numbered circles) shows where a sheet stands.

```
   Supervisor            Site PM              PMAG              Oracle P6
       │                    │                   │                    │
   ┌───▼────┐          ┌────▼─────┐        ┌────▼─────┐         ┌────▼─────┐
   │ Draft  │──Submit─▶│ Submitted│─Approve▶│ Approved │──Push──▶│ Schedule │
   │        │          │  to PM   │        │  by PM   │         │ updated  │
   └───▲────┘          └────┬─────┘        └────┬─────┘         └──────────┘
       │                    │                   │
       └────Reject──────────┘                   │
       └────────────Reject───────────────────────┘
```

| Status | Meaning | Stepper |
|---|---|---|
| **Draft** | Being worked on by the supervisor; not yet submitted | ① grey |
| **Submitted to PM** | Waiting for Site PM review | ① green |
| **Approved by PM** | Site PM approved; waiting for PMAG | ①② green |
| **Final Approved** | PMAG approved — ready to push, or already pushed to P6 | ①②③ green |
| **Rejected by PM** / **Rejected by PMAG** | Sent back for revision | ① amber with a pencil badge, labelled **Edited** |

Hover the stepper for a plain-language description of the current state.

> **Sheets stay editable.** Even after submission or approval, an authorised user can still open and change a sheet. Changes to a submitted sheet must be saved explicitly (see [8.6](#86-saving-and-submitting)).

---

## 7. Supervisor Guide — Entering Daily Progress

### 7.1 Opening your project

From the Projects screen, click the project you are working on. You land on the **Daily Progress Report** screen. If you see *"Unable to load project"*, click **Select Project** to go back to the list.

### 7.2 Setting the report date

Beside the **Daily Progress Report** heading is a **Report Date** field. It defaults to today, and you cannot pick a future date.

Change it to enter or correct progress for an earlier day. **Everything on the screen — the sheets, their saved values, and what you submit — belongs to the date shown here.** Check it before you start typing.

Most sheets show two live day-columns: **yesterday** (relative to the report date) and **today**. Several sheets also show five read-only history columns for the days before that, so you can see the run-up at a glance.

### 7.3 The header buttons

| Button | What it does |
|---|---|
| **Sync Project** | Pulls the latest activity list and schedule from Oracle P6. Use this if activities are missing or dates look stale |
| **Global Submit** | Submits **every changed draft sheet** for the selected report date to the Site PM in one action. Asks for confirmation, briefly saves pending edits, then reports how many sheets went through |
| **Compare with Drone** | Only on drone-enabled projects — compares reported quantities against drone survey figures ([17.3](#173-drone-verification)) |
| **Change Project** | Returns to the Projects list |

To the right, a coloured chip shows the **project type** and the **P6 ID**.

### 7.4 Which sheets you see

The tabs depend on the project type. You only see the sheets you have been given access to; **Summary** and **Issues** are always available.

| Project type | Tabs | Full reference |
|---|---|---|
| **Solar** | Summary · DP Qty · DC Side · AC Side · Testing & Commissioning · Labour Days · Manpower (Contractor) · Machinery Sheet · Issues — plus Switchyard, Transmission Line, Infra Works on Rajasthan projects | [Section 9](#9-sheet-reference--solar-projects) |
| **Wind** | Summary · Progress Sheet · Stone Column · 33KV · Erection · Labour Days · Manpower (Contractor) · Machinery Sheet · Productivity · Issues — plus PSS and EHV outside Khavda | [Section 10](#10-sheet-reference--wind-projects) |
| **PSS** | Summary · Civil and PEB · Electrical · 400KV Transmission Visual · 400KV Transmission · Manpower · Manpower (Contractor) · Issues | [Section 11](#11-sheet-reference--pss-projects) |
| **BESS** | Summary · DP Qty · Civil · Electrical · Testing & Comm. · Manpower · Productivity · Charging Schedule · Issues | [Section 12](#12-sheet-reference--bess-projects) |

### 7.5 Filters above the tabs

Filters narrow the rows shown without changing your data:

| Project type | Filters |
|---|---|
| **Solar** | **Activity Filter** (work package, taken from the activity ID prefix) and **Block** |
| **Wind** | **Work Category**, **PSS Location**, **Location** (WTG), **Activity** |
| **BESS** | **Activity Filter**, **Location** (block), **Status** (In Progress / Completed / Not Started), and on the Summary tab a **Trade Filter** (Civil / Electrical / Testing) |
| **PSS** | None — use the grid's own **Filters** button |

> **BESS — finding your own activities.** When a BESS sheet has activities that were added outside P6, the Activity Filter gains an extra option: **📝 DPR Level Activities**. Choose it to show only those, which is the quickest way to check the rows created by **Generate DPR Activities** or **Add DPR Activity**. They are also visible under **All**; picking any *other* activity group hides them.

Solar projects also show the **workflow stepper** here.

> Filters reset when you change project or tab, so a block from a previous project never carries over.

### 7.6 A typical day

1. Open the project and confirm the **Report Date**.
2. If the schedule changed in P6 overnight, click **Sync Project**.
3. Work through your sheets tab by tab.
4. Log any hindrances on the **Issues** tab.
5. Review the **Summary** tab.
6. Click **Global Submit** — or submit each sheet individually with its own **Submit** button.

---

## 8. Working Inside a Sheet (The Grid)

Every data-entry sheet uses the same Excel-like grid, so once you learn one, you know them all.

### 8.1 The grid toolbar

The bar above the grid shows the sheet title, the row count ("*X of Y rows*"), a status chip once the sheet has left draft, and these controls:

| Control | What it does |
|---|---|
| **Save** | Saves your changes as a draft. Asks you to confirm |
| **Submit** | Submits **this sheet** to the Site PM. Asks you to confirm |
| **Filters** | Shows a filter row under the headers for column-by-column filtering. **Clear** removes all column filters |
| **Changed Only** | Shows only rows you have modified or that carry a highlight. Turns amber and reads **Showing Changes** when active — the fastest way to check your work before submitting |
| **Cols** | Show or hide individual columns |
| **Export** | **This Sheet** downloads the current sheet as Excel; **Entire Project** downloads all the project's sheets in one workbook |
| **Fullscreen** | Expands the grid to fill the screen, keeping Save, Submit, Changed Only, Filters and Cols available |

### 8.2 Entering data

- Click a cell and type. Columns accept text, numbers, dates or dropdown selections depending on their type.
- **Read-only cells cannot be typed into.** Anything that comes from P6 (Activity ID, Block, Status, baseline dates) or is calculated (Balance, Gap, %) is locked — this is normal, not a permissions problem. Each sheet reference below lists exactly which columns you can edit.
- Standard clipboard shortcuts (**Ctrl+A**, **Ctrl+C**, **Ctrl+V**, **Ctrl+X**) work inside cells.
- Rows you have changed are highlighted, which is what **Changed Only** filters on.
- **Resize a column** by dragging the right-hand edge of its header. Useful on wide sheets where long activity descriptions are cut off. Widths apply for as long as the sheet is open; they are not saved between visits.

### 8.3 Adding rows and activities

Some sheets let you add rows directly, with edit (pencil) and delete (bin) icons at the start of rows you added.

Where a sheet supports activities that do not exist in P6, you get two extra tools:

- **Add DPR Activity** — a form for one new activity: **description**, **quantity/scope**, the **section heading** it belongs under, the **location**, and optionally vendor, priority, duration, feeder and remarks.
- **Upload Activities** *(green)* — bulk-add from Excel. Download the template with the download icon, fill it in, and upload. The dialog previews every row, flags invalid ones with a red icon, and lets you remove rows before confirming.
- **Generate DPR Activities** *(purple, BESS only)* — creates the whole DPR activity list automatically from the P6 schedule. See [8.7](#87-generate-dpr-activities--bess-only).

Activities you add this way are grouped under the same blue sub-headings as the P6 rows, so they read as part of the sheet rather than sitting in a block at the bottom. Each one carries a **bin icon** at the start of its row for deletion; P6 rows have no bin because they cannot be deleted here.

### 8.4 Cell comments

A small **speech-bubble icon** in the corner of a cell means it has comments — blue for normal, red for a rejection — with a count badge. Click to open the thread and reply. Reviewers use rejection comments to tell you exactly which cell is wrong and why.

### 8.5 Cell-level rejection marks

A Site PM or PMAG can flag **individual cells** rather than rejecting the whole sheet. Those cells come back highlighted in red with an explanation. Fix the flagged cells and resubmit.

### 8.6 Saving and submitting

**1. Auto-save (drafts only).** While a sheet is in **Draft**, edits save automatically about **two seconds** after you stop typing.

**2. Save (explicit).** Once a sheet has been **submitted or approved**, auto-save deliberately stops — silently re-saving would send an approved sheet back to draft and drop it out of the reviewer's queue. To change a submitted sheet, edit it and click **Save** yourself.

**3. Submit.** The grid's **Submit** button submits **only that sheet**. The header's **Global Submit** submits **every changed draft sheet for the selected report date** at once.

> Each sheet is tracked separately per day. Submitting the DC Side sheet does not submit the AC Side sheet.

### 8.7 Generate DPR Activities — *BESS only*

On the BESS **Civil**, **Electrical** and **Testing & Comm.** sheets there is a purple **Generate DPR Activities** button beside Upload Activities. It is available to users who can manage activities.

**What it is for.** P6 holds the schedule at milestone level, but the DPR needs finer line items — screed concrete, painting, PEB structure, panel tests — that do not exist in P6. Rather than typing hundreds of rows by hand, this button reads the project's P6 activities and creates the matching DPR items **for every block and BCT in the project** in one action.

Each created row is named after its P6 parent, so `BLK 1:CIV:CT - Grade slab of CT` produces `BLK 1:CIV:CT - CT - Epoxy Painting below FGL`, and lands under the right heading automatically. New rows start at scope 0, UOM *Nos*, status *Not Started*, ready for you to fill in.

**Using it**

1. Open the Civil, Electrical or Testing sheet.
2. Click **Generate DPR Activities**. The button reads *Generating…* while it works.
3. A message reports how many were created — or *"All N activities already exist"* if there is nothing new.
4. Set the **Activity Filter** to **📝 DPR Level Activities** to review just the new rows.

**Worth knowing**

- **Safe to run again.** It skips activities that already exist, so when new blocks appear in P6 you can press it again and only the new rows are added.
- **It depends on P6 naming.** The rules match the standard BESS activity names. If a project's P6 activities are named differently you get *"No matching BESS activities found in this project's P6 data"* — that is a naming mismatch, not a fault. Use **Upload Activities** instead.
- **Deleted rows come back.** Activities you deleted are recreated the next time you press the button. Delete them again after generating, or use **Add DPR Activity** / **Upload Activities** where you need precise control over the list.
- It works only on those three sheets. It is not offered on Summary, DP Qty, Manpower, Productivity or Charging Schedule.

---

## 9. Sheet Reference — Solar Projects

Solar is the default layout. Every sheet below is filtered by the **Activity Filter** (work package) and **Block** selectors above the tabs.

### 9.1 Summary — *read-only*

Titled **Solar Summary — CC Activities**. This is a roll-up of the data-entry sheets; you cannot type into it.

| Group | Columns |
|---|---|
| — | S.No, Description, UOM |
| **Construction Quantities** | Scope, Completed, Balance, % Comp |
| **Labour Days** | Required, Available, Gap, % Comp |
| **Summary in MW** | Units, MW Required, MW Available, MW Gap |
| **Schedule & Actuals** | Baseline Start, Baseline End, Actual Start, Actual Finish |

It draws on DP Qty, Labour Days, DC Side and AC Side together.

> **If this sheet is empty** you will see *"No matching CC activities found for this project/block."* The summary only picks up activities coded as **CC** in P6. Ask your planner to check the activity coding.

### 9.2 DP Qty — *read-only roll-up*

The consolidated daily-progress quantity view. **No cell on this sheet is directly editable** — the numbers mirror what you enter on DC Side, AC Side and Testing & Commissioning.

**Columns:** S.No (or Activity ID), Description, Status, UOM, Scope, Completed as on *(yesterday)*, Balance, Baseline Start, Baseline Finish, Actual Start, Actual Finish, Forecast Start, Forecast Finish, five history date columns, *(yesterday)*, *(today)*.

Use it to sanity-check totals before you submit.

### 9.3 DC Side — *data entry*

Progress on the DC scope, one row per P6 activity.

**Columns** (dates grouped under **Baseline** / **Actual** / **Forecast** headers): Activity ID, Description, Block, Priority, Contractor Name, UOM, Scope, Completed as on *(previous date)*, Balance, Physical Progress %, Baseline Start, Baseline Finish, Actual Start, Actual Finish, Forecast Start, Forecast Finish, Resource, five history date columns, *(yesterday)*, *(today)*.

| | Columns |
|---|---|
| **You can edit** | Description · Priority · Contractor Name · UOM · Scope · Physical Progress % · Actual Start · Actual Finish · Resource · the five history date columns · *(yesterday)* · *(today)* |
| **Read-only** | Activity ID · Block · Completed as on · Balance · Baseline Start/Finish · Forecast Start/Finish |

**Day-to-day:** put the quantity done into the *(today)* column. Balance and the "Completed as on" figure recalculate for you.

### 9.4 AC Side — *data entry*

Identical structure and editable columns to DC Side, for the AC scope.

### 9.5 Testing & Commissioning — *data entry*

Same as DC/AC Side but **without the Resource column**.

| | Columns |
|---|---|
| **You can edit** | Description · Priority · Contractor Name · UOM · Scope · Physical Progress % · Actual Start · Actual Finish · the five history date columns · *(yesterday)* · *(today)* |
| **Read-only** | Activity ID · Block · Completed as on · Balance · Baseline and Forecast dates |

### 9.6 Labour Days — *data entry*

Manpower against each activity.

**Columns:** Activity ID, Description, Block, Hours/Day, Required, Available, Gap, % Completion, five history date columns, *(yesterday)*, *(today)*.

| | Columns |
|---|---|
| **You can edit** | Description · Hours/Day · Required · Available · the five history date columns · *(yesterday)* · *(today)* |
| **Calculated** | **Gap** (Required − Available) and **% Completion** |

### 9.7 Manpower (Contractor) — *data entry*

A time-phased grid covering a rolling window of past **and future** days. For each date there are four columns:

`<date> - Contractor` · `<date> - Required` · `<date> - Available` · `<date> - Gap`

Preceded by Activity ID, Description and Block.

| | Columns |
|---|---|
| **You can edit** | Every **Contractor**, **Required** and **Available** column |
| **Calculated** | Every **Gap** column |

Because it extends into future dates, this is where you plan contractor manpower ahead, not just record it.

### 9.8 Machinery Sheet — *data entry*

Equipment deployed, by contractor.

**Columns:** S.No, Contractor Name, Machinery, UoM, one column per date, Remarks, Actions.

| | Columns |
|---|---|
| **You can edit** | Contractor Name · the date columns (numbers) · Remarks |
| **Read-only** | S.No · Machinery · UoM |

Use the **Actions** column to add or remove rows.

### 9.9 Rajasthan-only sheets — *data entry*

Rajasthan-region solar projects get three extra tabs inserted after Testing & Commissioning:

- **Switchyard**
- **Transmission Line**
- **Infra Works**

All three use the **same layout and editable columns as the AC Side sheet** ([9.4](#94-ac-side--data-entry)), with rows aggregated from the matching part of the project's WBS.

> **These tabs only appear when the project's WBS actually contains that scope.** A missing Switchyard tab usually means the WBS has no switchyard branch, not that you lack permission.

---

## 10. Sheet Reference — Wind Projects

Wind sheets are filtered by **Work Category**, **PSS Location**, **Location** (WTG) and **Activity** above the tabs.

### 10.1 Summary — *read-only*

A compact scope-versus-achievement roll-up with weekly and monthly columns.

**Columns:** S.No, Description, Scope, Achieved, Balance, **W.Plan**, **W.Achieved**, **W.Balance**, **M.Plan**, **M.Achieved**, **M.Balance**.

`W.` columns are the current week; `M.` columns are the current month.

### 10.2 Progress Sheet — *data entry*

The main wind activity sheet — one row per P6 activity, carrying the wind-specific site attributes.

**Columns:** S.No, Activity ID, Description, Status, Substation, SPV, Location, Activity Group, Feeder, WTG FDN Vendor, FDN Allotment Date, Stone Column Contractor, Soil Test Status, Coord E, Coord N, Resource, Scope, Completed, Physical Progress %, Baseline Start, then:

| Navbar date filter | Trailing columns |
|---|---|
| Normal | Baseline Finish, Actual Start, Actual Finish, Forecast Start, Forecast Finish, **No of Days** |
| **Delayed Activities** | Actual Start, Actual Finish, Forecast Start, Forecast Finish, **No of Days Delay** |

> Switching the navbar date filter to **Delayed Activities** genuinely changes this sheet's columns — it swaps *No of Days* for *No of Days Delay* so you can see slippage directly. This is the quickest way to review what is running late.

### 10.3 Stone Column — *data entry*

Ground-improvement progress, location by location.

**Columns:** SR. NO., Location no, Vendor, PSS, Drawing Status, RIG, Length, Number of column in scope, Plan, Achieved, Balance, Start Date, Finish Date — followed by a **Plan** and an **Actual** column for each date in the window.

Record the daily planned and achieved column counts in the paired date columns; Balance follows.

### 10.4 33KV — *data entry*

**This tab shows one of two different sheets depending on the site.**

**Underground cabling (Khavda and similar sites)**

| Columns |
|---|
| SR. NO. · CABLE FROM · CABLE TO · TOTAL LENGTH (METER) · TERMINATION END · JOINTING KIT · Today · Cumulative · Balance · Jointing Cumulative · Jointing Balance · Termination Cumulative · Termination Balance |

Enter the day's laying progress in **Today**; the cumulative and balance figures for laying, jointing and termination follow.

**Overhead lines (Outside Khavda, Mandvi, Mundra)**

| Columns |
|---|
| SR. NO. · VENDOR · FEEDER NAME · TYPE OF LINE · B-TO-B LINE (IN KM) · FINAL LINE (IN KM) · TOTAL LOCATIONS · then **Scope / Completed / Balance** for each activity type configured for the project |

The activity-type columns are configured per project, so two overhead projects can legitimately show different column sets.

Both variants support **Add DPR Activity** and **Upload Activities** for scope not present in P6.

### 10.5 Erection — *data entry*

The WTG erection log — a milestone-by-milestone date sheet plus time-loss analysis. **Every column except Sr. No. is editable.**

**Identification:** Sr. No., WTG Location, Crane No.

**Erection milestone dates:** Crane Assy Start date · Crane boom up Finish date · WTG Tower Ere Start date · WTG Tower Ere Finish date · Nacelle Erection Start · Nacelle Erection Finish · DT Erection Start · DT Erection Finish · Hub Erection Start · Hub Erection Finish · Blade Erection Start · Blade Erection Finish · Nacelle Cover Erection Finish · Crane Boom Down · Crane Dismentaling Start · Crane Dismentaling Finish · Crane Intercarting Start · Crane Intercarting Finish

**Remarks / Issues** — free text.

**Time-loss columns (hours):** FM – High Wind / Rain · AGEL ROW · non-availability of front · unavailability of WTG material · Crane Break Down · AGEL Tools & Tackles Breakdown · Crane Manpower Issues · Erection Contractor Issues · Tensioning & Torquing Manpower/Tools

> The time-loss columns are what feed delay analysis. Filling them in honestly each day is what makes the Delayed Activities view and the delay alert report useful.

### 10.6 Labour Days — *data entry*

**Columns:** Activity ID, Description, Block, Hours/Day, Budgeted Days, Actual Days, Remaining Days, % Completion, Actual Start, Actual Finish, Forecast Start, Forecast Finish, *(yesterday)*, *(today)*.

Note this differs from Solar's Labour Days: wind tracks **Budgeted / Actual / Remaining Days** rather than Required-versus-Available headcount.

### 10.7 Manpower (Contractor) — *data entry*

The same time-phased contractor grid as Solar ([9.7](#97-manpower-contractor--data-entry)) — four columns per date (Contractor, Required, Available, Gap), with Gap calculated.

### 10.8 Machinery Sheet — *data entry*

**Columns:** Sr no, Vendor Name, Area, Equipment Name, then one numeric column per date.

Editable: Vendor Name, Area, Equipment Name and the date columns.

### 10.9 Productivity — *data entry, monthly*

A monthly productivity grid. **Columns are months**; rows are grouped into four activities. In each group you enter the resource count and the system derives the rest:

| Activity | You enter | Calculated for you |
|---|---|---|
| **1. Stone Column** | Rigs | No of Columns · Cumm SC · Productivity |
| **2. WTG Foundation** | Gangs | No of Foundations · Cumm Foundations · Productivity |
| **3. WTG Erection** | Cranes Packages | No of Erections · Cumm Erections · Productivity |
| **4. WTG Commissioning** | Commissioning | No of Commissioning · Cumm Commissioning |

Productivity = output per resource per month, so keeping the rig/gang/crane counts accurate is what makes the figure meaningful. The sheet exports to Excel on its own.

### 10.10 Outside-Khavda-only sheets — *data entry*

Wind projects whose EPS is outside Khavda get two extra tabs after the Progress Sheet:

**PSS**

| Columns |
|---|
| S.No · Description · Priority · Duration · Baseline Start · Baseline Finish · Actual Start · Actual Finish · Forecast Start · Forecast Finish · Vendor Name · UOM · Plan till date · Actual till date · Balance · Physical Progress % |

**EHV**

| Columns | Editable |
|---|---|
| S.No · Description · UOM · Scope · Completed · Balance | Description · UOM · Scope · Completed (Balance is calculated) |

---

## 11. Sheet Reference — PSS Projects

PSS projects have no filter bar above the tabs — use the grid's own **Filters** button.

### 11.1 Summary — *data entry*

Titled **PSS Project - Summary**. Unlike the Solar and BESS summaries, **this one is editable**.

**Columns:** S.No, Description, Duration, Start Date, End Date, UOM, Scope, Completed, Balance, Actual Start, Actual Finish, Forecast Start, Forecast Finish, Remarks.

| | Columns |
|---|---|
| **You can edit** | Description · Duration · Start Date · End Date · UOM · Scope · Completed · Actual Start · Actual Finish · Remarks |
| **Calculated** | Balance |
| **Display only** | Forecast Start and Forecast Finish are kept for layout and stay blank |

**Colour cues:** Actual dates render **green bold**, Forecast **blue bold**. A **TOTAL** row at the bottom sums Scope, Completed and Balance.

### 11.2 Civil and PEB · Electrical · 400KV Transmission — *data entry*

These three tabs share one layout.

**Columns:** S.No, Description, Block, Status, Priority, Duration, Plan Start, Plan Finish, Actual Start, Actual Finish, Forecast Start, Forecast Finish, SO Vendor Name, UOM, Scope, Completed, Physical Progress %, Balance, Remarks.

| | Columns |
|---|---|
| **You can edit** | Description · Priority · Duration · Plan Start · Plan Finish · Actual Start · Actual Finish · SO Vendor Name · UOM · Scope · Completed · Remarks |
| **Read-only** | S.No · Block · Status · Forecast Start/Finish · **Physical Progress %** · Balance |

> **Physical Progress % is deliberately read-only.** It comes from P6 and there is no write-back path for it — you influence it by updating **Completed**, not by typing over the percentage.

Rows are organised under coloured **main headings** (dark navy) and **sub-headings** (light blue) that mirror the WBS structure.

### 11.3 400KV Transmission Visual — *data entry*

A simple quantity tracker.

**Columns:** S.No · Description · UOM · Total Quantity · Completed · WIP · Balance

`WIP` is work in progress — quantity started but not yet complete.

### 11.4 Manpower — *data entry*

**Columns:** S.No (or Activity ID), Description, Areas, Department, Scope, Completed (Cumulative), then history date columns, *(yesterday)* and *(today)*.

Enter the day's manpower in the *(today)* column; the cumulative figure follows.

### 11.5 Manpower (Contractor) — *data entry*

The same time-phased contractor grid as Solar ([9.7](#97-manpower-contractor--data-entry)).

---

## 12. Sheet Reference — BESS Projects

BESS sheets are filtered by **Activity Filter**, **Location** (block) and **Status** above the tabs, with a **Trade Filter** on the Summary tab.

BESS has two kinds of sheet, and it is worth knowing which you are on:

- **P6-backed sheets** — Civil, Electrical, Testing & Comm., Manpower. Rows come from the Oracle P6 schedule; you record progress against them.
- **Checklist sheets** — Productivity and Charging Schedule. Rows come from a fixed built-in activity list, loaded with **Add Row**. Nothing is pre-populated from P6, and the whole grid is saved each time.

### 12.1 Summary — *read-only*

Titled **BESS Project - Summary**. A plan-versus-actual comparison with a two-row grouped header.

| Group | Columns |
|---|---|
| — | Activity, UOM, Total Scope Qty, Completed, Yesterday Progress |
| **Today's Qty.** | Base Plan · **Catch Up Plan** *(blue)* · **Actual** *(green)* |
| **Cumulative Qty.** | Base Plan · **Catch Up Plan** *(blue)* · **Actual** *(green)* |
| — | Deviation Plan vs Actual, Total Scope Balance Qty, % Status as on date, Remarks |

The **Trade Filter** above the tabs switches this sheet between **Civil**, **Electrical**, **Testing** and **All Trades**. It defaults to Civil, so if the summary looks short, check the trade filter first.

**Deviation Plan vs Actual** is the number to watch — it is the gap between what the plan called for and what was achieved.

### 12.2 DP Qty — *roll-up*

The same read-only quantity roll-up used on Solar ([9.2](#92-dp-qty--read-only-roll-up)), shown with Activity IDs. **Its cells cannot be typed into** — the day values mirror across from the Civil, Electrical and Testing sheets.

Unlike Solar, this tab is its own submittable entry, so it has Save/Submit controls even though the grid itself is not directly editable.

### 12.3 Civil · Electrical · Testing & Comm. — *data entry*

The three work sheets share one layout — the PSS progress layout, reordered for BESS and extended with day columns.

**Column order:** Activity ID, Description, Block, Status, Priority, Duration, SO Vendor Name, UOM, Scope, Completed, Physical Progress %, Balance, **Baseline Start**, **Baseline Finish**, Actual Start, Actual Finish, Forecast Start, Forecast Finish, **five history date columns**, *(yesterday)*, *(today)*, Remarks.

| | Columns |
|---|---|
| **You can edit** | Description · Priority · Duration · Baseline Start · Baseline Finish · Actual Start · Actual Finish · SO Vendor Name · UOM · Scope · Completed · the seven day columns · Remarks |
| **Read-only** | Activity ID · Block · Status · Forecast Start/Finish · **Physical Progress %** · Balance |

Two things differ from the PSS version of this sheet:

1. The commercial columns (**SO Vendor Name, UOM, Scope, Completed, Physical Progress %, Balance**) sit **before** the date blocks, not after.
2. The "Plan" date group is labelled **Baseline**.

> **What you type in the day columns flows straight into the DP Qty sheet.** Enter the day's quantity once, here — do not try to also enter it on DP Qty.

These three sheets are the only ones offering **Generate DPR Activities** ([8.7](#87-generate-dpr-activities--bess-only)) alongside **Add DPR Activity** and **Upload Activities**. Activities added by any of the three appear under the same blue sub-headings as the P6 rows, and can be isolated with the **📝 DPR Level Activities** option in the Activity Filter.

### 12.4 Manpower — *data entry*

The same layout as the PSS Manpower sheet ([11.4](#114-manpower--data-entry)), shown with Activity IDs: S.No/Activity ID, Description, Areas, Department, Scope, Completed (Cumulative), history dates, *(yesterday)*, *(today)*.

Supports **Add DPR Activity** and edit/delete of activities you added.

### 12.5 Productivity — *data entry*

Titled **BESS - Productivity**. A standalone checklist sheet — its rows exist only in your DPR, nothing is pre-populated from P6.

**Columns:** Container Make · Block No. · Sr. · Activity · **seven trailing date columns** ending on the report date.

| | Columns |
|---|---|
| **You can edit** | Container Make · Block No. · the seven day columns |
| **Read-only** | Sr. · Activity (both come from the fixed checklist) |

**The sheet starts empty.** You will see *"No data yet. Click Add Row to load the productivity activities."*

- **Add Row** loads the full checklist in one click — **48 activities** under two green category headers, **Civil** (11) and **Electrical** (37).
- Each further click appends **another complete copy**, so you can track several container makes or blocks side by side on the same sheet. Two clicks give 96 activity rows.
- The **bin icon** on the last row undoes one click at a time: it removes the most recently added copy. When only one copy is left it clears the sheet. Either way it asks for confirmation first, and entered values in the removed rows are lost.

The seven date columns are the seven days **ending on the report date**, so changing the Report Date shifts the whole window. Enter the day's productivity figure against each activity you worked on.

> Because the rows are yours rather than P6's, **the whole grid is saved** on every save, not just the rows you touched. This is what lets a deleted row stay deleted.

### 12.6 Charging Schedule — *data entry*

Titled **Charging Schedule**. This sheet tracks the run-up to energisation — which containers are on site, when charging starts, and when each block reaches COD. Like Productivity it is a standalone checklist sheet, but it pulls progress figures from P6 where it can.

**Column groups**

| Group | Columns |
|---|---|
| — | Container Make, Block No, Containers at Site, MWh, IDT Charging / Commissioning Start, Trail-Run End Date, COD |
| **Status** | Sr, Activity, **Progress** (S · C · B), EDC, New EDC, vendor |
| — | Productivity, Manpower, Total Mandays, Remarks |

**Progress S / C / B** are Scope, Completed and Balance. **Balance is always calculated** (S − C) and never typed.

**Where the numbers come from.** Scope and Completed are matched against the project's P6 activities by name. When a match is found the two cells turn **blue and bold, and become read-only** — hovering shows *"Auto-populated from P6 data"*. Where there is no P6 match you type them yourself.

**Rows highlighted yellow** are Electrical activities with no scope coming from P6 — DPR-level items that P6 does not carry. They are expected, not errors; fill them in manually.

**The three dates chain automatically**

1. Enter **IDT Charging / Commissioning Start**.
2. **Trail-Run End Date** fills in at **+3 days**.
3. **COD** fills in at **+2 days after Trail-Run**.

All three stay editable — override any of them and the ones below recalculate. Changing Trail-Run recomputes COD; clearing IDT clears both. A small badge beside COD shows its actual gap from Trail-Run: **green +2d** for the standard interval, **amber** for anything else, so a manually stretched COD is visible at a glance.

Dates display as DD-MMM-YY. Click a date cell to get a date picker.

**Add Row** and the **bin icon** behave exactly as on the Productivity sheet — one click appends the full Civil + Electrical checklist, and the bin removes the last copy added.

---

## 13. Logging Issues and Hindrances

The **Issues** tab records anything blocking progress. Issues are stored centrally, so a Site PM or PMAG sees them from their own dashboards through the ⚠ issues bell.

### 13.1 Raising an issue

1. Go to the **Issues** tab and click **Add Issue** (Supervisors can also use **Add Issue** in the avatar menu).
2. Fill in the form:

| Field | Notes |
|---|---|
| **Description** | What the hindrance is |
| **Location** | Block, or WTG on wind projects — searchable |
| **WBS** | The section the issue sits under — searchable |
| **Activity** | The specific P6 activity affected — searchable |
| **Start Date** / **Finished Date** | When the hindrance began and ended |
| **Delayed Days** | Impact in days |
| **Status** | Open · In Progress · Resolved · Closed |
| **Priority** | Low · Medium · High · Critical |
| **Action Required** | What needs to happen to clear it |
| **Notification email** | Type the `firstname.lastname` of the person to notify |
| **Remarks** | Anything else |
| **Attachment** | Optional supporting file |

3. Click **Submit**.

### 13.2 Managing issues

The issues table lists everything raised for the project. Use the row actions to **edit** or **delete** an issue (confirmation required). Edits sync back to the central issue log.

---

## 14. Site PM Guide — Reviewing and Approving

Sign in as **Site PM**, pick your project, and you land on the PM Dashboard.

### 14.1 The dashboard summary

The top section shows the project name, your name, project details, and clickable statistic tiles. **Clicking a tile opens the list of sheets behind that number.** There is a **Refresh** control, and **Compare with Drone** on drone-enabled projects.

### 14.2 Reviewing a submitted sheet

1. Click a statistic tile to open the sheet list.
2. Pick a sheet — each row offers **Edit**, **Approve** and **Reject**.
3. Click **Edit** to open exactly what the supervisor submitted.

Inside the editor you can:

- **Correct values directly**
- **Flag individual cells for rejection** — the supervisor sees them highlighted in red
- **Add cell comments** explaining what needs to change
- **Save** your corrections, or **Reject** straight from the editor (cell markings are saved first, then the rejection dialog opens)

### 14.3 Approving

Click **Approve**. The sheet moves to **Approved by PM** and enters the PMAG queue, with a notification confirming it was forwarded.

### 14.4 Rejecting

Click **Reject** and give a **rejection reason** — this text goes back to the supervisor, so be specific ("Block 4 DC quantities exceed scope" beats "wrong").

### 14.5 Charts

- **Sheet Status Trend** — distribution across statuses
- **Sheets by Type** — volume per sheet type
- **Overall Distribution**
- **Supervisor Performance** — submissions by supervisor
- **Progress heatmap** on solar projects

Clicking into a chart segment opens the underlying sheet list.

### 14.6 Creating supervisors and assigning projects

- **Add User** — create a **Supervisor** account, optionally assigning one project at creation. **This assignment is permanent.**
- **Assign Project** — assign projects to supervisors you manage.

### 14.7 Staying current

The dashboard refreshes itself when a new submission notification arrives. Clicking a notification takes you straight into the relevant sheet's editor.

---

## 15. PMAG Guide — Final Approval and Push to P6

### 15.1 The dashboard summary

| Tile | Contents |
|---|---|
| **Approved Sheets** | Sheets approved by the Site PM, waiting for you |
| **Pushed Sheets** | Sheets already pushed to P6 |
| **Archived Sheets** | Older, archived entries |
| **Team Members** | The Site PMs in your scope |

Also on this bar: **Compare with Drone**, **P6 Push Snapshot**, and **Send Delay Alerts**.

### 15.2 Reviewing and approving

From **Approved Sheets**, each entry offers:

- **Edit** — the full editor, with the same capabilities as the Site PM's. From here you can **Save**, **Save & Push**, **Reject**, or **Push to P6**
- **Reject** — sends the sheet back to the Site PM
- **Push to P6** — final approval plus publishing

### 15.3 Pushing to Oracle P6

1. Click **Push to P6** (or **Save & Push** from the editor to save edits first).
2. A **push progress dialog** shows the push running activity by activity.
3. On completion the application automatically syncs the project back from P6 so the screen matches what P6 now holds.
4. If the push completes with errors, the message names them.

> **If P6 credentials have expired**, the push is blocked with *"Oracle P6 password has expired. Integrations will fail until updated."* A Super Admin must update the P6 password before pushes can resume.

### 15.4 P6 Push Snapshot

- **Push history** — every push, when and by whom
- **Comparison between two dates** — pick a range, click **Compare**, and **Top Movers by Variance** highlights the biggest changes
- **Push Frequency (30 days)**
- **Push Success Rate**
- **Cumulative Progress Trend**
- **Sheet Type Breakdown**

### 15.5 Send Delay Alerts

Generates and emails the Delayed Activities Excel report to the configured recipient, with a confirmation when it has gone.

### 15.6 Managing projects

PMAG users also reach the **Projects** tab of the administration console via **Manage Projects** in the avatar menu ([16.3](#163-projects-tab)).

---

## 16. Super Admin Guide — Administration Console

### 16.1 Users tab

The full user list — **Name**, **Email**, **Role**, **Status**, **Created At**.

- **Search** by name, email or role; filter by **Role** and **Status**; **Refresh**
- Row actions: **View User**, **Edit User**, **Assign Project**
- For **PMAG** users only, an **EPS** button assigns an entire EPS group of projects
- **Create User** from the header

### 16.2 Access Requests tab

Where new-user requests land. The tab header carries a **red badge with the pending count**, refreshed every 30 seconds.

Columns: **User**, **Type**, **EPS / Project**, **Justification**, **Status**, **Date**.

- **Approve** — choose which role to grant, then confirm
- **Reject** — declines the request
- Filter by status and **Refresh**

Handles both new-user role requests and PMAG project/EPS access requests.

### 16.3 Projects tab

Every project — **Project ID**, **Project Name**, **Type**, **Start Date**, **End Date**, **Visibility**.

**Filters:** search by name; **Status** (active / planning / completed); **Visibility** (live / on hold); **Type**; **Year**.

**Per-project actions:** **View**, **Edit** (name, location, status, progress, planned dates, project type, visibility), **Sync from P6**.

**Bulk actions** — tick checkboxes, or the header checkbox for all filtered projects:

| Action | Effect |
|---|---|
| **Sync Selected (n)** | Syncs every selected project from P6 |
| **Mark Live** | Makes the projects visible to users |
| **Put Hold** | Marks the projects On Hold |
| **Sync New Projects** | Discovers and imports projects newly created in P6 |

### 16.4 Sheet Entries tab

Browse every DPR sheet entry across all projects, for support and audit.

### 16.5 Role Management tab

Each role with its permissions and user count, with an edit action.

### 16.6 Workflow Overrides tab

Shows **Sheet ID**, **Project**, **Submitted By**, **Status** and the available **Override Action**, with an **Execute Override** button (confirmation required).

### 16.7 Analytics tab

System-wide analytics across projects and users.

### 16.8 System Logs tab

The system activity log — including automatic actions such as auto-approvals, recorded with their reason.

### 16.9 P6 password maintenance

Use the **Update P6 Password** dialog when the Oracle P6 integration password nears expiry. Until it is updated, PMAG pushes to P6 will fail.

---

## 17. Shared Tools Available to Everyone

### 17.1 E&D Sheets

The Engineering & Delivery tracker for the current project, with four tabs — **Summary**, **Engineering**, **Ordering**, **Delivery**. Each has its own search box and date filter, with rows grouped under headings. Export the current tab, or all tabs, to Excel.

### 17.2 Project Summary

The **Summary** button on a project card opens a read-only view with **Activity Table** and **Charts** tabs.

### 17.3 Drone Verification

On drone-enabled projects (Khavda and Baiya sites, and specific FY25 project IDs), **Compare with Drone** cross-checks reported progress against drone survey data.

The table shows, per activity: **Source API**, **DPR Cumulative**, **Drone Total**, **Variance**, **Status**. Rows flagged **Over-Reported** are shaded red — the DPR claims more progress than the survey found. Click a row to expand its breakdown.

### 17.4 Charts page

- **Planned vs Actual Progress**
- **Top Delayed Activities**
- **Approval Flow Status**
- **Submission Trends** (PMAG and Super Admin)
- **Rejection Reasons**
- **Bottleneck Identification**
- **Project Health Comparison**

### 17.5 Exports

- **This Sheet** — the current sheet as Excel
- **Entire Project** — all the project's sheets in one workbook

Historical exports include an **Analytics** tab with a *Total Progress Volume by Category* pie chart. The Wind Productivity sheet also has its own dedicated export.

### 17.6 Notifications

The 🔔 bell collects submissions, approvals and rejections. Expand an entry to read it; click through to open the sheet it refers to. **Mark all as read** clears the badge.

### 17.7 Dark mode

The theme toggle switches between light and dark. Grids, charts and dialogs all follow your choice.

---

## 18. Automatic Behaviour You Should Know About

| What | When | Why it matters to you |
|---|---|---|
| **Auto-save of drafts** | ~2 seconds after you stop typing | Draft work is safe without clicking Save. Does **not** apply once a sheet is submitted or approved |
| **Charging Schedule date chain** | As you type the IDT date | Trail-Run fills at +3 days and COD at +2 days after Trail-Run. All three stay editable, and the badge beside COD flags any non-standard gap ([12.6](#126-charging-schedule--data-entry)) |
| **Charging Schedule P6 lookup** | Whenever the sheet loads | Scope and Completed are matched to P6 activities by name and locked where a match is found. Blue bold figures are from P6; black ones are yours |
| **Auto-approval** | Hourly check. Sheets in **Submitted to PM** for more than **2 days** move automatically to **Final Approved** | A sheet nobody reviewed does not block the pipeline forever. Review promptly if you want a real review to happen |
| **Auto-finalisation** | Same job. Sheets in **Approved by PM** for more than **2 days** awaiting a PMAG push are finalised automatically | As above, for the PMAG stage |
| **Automatic project sync** | Daily at **01:00** | New projects created in P6 are picked up overnight |
| **P6 password expiry check** | Daily at **10:00** | Warns administrators before the integration breaks |
| **Access status polling** | Every 30 seconds on the pending-approval screen | No need to keep refreshing while waiting for approval |
| **Maintenance screen** | When the backend is unreachable | You see a maintenance message rather than a broken page |

---

## 19. Troubleshooting

**I signed in but land on "Welcome to Digitalized DPR!" instead of my projects.**
You do not have a role yet. Select a role and click **Request Access** ([3.4](#34-first-time-in--requesting-access)).

**My access was approved but I still cannot get in.**
Sign in again. Approval does not upgrade an already-issued session.

**I cannot see a project I expect to see.**
Check your filters first. If genuinely missing: supervisors and Site PMs only see assigned projects — ask your Site PM or PMAG. PMAG users can use **Request Project Access**. The project may also be **On Hold**.

**A sheet tab I need is missing.**
Supervisors only see permitted sheets — the badges on the project card list them. Optional sheets also appear conditionally: **Switchyard / Transmission Line / Infra Works** only on Rajasthan solar projects whose WBS contains that scope; **PSS / EHV** only on wind projects outside Khavda.

**The 33KV sheet looks completely different from the one I used on another wind project.**
That is expected. Khavda-type sites get the underground cabling layout; Outside Khavda, Mandvi and Mundra get the overhead-line layout ([10.4](#104-33kv--data-entry)).

**The BESS Summary looks almost empty.**
The **Trade Filter** defaults to **Civil**. Switch it to Electrical, Testing or All Trades ([12.1](#121-summary--read-only)).

**The Solar Summary says "No matching CC activities found."**
The summary only picks up activities coded as **CC** in P6. Ask your planner to check the activity coding ([9.1](#91-summary--read-only)).

**I cannot type into Physical Progress %.**
It is read-only by design on the PSS and BESS work sheets — it comes from P6 with no write-back path. Update **Completed** instead ([11.2](#112-civil-and-peb--electrical--400kv-transmission--data-entry)).

**I cannot type into the DP Qty sheet.**
DP Qty is a roll-up. Enter quantities on DC Side / AC Side / Testing & Commissioning (Solar) or Civil / Electrical / Testing (BESS), and they mirror across ([9.2](#92-dp-qty--read-only-roll-up), [12.2](#122-dp-qty--roll-up)).

**The BESS Productivity or Charging Schedule sheet is empty.**
That is the starting state. Click **Add Row** to load the activity checklist ([12.5](#125-productivity--data-entry), [12.6](#126-charging-schedule--data-entry)). These sheets are not populated from P6.

**I clicked Add Row twice and now every activity appears twice.**
Each click appends a complete copy of the checklist — that is intended, so you can track more than one container make or block on one sheet. Use the **bin icon** on the last row to remove the most recent copy.

**Generate DPR Activities says "No matching BESS activities found in this project's P6 data".**
The project's P6 activities do not follow the standard BESS naming the rules expect. Nothing was created and nothing was damaged. Use **Upload Activities** to load them from Excel instead ([8.7](#87-generate-dpr-activities--bess-only)).

**Activities I deleted reappeared after I clicked Generate DPR Activities.**
Expected. The button recreates anything missing from the standard list. Delete them again after generating, or maintain the list with **Add DPR Activity** / **Upload Activities**.

**I cannot type into Scope or Completed on the Charging Schedule.**
Those cells are blue and bold, which means they were matched to a P6 activity and are read-only. Correct the figure on the Civil / Electrical / Testing sheet and it flows through ([12.6](#126-charging-schedule--data-entry)).

**Some Charging Schedule rows are highlighted yellow.**
They are Electrical activities with no scope in P6 — DPR-level items you fill in by hand. Not an error.

**Activities are missing or the dates look out of date.**
Click **Sync Project**. Check **Sync Date** and **P6 Updated** on the project card to confirm the sync landed.

**"Unknown Project Type — This project type is not currently supported."**
The project type could not be determined. Ask a Super Admin to set it in the **Projects** tab.

**Global Submit says "No changed draft sheets found to submit for this date."**
Either nothing changed, the sheets were already submitted, or the **Report Date** is not the day you edited. Check the date field first — this is the most common cause.

**I edited an approved sheet and it did not save.**
By design. Auto-save is off for submitted and approved sheets so they do not silently revert to draft. Click **Save** explicitly ([8.6](#86-saving-and-submitting)).

**Push to P6 fails with a password message.**
The Oracle P6 integration password has expired. A Super Admin must update it.

**My sheet was approved and I never saw it reviewed.**
Sheets pending more than 2 days are auto-approved ([section 18](#18-automatic-behaviour-you-should-know-about)). The system log records this.

**The screen says the application is under maintenance.**
The backend is unreachable. Wait and reload; if it persists, contact your administrator.

---

## 20. Glossary

| Term | Meaning |
|---|---|
| **DPR** | Daily Progress Report — the daily record of site progress |
| **P6 / Oracle P6** | Oracle Primavera P6, the scheduling system this application reads from and writes back to |
| **P6 ID** | The project's identifier in P6, shown beside the project name |
| **EPS** | Enterprise Project Structure — the hierarchy grouping projects in P6. Access can be granted per EPS |
| **WBS** | Work Breakdown Structure — the hierarchy of work within a project |
| **PMAG** | The project management assurance group — the final approval authority before data reaches P6 |
| **BESS** | Battery Energy Storage System project |
| **PSS** | Pooling Sub-Station project |
| **WTG** | Wind Turbine Generator — the location unit on wind projects |
| **Block** | The location unit on solar and BESS projects |
| **SPV** | Special Purpose Vehicle — the legal entity a wind activity belongs to |
| **PEB** | Pre-Engineered Building |
| **B-to-B line** | Back-to-back line length on overhead 33KV feeders |
| **Stone column** | Ground-improvement columns installed before WTG foundations |
| **DT / Hub / Nacelle** | Wind turbine components erected in sequence |
| **Catch Up Plan** | The recovery plan quantity on BESS, shown beside the Base Plan |
| **BCT** | Battery Container Terminal — the sub-location within a BESS block, e.g. *Block 04 - BCT 1 & 2* |
| **IDT** | Initial Dispatch Test — the start of charging and commissioning on a BESS block |
| **Trail-Run** | The trial running period after IDT, before commercial operation. Defaults to IDT + 3 days |
| **COD** | Commercial Operation Date — when the block goes commercially live. Defaults to Trail-Run + 2 days |
| **EDC** | Expected Date of Completion, with **New EDC** for a revised commitment |
| **DPR-level activity** | An activity that exists only in the DPR, not in the P6 schedule — added manually, uploaded, or created by **Generate DPR Activities** |
| **WIP** | Work in progress — quantity started but not yet complete |
| **Baseline** | The approved schedule dates from P6, never editable in the DPR |
| **Forecast** | Projected dates from P6 |
| **Data Date** | The date P6 considers the schedule current as of |
| **CC activity** | An activity coded "CC" in P6 — what the Solar Summary rolls up |
| **Draft** | A sheet still being worked on, not yet submitted |
| **Push** | Sending approved progress from this application into Oracle P6 |
| **Live / On Hold** | Whether a project is visible to users or paused by an administrator |
| **Sheet entry** | One sheet, for one project, for one date — the unit that moves through the approval workflow |

---

*Digitalized DPR — Adani Renewables. Proprietary.*
