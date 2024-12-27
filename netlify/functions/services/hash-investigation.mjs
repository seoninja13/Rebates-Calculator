import crypto from 'crypto';

function investigateHashGeneration() {
    // Test variations of input
    const testCases = [
        { 
            description: 'Exact Match',
            level: 'County', 
            county: 'Alameda', 
            category: 'all' 
        },
        { 
            description: 'Lowercase Level',
            level: 'county', 
            county: 'Alameda', 
            category: 'all' 
        },
        { 
            description: 'Trimmed County',
            level: 'County', 
            county: ' Alameda ', 
            category: 'all' 
        },
        { 
            description: 'Different Casing',
            level: 'COUNTY', 
            county: 'ALAMEDA', 
            category: 'all' 
        }
    ];

    // Comprehensive hash generation function mimicking the original
    function generateHash(level, county, category = 'all') {
        // Normalize level
        const normalizedLevel = level.trim().charAt(0).toUpperCase() + level.trim().slice(1).toLowerCase();
        
        // Normalize county (if exists)
        const normalizedCounty = county ? county.trim().charAt(0).toUpperCase() + county.trim().slice(1).toLowerCase() : '';
        
        // Prepare hash input variations
        const hashInputVariations = {
            variation1: `${normalizedLevel}:${normalizedCounty}:${category}`,
            variation2: `${normalizedLevel}:${county ? county.trim() : ''}:${category}`,
            variation3: `${normalizedLevel}:${county || ''}:${category}`
        };

        // Generate hashes for each variation
        const hashResults = {
            variation1: crypto.createHash('md5').update(hashInputVariations.variation1).digest('hex'),
            variation2: crypto.createHash('md5').update(hashInputVariations.variation2).digest('hex'),
            variation3: crypto.createHash('md5').update(hashInputVariations.variation3).digest('hex')
        };

        return {
            input: hashInputVariations,
            hashes: hashResults
        };
    }

    // Run comprehensive investigation
    console.log('🔍 Comprehensive Hash Generation Investigation\n');
    
    testCases.forEach(testCase => {
        console.log(`Test Case: ${testCase.description}`);
        console.log('Input:', {
            level: testCase.level,
            county: testCase.county,
            category: testCase.category
        });

        const hashinvestigation = generateHash(
            testCase.level, 
            testCase.county, 
            testCase.category
        );

        console.log('Hash Input Variations:', hashinvestigation.input);
        console.log('Generated Hashes:', hashinvestigation.hashes);
        console.log('\n---\n');
    });

    // Byte-level analysis of a specific input
    function byteAnalysis(input) {
        return Array.from(input).map(char => ({
            char: char,
            charCode: char.charCodeAt(0),
            hex: char.charCodeAt(0).toString(16)
        }));
    }

    console.log('🔬 Byte-Level Analysis for "County:Alameda:all"');
    console.log(byteAnalysis('County:Alameda:all'));
}

investigateHashGeneration();
