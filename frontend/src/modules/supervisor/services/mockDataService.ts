// src/modules/supervisor/services/mockDataService.ts
// Service to fetch data from the mock API

const MOCK_API_BASE_URL = 'http://localhost:4001';

// Helper function to convert date format from DD-MMM-YYYY to YYYY-MM-DD for better display
const convertDateFormat = (dateStr: string): string => {
  if (!dateStr) return '';

  // Split the date string (e.g., "04-Feb-2025")
  const parts = dateStr.split('-');
  if (parts.length !== 3) return dateStr;

  const day = parts[0];
  const month = parts[1];
  const year = parts[2];

  // Month mapping
  const monthMap: Record<string, string> = {
    'Jan': '01', 'Feb': '02', 'Mar': '03', 'Apr': '04',
    'May': '05', 'Jun': '06', 'Jul': '07', 'Aug': '08',
    'Sep': '09', 'Oct': '10', 'Nov': '11', 'Dec': '12'
  };

  const monthNum = monthMap[month];
  if (!monthNum) return dateStr;

  return `${year}-${monthNum}-${day.padStart(2, '0')}`;
};

// Helper function to transform mock API data to component data format
const transformDpQtyData = (apiData: any[]): any[] => {
  // Check if the data has the new structure with nested items
  if (apiData.length > 0 && apiData[0].data) {
    // New structure - flatten the nested items
    const flattenedData: any[] = [];

    apiData[0].data.forEach((categoryItem: any) => {
      categoryItem.items.forEach((item: any, index: number) => {
        flattenedData.push({
          slNo: `${categoryItem.id}.${index + 1}`, // Combine category ID with item index
          description: item.name,
          totalQuantity: item.quantity.toString(),
          uom: item.unit,
          basePlanStart: convertDateFormat(item.plan_start) || '',
          basePlanFinish: convertDateFormat(item.plan_finish) || '',
          forecastStart: convertDateFormat(item.forecast_start) || '',
          forecastFinish: convertDateFormat(item.forecast_finish) || '',
          actualStart: convertDateFormat(item.actual_start) || '',
          actualFinish: convertDateFormat(item.actual_finish) || '',
          remarks: item.remarks || '',
          balance: (item.quantity - item.cumulative).toString(),
          cumulative: item.cumulative.toString(),
          yesterday: '', // Will be populated by the component
          yesterdayIsApproved: true,
          today: '' // Will be populated by the component
        });
      });
    });

    return flattenedData;
  } else {
    // Old structure - transform as before
    return apiData.map(item => ({
      slNo: item.id.toString(),
      description: `Activity ${item.activityId}`,
      totalQuantity: item.plannedQty.toString(),
      uom: item.uom,
      basePlanStart: '', // Not in mock data
      basePlanFinish: '', // Not in mock data
      forecastStart: '', // Not in mock data
      forecastFinish: '', // Not in mock data
      blockCapacity: '', // Not in mock data
      phase: '', // Not in mock data
      block: item.wbsCode,
      spvNumber: '', // Not in mock data
      actualStart: '', // User editable
      actualFinish: '', // User editable
      remarks: '', // User editable
      priority: '', // User editable
      balance: (item.plannedQty - item.actualQty).toString(),
      cumulative: item.actualQty.toString(),
      yesterday: '', // Number value, not editable
      yesterdayIsApproved: true,
      today: '' // Number value, editable
    }));
  }
};

const transformDpBlockData = (apiData: any[]): any[] => {
  // Check if we have the new structure with piling_tracker_blocks
  if (apiData && apiData[0] && apiData[0].piling_tracker_blocks) {
    // Transform the new structure
    return apiData[0].piling_tracker_blocks.map((item: any, index: number) => ({
      activityId: `ACT-${index + 1}`,
      activities: `${item.block} - ${item.phase}`,
      plot: item.spv_number,
      newBlockNom: item.block,
      baselinePriority: item.priority,
      scope: item.scope.toString(),
      holdDueToWtg: item.hold.toString(),
      front: item.front.toString(),
      actual: item.completed.toString(),
      completionPercentage: item.balance === 0 ? '100.00' : ((item.completed / item.scope) * 100).toFixed(2),
      balance: item.balance.toString(),
      baselineStart: item.baseline_start,
      baselineFinish: item.baseline_finish,
      actualStart: item.actual_start,
      actualFinish: item.actual_finish,
      forecastStart: item.forecast_start,
      forecastFinish: item.forecast_finish,
      yesterdayValue: '', // Number value, not editable
      todayValue: '' // Number value, editable
    }));
  } else {
    // Old structure - transform as before
    return apiData.map(item => ({
      activityId: item.activityId || item.id.toString(),
      activities: `Block Activity ${item.id}`,
      plot: item.blockId,
      newBlockNom: '', // Not in mock data
      baselinePriority: '', // Not in mock data
      scope: '', // Not in mock data
      holdDueToWtg: '', // Not in mock data
      front: '', // Auto calculated
      actual: '', // Auto calculated
      completionPercentage: item.completedPercent.toString(),
      yesterdayValue: '', // Number value, not editable
      todayValue: '' // Number value, editable
    }));
  }
};

const transformDpVendorIdtData = (apiData: any[]): any[] => {
  // Handle hierarchical data structure with category rows
  return apiData.map(item => {
    if (item.is_category_row) {
      // Category row - only show category name
      return {
        activityId: '',
        activities: '',
        plot: '',
        newBlockNom: '',
        baselinePriority: '',
        scope: '',
        front: '',
        priority: '',
        contractorName: '',
        remarks: '',
        actual: '',
        completionPercentage: '',
        yesterdayValue: '',
        todayValue: '',
        category: item.category,
        isCategoryRow: true
      };
    } else {
      // Activity row - show all data
      return {
        activityId: item.activity_id || '',
        activities: item.activity || '',
        plot: item.plot || '',
        newBlockNom: item.block || '',
        baselinePriority: item.baseline_priority || '',
        scope: item.scope || '',
        front: item.front || '',
        priority: item.priority || '',
        contractorName: item.contractor || '',
        remarks: item.remarks || '',
        actual: item.actual || '',
        completionPercentage: item.percent_completion || '',
        yesterdayValue: '',
        todayValue: '',
        isCategoryRow: false
      };
    }
  });
};

const transformManpowerDetailsData = (apiData: any[]): any[] => {
  return apiData.map(item => ({
    activityId: item.activityId || item.id.toString(),
    slNo: item.id.toString(),
    block: '', // Not in mock data
    contractorName: `${item.trade} Contractor`,
    activity: item.trade,
    section: '', // Not in mock data
    yesterdayValue: '',
    todayValue: item.count.toString()
  }));
};

const transformMmsModuleRfiData = (apiData: any[]): any[] => {
  return apiData.map(item => ({
    rfiNo: item.rfiId,
    subject: `RFI Subject ${item.id}`,
    module: `Module ${item.id}`,
    submittedDate: item.submittedDate,
    responseDate: item.approvedDate || '',
    status: item.status,
    remarks: '', // User editable
    yesterdayValue: '',
    todayValue: ''
  }));
};

const transformDpVendorBlockData = (apiData: any[]): any[] => {
  // Handle hierarchical data structure with category rows
  return apiData.map(item => {
    if (item.is_category_row) {
      // Category row - only show category name
      return {
        activityId: '',
        activities: '',
        plot: '',
        newBlockNom: '',
        priority: '',
        baselinePriority: '',
        contractorName: '',
        scope: '',
        holdDueToWtg: '',
        front: '',
        actual: '',
        completionPercentage: '',
        remarks: '',
        yesterdayValue: '',
        todayValue: '',
        category: item.category,
        isCategoryRow: true
      };
    } else {
      // Activity row - show all data
      return {
        activityId: item.activity_id || '',
        activities: item.activity || '',
        plot: item.plot || '',
        newBlockNom: item.block || '',
        priority: item.priority || '',
        baselinePriority: '', // Not in mock data
        contractorName: item.contractor || '',
        scope: item.scope?.toString() || '',
        holdDueToWtg: '', // Not in mock data
        front: item.front?.toString() || '',
        actual: item.actual?.toString() || '',
        completionPercentage: item.completion || '',
        remarks: item.remarks || '',
        yesterdayValue: '',
        todayValue: '',
        isCategoryRow: false
      };
    }
  });
};

// Fetch DP Qty data from mock API
export const fetchDpQtyData = async (): Promise<any[]> => {
  try {
    const response = await fetch(`${MOCK_API_BASE_URL}/p6/dp-qty`);
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    const data = await response.json();
    return transformDpQtyData(data);
  } catch (error) {
    console.error('Error fetching DP Qty data from mock API:', error);
    // Return default empty row if fetch fails
    return [{
      slNo: '',
      description: '',
      totalQuantity: '',
      uom: '',
      basePlanStart: '',
      basePlanFinish: '',
      forecastStart: '',
      forecastFinish: '',
      blockCapacity: '',
      phase: '',
      block: '',
      spvNumber: '',
      actualStart: '',
      actualFinish: '',
      remarks: '',
      priority: '',
      balance: '',
      cumulative: '',
      yesterday: '', // Number value, not editable
      yesterdayIsApproved: true,
      today: '' // Number value, editable
    }];
  }
};

// Fetch DP Block data from mock API
export const fetchDpBlockData = async (): Promise<any[]> => {
  try {
    const response = await fetch(`${MOCK_API_BASE_URL}/p6/dp-block`);
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    const data = await response.json();
    return transformDpBlockData(data);
  } catch (error) {
    console.error('Error fetching DP Block data from mock API:', error);
    // Return default empty row if fetch fails
    return [{
      activityId: '',
      activities: '',
      plot: '',
      newBlockNom: '',
      baselinePriority: '',
      contractorName: '',
      scope: '',
      holdDueToWtg: '',
      front: '',
      actual: '',
      completionPercentage: '',
      yesterdayValue: '', // Number value, not editable
      todayValue: '' // Number value, editable
    }];
  }
};

// Fetch DP Vendor IDT data from mock API
export const fetchDpVendorIdtData = async (): Promise<any[]> => {
  try {
    const response = await fetch(`${MOCK_API_BASE_URL}/p6/vendor-idt`);
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    const data = await response.json();
    return transformDpVendorIdtData(data);
  } catch (error) {
    console.error('Error fetching DP Vendor IDT data from mock API:', error);
    // Return default empty row if fetch fails
    return [{
      activityId: '',
      activities: '',
      plot: '',
      newBlockNom: '',
      baselinePriority: '',
      scope: '',
      front: '',
      priority: '',
      contractorName: '',
      remarks: '',
      actual: '',
      completionPercentage: '',
      yesterdayValue: '', // Number value, not editable
      todayValue: '' // Number value, editable
    }];
  }
};

// Fetch Manpower Details data from mock API
export const fetchManpowerDetailsData = async (): Promise<any[]> => {
  try {
    const response = await fetch(`${MOCK_API_BASE_URL}/p6/manpower`);
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    const data = await response.json();
    return transformManpowerDetailsData(data);
  } catch (error) {
    console.error('Error fetching Manpower Details data from mock API:', error);
    // Return default empty row if fetch fails
    return [{
      activityId: '',
      slNo: '',
      block: '',
      contractorName: '',
      activity: '',
      section: '',
      yesterdayValue: '',
      todayValue: ''
    }];
  }
};

// Fetch MMS & Module RFI data from mock API
export const fetchMmsModuleRfiData = async (): Promise<any[]> => {
  try {
    const response = await fetch(`${MOCK_API_BASE_URL}/p6/mms-rfi`);
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    const data = await response.json();
    return transformMmsModuleRfiData(data);
  } catch (error) {
    console.error('Error fetching MMS & Module RFI data from mock API:', error);
    // Return default empty row if fetch fails
    return [{
      rfiNo: '',
      subject: '',
      module: '',
      submittedDate: '',
      responseDate: '',
      status: '',
      remarks: '',
      yesterdayValue: '',
      todayValue: ''
    }];
  }
};

// Fetch DP Vendor Block data from mock API
export const fetchDpVendorBlockData = async (): Promise<any[]> => {
  try {
    const response = await fetch(`${MOCK_API_BASE_URL}/p6/vendor-block`);
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    const data = await response.json();
    return transformDpVendorBlockData(data);
  } catch (error) {
    console.error('Error fetching DP Vendor Block data from mock API:', error);
    // Return default empty row if fetch fails
    return [{
      activityId: '',
      activities: '',
      plot: '',
      newBlockNom: '',
      priority: '',
      baselinePriority: '',
      contractorName: '',
      scope: '',
      holdDueToWtg: '',
      front: '',
      actual: '',
      completionPercentage: '',
      remarks: '',
      yesterdayValue: '',
      todayValue: ''
    }];
  }
};

// Fetch DP Vendor IDT Categories data from mock API
export const fetchDpVendorIdtCategories = async (): Promise<any[]> => {
  try {
    const response = await fetch(`${MOCK_API_BASE_URL}/p6/vendor-idt-categories`);
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    const data = await response.json();
    return data;
  } catch (error) {
    console.error('Error fetching DP Vendor IDT Categories data from mock API:', error);
    // Return empty array if fetch fails
    return [];
  }
};
