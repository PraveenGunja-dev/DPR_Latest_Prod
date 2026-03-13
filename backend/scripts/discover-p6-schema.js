const { restClient } = require('../services/oracleP6RestClient');
const dotenv = require('dotenv');
const path = require('path');

// Load environment variables
const envPath = path.resolve(__dirname, '../.env');
dotenv.config({ path: envPath });

async function discoverP6Schema() {
    try {
        console.log('--- Discovering P6 UDF Types ---');
        // P6 REST API endpoint: /udfType
        // Fields: ObjectId, Title, SubjectArea
        const udfTypes = await restClient.get('/udfType', {
            Fields: 'ObjectId,Title,SubjectArea',
            Filter: "SubjectArea = 'Activity'"
        });

        const items = Array.isArray(udfTypes) ? udfTypes : (udfTypes.data || udfTypes.items || []);
        console.log(`Found ${items.length} Activity UDFs:`);
        items.forEach(udf => {
            console.log(` - [${udf.ObjectId}] ${udf.Title}`);
        });

        console.log('\n--- Discovering P6 Activity Code Types ---');
        // P6 REST API endpoint: /activityCodeType
        const codeTypes = await restClient.get('/activityCodeType', {
            Fields: 'ObjectId,Name,ProjectObjectId'
        });
        const cItems = Array.isArray(codeTypes) ? codeTypes : (codeTypes.data || codeTypes.items || []);
        console.log(`Found ${cItems.length} Activity Code Types:`);
        cItems.forEach(ct => {
            console.log(` - [${ct.ObjectId}] ${ct.Name} (Project: ${ct.ProjectObjectId})`);
        });

    } catch (error) {
        console.error('Error during discovery:', error.message);
        if (error.response) console.error(error.response.data);
    }
}

discoverP6Schema();
