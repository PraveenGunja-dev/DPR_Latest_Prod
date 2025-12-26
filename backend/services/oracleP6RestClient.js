// server/services/oracleP6RestClient.js
// Oracle P6 REST API Client - Simple REST-based client for P6

const axios = require('axios');
const { getValidToken } = require('./oracleP6AuthService');

class OracleP6RestClient {
    constructor() {
        this.baseUrl = process.env.ORACLE_P6_BASE_URL || 'https://sin1.p6.oraclecloud.com/adani/p6ws/restapi';
        this._manualToken = null;
    }

    /**
     * Set the OAuth token for authentication (manual override)
     * @param {string} token - OAuth Bearer token
     */
    setToken(token) {
        this._manualToken = token;
    }

    /**
     * Get current token - uses JWT token directly from environment variable
     * @returns {Promise<string>} Current token
     */
    async getToken() {
        if (this._manualToken) return this._manualToken;

        // Use JWT token directly from environment variable, OR fallback to hardcoded token for reliability
        const token = process.env.ORACLE_P6_AUTH_TOKEN;
        if (token) {
            return token;
        }

        // Fallback hardcoded token (updated Dec 26, 2025 - 3:16 PM)
        const FALLBACK_TOKEN = 'eyJ4NXQjUzI1NiI6IlV6LU1BTlgyS0VncEFpb2I3cEVwQlZWSmtZSzFvV2FRczBacHhMbDI5NWciLCJ4NXQiOiJGNmE4X1lJMENCTEI3LVpkd3RWNjM5bXFqZ0kiLCJraWQiOiJTSUdOSU5HX0tFWSIsImFsZyI6IlJTMjU2In0.eyJjbGllbnRfb2NpZCI6Im9jaWQxLmRvbWFpbmFwcC5vYzEuYXAtbXVtYmFpLTEuYW1hYWFhYWFhcXRwNWJhYTVnaHlqbG92NnJ5d25zYzdta2w2d2ZybTd3cXJiNm9heXh1M3UzZWVsNWFxIiwidXNlcl90eiI6IkFzaWEvS29sa2F0YSIsInN1YiI6ImFnZWwuZm9yZWNhc3RpbmdAYWRhbmkuY29tIiwidXNlcl9sb2NhbGUiOiJlbiIsInNpZGxlIjo0ODAsInVzZXIudGVuYW50Lm5hbWUiOiJpZGNzLWQyYWE5Y2U2MDFjZDQ4NGFhZTQzNGY4YTJmMDBhMTQ3IiwiaXNzIjoiaHR0cHM6Ly9pZGVudGl0eS5vcmFjbGVjbG91ZC5jb20vIiwiZG9tYWluX2hvbWUiOiJhcC1tdW1iYWktMSIsImNhX29jaWQiOiJvY2lkMS50ZW5hbmN5Lm9jMS4uYWFhYWFhYWFrejRrZnl3cGVjc3h3dHBqc2tiZ2d5ZGNuNzdidGp2cmpocWVhaGJ5dGZ3dWczeXBnamJxIiwidXNlcl90ZW5hbnRuYW1lIjoiaWRjcy1kMmFhOWNlNjAxY2Q0ODRhYWU0MzRmOGEyZjAwYTE0NyIsImNsaWVudF9pZCI6IlByaW1hdmVyYVdUU1NfQWRhbmlfU3RhZ2VfQVBQSUQiLCJkb21haW5faWQiOiJvY2lkMS5kb21haW4ub2MxLi5hYWFhYWFhYTRsejVldWQ1bWc2dm82eGdqbG5lNWptbHMzb2x6NjZmZnQ3anRjd2dnYnRsM3RzNnloc3EiLCJzdWJfdHlwZSI6InVzZXIiLCJzY29wZSI6InVybjpvcGM6aWRtOnQuc2VjdXJpdHkuY2xpZW50IHVybjpvcGM6aWRtOnQudXNlci5hdXRobi5mYWN0b3JzIiwidXNlcl9vY2lkIjoib2NpZDEudXNlci5vYzEuLmFhYWFhYWFhdmQ3MnVkNm5maHg1dW4zMmdndnRhM2RibWlwNTJsYTZ4NnJnZmE0bW1yeGZ4bnJ5dGVncSIsImNsaWVudF90ZW5hbnRuYW1lIjoiaWRjcy1kMmFhOWNlNjAxY2Q0ODRhYWU0MzRmOGEyZjAwYTE0NyIsInJlZ2lvbl9uYW1lIjoiYXAtbXVtYmFpLWlkY3MtMSIsInVzZXJfbGFuZyI6ImVuIiwidXNlckFwcFJvbGVzIjpbIkF1dGhlbnRpY2F0ZWQiXSwiZXhwIjoxNzY2NzY4MTc3LCJpYXQiOjE3NjY3MzIxNzcsImNsaWVudF9ndWlkIjoiODMxYjBjZTYzYTE5NDk0NmI3MjFiOTYxYjdiZTEyNmYiLCJjbGllbnRfbmFtZSI6IlByaW1hdmVyYVdUU1NfQWRhbmlfU3RhZ2UiLCJ0ZW5hbnQiOiJpZGNzLWQyYWE5Y2U2MDFjZDQ4NGFhZTQzNGY4YTJmMDBhMTQ3IiwianRpIjoiNjVmMTY5NmQ2MzdiNGVlODlmMmU1YTNiMTQ4NTE5ZjUiLCJndHAiOiJybyIsInVzZXJfZGlzcGxheW5hbWUiOiJBZ2VsIGZvcmNhc3RpbmciLCJvcGMiOnRydWUsInN1Yl9tYXBwaW5nYXR0ciI6InVzZXJOYW1lIiwicHJpbVRlbmFudCI6dHJ1ZSwidG9rX3R5cGUiOiJBVCIsImF1ZCI6WyJ1cm46b3BjOmxiYWFzOmxvZ2ljYWxndWlkPWlkY3MtZDJhYTljZTYwMWNkNDg0YWFlNDM0ZjhhMmYwMGExNDciLCJodHRwczovL2lkY3MtZDJhYTljZTYwMWNkNDg0YWFlNDM0ZjhhMmYwMGExNDcuYXAtbXVtYmFpLWlkY3MtMS5zZWN1cmUuaWRlbnRpdHkub3JhY2xlY2xvdWQuY29tIiwiaHR0cHM6Ly9pZGNzLWQyYWE5Y2U2MDFjZDQ4NGFhZTQzNGY4YTJmMDBhMTQ3LmlkZW50aXR5Lm9yYWNsZWNsb3VkLmNvbSJdLCJjYV9uYW1lIjoiYWRhbmkiLCJzdHUiOiJQUklNQVZFUkEiLCJ1c2VyX2lkIjoiYjA2ZGZkMWUwZTIxNDYwNWE1MDA5YzE5ZmI5NThkMmEiLCJkb21haW4iOiJEZWZhdWx0IiwiY2xpZW50QXBwUm9sZXMiOlsiVXNlciBWaWV3ZXIiLCJBdXRoZW50aWNhdGVkIENsaWVudCIsIkNsb3VkIEdhdGUiXSwidGVuYW50X2lzcyI6Imh0dHBzOi8vaWRjcy1kMmFhOWNlNjAxY2Q0ODRhYWU0MzRmOGEyZjAwYTE0Ny5pZGVudGl0eS5vcmFjbGVjbG91ZC5jb206NDQzIn0.DlocpzsATEIfR99S5aZKEkSwPQCjFfwolUAR5SDKurr48UC4g-KnOjfnF-8thQqJU6qbEPRNre2GepS5NtKRWoAuG7-xoQht2tjmQvTxT3coQHfIOvL8QZI4LNavikRgp2q8TfiFQ-dlcqcXSdQipkza4_fFSIfyNZbJ8z8TSN6auvJb0wGsWZsejX7wYC6yYjuBB2GIDi6AgED6OuY60sp5JOhtW3if-wcY3j6pWzQdMXzR6MAnwtvP5OBqYv6-rjTqEXAlV4mbpnzAc52nlgzQcxHAhCETaJR1D2UI_8K_VUUxnQ1cv_ujZKsuhw3NGBfM3Lt1nrjbdFSQvd-x5g';

        console.warn('Using fallback hardcoded token because environment variable is missing');
        return FALLBACK_TOKEN;
    }

    /**
     * Make authenticated GET request
     * @param {string} endpoint - API endpoint (e.g., '/project')
     * @param {Object} params - Query parameters
     * @returns {Promise<Array|Object>} Response data
     */
    async get(endpoint, params = {}) {
        try {
            const url = `${this.baseUrl}${endpoint}`;
            const token = await this.getToken();

            console.log(`GET ${endpoint} with token ending ...${token.slice(-10)}`);

            const config = {
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Accept': 'application/json'
                },
                params: params,
                timeout: 30000 // 30 second timeout
            };

            const response = await axios.get(url, config);
            console.log(`SUCCESS ${endpoint}: Status ${response.status}`);
            return response.data;
        } catch (error) {
            console.error(`ERROR ${endpoint}: ${error.message} ${error.response?.status}`);
            if (error.response) {
                console.error(`Response data: ${JSON.stringify(error.response.data)}`);
            }
            throw error;
        }
    }

    /**
     * Read projects from Oracle P6
     * @param {Array<string>} fields - Fields to retrieve
     * @returns {Promise<Array>} Array of projects
     */
    async readProjects(fields = ['ObjectId', 'Id', 'Name', 'Status', 'StartDate', 'FinishDate', 'Description']) {
        // First try to fetch from live P6 API
        try {
            const params = {
                Fields: fields.join(',')
            };

            const data = await this.get('/project', params);

            // Handle both array and object responses
            const projects = Array.isArray(data) ? data : (data.data || data.items || []);
            console.log(`[P6 REST] Retrieved ${projects.length} projects from live API`);

            return projects;
        } catch (apiError) {
            console.log('[P6 REST] API Error, trying saved JSON file:', apiError.message);

            // Fallback to saved JSON file if API fails
            try {
                const fs = require('fs');
                const path = require('path');
                const jsonPath = path.join(__dirname, '..', 'p6-projects.json');

                if (fs.existsSync(jsonPath)) {
                    const data = fs.readFileSync(jsonPath, 'utf8');
                    const projects = JSON.parse(data);
                    console.log(`[P6 REST] Loaded ${projects.length} projects from JSON file (fallback)`);
                    return projects;
                }
            } catch (fileError) {
                console.log('[P6 REST] Could not load from JSON file:', fileError.message);
            }

            // Re-throw if both fail
            throw apiError;
        }
    }

    /**
     * Read activities from Oracle P6
     * @param {Array<string>} fields - Fields to retrieve
     * @param {number} projectObjectId - Optional project filter
     * @returns {Promise<Array>} Array of activities
     */
    async readActivities(fields = ['ObjectId', 'Id', 'Name', 'Status', 'StartDate', 'FinishDate'], projectObjectId = null) {
        try {
            const params = {
                Fields: fields.join(',')
            };

            if (projectObjectId) {
                params.Filter = `ProjectObjectId = ${projectObjectId}`;
            }

            const data = await this.get('/activity', params);

            const activities = Array.isArray(data) ? data : (data.data || data.items || []);
            console.log(`[P6 REST] Retrieved ${activities.length} activities from live API`);

            return activities;
        } catch (apiError) {
            console.error('[P6 REST] API Error fetching activities:', apiError.message);
            // Re-throw error - no fallback sample data
            throw apiError;
        }
    }

    /**
     * Read UDF values for activities in a project
     * P6 REST API endpoint: /udfvalue (generic UDF endpoint, filter by ForeignObjectId)
     * @param {Array<number>} activityObjectIds - List of activity ObjectIds to get UDFs for
     * @returns {Promise<Array>} Array of UDF values
     */
    async readActivityUDFValues(activityObjectIds) {
        try {
            if (!activityObjectIds || activityObjectIds.length === 0) {
                return [];
            }

            // Build filter for multiple activities (batch in groups of 50 to avoid URL length issues)
            const batchSize = 50;
            const allUdfValues = [];

            for (let i = 0; i < activityObjectIds.length; i += batchSize) {
                const batch = activityObjectIds.slice(i, i + batchSize);
                const filterValue = batch.join(',');

                const params = {
                    // Request all possible UDF value fields
                    Fields: 'ObjectId,ForeignObjectId,UDFTypeObjectId,UDFTypeTitle,Text,Double,Integer,Cost,StartDate,FinishDate,Indicator,CodeValue,Description',
                    Filter: `ForeignObjectId IN (${filterValue})`
                };

                // Use /udfvalue endpoint (lowercase, correct P6 REST API endpoint)
                const data = await this.get('/udfvalue', params);
                const udfValues = Array.isArray(data) ? data : (data.data || data.items || []);
                allUdfValues.push(...udfValues);
            }

            console.log(`[P6 REST] Retrieved ${allUdfValues.length} UDF values for ${activityObjectIds.length} activities`);
            return allUdfValues;
        } catch (apiError) {
            console.error('[P6 REST] Error fetching UDF values:', apiError.message);
            // Return empty array on error - UDFs are optional enhancement
            return [];
        }
    }


    /**
     * Read Resource Assignments from Oracle P6
     * Used to get Total Quantity (PlannedUnits/BudgetedUnits) and UOM data
     * @param {number} projectObjectId - Project ObjectId to fetch assignments for
     * @returns {Promise<Array>} Array of resource assignments
     */
    async readResourceAssignments(projectObjectId) {
        try {
            const params = {
                Fields: 'ObjectId,ActivityObjectId,ResourceObjectId,ResourceName,PlannedUnits,ActualUnits,RemainingUnits,BudgetedUnits,UnitOfMeasure,StartDate,FinishDate,IsPrimaryResource,ProjectObjectId',
                Filter: `ProjectObjectId = ${projectObjectId}`
            };

            const data = await this.get('/resourceassignment', params);
            const assignments = Array.isArray(data) ? data : (data.data || data.items || []);

            console.log(`[P6 REST] Retrieved ${assignments.length} resource assignments for project ${projectObjectId}`);
            return assignments;
        } catch (apiError) {
            console.error('[P6 REST] Error fetching resource assignments:', apiError.message);
            // Return empty array on error - resource assignments are optional
            return [];
        }
    }

    /**
     * Read Activity Code Types from Oracle P6
     * Activity Code Types are categories like "Priority", "Plot", "Phase"
     * @param {number} projectObjectId - Project ObjectId to fetch code types for
     * @returns {Promise<Array>} Array of activity code types
     */
    async readActivityCodeTypes(projectObjectId) {
        try {
            const params = {
                Fields: 'ObjectId,ProjectObjectId,Name,Description,SequenceNumber,MaxLength',
                Filter: `ProjectObjectId = ${projectObjectId}`
            };

            const data = await this.get('/activitycodetype', params);
            const codeTypes = Array.isArray(data) ? data : (data.data || data.items || []);

            console.log(`[P6 REST] Retrieved ${codeTypes.length} activity code types for project ${projectObjectId}`);
            return codeTypes;
        } catch (apiError) {
            console.error('[P6 REST] Error fetching activity code types:', apiError.message);
            // Return empty array on error - activity codes are optional
            return [];
        }
    }

    /**
     * Read Activity Codes from Oracle P6
     * Activity Codes are the actual values like "High", "Medium", "Low"
     * @param {number} projectObjectId - Project ObjectId to fetch codes for
     * @returns {Promise<Array>} Array of activity codes
     */
    async readActivityCodes(projectObjectId) {
        try {
            const params = {
                Fields: 'ObjectId,CodeTypeObjectId,CodeValue,Description,ShortName,Color,SequenceNumber',
                Filter: `ProjectObjectId = ${projectObjectId}`
            };

            const data = await this.get('/activitycode', params);
            const codes = Array.isArray(data) ? data : (data.data || data.items || []);

            console.log(`[P6 REST] Retrieved ${codes.length} activity codes for project ${projectObjectId}`);
            return codes;
        } catch (apiError) {
            console.error('[P6 REST] Error fetching activity codes:', apiError.message);
            // Return empty array on error - activity codes are optional
            return [];
        }
    }

    /**
     * Read Activity Code Assignments from Oracle P6
     * Links activities to their assigned code values
     * @param {number} projectObjectId - Project ObjectId to fetch assignments for
     * @returns {Promise<Array>} Array of activity code assignments
     */
    async readActivityCodeAssignments(projectObjectId) {
        try {
            const params = {
                Fields: 'ObjectId,ActivityObjectId,ActivityCodeObjectId,ProjectObjectId',
                Filter: `ProjectObjectId = ${projectObjectId}`
            };

            const data = await this.get('/activitycodeassignment', params);
            const assignments = Array.isArray(data) ? data : (data.data || data.items || []);

            console.log(`[P6 REST] Retrieved ${assignments.length} activity code assignments for project ${projectObjectId}`);
            return assignments;
        } catch (apiError) {
            console.error('[P6 REST] Error fetching activity code assignments:', apiError.message);
            // Return empty array on error - activity codes are optional
            return [];
        }
    }

    /**
     * Read Resources from Oracle P6
     * Resources include contractors, labor, equipment, materials
     * @param {number} projectObjectId - Optional project filter (may not be available on all P6 instances)
     * @returns {Promise<Array>} Array of resources
     */
    async readResources(projectObjectId = null) {
        try {
            const params = {
                // Minimal field set - only request fields that definitely exist
                Fields: 'ObjectId,Id,Name'
            };

            // Note: Some P6 instances may not support filtering resources by project
            // If projectObjectId is provided, try filtering, but be prepared for it to fail
            if (projectObjectId) {
                params.Filter = `ProjectObjectId = ${projectObjectId}`;
            }

            const data = await this.get('/resource', params);
            const resources = Array.isArray(data) ? data : (data.data || data.items || []);

            console.log(`[P6 REST] Retrieved ${resources.length} resources${projectObjectId ? ' for project ' + projectObjectId : ''}`);
            return resources;
        } catch (apiError) {
            console.error('[P6 REST] Error fetching resources:', apiError.message);
            // Return empty array on error - resources are optional
            return [];
        }
    }

    /**
     * Get a single project by ObjectId
     * @param {number} objectId - Project ObjectId
     * @param {Array<string>} fields - Fields to retrieve
     * @returns {Promise<Object|null>} Project or null
     */
    async getProjectById(objectId, fields = ['ObjectId', 'Id', 'Name', 'Status', 'StartDate', 'FinishDate', 'Description']) {

        const params = {
            Fields: fields.join(','),
            Filter: `ObjectId = ${objectId}`
        };

        const data = await this.get('/project', params);
        const projects = Array.isArray(data) ? data : (data.data || data.items || []);

        return projects.length > 0 ? projects[0] : null;
    }
}

// Export singleton instance
const restClient = new OracleP6RestClient();

module.exports = { OracleP6RestClient, restClient };
