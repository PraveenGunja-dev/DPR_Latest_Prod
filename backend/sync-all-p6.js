// Complete P6 sync script - syncs all projects with full data including ActivityCodes and Resources
const p6DataService = require('./services/p6DataService');
const { restClient } = require('./services/oracleP6RestClient');
const pool = require('./db');

async function syncAllFromP6() {
    console.log('\n' + '='.repeat(80));
    console.log('STARTING COMPLETE P6 SYNC');
    console.log('This will sync all projects with activities, codes, and resources');
    console.log('='.repeat(80) + '\n');

    let client;
    const startTime = Date.now();

    try {
        // Get database client
        client = await pool.connect();

        // Step 1: Fetch all projects from P6
        console.log('\n📋 Step 1: Fetching all projects from P6 REST API...');
        const projects = await restClient.readProjects([
            'ObjectId', 'Id', 'Name', 'Status', 'StartDate', 'FinishDate'
        ]);

        console.log(`✅ Found ${projects.length} projects in P6\n`);

        if (projects.length === 0) {
            console.log('⚠️  No projects found in P6');
            return;
        }

        // Step 2: Sync each project with full data
        let successCount = 0;
        let failCount = 0;
        const failedProjects = [];

        for (let i = 0; i < projects.length; i++) {
            const project = projects[i];
            console.log(`\n${'─'.repeat(80)}`);
            console.log(`🔄 [${i + 1}/${projects.length}] Syncing: ${project.Name} (ID: ${project.ObjectId})`);
            console.log(`${'─'.repeat(80)}`);

            try {
                await p6DataService.syncProject(parseInt(project.ObjectId));
                successCount++;
                console.log(`✅ Successfully synced: ${project.Name}`);
            } catch (error) {
                failCount++;
                failedProjects.push({
                    id: project.ObjectId,
                    name: project.Name,
                    error: error.message
                });
                console.error(`❌ Failed to sync ${project.Name}:`, error.message);
            }
        }

        // Summary
        const duration = ((Date.now() - startTime) / 1000).toFixed(2);

        console.log('\n' + '='.repeat(80));
        console.log('SYNC SUMMARY');
        console.log('='.repeat(80));
        console.log(`Total Projects: ${projects.length}`);
        console.log(`✅ Success: ${successCount}`);
        console.log(`❌ Failed: ${failCount}`);
        console.log(`⏱️  Duration: ${duration}s`);

        if (failedProjects.length > 0) {
            console.log('\n❌ Failed Projects:');
            failedProjects.forEach(p => {
                console.log(`   - ${p.name} (${p.id}): ${p.error}`);
            });
        }

        // Display what was synced
        console.log('\n📊 Data Synced for Each Project:');
        console.log('   ✓ Project metadata');
        console.log('   ✓ WBS structure');
        console.log('   ✓ Activities');
        console.log('   ✓ UDF values');
        console.log('   ✓ Activity Code Types (NEW)');
        console.log('   ✓ Activity Codes (NEW)');
        console.log('   ✓ Activity Code Assignments (NEW)');
        console.log('   ✓ Resources (NEW)');
        console.log('   ✓ Resource Assignments');

        console.log('\n' + '='.repeat(80));
        console.log('✅ COMPLETE P6 SYNC FINISHED');
        console.log('='.repeat(80) + '\n');

    } catch (error) {
        console.error('\n❌ FATAL ERROR during P6 sync:', error);
        throw error;
    } finally {
        if (client) client.release();
        await pool.end();
        process.exit(0);
    }
}

// Run the sync
syncAllFromP6().catch(error => {
    console.error('\n💥 Sync script crashed:', error);
    process.exit(1);
});
