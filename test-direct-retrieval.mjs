import { handler } from './netlify/functions/direct-retrieval.mjs';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

// Get directory name
const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Load environment variables from .env file
dotenv.config({ path: path.join(__dirname, '.env') });

// Mock environment variables if not set
if (!process.env.GOOGLE_SHEETS_SPREADSHEET_ID) {
    console.log('⚠️ Using mock spreadsheet ID for testing');
    process.env.GOOGLE_SHEETS_SPREADSHEET_ID = '1234567890';
}

// Parse Google Sheets credentials if they exist
if (process.env.GOOGLE_SHEETS_CREDENTIALS) {
    try {
        if (typeof process.env.GOOGLE_SHEETS_CREDENTIALS === 'string') {
            process.env.GOOGLE_SHEETS_CREDENTIALS = JSON.parse(process.env.GOOGLE_SHEETS_CREDENTIALS);
        }
    } catch (error) {
        console.error('Failed to parse Google Sheets credentials:', error);
        process.exit(1);
    }
} else {
    console.log('⚠️ Using mock credentials for testing');
    process.env.GOOGLE_SHEETS_CREDENTIALS = {
        type: 'service_account',
        project_id: 'mock-project',
        private_key_id: 'mock-key-id',
        private_key: 'mock-private-key',
        client_email: 'mock@example.com',
        client_id: 'mock-client-id'
    };
}

// Test cases
const tests = [
    {
        name: "Federal Level Test",
        event: {
            httpMethod: 'POST',
            body: JSON.stringify({
                category: 'Federal'
            })
        }
    },
    {
        name: "State Level Test",
        event: {
            httpMethod: 'POST',
            body: JSON.stringify({
                category: 'State'
            })
        }
    },
    {
        name: "County Level Test - Alameda",
        event: {
            httpMethod: 'POST',
            body: JSON.stringify({
                category: 'County',
                county: 'Alameda'
            })
        }
    },
    {
        name: "Invalid Category Test",
        event: {
            httpMethod: 'POST',
            body: JSON.stringify({
                category: 'Invalid'
            })
        }
    },
    {
        name: "Missing County Test",
        event: {
            httpMethod: 'POST',
            body: JSON.stringify({
                category: 'County'
                // Missing county parameter
            })
        }
    }
];

// Run tests
async function runTests() {
    console.log('🧪 Starting Direct Retrieval Tests\n');
    
    for (const test of tests) {
        console.log(`\n📋 Test: ${test.name}`);
        console.log('Input:', JSON.parse(test.event.body));
        
        try {
            const result = await handler(test.event);
            console.log('Status:', result.statusCode);
            console.log('Response:', JSON.parse(result.body));
            
            // Validate response format
            const response = JSON.parse(result.body);
            if (!response.hasOwnProperty('success')) {
                console.error('❌ Missing success property');
            }
            if (response.success && !response.hasOwnProperty('data')) {
                console.error('❌ Missing data property on success');
            }
            if (!response.success && !response.hasOwnProperty('error')) {
                console.error('❌ Missing error property on failure');
            }
        } catch (error) {
            console.error('❌ Test Failed:', error);
        }
        
        console.log('-----------------------------------');
    }
}

// Run all tests
runTests().catch(console.error);
