import express from 'express';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

try {
    // Get __dirname equivalent in ES modules
    const __filename = fileURLToPath(import.meta.url);
    const __dirname = dirname(__filename);

    // Load environment variables
    const envPath = join(__dirname, 'backend', '.env');
    console.log('\n=== Server Startup ===');
    console.log('1. Loading .env from:', envPath);
    const envResult = dotenv.config({ path: envPath });
    
    if (envResult.error) {
        throw new Error(`Failed to load .env file: ${envResult.error.message}`);
    }
    console.log('2. Environment variables loaded successfully');
    
    // Verify required environment variables
    const requiredEnvVars = ['GOOGLE_API_KEY', 'GOOGLE_SEARCH_ENGINE_ID'];
    const missingVars = requiredEnvVars.filter(varName => !process.env[varName]);
    
    if (missingVars.length > 0) {
        throw new Error(`Missing required environment variables: ${missingVars.join(', ')}`);
    }
    console.log('3. Required environment variables present');

    // Create Express app
    const app = express();
    console.log('4. Express app created');

    // Basic test endpoint
    app.get('/', (req, res) => {
        console.log('Received request to /');
        res.json({ message: 'Server is running!' });
    });

    // Environment test endpoint
    app.get('/env', (req, res) => {
        console.log('Received request to /env');
        res.json({
            google_key: process.env.GOOGLE_API_KEY ? 'present' : 'missing',
            google_cx: process.env.GOOGLE_SEARCH_ENGINE_ID ? 'present' : 'missing'
        });
    });

    // Google search test endpoint
    app.get('/test-search', async (req, res) => {
        try {
            console.log('\n=== Testing Google Search API ===');
            
            // Simple search URL
            const searchUrl = new URL('https://customsearch.googleapis.com/customsearch/v1');
            searchUrl.searchParams.append('key', process.env.GOOGLE_API_KEY);
            searchUrl.searchParams.append('cx', process.env.GOOGLE_SEARCH_ENGINE_ID);
            searchUrl.searchParams.append('q', 'California energy rebate programs');
            searchUrl.searchParams.append('num', '10'); // Get 10 results
            
            console.log('Making request to Google API...');
            const response = await fetch(searchUrl.toString());
            const data = await response.json();
            
            // Return the raw response from Google
            res.json(data);
            
        } catch (error) {
            console.error('Search error:', error);
            res.status(500).json({
                error: error.message,
                stack: error.stack
            });
        }
    });

    // Start server
    const PORT = 3005;
    const server = app.listen(PORT, () => {
        console.log('5. Server started successfully');
        console.log(`\n=== Server Ready ===`);
        console.log(`Server running at http://localhost:${PORT}`);
        console.log(`Try visiting:`);
        console.log(`- http://localhost:${PORT}/`);
        console.log(`- http://localhost:${PORT}/env`);
        console.log(`- http://localhost:${PORT}/test-search\n`);
    });

    // Handle server errors
    server.on('error', (error) => {
        if (error.code === 'EADDRINUSE') {
            console.error(`\n❌ Error: Port ${PORT} is already in use. Another server might be running.`);
            console.error('Please stop other servers or choose a different port.\n');
        } else {
            console.error('\n❌ Server error:', error);
        }
        process.exit(1);
    });

} catch (error) {
    console.error('\n❌ Startup error:', error);
    console.error('\nStack trace:', error.stack);
    process.exit(1);
}
