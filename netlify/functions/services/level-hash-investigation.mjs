import crypto from 'crypto';

function generateLevelHashes() {
    const levels = [
        { name: 'County', county: 'Alameda' },
        { name: 'State', county: null },
        { name: 'Federal', county: null }
    ];

    const categories = ['all'];

    console.log('🔍 Level Hash Generation Investigation\n');

    levels.forEach(level => {
        categories.forEach(category => {
            // Generate hash input variations
            const hashInputs = [
                `${level.name}:${level.county || ''}:${category}`,
                `${level.name.toLowerCase()}:${level.county || ''}:${category}`,
                `${level.name.toUpperCase()}:${level.county || ''}:${category}`
            ];

            console.log(`Level: ${level.name}, County: ${level.county || 'N/A'}, Category: ${category}`);
            
            hashInputs.forEach(input => {
                const hash = crypto.createHash('md5').update(input).digest('hex');
                console.log(`  Input: "${input}"`);
                console.log(`  Hash:  ${hash}`);
                console.log(`  Length: ${input.length}\n`);
            });

            console.log('---\n');
        });
    });
}

generateLevelHashes();
