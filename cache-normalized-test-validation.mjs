import { GoogleSheetsCache } from './netlify/functions/services/cache/GoogleSheetsCache.mjs';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import { google } from 'googleapis';
import { JWT } from 'google-auth-library';

// Get directory name
const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Load environment variables from backend/.env
dotenv.config({ path: path.join(__dirname, 'backend', '.env') });

async function validateCacheData() {
    console.log('Starting cache data validation...');
    console.log('Using spreadsheet ID:', process.env.GOOGLE_SHEETS_SPREADSHEET_ID);
    
    // Initialize cache and auth
    const cache = new GoogleSheetsCache();
    await cache.initialize();
    
    const validation = {
        totalRows: 0,
        uniqueHashes: new Set(),
        programsWithoutTitle: [],
        amountFormats: new Set(),
        amountDetails: [],
        programsByLevel: {
            federal: { total: 0, withTitle: 0, withoutTitle: 0 },
            state: { total: 0, withTitle: 0, withoutTitle: 0 },
            county: { total: 0, withTitle: 0, withoutTitle: 0 }
        }
    };

    try {
        // Parse credentials
        const credentials = JSON.parse(process.env.GOOGLE_SHEETS_CREDENTIALS);
        
        // Create JWT client
        const client = new JWT({
            email: credentials.client_email,
            key: credentials.private_key,
            scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly']
        });

        // Get all rows from the cache sheet using sheets API directly
        const sheets = google.sheets({ version: 'v4', auth: client });
        const response = await sheets.spreadsheets.values.get({
            spreadsheetId: process.env.GOOGLE_SHEETS_SPREADSHEET_ID,
            range: 'Cache-normalized!A:H'
        });

        const rows = response.data.values || [];
        validation.totalRows = rows.length;

        console.log(`Processing ${rows.length} rows...`);

        // Process each row
        for (const row of rows) {
            // Skip header row or empty rows
            if (!row[0] || row[0] === 'hash') continue;

            const hash = row[0];
            const level = (row[1] || '').toLowerCase();
            const analysisJson = row[3]; // Column D contains the analysis JSON

            validation.uniqueHashes.add(hash);

            if (!analysisJson) continue;

            try {
                const analysis = typeof analysisJson === 'string' 
                    ? JSON.parse(analysisJson) 
                    : analysisJson;

                if (analysis && analysis.programs) {
                    // Process each program in the analysis
                    analysis.programs.forEach(program => {
                        if (level in validation.programsByLevel) {
                            validation.programsByLevel[level].total++;
                            
                            if (program.title || program.programName) {
                                validation.programsByLevel[level].withTitle++;
                            } else {
                                validation.programsByLevel[level].withoutTitle++;
                                validation.programsWithoutTitle.push({
                                    level,
                                    hash,
                                    program
                                });
                            }

                            // Track amount formats and details
                            if (program.amount) {
                                validation.amountFormats.add(program.amount);
                                
                                // Store detailed amount information
                                validation.amountDetails.push({
                                    level,
                                    title: program.title || program.programName,
                                    amount: program.amount,
                                    details: program.details || program.description || program.summary || '',
                                    amountDetails: program.amountDetails || '',
                                    costBasis: program.costBasis || '',
                                    requirements: program.requirements || ''
                                });
                            }
                        }
                    });
                }
            } catch (error) {
                console.error(`Error parsing JSON for hash ${hash}:`, error);
            }
        }

        // Print validation results
        console.log('\n=== Cache Data Validation Results ===');
        console.log(`Total Rows: ${validation.totalRows}`);
        console.log(`Unique Hashes: ${validation.uniqueHashes.size}`);
        
        console.log('\n=== Amount Formats Found ===');
        console.log(Array.from(validation.amountFormats).sort());

        console.log('\n=== Sample Amount Details ===');
        // Show 10 examples of amounts with their details
        validation.amountDetails
            .filter(detail => detail.amount.includes('%') || detail.amount.includes('Up to'))
            .slice(0, 10)
            .forEach((detail, index) => {
                console.log(`\n${index + 1}. ${detail.title}`);
                console.log(`   Amount: ${detail.amount}`);
                if (detail.amountDetails) console.log(`   Amount Details: ${detail.amountDetails}`);
                if (detail.costBasis) console.log(`   Cost Basis: ${detail.costBasis}`);
                if (detail.requirements) console.log(`   Requirements: ${detail.requirements}`);
                if (detail.details) console.log(`   Additional Details: ${detail.details}`);
            });

        if (validation.programsWithoutTitle.length > 0) {
            console.log('\n=== Programs Without Title ===');
            validation.programsWithoutTitle.forEach((item, index) => {
                console.log(`\n${index + 1}. Level: ${item.level}`);
                console.log(`   Hash: ${item.hash}`);
                console.log('   Program Data:', JSON.stringify(item.program, null, 2));
            });
        }

    } catch (error) {
        console.error('Error accessing sheet:', error);
        if (error.response) {
            console.error('API Response:', error.response.data);
        }
    }
}

// Run validation
validateCacheData().catch(console.error);
