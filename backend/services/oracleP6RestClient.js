// server/services/oracleP6RestClient.js
// Oracle P6 REST API Client - Simple REST-based client for P6

const axios = require('axios');
const fs = require('fs');
const http = require('http');
const https = require('https');
const { getValidToken } = require('./oracleP6AuthService');
const { getValidP6Token } = require('./p6TokenService');

const { HttpsProxyAgent } = require('https-proxy-agent');

class OracleP6RestClient {
    constructor() {
        // Use Stage environment (not production)
        this.baseUrl = process.env.ORACLE_P6_BASE_URL || 'https://sin1.p6.oraclecloud.com/adani/stage/p6ws/restapi';
        this._manualToken = null;

        // Setup Proxy or Direct Agent
        const proxyUrl = process.env.HTTPS_PROXY || process.env.http_proxy;
        if (proxyUrl) {
            console.log(`[P6 Client] Using Proxy Agent: ${proxyUrl}`);
            this.httpsAgent = new HttpsProxyAgent(proxyUrl, {
                rejectUnauthorized: false
            });
        } else {
            // Create an agent that ignores SSL certificate errors (fixes ECONNRESET)
            this.httpsAgent = new https.Agent({
                rejectUnauthorized: false
            });
        }
    }

    /**
     * Set the OAuth token for authentication (manual override)
     * @param {string} token - OAuth Bearer token
     */
    setToken(token) {
        this._manualToken = token;
    }

    /**
     * Get current token - uses dynamic P6 OAuth token
     * @returns {Promise<string>} Current token
     */
    async getToken() {
        if (this._manualToken) {
            console.log('[P6 Client] Using manually set token');
            return this._manualToken;
        }

        // Use dynamic token service
        try {
            const token = await getValidP6Token();
            console.log('[P6 Client] Using dynamically generated token from p6TokenService');
            return token;
        } catch (error) {
            console.error('[P6 Client] Failed to get dynamic token:', error.message);
            throw error;
        }
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
                timeout: 120000, // 120 second timeout for large data
                httpsAgent: this.httpsAgent // Use permissive agent
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
     * Make authenticated PUT request (for updating data in P6)
     * @param {string} endpoint - API endpoint (e.g., '/activity')
     * @param {Object|Array} data - Data to update
     * @returns {Promise<Object>} Response data
     */
    async put(endpoint, data) {
        try {
            const url = `${this.baseUrl}${endpoint}`;
            const token = await this.getToken();

            console.log(`PUT ${endpoint} with token ending ...${token.slice(-10)}`);
            console.log(`PUT data:`, JSON.stringify(data).substring(0, 200) + '...');

            const config = {
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Accept': 'application/json',
                    'Content-Type': 'application/json'
                },
                timeout: 60000, // 60 second timeout for updates
                httpsAgent: this.httpsAgent // Use permissive agent
            };

            const response = await axios.put(url, data, config);
            console.log(`SUCCESS PUT ${endpoint}: Status ${response.status}`);
            return response.data;
        } catch (error) {
            console.error(`ERROR PUT ${endpoint}: ${error.message} ${error.response?.status}`);
            if (error.response) {
                console.error(`Response data: ${JSON.stringify(error.response.data)}`);
            }
            throw error;
        }
    }

    /**
     * Update activities in Oracle P6
     * Uses PUT /activity endpoint to update one or more activities
     * @param {Array<Object>} activities - Array of activity objects with ObjectId and fields to update
     * @returns {Promise<Object>} API response
     */
    async updateActivities(activities) {
        if (!activities || activities.length === 0) {
            return { success: true, message: 'No activities to update', count: 0 };
        }

        try {
            console.log(`[P6 REST] Updating ${activities.length} activities in P6...`);

            // P6 expects array of activity objects with ObjectId
            const response = await this.put('/activity', activities);

            console.log(`[P6 REST] Successfully updated ${activities.length} activities in P6`);
            return {
                success: true,
                message: `Updated ${activities.length} activities in P6`,
                count: activities.length,
                response: response
            };
        } catch (error) {
            console.error('[P6 REST] Error updating activities:', error.message);
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
                    Fields: 'ForeignObjectId,UDFTypeObjectId,UDFTypeTitle,Text,Double,Integer,Cost,StartDate,FinishDate,Indicator,CodeValue,Description',
                    Filter: `ForeignObjectId IN (${filterValue})`
                };

                // Use /udfValue endpoint (camelCase per P6 Swagger docs)
                const data = await this.get('/udfValue', params);
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
                Fields: 'ObjectId,ActivityObjectId,ResourceObjectId,ResourceName,PlannedUnits,ActualUnits,RemainingUnits,StartDate,FinishDate,IsPrimaryResource,ProjectObjectId',
                Filter: `ProjectObjectId = ${projectObjectId}`
            };

            const data = await this.get('/resourceAssignment', params);
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
                Fields: 'ObjectId,ProjectObjectId,Name,SequenceNumber',
                Filter: `ProjectObjectId = ${projectObjectId}`
            };
            console.log('[DEBUG] ActivityCodeType Params:', JSON.stringify(params));

            const data = await this.get('/activityCodeType', params);
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

            const data = await this.get('/activityCode', params);
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

            const data = await this.get('/activityCodeAssignment', params);
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
     * NOTE: Resources in P6 are global - they are NOT tied to specific projects
     * @param {number} projectObjectId - Ignored - resources are fetched globally
     * @returns {Promise<Array>} Array of resources
     */
    async readResources(projectObjectId = null) {
        try {
            const params = {
                // Request more fields for better resource identification
                Fields: 'ObjectId,Id,Name,ResourceType,ParentObjectId'
            };

            // Resources are global in P6 - do NOT filter by project
            // Filtering by ProjectObjectId will return 0 results
            console.log('[P6 REST] Fetching ALL resources (global - no project filter)');

            const data = await this.get('/resource', params);
            const resources = Array.isArray(data) ? data : (data.data || data.items || []);

            console.log(`[P6 REST] Retrieved ${resources.length} resources from P6`);
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
