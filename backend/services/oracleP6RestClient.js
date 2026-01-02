// server/services/oracleP6RestClient.js
// Oracle P6 REST API Client - Simple REST-based client for P6

const axios = require('axios');
const { getValidToken } = require('./oracleP6AuthService');

class OracleP6RestClient {
    constructor() {
        // Use Stage environment (not production)
        this.baseUrl = process.env.ORACLE_P6_BASE_URL || 'https://sin1.p6.oraclecloud.com/adani/stage/p6ws/restapi';
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

        // Use JWT token directly from environment variable
        const token = process.env.ORACLE_P6_AUTH_TOKEN || process.env.P6_TOKEN;
        if (token) {
            console.log('Using P6 token from environment variable');
            return token;
        }

        // Updated Jan 2, 2026 - Production token
        const CURRENT_TOKEN = 'eyJ4NXQjUzI1NiI6IlV6LU1BTlgyS0VncEFpb2I3cEVwQlZWSmtZSzFvV2FRczBacHhMbDI5NWciLCJ4NXQiOiJGNmE4X1lJMENCTEI3LVpkd3RWNjM5bXFqZ0kiLCJraWQiOiJTSUdOSU5HX0tFWSIsImFsZyI6IlJTMjU2In0.eyJjbGllbnRfb2NpZCI6Im9jaWQxLmRvbWFpbmFwcC5vYzEuYXAtbXVtYmFpLTEuYW1hYWFhYWFhcXRwNWJhYWp3c2JicW9wa3cydXFxcG9jcm52YWl1YXdsdGl6bXkyZmNueDVlbG96Ym1hIiwidXNlcl90eiI6IkFzaWEvS29sa2F0YSIsInN1YiI6ImFnZWwuZm9yZWNhc3RpbmdAYWRhbmkuY29tIiwidXNlcl9sb2NhbGUiOiJlbiIsInNpZGxlIjo0ODAsInVzZXIudGVuYW50Lm5hbWUiOiJpZGNzLWQyYWE5Y2U2MDFjZDQ4NGFhZTQzNGY4YTJmMDBhMTQ3IiwiaXNzIjoiaHR0cHM6Ly9pZGVudGl0eS5vcmFjbGVjbG91ZC5jb20vIiwiZG9tYWluX2hvbWUiOiJhcC1tdW1iYWktMSIsImNhX29jaWQiOiJvY2lkMS50ZW5hbmN5Lm9jMS4uYWFhYWFhYWFrejRrZnl3cGVjc3h3dHBqc2tiZ2d5ZGNuNzdidGp2cmpocWVhaGJ5dGZ3dWczeXBnamJxIiwidXNlcl90ZW5hbnRuYW1lIjoiaWRjcy1kMmFhOWNlNjAxY2Q0ODRhYWU0MzRmOGEyZjAwYTE0NyIsImNsaWVudF9pZCI6IlByaW1hdmVyYVdUU1NfQWRhbmlfUHJvZHVjdGlvbl9BUFBJRCIsImRvbWFpbl9pZCI6Im9jaWQxLmRvbWFpbi5vYzEuLmFhYWFhYWFhNGx6NWV1ZDVtZzZ2bzZ4Z2psbmU1am1sczNvbHo2NmZmdDdqdGN3Z2didGwzdHM2eWhzcSIsInN1Yl90eXBlIjoidXNlciIsInNjb3BlIjoidXJuOm9wYzppZG06dC5zZWN1cml0eS5jbGllbnQgdXJuOm9wYzppZG06dC51c2VyLmF1dGhuLmZhY3RvcnMiLCJ1c2VyX29jaWQiOiJvY2lkMS51c2VyLm9jMS4uYWFhYWFhYWF2ZDcydWQ2bmZoeDV1bjMyZ2d2dGEzZGJtaXA1MmxhNng2cmdmYTRtbXJ4Znhucnl0ZWdxIiwiY2xpZW50X3RlbmFudG5hbWUiOiJpZGNzLWQyYWE5Y2U2MDFjZDQ4NGFhZTQzNGY4YTJmMDBhMTQ3IiwicmVnaW9uX25hbWUiOiJhcC1tdW1iYWktaWRjcy0xIiwidXNlcl9sYW5nIjoiZW4iLCJ1c2VyQXBwUm9sZXMiOlsiQXV0aGVudGljYXRlZCJdLCJleHAiOjE3NjczODM1MTYsImlhdCI6MTc2NzM0NzUxNiwiY2xpZW50X2d1aWQiOiI5ZDRkMDQ1NjUxYzA0OTgyOGI3NDFjZWYzNmM3M2UzZiIsImNsaWVudF9uYW1lIjoiUHJpbWF2ZXJhV1RTU19BZGFuaV9Qcm9kdWN0aW9uIiwidGVuYW50IjoiaWRjcy1kMmFhOWNlNjAxY2Q0ODRhYWU0MzRmOGEyZjAwYTE0NyIsImp0aSI6Ijc1ZmUzYzAwODU2OTQ3ZTViNTY5OTBlM2Y3YzBiNGM2IiwiZ3RwIjoicm8iLCJ1c2VyX2Rpc3BsYXluYW1lIjoiQWdlbCBmb3JjYXN0aW5nIiwib3BjIjp0cnVlLCJzdWJfbWFwcGluZ2F0dHIiOiJ1c2VyTmFtZSIsInByaW1UZW5hbnQiOnRydWUsInRva190eXBlIjoiQVQiLCJhdWQiOlsidXJuOm9wYzpsYmFhczpsb2dpY2FsZ3VpZD1pZGNzLWQyYWE5Y2U2MDFjZDQ4NGFhZTQzNGY4YTJmMDBhMTQ3IiwiaHR0cHM6Ly9pZGNzLWQyYWE5Y2U2MDFjZDQ4NGFhZTQzNGY4YTJmMDBhMTQ3LmFwLW11bWJhaS1pZGNzLTEuc2VjdXJlLmlkZW50aXR5Lm9yYWNsZWNsb3VkLmNvbSIsImh0dHBzOi8vaWRjcy1kMmFhOWNlNjAxY2Q0ODRhYWU0MzRmOGEyZjAwYTE0Ny5pZGVudGl0eS5vcmFjbGVjbG91ZC5jb20iXSwiY2FfbmFtZSI6ImFkYW5pIiwic3R1IjoiUFJJTUFWRVJBIiwidXNlcl9pZCI6ImIwNmRmZDFlMGUyMTQ2MDVhNTAwOWMxOWZiOTU4ZDJhIiwiZG9tYWluIjoiRGVmYXVsdCIsImNsaWVudEFwcFJvbGVzIjpbIlVzZXIgVmlld2VyIiwiQXV0aGVudGljYXRlZCBDbGllbnQiLCJDbG91ZCBHYXRlIl0sInRlbmFudF9pc3MiOiJodHRwczovL2lkY3MtZDJhYTljZTYwMWNkNDg0YWFlNDM0ZjhhMmYwMGExNDcuaWRlbnRpdHkub3JhY2xlY2xvdWQuY29tOjQ0MyJ9.t6jAXH0xsqfmznNRKRATf9whSmhR093T6XE8-MEIOimM_bJ4SRzzSfXacd-cY3Rxh5puRGgd4dTVbxY3oLkzXKtzDHxTxoX4p66pOUjGKp7JgzWxNnpSv-cfdOstz5zy8cwy2H46f7cmStCefP9dYmIJC5CigzV9JHW1z-LCV9m2bY0u7_Au_G_KOWhI0u5clbiL0dkHoGGMKB5WQvXCQOMgqMagCwg3XSjzCAw-wmKgXBTyxrLSfBvJw-B0SzLnd8LCpGdDLEEmOIy2sQXIZTDe8SoZwAVAVlQpcavAlGnfsRUd6U0g_J7h9pxeJaVo0mGR8v7b8c4I8JNjWx5E-A';

        console.log('Using hardcoded P6 token (Jan 2, 2026)');
        return CURRENT_TOKEN;
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
                timeout: 60000 // 60 second timeout for updates
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
                    Fields: 'ObjectId,ForeignObjectId,UDFTypeObjectId,UDFTypeTitle,Text,Double,Integer,Cost,StartDate,FinishDate,Indicator,CodeValue,Description',
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
                Fields: 'ObjectId,ActivityObjectId,ResourceObjectId,ResourceName,PlannedUnits,ActualUnits,RemainingUnits,BudgetedUnits,UnitOfMeasure,StartDate,FinishDate,IsPrimaryResource,ProjectObjectId',
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
                Fields: 'ObjectId,ProjectObjectId,Name,Description,SequenceNumber,MaxLength',
                Filter: `ProjectObjectId = ${projectObjectId}`
            };

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
                Fields: 'ObjectId,Id,Name,ResourceType,EmailAddress,ParentObjectId'
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
