// Trigger P6 sync for project 348956
const p6DataService = require('./services/p6DataService');

async function triggerSync() {
    const projectId = 348956;

    console.log(`\n${'='.repeat(60)}`);
    console.log(`Triggering P6 Sync for Project ${projectId}`);
    console.log(`${'='.repeat(60)}\n`);

    try {
        await p6DataService.syncProject(projectId);
        console.log(`\n${'='.repeat(60)}`);
        console.log('✅ Sync completed successfully!');
        console.log(`${'='.repeat(60)}\n`);
        process.exit(0);
    } catch (error) {
        console.error(`\n${'='.repeat(60)}`);
        console.error('❌ Sync failed:', error.message);
        console.error(`${'='.repeat(60)}\n`);
        console.error('Full error:', error);
        process.exit(1);
    }
}

triggerSync();
