// Test comprehensive field list to see what's available
const { restClient } = require('./services/oracleP6RestClient');

async function testComprehensiveFields() {
    console.log('\n' + '='.repeat(80));
    console.log('TESTING COMPREHENSIVE ACTIVITY FIELD LIST');
    console.log('='.repeat(80) + '\n');

    // Common P6 activity fields that might exist
    const fieldsToTest = [
        // Core fields
        'ObjectId', 'Id', 'Name', 'Type', 'Status',
        // Dates
        'StartDate', 'FinishDate', 'PlannedStartDate', 'PlannedFinishDate',
        'ActualStartDate', 'ActualFinishDate',
        // Progress
        'PercentComplete', 'PhysicalPercentComplete',
        // Duration
        'PlannedDuration', 'ActualDuration', 'RemainingDuration',
        // Codes
        'PrimaryCodeObjectId', 'PrimaryCodeValue',
        'SecondaryCodeObjectId', 'SecondaryCodeValue',
        // WBS
        'WBSObjectId', 'WBSName', 'WBSCode',
        // Project
        'ProjectId', 'ProjectObjectId', 'ProjectName',
        // Resources
        'PrimaryResourceObjectId', 'PrimaryResourceName', 'PrimaryResourceId',
        'ResourceObjectId', 'ResourceName', 'ResourceId',
        // Quantity
        'PlannedUnits', 'ActualUnits', 'RemainingUnits',
        'PlannedLaborUnits', 'ActualLaborUnits', 'RemainingLaborUnits',
        'PlannedNonLaborUnits', 'ActualNonLaborUnits', 'RemainingNonLaborUnits',
        'BudgetedTotalCost', 'BudgetedLaborCost', 'BudgetedNonLaborCost',
        // UOM possibilities
        'UnitOfMeasure', 'UnitsPercentComplete',
        // Custom/UDF possibilities
        'UDF1', 'UDF2', 'UDF3', 'UDF4', 'UDF5',
        'UserDefinedField1', 'UserDefinedField2', 'UserDefinedField3',
        // Priority possibilities
        'Priority', 'PriorityType',
        // Other
        'Calendar', 'CalendarObjectId', 'LocationObjectId', 'LocationName',
        'NotebookTopics', 'Comments'
    ];

    console.log(`Testing ${fieldsToTest.length} potential fields...\n`);

    try {
        const activities = await restClient.get('/activity', {
            Filter: 'ProjectObjectId=348956',
            Fields: fieldsToTest.join(',')
        });

        if (activities && activities.length > 0) {
            const activity = activities[0];
            console.log('✅ Successfully retrieved activity\n');
            console.log('Fields that exist and have values:\n');

            const populatedFields = [];
            const emptyFields = [];

            fieldsToTest.forEach(field => {
                if (activity.hasOwnProperty(field)) {
                    const value = activity[field];
                    if (value !== null && value !== undefined && value !== '') {
                        populatedFields.push({ field, value });
                    } else {
                        emptyFields.push(field);
                    }
                }
            });

            populatedFields.forEach(({ field, value }) => {
                const preview = String(value).substring(0, 60);
                console.log(`✓ ${field.padEnd(30)} = ${preview}`);
            });

            console.log(`\n\nFields that exist but are empty: ${emptyFields.length}`);
            console.log(`Fields with data: ${populatedFields.length}`);

        } else {
            console.log('❌ No activities found');
        }

    } catch (error) {
        console.log(`\n❌ Error: ${error.message}`);
        if (error.response?.data) {
            console.log('\nResponse:', error.response.data);
        }
    }

    console.log('\n' + '='.repeat(80) + '\n');
    process.exit(0);
}

testComprehensiveFields();
