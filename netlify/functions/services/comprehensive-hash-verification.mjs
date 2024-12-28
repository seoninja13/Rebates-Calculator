import { GoogleSheetsCache } from '../../../backend/services/sheets-cache.js';

function comprehensiveHashVerification() {
    const cache = new GoogleSheetsCache();

    // Comprehensive test cases covering various county name formats
    const testCases = [
        // Original Alameda variations
        { level: 'County', county: 'Alameda', expectedHash: 'da9857730a363cdee68bae857012f34e' },
        { level: 'County', county: 'Alameda County', expectedHash: 'da9857730a363cdee68bae857012f34e' },
        { level: 'County', county: 'alameda county', expectedHash: 'da9857730a363cdee68bae857012f34e' },
        { level: 'County', county: ' Alameda County ', expectedHash: 'da9857730a363cdee68bae857012f34e' },
        
        // Additional complex variations
        { level: 'County', county: 'County Alameda', expectedHash: 'da9857730a363cdee68bae857012f34e' },
        { level: 'County', county: 'COUNTY ALAMEDA', expectedHash: 'da9857730a363cdee68bae857012f34e' },
        
        // State and Federal levels
        { level: 'State', county: null, expectedHash: '6afa817149bc61f1b4e324530c2e9751' },
        { level: 'Federal', county: null, expectedHash: '97dd6bb017f636fd49043c72e5a4240d' }
    ];

    console.log('🔍 Comprehensive Hash Generation Verification\n');

    testCases.forEach((testCase, index) => {
        try {
            const generatedHash = cache.generateHash(
                testCase.level, 
                testCase.county,
                'all'
            );

            const status = generatedHash === testCase.expectedHash ? '✅ PASS' : '❌ FAIL';
            
            console.log(`Test Case ${index + 1}:`, {
                input: {
                    level: testCase.level,
                    county: testCase.county || 'N/A'
                },
                generatedHash,
                expectedHash: testCase.expectedHash,
                status
            });

            if (generatedHash !== testCase.expectedHash) {
                throw new Error(`Hash mismatch for ${testCase.level}: ${testCase.county}`);
            }
        } catch (error) {
            console.error('Verification Error:', error.message);
        }
    });

    // Additional county normalization diagnostics
    console.log('\n🔬 County Normalization Diagnostic');
    const countyTestCases = [
        'Alameda',
        'Alameda County',
        'county Alameda',
        'COUNTY ALAMEDA',
        ' Alameda County ',
        'County Alameda'
    ];

    countyTestCases.forEach(county => {
        const cache = new GoogleSheetsCache();
        const normalizedQuery = cache.normalizeQuery(county);
        console.log(`Input: "${county}" → Normalized: "${normalizedCounty}"`);
    });
}

comprehensiveHashVerification();
