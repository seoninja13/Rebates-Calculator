import crypto from 'crypto';

function preciseHashInvestigation() {
    // Exhaustive test cases to understand hash generation
    const testCases = [
        // Exact variations of input
        'County:Alameda:all',
        'County: Alameda :all',
        'County:Alameda :all',
        'County: Alameda:all',
        'county:Alameda:all',
        'COUNTY:ALAMEDA:all',
        'County:alameda:all',
        ' County:Alameda:all',
        'County:Alameda:all ',
        ' County:Alameda:all '
    ];

    function generateDetailedHash(input) {
        // Detailed hash generation with comprehensive logging
        console.log('\n🔍 Investigating Input:', JSON.stringify(input));
        
        // Byte-level analysis
        const byteAnalysis = Array.from(input).map(char => ({
            char: char,
            charCode: char.charCodeAt(0),
            hex: char.charCodeAt(0).toString(16).padStart(2, '0')
        }));
        
        console.log('Byte-Level Input Analysis:');
        byteAnalysis.forEach((byte, index) => {
            console.log(`  Byte ${index}: ${byte.char} (Code: ${byte.charCode}, Hex: ${byte.hex})`);
        });

        // Generate MD5 hash
        const hash = crypto.createHash('md5').update(input).digest('hex');
        
        console.log('Generated Hash:', hash);
        console.log('Input Length:', input.length);
        
        return {
            input,
            hash,
            byteAnalysis
        };
    }

    // Run investigation on all test cases
    console.log('🚀 Precise Hash Generation Investigation\n');
    
    testCases.forEach(testCase => {
        generateDetailedHash(testCase);
    });

    // Additional investigation of normalization techniques
    console.log('\n🔬 Normalization Investigation');
    
    function normalizeInput(input) {
        // Simulate potential normalization techniques
        const techniques = {
            trim: input.trim(),
            lowercaseFirst: input.charAt(0).toLowerCase() + input.slice(1),
            uppercaseFirst: input.charAt(0).toUpperCase() + input.slice(1),
            fullyLowercase: input.toLowerCase(),
            fullyUppercase: input.toUpperCase()
        };

        console.log('Input:', input);
        Object.entries(techniques).forEach(([name, normalized]) => {
            console.log(`  ${name}: ${JSON.stringify(normalized)} → ${crypto.createHash('md5').update(normalized).digest('hex')}`);
        });
    }

    normalizeInput('County:Alameda:all');
}

preciseHashInvestigation();
