import api from './apiClient';

export interface ProjectConfiguration {
    p6_id: string;
    enable_drone_integration: boolean;
    dashboard_layout_type: string;
}

export const getProjectConfig = async (p6Id: string): Promise<ProjectConfiguration> => {
    try {
        if (!p6Id) return { p6_id: '', enable_drone_integration: false, dashboard_layout_type: 'standard' };
        const response = await api.get(`/config/project/${p6Id}`);
        return response.data;
    } catch (error) {
        console.error("Error fetching project config:", error);
        return {
            p6_id: p6Id,
            enable_drone_integration: false,
            dashboard_layout_type: "standard"
        };
    }
};

export const getWbsPatterns = async () => {
    try {
        const response = await api.get('/config/wbs-patterns');
        return response.data;
    } catch (error) {
        console.error("Error fetching wbs patterns:", error);
        return {};
    }
};

export const getActivityMasterList = async (sheetType: string) => {
    try {
        const response = await api.get(`/config/activities/${sheetType}`);
        return response.data;
    } catch (error) {
        console.error("Error fetching activity master list:", error);
        return [];
    }
};

export const fetchAllMasterLists = async () => {
    try {
        const [dc, ac, tc] = await Promise.all([
            getActivityMasterList('dc_sheet'),
            getActivityMasterList('ac_sheet'),
            getActivityMasterList('testing_commissioning')
        ]);
        return {
            dc_sheet: dc,
            ac_sheet: ac,
            testing_commissioning: tc
        };
    } catch (error) {
        console.error("Error fetching all master lists:", error);
        return {};
    }
};
