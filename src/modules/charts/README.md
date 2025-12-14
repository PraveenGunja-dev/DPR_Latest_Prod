# Charts Module

This module provides project-specific, workflow-related charts for the DPR workflow application. It is designed to be reusable across different dashboards and as a standalone page.

## Features

- **Role-based Access Control**: Different chart sets for different user roles
- **Project-specific Data**: Charts are filtered by the currently selected project
- **Responsive Design**: Works on all device sizes
- **Dark/Light Theme Support**: Automatically adapts to the current theme
- **Export Functionality**: Export charts as PNG or CSV data
- **Performance Optimized**: Lazy loading and memoization for better performance

## Chart Types

1. **Planned vs Actual Progress** - Compare baseline plans with real execution
2. **Activity Completion & Delay Visualization** - See which activities are on track or delayed
3. **Approval Flow Status** - Track the supervisor → PM → PMAG approval pipeline
4. **Submission Trends Over Time** - Monitor submission patterns
5. **Rejections vs Approvals Distribution** - Analyze approval rates
6. **Bottleneck Identification** - Identify activities or roles causing delays
7. **Cross-project Health Comparison** - Compare project health (SuperAdmin only)

## Role-based Behavior

- **Supervisors**: No charts (to avoid analytics overload)
- **Site PMs**: Validation and supervisor-related charts
- **PMAG/PMRG**: Final approval and deviation impact charts
- **SuperAdmin**: Cross-project and user workload charts

## Integration

### Standalone Route

The charts are accessible via `/charts` route for all authorized users.

### Dashboard Integration

Import and use the `ChartsSection` component in any dashboard:

```tsx
import { ChartsSection } from '@/modules/charts';

// In PM Dashboard
<ChartsSection context="PM_DASHBOARD" />

// In PMAG Dashboard  
<ChartsSection context="PMRG_DASHBOARD" />

// In SuperAdmin Dashboard
<ChartsSection context="SUPER_ADMIN_DASHBOARD" />
```

## API Services

The module uses the `chartService` to fetch data:

- `getAllChartsData()` - Fetches all relevant chart data based on user role
- Individual data fetchers for each chart type

## Styling

Charts automatically adapt to the current theme (light/dark) and are fully responsive.

## Export Features

Each chart has export buttons:
- **CSV** - Export raw data as CSV
- **PNG** - Export chart visualization as PNG (placeholder implementation)

## Performance

- Lazy loading of chart components
- Memoization of heavy renders
- Skeleton loaders during data fetching
- Graceful handling of empty or partial data