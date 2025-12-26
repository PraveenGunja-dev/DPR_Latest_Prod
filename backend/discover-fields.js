// Check all available fields on Activity endpoint
const { restClient } = require('./services/oracleP6RestClient');

async function discoverActivityFields() {
    console.log('\n' + '='.repeat(80));
    console.log('DISCOVERING AVAILABLE ACTIVITY FIELDS IN PRODUCTION P6');
    console.log('='.repeat(80) + '\n');

    try {
        // Fetch one activity with ALL fields (no Fields parameter)
        console.log('Fetching sample activity with all fields...\n');
        const activities = await restClient.get('/activity', {
            Filter: 'ProjectObjectId=348956'
        });

        if (activities && activities.length > 0) {
            const sampleActivity = activities[0];
            console.log('Available fields on Activity object:\n');

            const fields = Object.keys(sampleActivity).sort();
            fields.forEach((field, index) => {
                const value = sampleActivity[field];
                const type = typeof value;
                const preview = value ? String(value).substring(0, 50) : 'null';
                console.log(`${(index + 1).toString().padStart(3)}. ${field.padEnd(40)} [${type}] ${preview}`);
            });

            console.log(`\n✅ Total fields available: ${fields.length}`);

            // Check for fields that might contain our data
            console.log('\n' + '='.repeat(80));
            console.log('POTENTIAL FIELDS FOR REQUIRED DATA:');
            console.log('='.repeat(80));

            const searchTerms = ['priority', 'plot', 'block', 'uom', 'unit', 'quantity', 'capacity', 'spv', 'scope', 'contractor', 'resource'];
            const matches = [];

            fields.forEach(field => {
                const fieldLower = field.toLowerCase();
                searchTerms.forEach(term => {
                    if (fieldLower.includes(term)) {
                        matches.push({ field, term, value: sampleActivity[field] });
                    }
                });
            });

            if (matches.length > 0) {
                matches.forEach(m => {
                    console.log(`\n📌 ${m.field} (matches: ${m.term})`);
                    console.log(`   Value: ${m.value}`);
                });
            } else {
                console.log('\n⚠️  No fields found matching common search terms');
                console.log('   The data might be in custom fields with different names');
            }

        } else {
            console.log('❌ No activities found for project 348956');
        }

    } catch (error) {
        console.error('❌ Error:', error.message);
    }

    console.log('\n' + '='.repeat(80) + '\n');
    process.exit(0);
}

discoverActivityFields();
