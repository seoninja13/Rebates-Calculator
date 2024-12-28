import { google } from 'googleapis';
import crypto from 'crypto';
import { sendLogToClient, logError, logAPIResponse } from '../../netlify/functions/services/logging-utils.mjs';
import { validateCacheEntry } from '../../netlify/functions/services/validation-utils.mjs';

// Singleton instance
let instance = null;

export class GoogleSheetsCache {
    constructor() {
        if (instance) {
            return instance;
        }
        
        this.spreadsheetId = process.env.GOOGLE_SHEETS_SPREADSHEET_ID;
        this.enabled = !!this.spreadsheetId;
        this.initialized = false;
        instance = this;
    }

    async initialize() {
        if (this.initialized) {
            return true;
        }

        try {
            // Setup Google auth with read/write scope
            const auth = new google.auth.GoogleAuth({
                credentials: JSON.parse(process.env.GOOGLE_SHEETS_CREDENTIALS),
                scopes: ['https://www.googleapis.com/auth/spreadsheets']
            });

            // Get auth client
            const authClient = await auth.getClient();

            // Create sheets client
            this.sheets = google.sheets({ version: 'v4', auth: authClient });
            
            // Test the connection and log spreadsheet info
            const test = await this.sheets.spreadsheets.get({
                spreadsheetId: this.spreadsheetId
            });
            
            console.log("[LOG] Cache → Initialized", {
                spreadsheetId: this.spreadsheetId,
                title: test.data.properties.title
            });
            
            this.initialized = true;

            // Normalize existing data
            console.log("[LOG] Cache → Normalizing existing data...");
            await this.normalizeExistingData();
            
            return true;
        } catch (error) {
            console.error("[ERROR] Cache → Initialize Failed", error);
            return false;
        }
    }

    // Utility Methods
    generateHash(query, level) {
        // Ensure consistent string formatting
        const normalizedQuery = query.toLowerCase().trim();
        const normalizedLevel = level.toLowerCase().trim();
        const hashInput = `${normalizedQuery}|${normalizedLevel}`;
        
        return crypto
            .createHash('md5')
            .update(hashInput)
            .digest('hex');
    }

    getPSTTimestamp() {
        return new Date().toLocaleString('en-US', {
            timeZone: 'America/Los_Angeles'
        });
    }

    normalizeQuery(query) {
        const queryParts = query.toLowerCase().split(',').map(part => part.trim());
        return queryParts.length === 2 ? 
            `${queryParts[0]}, ${queryParts[1]}` : 
            query;
    }

    // Google Sheets Operations
    async getSheetRows(range = 'Cache-normalized!A:H') {
        try {
            console.log("[LOG] Cache → Getting Rows", { range });
            const response = await this.sheets.spreadsheets.values.get({
                spreadsheetId: this.spreadsheetId,
                range
            });
            
            const rows = response.data.values;
            console.log("[LOG] Cache → Got Rows", { rowCount: rows?.length });
            return rows;
        } catch (error) {
            console.error("[ERROR] Cache → Get Rows Failed", error);
            return null;
        }
    }

    async updateRow(range, values) {
        if (!this.enabled || !range) return false;

        try {
            await this.sheets.spreadsheets.values.update({
                spreadsheetId: this.spreadsheetId,
                range: range.replace('Cache!', 'Cache-normalized!'),
                valueInputOption: 'RAW',
                resource: {
                    values: [values]
                }
            });
            return true;
        } catch (error) {
            console.error("[ERROR] Cache → Update Row Failed", error);
            return false;
        }
    }

    async appendNewRow(values) {
        if (!this.enabled) return false;

        try {
            await this.sheets.spreadsheets.values.append({
                spreadsheetId: this.spreadsheetId,
                range: 'Cache-normalized!A:H',
                valueInputOption: 'RAW',
                insertDataOption: 'INSERT_ROWS',
                resource: {
                    values: [values]
                }
            });
            return true;
        } catch (error) {
            console.error("[ERROR] Cache → Append Row Failed", error);
            return false;
        }
    }

    async normalizeExistingData() {
        try {
            const rows = await this.getSheetRows();
            if (!rows || !rows.length) {
                console.log('No data found to normalize');
                return;
            }

            // Normalize each row
            const normalizedRows = rows.map(row => {
                if (row[0] === 'Query') return row; // Skip header row
                
                // Normalize query and level
                const normalizedQuery = this.normalizeQuery(row[0]);
                const normalizedLevel = row[1].toLowerCase().trim();
                const hash = this.generateHash(normalizedQuery, normalizedLevel);
                
                return [
                    normalizedQuery,
                    normalizedLevel,
                    row[2], // googleResults
                    row[3], // openaiAnalysis
                    row[4], // timestamp
                    hash,   // new hash
                    row[6], // isGoogleCached
                    row[7]  // isOpenAICached
                ];
            });

            // Update the sheet
            await this.sheets.spreadsheets.values.update({
                spreadsheetId: this.spreadsheetId,
                range: 'Cache-normalized!A1',
                valueInputOption: 'RAW',
                resource: {
                    values: normalizedRows
                }
            });

            console.log('Successfully normalized cache data');
        } catch (error) {
            console.error('Error normalizing cache:', error);
        }
    }

    // Core Cache Operations
    async logSearch(data) {
        if (!this.enabled) return;

        const formattedQuery = this.normalizeQuery(data.query);
        const hash = this.generateHash(formattedQuery, data.level);
        const timestamp = this.getPSTTimestamp();

        sendLogToClient('Cache → Log Search Hash', {
            originalQuery: data.query,
            formattedQuery,
            level: data.level,
            hash
        });

        const rowValues = [
            formattedQuery,                                    // Query
            data.level,                                       // Level
            JSON.stringify(data.googleResults || []),         // Google Results
            JSON.stringify(data.openaiAnalysis || {}),        // openAI Analysis
            timestamp,                                        // Timestamp
            hash,                                            // Hash
            data.isGoogleCached ? 'Cache' : 'Search',        // Google Search-Cache
            data.isOpenAICached ? 'Cache' : 'Search'         // OpenAI Search-Cache
        ];

        try {
            const rows = await this.getSheetRows();
            const existingRowIndex = rows.findIndex(row => 
                row[5] === hash // Look for matching hash in column F (index 5)
            );

            if (existingRowIndex > 0) {
                await this.updateRow(`Cache-normalized!A${existingRowIndex + 1}:H${existingRowIndex + 1}`, rowValues);
                sendLogToClient('Cache → Sheets | Search updated', {
                    query: formattedQuery,
                    level: data.level,
                    hash
                });
            } else {
                await this.appendNewRow(rowValues);
                sendLogToClient('Cache → Sheets | Search logged', {
                    query: formattedQuery,
                    level: data.level,
                    hash
                });
            }
        } catch (error) {
            logError('Log Search', error);
            throw error;
        }
    }

    async checkCache(query, level) {
        if (!this.enabled) return null;

        const normalizedQuery = this.normalizeQuery(query);
        const hash = this.generateHash(normalizedQuery, level);

        console.log('\n🔍 CACHE CHECK');
        console.log('==================');
        console.log('Query:', query);
        console.log('Level:', level);
        console.log('Hash:', hash);
        console.log('==================\n');

        const rows = await this.getSheetRows();
        if (!rows || rows.length === 0) {
            console.log('❌ CACHE MISS - No data in cache');
            return null;
        }

        // Find row with matching hash
        const matchingRow = rows.find(row => row[5] === hash);
        if (!matchingRow) {
            console.log('❌ CACHE MISS - Hash not found');
            return null;
        }

        console.log('✅ CACHE HIT');
        console.log('==================');
        console.log('Cached Query:', matchingRow[0]);
        console.log('Cached Level:', matchingRow[1]);
        console.log('Cached Hash:', matchingRow[5]);
        console.log('Timestamp:', matchingRow[4]);
        console.log('Raw Google Results:', matchingRow[2]);
        console.log('Raw OpenAI Analysis:', matchingRow[3]);
        console.log('==================\n');

        const parsedData = {
            googleResults: JSON.parse(matchingRow[2] || '[]'),
            openaiAnalysis: JSON.parse(matchingRow[3] || '{}'),
            programs: JSON.parse(matchingRow[2] || '[]')  // For backward compatibility
        };
        
        console.log('Parsed Data:', JSON.stringify(parsedData, null, 2));

        return {
            query: matchingRow[0],
            level: matchingRow[1],
            data: parsedData,
            timestamp: matchingRow[4],
            hash: matchingRow[5],
            isGoogleCached: matchingRow[6] === 'Cache',
            isOpenAICached: matchingRow[7] === 'Cache',
            found: true
        };
    }
}
