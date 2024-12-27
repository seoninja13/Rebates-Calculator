/**
 * Cache Service for Energy Rebate Programs
 * 
 * IMPORTANT PATTERNS - DO NOT MODIFY WITHOUT CHECKING AGAINST THESE:
 * 
 * 1. Hash Generation Patterns:
 *    - Federal level: "Federal::all"
 *    - State level: "State::all"
 *    - County level: "County:${countyName}:all"
 * 
 * 2. Query Format Patterns:
 *    - Federal: "Federal energy rebate programs california"
 *    - State: "California State energy rebate programs"
 *    - County: "${countyName} County local energy rebate programs"
 * 
 * 3. Timestamp Format:
 *    - Format: "MM/DD/YYYY, HH:MM:SS AM/PM"
 *    - Example: "12/26/2024, 09:05:58 AM"
 *    - Must be in PST timezone
 *    - Must include leading zeros for month/day
 * 
 * 4. Working Example Row Structure:
 *    {
 *      query: "California State energy rebate programs",
 *      level: "State",
 *      results: [...],  // Array of search results
 *      timestamp: "12/26/2024, 09:05:58 AM",
 *      hash: "md5_hash_of_State::all"
 *    }
 */

import { google } from 'googleapis';
import crypto from 'crypto';

export class GoogleSheetsCache {
    constructor() {
        console.log('Cache → Constructor | Initializing with:', {
            spreadsheetId: process.env.GOOGLE_SHEETS_SPREADSHEET_ID ? '✓' : '✗',
            credentials: process.env.GOOGLE_SHEETS_CREDENTIALS ? '✓' : '✗'
        });
        this.spreadsheetId = process.env.GOOGLE_SHEETS_SPREADSHEET_ID;
        this.enabled = !!this.spreadsheetId;
        this.initialized = false;
        console.log('Cache → Constructor | Status:', {
            enabled: this.enabled,
            env: {
                GOOGLE_SHEETS_SPREADSHEET_ID: process.env.GOOGLE_SHEETS_SPREADSHEET_ID ? '✓' : '✗',
                GOOGLE_SHEETS_CREDENTIALS: process.env.GOOGLE_SHEETS_CREDENTIALS ? '✓' : '✗'
            }
        });
    }

    async initialize() {
        if (!this.enabled) {
            console.log('Cache → Initialize | Cache disabled');
            return false;
        }

        if (this.initialized) {
            console.log('Cache → Initialize | Already initialized');
            return true;
        }

        try {
            if (!process.env.GOOGLE_SHEETS_CREDENTIALS) {
                console.group('🚨 CACHE INITIALIZATION ERROR');
                console.error('Missing Credentials:', {
                    error: 'GOOGLE_SHEETS_CREDENTIALS is missing',
                    timestamp: new Date().toISOString()
                });
                console.groupEnd();
                throw new Error('GOOGLE_SHEETS_CREDENTIALS is missing');
            }

            console.log('Cache → Initialize | Setting up Google auth');
            const auth = new google.auth.GoogleAuth({
                credentials: JSON.parse(process.env.GOOGLE_SHEETS_CREDENTIALS),
                scopes: ['https://www.googleapis.com/auth/spreadsheets']
            });

            console.log('Cache → Initialize | Getting auth client');
            const authClient = await auth.getClient();
            
            console.log('Cache → Initialize | Creating sheets client');
            this.sheets = google.sheets({ version: 'v4', auth: authClient });
            
            // Test the connection and ensure sheet structure
            console.log('Cache → Initialize | Testing connection');
            const test = await this.sheets.spreadsheets.get({
                spreadsheetId: this.spreadsheetId
            });

            // Ensure the Cache sheet exists with correct headers
            await this.ensureSheetStructure();
            
            this.initialized = true;
            console.log('Cache → Initialize | Connection successful:', {
                spreadsheetTitle: test.data.properties.title,
                spreadsheetId: this.spreadsheetId
            });
            return true;
        } catch (error) {
            console.group('🚨 CACHE INITIALIZATION ERROR');
            console.error('Failed to initialize cache:', {
                error: error.message,
                stack: error.stack,
                credentials: process.env.GOOGLE_SHEETS_CREDENTIALS ? 'Present' : 'Missing',
                spreadsheetId: this.spreadsheetId ? 'Present' : 'Missing',
                timestamp: new Date().toISOString()
            });
            console.groupEnd();
            throw new Error(`Cache initialization failed: ${error.message}`);
        }
    }

    async ensureSheetStructure() {
        try {
            // Check if Cache sheet exists
            const sheets = await this.sheets.spreadsheets.get({
                spreadsheetId: this.spreadsheetId
            });

            const cacheSheet = sheets.data.sheets.find(s => 
                s.properties.title === 'Cache'
            );

            if (!cacheSheet) {
                // Create Cache sheet if it doesn't exist
                await this.sheets.spreadsheets.batchUpdate({
                    spreadsheetId: this.spreadsheetId,
                    resource: {
                        requests: [{
                            addSheet: {
                                properties: {
                                    title: 'Cache'
                                }
                            }
                        }]
                    }
                });
            }

            // Set headers
            const headers = [
                'Query',
                'Level',
                'Google Results',
                'OpenAI Analysis',
                'Timestamp',
                'Hash',
                'Google Search-Cache',
                'OpenAI Search-Cache'
            ];

            await this.sheets.spreadsheets.values.update({
                spreadsheetId: this.spreadsheetId,
                range: 'Cache!A1:H1',
                valueInputOption: 'RAW',
                resource: {
                    values: [headers]
                }
            });

        } catch (error) {
            console.error('Failed to ensure sheet structure:', error);
            throw error;
        }
    }

    // Get query format based on working examples
    normalizeQueryFormat(county, level) {
        switch (level.trim()) {
            case 'Federal':
                return 'federal energy rebate programs california, US government energy incentives california';
            case 'State':
                return 'California state energy rebate programs, California state government energy incentives';
            case 'County':
                if (!county) return null;
                const cleanCounty = county.replace(/^County:/, '').replace(/ County$/i, '').trim();
                return `${cleanCounty} County energy rebate programs california, ${cleanCounty} County utility incentives california`;
            default:
                return null;
        }
    }

    // Generate a unique hash for the query and category
    netlifyGenerateHash(level, county, category) {
        if (!level) return null;
        
        // Normalize inputs
        level = level.trim();
        if (county) {
            county = county.replace(/^County:/, '').replace(/ County$/i, '').trim();
        }
        
        // Generate cache key based on exact patterns
        let cacheKey;
        switch (level) {
            case 'Federal':
                cacheKey = 'Federal::all';
                break;
            case 'State':
                cacheKey = 'State::all';
                break;
            case 'County':
                if (!county) return null;
                cacheKey = `County:${county}:all`;
                break;
            default:
                return null;
        }
            
        console.log('Cache → Hash | Generated:', {
            level,
            county,
            cacheKey
        });
        
        return crypto.createHash('md5').update(cacheKey).digest('hex');
    }

    // Get timestamp in PST with exact format
    netlifyGetPSTTimestamp() {
        const now = new Date();
        const pstDate = new Date(now.toLocaleString("en-US", { timeZone: "America/Los_Angeles" }));
        
        // Format: "MM/DD/YYYY, HH:MM:SS AM/PM"
        const month = String(pstDate.getMonth() + 1).padStart(2, '0');
        const day = String(pstDate.getDate()).padStart(2, '0');
        const year = pstDate.getFullYear();
        const hours = String(pstDate.getHours() % 12 || 12).padStart(2, '0');
        const minutes = String(pstDate.getMinutes()).padStart(2, '0');
        const seconds = String(pstDate.getSeconds()).padStart(2, '0');
        const ampm = pstDate.getHours() >= 12 ? 'PM' : 'AM';
        
        return `${month}/${day}/${year}, ${hours}:${minutes}:${seconds} ${ampm}`;
    }

    // Get cache entry by level, county and category
    async netlifyGetCache(level, county, requestedCategory) {
        if (!this.enabled) return { found: false };
        if (!this.initialized) await this.initialize();

        try {
            // Generate hash using exact patterns
            const hash = this.netlifyGenerateHash(level, county, 'all');
            if (!hash) {
                console.log('Cache → Get | Invalid parameters:', { level, county });
                return { found: false };
            }
            
            console.log('Cache → Get | Looking up:', {
                level: level.trim(),
                county,
                requestedCategory,
                hash
            });

            const response = await this.sheets.spreadsheets.values.get({
                spreadsheetId: this.spreadsheetId,
                range: 'Cache!A:H'
            });

            const rows = response.data.values || [];
            const dataRows = rows.length > 0 && rows[0][0] === 'Query' ? rows.slice(1) : rows;
            
            // Find exact matches only
            const matchingRows = dataRows.filter(row => 
                row[5] === hash && // Hash must match exactly
                row[1] === level.trim() && // Level must match exactly
                row.length === 8 // Must have all columns
            );

            if (matchingRows.length === 0) {
                console.log('Cache → Get | No matches found');
                return { found: false };
            }

            // Get most recent entry
            const latestRow = matchingRows.reduce((latest, current) => {
                const currentDate = new Date(current[4]); // Timestamp is in column E
                const latestDate = new Date(latest[4]);
                return currentDate > latestDate ? current : latest;
            });

            // Return in exact format
            return {
                found: true,
                data: {
                    query: latestRow[0],
                    level: latestRow[1],
                    googleResults: JSON.parse(latestRow[2]),
                    openaiAnalysis: JSON.parse(latestRow[3]),
                    timestamp: latestRow[4],
                    hash: latestRow[5],
                    googleSearchCache: latestRow[6],
                    openaiSearchCache: latestRow[7]
                }
            };

        } catch (error) {
            console.error('Cache → Get | Error:', error);
            return { found: false };
        }
    }

    // Append a row to the cache sheet
    async appendRow(data) {
        if (!this.enabled) {
            console.log('Cache → Append | Cache disabled');
            return;
        }
        
        if (!this.initialized) await this.initialize();

        try {
            const hash = this.netlifyGenerateHash(data.level, data.county, 'all');
            if (!hash) throw new Error('Failed to generate hash');

            // Format query correctly for county searches
            const query = this.normalizeQueryFormat(data.county, data.level);
            if (!query) throw new Error('Failed to normalize query format');

            // Safely stringify JSON data
            const googleResultsJson = typeof data.googleResults === 'string' 
                ? data.googleResults 
                : JSON.stringify(data.googleResults || []);
                
            const openaiAnalysisJson = typeof data.openaiAnalysis === 'string'
                ? data.openaiAnalysis
                : JSON.stringify(data.openaiAnalysis || []);

            console.log('Cache → Append | Preparing data:', {
                query,
                level: data.level,
                resultsCount: Array.isArray(data.googleResults) ? data.googleResults.length : 0,
                analysisCount: Array.isArray(data.openaiAnalysis) ? data.openaiAnalysis.length : 0
            });

            const rowData = [
                query,                           // A: Query
                data.level || '',               // B: Level
                googleResultsJson,              // C: Google Results
                openaiAnalysisJson,             // D: openAI Analysis
                this.netlifyGetPSTTimestamp(),  // E: Timestamp
                hash,                           // F: Hash
                data.googleSearchCache || 'Search',  // G: Google Search-Cache
                data.openaiSearchCache || 'Search'   // H: OpenAI Search-Cache
            ];

            // Log the exact row structure for verification
            console.log('Cache → Append | Row matches example:', {
                query: rowData[0],
                level: rowData[1],
                timestamp: rowData[4],
                hash: rowData[5]
            });

            // Append to sheet
            const response = await this.sheets.spreadsheets.values.append({
                spreadsheetId: this.spreadsheetId,
                range: 'Cache!A:H',
                valueInputOption: 'RAW',
                insertDataOption: 'INSERT_ROWS',
                resource: {
                    values: [rowData]
                }
            });

            console.log('Cache → Append | Success:', {
                updatedRange: response.data.updates.updatedRange,
                updatedRows: response.data.updates.updatedRows,
                timestamp: this.netlifyGetPSTTimestamp()
            });

            return response;

        } catch (error) {
            console.error('Cache → Append | Error:', error);
            throw error;
        }
    }

    // Set cache entry
    async netlifySetCache(level, county, category, data) {
        try {
            if (!this.initialized) await this.initialize();
            if (!level) throw new Error('Level is required');

            // Normalize inputs
            const normalizedLevel = level.trim();
            let normalizedCounty = county ? county.replace(/^County:/, '').replace(/ County$/i, '').trim() : null;
            
            // Generate hash first to check for existing entries
            const hash = this.netlifyGenerateHash(normalizedLevel, normalizedCounty, category);
            if (!hash) throw new Error('Failed to generate hash');

            // Check if entry already exists
            const existingEntry = await this.netlifyGetCache(normalizedLevel, normalizedCounty, category);
            if (existingEntry) {
                console.log('Cache → Set | Entry already exists:', {
                    level: normalizedLevel,
                    county: normalizedCounty,
                    hash,
                    timestamp: this.netlifyGetPSTTimestamp()
                });
                return true;
            }

            // Get query format exactly as per documentation
            let query;
            switch (normalizedLevel) {
                case 'Federal':
                    query = 'federal energy rebate programs california, US government energy incentives california';
                    break;
                case 'State':
                    query = 'California state energy rebate programs, California state government energy incentives';
                    break;
                case 'County':
                    if (!normalizedCounty) {
                        throw new Error('County name is required for county-level query');
                    }
                    query = `${normalizedCounty} County energy rebate programs california, ${normalizedCounty} County utility incentives california`;
                    break;
                default:
                    throw new Error(`Invalid level: ${normalizedLevel}`);
            }

            // Match working example row structure exactly
            const rowData = [
                query,                                    // Query - exact format from docs
                normalizedLevel,                         // Level - "Federal", "State", or "County"
                JSON.stringify(data.googleResults || []), // Results array
                JSON.stringify(data.openaiAnalysis || []), // Analysis array
                this.netlifyGetPSTTimestamp(),           // Timestamp in exact format
                hash,                                    // MD5 hash of level::all pattern
                'Search',                                // Default cache type
                'Search'                                 // Default cache type
            ];

            // Log the exact row structure for verification
            console.log('Cache → Set | Row matches example:', {
                query: rowData[0],
                level: rowData[1],
                timestamp: rowData[4],
                hash: rowData[5]
            });

            // Append to sheet
            const response = await this.sheets.spreadsheets.values.append({
                spreadsheetId: this.spreadsheetId,
                range: 'Cache!A:H',
                valueInputOption: 'RAW',
                insertDataOption: 'INSERT_ROWS',
                resource: {
                    values: [rowData]
                }
            });

            console.log('Cache → Set | Success:', {
                level: normalizedLevel,
                county: normalizedCounty,
                hash,
                updatedRange: response.data.updates?.updatedRange,
                updatedRows: response.data.updates?.updatedRows,
                timestamp: this.netlifyGetPSTTimestamp()
            });

            return true;

        } catch (error) {
            console.error('Cache → Set | Error:', {
                error: error.message,
                stack: error.stack,
                level,
                county,
                category,
                timestamp: this.netlifyGetPSTTimestamp()
            });
            throw error;
        }
    }
}