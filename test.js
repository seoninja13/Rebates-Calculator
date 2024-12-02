import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { existsSync } from 'fs';

// Get __dirname equivalent in ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Try to load .env from different locations
const possibleEnvPaths = [
    join(__dirname, '.env'),
    join(__dirname, 'backend', '.env')
];

console.log('=== Environment Test ===');
console.log('Current directory:', __dirname);
console.log('\nChecking .env file locations:');

for (const envPath of possibleEnvPaths) {
    console.log(`\nTrying ${envPath}:`);
    console.log('File exists:', existsSync(envPath));
    
    const result = dotenv.config({ path: envPath });
    if (result.error) {
        console.log('Failed to load:', result.error.message);
    } else {
        console.log('Successfully loaded');
    }
}

console.log('\nEnvironment Variables:');
console.log('GOOGLE_API_KEY:', process.env.GOOGLE_API_KEY ? '✓ present' : '❌ missing');
console.log('GOOGLE_SEARCH_ENGINE_ID:', process.env.GOOGLE_SEARCH_ENGINE_ID ? '✓ present' : '❌ missing');
