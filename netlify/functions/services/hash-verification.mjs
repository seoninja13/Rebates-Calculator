import { GoogleSheetsCache } from './sheets-cache.mjs';

function verifyHashGeneration() {
    const cache = new GoogleSheetsCache();

    // Test cases to verify consistent hash generation
    const testCases = [
        // County variations
        { level: 'County', county: 'Alameda', expectedHash: 'da9857730a363cdee68bae857012f34e' },
        { level: 'county', county: 'Alameda', expectedHash: 'da9857730a363cdee68bae857012f34e' },
        { level: 'COUNTY', county: 'ALAMEDA', expectedHash: 'da9857730a363cdee68bae857012f34e' },
        { level: 'County', county: ' Alameda ', expectedHash: 'da9857730a363cdee68bae857012f34e' },
        { level: 'County', county: 'Alameda County', expectedHash: 'da9857730a363cdee68bae857012f34e' },

        // State variations
        { level: 'State', county: null, expectedHash: '6afa817149bc61f1b4e324530c2e9751' },
        { level: 'state', county: null, expectedHash: '6afa817149bc61f1b4e324530c2e9751' },
        { level: 'STATE', county: null, expectedHash: '6afa817149bc61f1b4e324530c2e9751' },

        // Federal variations
        { level: 'Federal', county: null, expectedHash: '97dd6bb017f636fd49043c72e5a4240d' },
        { level: 'federal', county: null, expectedHash: '97dd6bb017f636fd49043c72e5a4240d' },
        { level: 'FEDERAL', county: null, expectedHash: '97dd6bb017f636fd49043c72e5a4240d' }
    ];

    console.log('🔍 Hash Generation Verification\n');

    testCases.forEach((testCase, index) => {
        try {
            const generatedHash = cache.netlifyGenerateHash(
                testCase.level, 
                testCase.county
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
                throw new Error(`Hash mismatch for ${testCase.level}`);
            }
        } catch (error) {
            console.error('Verification Error:', error.message);
        }
    });
}

verifyHashGeneration();
