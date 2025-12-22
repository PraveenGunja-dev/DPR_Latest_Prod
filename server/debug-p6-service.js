require('dotenv').config({ path: require('path').join(__dirname, '.env') });
const p6DataService = require('./services/p6DataService');

async function run() {
    try {
        console.log('Testing syncProject(1983)...');
        await p6DataService.syncProject(1983);
        console.log('Sync successful.');

        console.log('Testing getActivities(1983)...');
        const acts = await p6DataService.getActivities(1983);
        console.log(`Fetched ${acts.length} activities.`);

    } catch (e) {
        console.error('Test failed:', e);
    }
    process.exit();
}

run();
