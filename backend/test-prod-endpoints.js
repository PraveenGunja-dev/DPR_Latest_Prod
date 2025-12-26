// Test production API endpoints availability
const { restClient } = require('./services/oracleP6RestClient');

async function testProductionEndpoints() {
    console.log('\n' + '='.repeat(80));
    console.log('TESTING PRODUCTION P6 API ENDPOINTS');
    console.log('='.repeat(80) + '\n');

    const projectId = 348956; // Test project ID

    const endpoints = [
        { name: 'Projects', endpoint: '/project', params: { Fields: 'ObjectId,Name', Filter: `ObjectId=${projectId}` } },
        { name: 'WBS', endpoint: '/wbs', params: { Fields: 'ObjectId,Name', Filter: `ProjectObjectId=${projectId}` } },
        { name: 'Activities', endpoint: '/activity', params: { Fields: 'ObjectId,Name', Filter: `ProjectObjectId=${projectId}` } },
        { name: 'UDF Values', endpoint: '/udfvalue', params: { Fields: 'ObjectId,UDFTypeTitle', Filter: `ForeignObjectId=${projectId}` } },
        { name: 'Activity Code Types', endpoint: '/activitycodetype', params: { Fields: 'ObjectId,Name', Filter: `ProjectObjectId=${projectId}` } },
        { name: 'Activity Codes', endpoint: '/activitycode', params: { Fields: 'ObjectId,CodeValue', Filter: `ProjectObjectId=${projectId}` } },
        { name: 'Activity Code Assignments', endpoint: '/activitycodeassignment', params: { Fields: 'ObjectId', Filter: `ProjectObjectId=${projectId}` } },
        { name: 'Resources', endpoint: '/resource', params: { Fields: 'ObjectId,Name' } },
        { name: 'Resource Assignments', endpoint: '/resourceassignment', params: { Fields: 'ObjectId', Filter: `ProjectObjectId=${projectId}` } }
    ];

    const results = [];

    for (const test of endpoints) {
        try {
            console.log(`Testing ${test.name}...`);
            const data = await restClient.get(test.endpoint, test.params);
            const count = Array.isArray(data) ? data.length : (data.data?.length || 0);
            results.push({ endpoint: test.name, status: '✅ Available', count });
            console.log(`  ✅ ${test.name}: ${count} records found`);
        } catch (error) {
            const status = error.response?.status || 'ERROR';
            results.push({ endpoint: test.name, status: `❌ ${status}`, error: error.message });
            console.log(`  ❌ ${test.name}: ${status} - ${error.message}`);
        }
    }

    console.log('\n' + '='.repeat(80));
    console.log('ENDPOINT AVAILABILITY SUMMARY');
    console.log('='.repeat(80));

    results.forEach(r => {
        console.log(`${r.endpoint.padEnd(30)} ${r.status}`);
    });

    console.log('\n' + '='.repeat(80) + '\n');
    process.exit(0);
}

testProductionEndpoints().catch(error => {
    console.error('Test failed:', error);
    process.exit(1);
});
