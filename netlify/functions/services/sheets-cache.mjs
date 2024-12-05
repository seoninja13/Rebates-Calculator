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
            
            // Test the connection
            console.log('Cache → Initialize | Testing connection');
            const test = await this.sheets.spreadsheets.get({
                spreadsheetId: this.spreadsheetId
            });
            
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

    // Generate a unique hash for the query and category
    netlifyGenerateHash(query, category) {
        // EXACTLY match local environment's implementation
        return crypto
            .createHash('md5')
            .update(`${query}|${category}`)
            .digest('hex');
    }

    // Convert to PST timestamp
    netlifyGetPSTTimestamp() {
        return new Date().toLocaleString('en-US', {
            timeZone: 'America/Los_Angeles'
        });
    }

    // Get cache entry by query and category
    async netlifyGetCache(query, category) {
        if (!this.enabled) {
            console.log('Cache → Get | Cache disabled');
            return null;
        }

        if (!this.sheets) {
            console.group('🚨 CACHE ERROR');
            console.error('Sheets client not initialized:', {
                error: 'Client missing',
                query,
                category,
                timestamp: new Date().toISOString()
            });
            console.groupEnd();
            throw new Error('Cache client not initialized');
        }

        // Convert the query to match the stored format
        let fullQuery;
        if (category === 'Federal') {
            fullQuery = 'Federal energy rebate programs california, US government energy incentives california';
        } else if (category === 'State') {
            fullQuery = 'California state energy rebate programs, California state government energy incentives';
        } else if (category === 'County') {
            const county = query.split(':')[1];
            fullQuery = `${county} County energy rebate programs california, ${county} County utility incentives california`;
        } else {
            fullQuery = query;
        }

        const hash = this.netlifyGenerateHash(fullQuery, category);

        try {
            console.log('Cache → Get | Checking cache:', {
                originalQuery: query,
                fullQuery: fullQuery,
                category,
                hash,
                hasSheets: !!this.sheets,
                hasSpreadsheetId: !!this.spreadsheetId
            });

            const response = await this.sheets.spreadsheets.values.get({
                spreadsheetId: this.spreadsheetId,
                range: 'Cache!A:H'
            });

            if (!response.data.values) {
                console.log('Cache → Get | No values found in sheet');
                return null;
            }

            // Debug existing cache entries
            console.log('Cache → Contents:', {
                entries: response.data.values.slice(1).map(row => ({
                    storedQuery: row[0],
                    storedCategory: row[1],
                    storedHash: row[5]
                })),
                currentQuery: fullQuery,
                currentCategory: category,
                currentHash: hash
            });

            // Find the most recent matching entry
            const matches = response.data.values.slice(1)
                .filter(row => row[5] === hash) // Hash is in column F (index 5)
                .sort((a, b) => new Date(b[4]) - new Date(a[4])); // Sort by timestamp descending

            if (matches.length > 0) {
                const match = matches[0]; // Get most recent match
                console.log('Cache → Get | Cache hit:', {
                    query: match[0],
                    category: match[1],
                    timestamp: match[4],
                    hash: match[5],
                    googleCache: match[6],
                    openaiCache: match[7],
                    matchedHash: hash
                });

                return {
                    found: true,
                    googleResults: match[2],
                    openaiAnalysis: match[3],
                    timestamp: match[4],
                    hash: match[5],
                    googleSearchCache: match[6],
                    openaiSearchCache: match[7]
                };
            }

            console.log('Cache → Get | Cache missing:', {
                query: fullQuery,
                category,
                hash,
                availableHashes: response.data.values.slice(1).map(row => row[5])
            });
            return null;

        } catch (error) {
            console.group('🚨 CACHE LOOKUP ERROR');
            console.error('Failed to get from cache:', {
                error: error.message,
                stack: error.stack,
                query: fullQuery,
                category,
                timestamp: new Date().toISOString()
            });
            console.groupEnd();
            throw error;
        }
    }

    // Append a row to the cache sheet
    async appendRow(data) {
        if (!this.enabled) {
            console.log('Cache → Append | Cache disabled');
            return;
        }

        if (!this.sheets) {
            console.error('Cache → Append | Sheets client not initialized');
            return;
        }

        try {
            // Convert the query to match the stored format
            let fullQuery;
            if (data.category === 'Federal') {
                fullQuery = 'Federal energy rebate programs california, US government energy incentives california';
            } else if (data.category === 'State') {
                fullQuery = 'California state energy rebate programs, California state government energy incentives';
            } else if (data.category === 'County') {
                const county = data.query.split(':')[1];
                fullQuery = `${county} County energy rebate programs california, ${county} County utility incentives california`;
            } else {
                fullQuery = data.query;
            }

            console.log('Cache → Append | Starting:', {
                spreadsheetId: this.spreadsheetId,
                originalQuery: data.query,
                fullQuery: fullQuery,
                category: data.category
            });

            // Ensure consistent column order:
            // A: Query, B: Category, C: GoogleResults, D: OpenAIAnalysis, 
            // E: Timestamp, F: Hash, G: GoogleCache, H: OpenAICache
            const response = await this.sheets.spreadsheets.values.append({
                spreadsheetId: this.spreadsheetId,
                range: 'Cache!A:H',
                valueInputOption: 'RAW',
                insertDataOption: 'INSERT_ROWS',
                resource: {
                    values: [[
                        fullQuery || '',                  // A: Query
                        data.category || '',               // B: Category
                        data.googleResults || '',          // C: GoogleResults
                        data.openaiAnalysis || '',         // D: OpenAIAnalysis
                        this.netlifyGetPSTTimestamp(),     // E: Timestamp
                        this.netlifyGenerateHash(fullQuery, data.category) || '', // F: Hash
                        data.googleSearchCache || 'Search', // G: GoogleCache
                        data.openaiSearchCache || 'Search'  // H: OpenAICache
                    ]]
                }
            });

            console.log('Cache → Append | Success:', {
                updatedRange: response.data.updates.updatedRange,
                updatedRows: response.data.updates.updatedRows
            });

            return response;
        } catch (error) {
            console.error('Cache → Append | Failed:', {
                error: error.message,
                stack: error.stack,
                query: data.query,
                category: data.category
            });
            throw error;
        }
    }
} 