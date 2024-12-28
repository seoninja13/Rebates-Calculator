import { GoogleSheetsCache } from '../../../backend/services/sheets-cache.js';

// Test function for query normalization
async function testCountyNormalization() {
    const cache = new GoogleSheetsCache();
    
    // Test cases with county names as they would come from the UI dropdown
    const testCases = [
        {
            query: "Alameda",
            level: "County",
            expected: "Alameda County energy rebate programs california, Alameda County utility incentives california"
        },
        {
            query: "San Francisco",
            level: "County",
            expected: "San Francisco County energy rebate programs california, San Francisco County utility incentives california"
        },
        {
            query: "Los Angeles",
            level: "County",
            expected: "Los Angeles County energy rebate programs california, Los Angeles County utility incentives california"
        },
        {
            query: "Santa Clara",
            level: "County",
            expected: "Santa Clara County energy rebate programs california, Santa Clara County utility incentives california"
        }
    ];

    console.log('🧪 Starting County Query Normalization Tests\n');

    for (const test of testCases) {
        console.log(`Testing county: "${test.query}"`);
        const result = cache.normalizeQueryFormat(test.query, test.level);
        const passed = result === test.expected;
        
        console.log('Result:', result);
        console.log('Expected:', test.expected);
        console.log('Status:', passed ? '✅ PASSED' : '❌ FAILED');
        console.log('-------------------\n');
    }
}

// Test complete cache operation flow
async function testCacheOperation() {
    const cache = new GoogleSheetsCache();
    await cache.initialize();
    
    console.log('🧪 Testing Complete Cache Operation Flow\n');
    
    const testData = {
        level: 'County',
        category: 'all',
        county: 'Alameda',
        data: {
            googleResults: [{ title: 'Test Result' }],
            openaiAnalysis: { programs: [] },
            timestamp: new Date().toISOString(),
            hash: 'test-hash',
            googleSearchCache: true,
            openaiSearchCache: true
        }
    };

    try {
        console.log('Setting cache with county data:', {
            level: testData.level,
            category: testData.category,
            county: testData.county
        });

        await cache.netlifySetCache(
            testData.level,
            testData.category,
            testData.county,
            testData.data
        );

        console.log('✅ Cache set successfully');
        console.log('-------------------\n');

        // Now try to retrieve it
        console.log('Retrieving from cache...');
        const query = cache.normalizeQueryFormat(testData.county, testData.level);
        const result = await cache.netlifyGetCache(query, testData.level, testData.category);

        console.log('Cache retrieval result:', {
            found: result ? true : false,
            query: result?.query,
            level: result?.level,
            category: result?.category,
            timestamp: result?.timestamp
        });
        
        if (result) {
            console.log('✅ Cache retrieval successful');
        } else {
            console.log('❌ Cache retrieval failed');
        }
    } catch (error) {
        console.error('❌ Test failed:', error.message);
    }
}

// Run both tests
async function runAllTests() {
    await testCountyNormalization();
    console.log('\n===================\n');
    await testCacheOperation();
}

runAllTests();
