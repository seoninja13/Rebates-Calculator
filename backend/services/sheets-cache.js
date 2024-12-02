import { google } from 'googleapis';
import crypto from 'crypto';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

// Initialize environment variables with the correct path
const envPath = path.join(dirname(fileURLToPath(import.meta.url)), '..', '.env');
const log = (message, error = false) => {
    const timestamp = new Date().toISOString();
    if (error) {
        console.error(timestamp + ':', message);
    } else if (typeof message === 'object') {
        console.log(timestamp + ':', JSON.stringify(message, null, 2));
    } else {
        console.log(timestamp + ':', message);
    }
};

log('🔧 Loading environment variables from:', envPath);
dotenv.config({ path: envPath });

// Log all environment variables for debugging
log('📋 Environment variables status:', {
    GOOGLE_SHEETS_SPREADSHEET_ID: process.env.GOOGLE_SHEETS_SPREADSHEET_ID ? '✅' : '❌',
    GOOGLE_SHEETS_CREDENTIALS: process.env.GOOGLE_SHEETS_CREDENTIALS ? '✅' : '❌'
});

class GoogleSheetsCache {
    constructor() {
        log('🔧 GoogleSheetsCache: Starting initialization...');
        try {
            // Use the spreadsheet ID from environment variables
            this.spreadsheetId = process.env.GOOGLE_SHEETS_SPREADSHEET_ID;
            this.credentialsJson = process.env.GOOGLE_SHEETS_CREDENTIALS;

            log('📋 Environment variables loaded:', {
                spreadsheetId: this.spreadsheetId ? this.spreadsheetId.substring(0, 5) + '...' : 'Missing',
                credentialsLength: this.credentialsJson ? this.credentialsJson.length : 0,
                credentialsPresent: !!this.credentialsJson
            });

            if (!this.spreadsheetId) {
                log('❌ GoogleSheetsCache: Missing spreadsheet ID', true);
                this.enabled = false;
                return;
            }

            if (!this.credentialsJson) {
                log('❌ GoogleSheetsCache: Missing credentials', true);
                this.enabled = false;
                return;
            }

            try {
                // Initialize Google Sheets API
                const credentials = JSON.parse(this.credentialsJson);
                log('🔑 Credentials parsed successfully:', {
                    type: credentials.type,
                    project_id: credentials.project_id,
                    client_email: credentials.client_email
                });
                
                this.auth = new google.auth.GoogleAuth({
                    credentials,
                    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
                });

                // Initialize sheets API
                this.sheets = google.sheets({ version: 'v4', auth: this.auth });
                
                // Test the connection
                this.testConnection();
                
                this.enabled = true;
                log('✅ GoogleSheetsCache: Successfully initialized auth');
            } catch (parseError) {
                log('❌ GoogleSheetsCache: Error parsing credentials:', true);
                log(parseError, true);
                this.enabled = false;
            }
        } catch (error) {
            log('❌ GoogleSheetsCache: Initialization error:', true);
            log(error, true);
            this.enabled = false;
        }
    }

    async initialize() {
        if (!this.enabled) {
            log('⚠️ GoogleSheetsCache: Cache is disabled, skipping initialization');
            return;
        }
        try {
            log('🔄 Initializing Google Sheets API...');
            
            // Check if Cache sheet exists, if not create it
            try {
                log('🔍 Checking for Cache sheet in spreadsheet:', this.spreadsheetId);
                const response = await this.sheets.spreadsheets.get({
                    spreadsheetId: this.spreadsheetId
                });
                
                log('📊 Spreadsheet info:', {
                    title: response.data.properties.title,
                    sheets: response.data.sheets.map(s => s.properties.title)
                });

                const cacheSheet = response.data.sheets.find(
                    sheet => sheet.properties.title === 'Cache'
                );
                
                if (!cacheSheet) {
                    log('📝 Creating Cache sheet...');
                    await this.sheets.spreadsheets.batchUpdate({
                        spreadsheetId: this.spreadsheetId,
                        resource: {
                            requests: [{
                                addSheet: {
                                    properties: {
                                        title: 'Cache',
                                        gridProperties: {
                                            rowCount: 1000,
                                            columnCount: 8
                                        }
                                    }
                                }
                            }]
                        }
                    });
                    
                    // Add headers
                    await this.sheets.spreadsheets.values.update({
                        spreadsheetId: this.spreadsheetId,
                        range: 'Cache!A:H',
                        valueInputOption: 'RAW',
                        resource: {
                            values: [['Query', 'Category', 'Google Results', 'OpenAI Analysis', 'Timestamp', 'Hash', 'Google Search-Cache', 'OpenAI Search-Cache']]
                        }
                    });
                    log('✅ Cache sheet created and headers added');
                } else {
                    log('✅ Cache sheet already exists');
                }
            } catch (error) {
                log('❌ Error checking/creating Cache sheet:', true);
                log('Error details:', {
                    message: error.message,
                    code: error.code,
                    status: error.status,
                    details: error.details
                });
                throw error;
            }
        } catch (error) {
            log('❌ GoogleSheetsCache: Failed to initialize sheets API:', true);
            log('Stack trace:', error.stack);
            this.enabled = false;
        }
    }

    async set(query, category, data) {
        if (!this.enabled) {
            log('⚠️ Cache is disabled, skipping set operation');
            return false;
        }
        try {
            log('💾 Attempting to cache results:', {
                query,
                category,
                dataKeys: Object.keys(data),
                enabled: this.enabled,
                spreadsheetId: this.spreadsheetId ? '✓' : '❌'
            });

            if (!this.sheets) {
                log('❌ Google Sheets API not initialized');
                return false;
            }

            // Generate hash from category and query
            const hash = this._generateHash(`${category}:${query}`);
            const timestamp = new Date().toLocaleString("en-US", {
                timeZone: "America/Los_Angeles",
                year: 'numeric',
                month: '2-digit',
                day: '2-digit',
                hour: '2-digit',
                minute: '2-digit',
                second: '2-digit'
            });

            log('📝 Preparing cache data:', {
                hash,
                timestamp,
                query,
                category
            });

            // Always append a new row to log the search
            try {
                await this.appendRow(
                    query,
                    category,
                    data.results,
                    data.analysis,
                    hash,
                    timestamp,
                    data.source
                );
                return true;
            } catch (appendError) {
                log('❌ Error appending to sheet:', appendError);
                log('Error details:', {
                    message: appendError.message,
                    code: appendError.code,
                    status: appendError.status,
                    details: appendError.details
                });
                return false;
            }
        } catch (error) {
            log('❌ Error in set operation:', error);
            log('Error details:', {
                message: error.message,
                code: error.code,
                status: error.status,
                details: error.details
            });
            return false;
        }
    }

    async appendRow(query, category, googleResults, openAIAnalysis, hash, timestamp, cacheStatus) {
        try {
            const appendResponse = await this.sheets.spreadsheets.values.append({
                spreadsheetId: this.spreadsheetId,
                range: 'Cache!A:H',
                valueInputOption: 'RAW',
                insertDataOption: 'INSERT_ROWS',
                resource: {
                    values: [[
                        query,               // Query
                        category,            // Category
                        JSON.stringify(googleResults),  // Google Results - actual results
                        openAIAnalysis,      // OpenAI Analysis - actual analysis
                        timestamp,           // Timestamp
                        hash,                // Hash
                        cacheStatus.googleSearch ? 'Search' : 'Cache',    // Google Search-Cache
                        cacheStatus.openaiAnalysis ? 'Search' : 'Cache'   // OpenAI Search-Cache
                    ]]
                }
            });

            log('✅ Cache operation successful:', {
                updatedRange: appendResponse.data.updates.updatedRange,
                updatedRows: appendResponse.data.updates.updatedRows
            });
        } catch (error) {
            log('❌ Error appending row:', error);
            log('Error details:', {
                message: error.message,
                code: error.code,
                status: error.status,
                details: error.details
            });
            throw error;
        }
    }

    async get(query, category) {
        if (!this.enabled) {
            log('⚠️ Cache is disabled, skipping get operation');
            return null;
        }
        try {
            const hash = this._generateHash(`${category}:${query}`);
            
            // Get all cache entries
            const response = await this.sheets.spreadsheets.values.get({
                spreadsheetId: this.spreadsheetId,
                range: 'Cache!A:H'
            });

            const rows = response.data.values || [];
            if (rows.length <= 1) {  // Only header row or empty
                return null;
            }

            // Find the most recent entry for this hash
            const matchingRows = rows.slice(1).filter(row => row[5] === hash);  // Hash is in column F (index 5)
            if (matchingRows.length > 0) {
                const latestEntry = matchingRows[matchingRows.length - 1];
                try {
                    return {
                        results: JSON.parse(latestEntry[2]),  // Google Results
                        analysis: latestEntry[3],  // OpenAI Analysis
                        source: {
                            googleSearch: latestEntry[6] === 'Search',  // Google Search-Cache
                            openaiAnalysis: latestEntry[7] === 'Search'  // OpenAI Search-Cache
                        }
                    };
                } catch (parseError) {
                    log('❌ Error parsing cache entry:', parseError);
                    return null;
                }
            }
            return null;
        } catch (error) {
            log('❌ Error in get:', error);
            return null;
        }
    }

    async clearAndResetSheet() {
        try {
            // Clear all content except headers
            await this.sheets.spreadsheets.values.clear({
                spreadsheetId: this.spreadsheetId,
                range: 'Cache!A2:H',  // Clear everything except header row
            });

            // Reset headers
            await this.sheets.spreadsheets.values.update({
                spreadsheetId: this.spreadsheetId,
                range: 'Cache!A1:H1',
                valueInputOption: 'RAW',
                resource: {
                    values: [[
                        'Query',
                        'Category',
                        'Google Results',
                        'OpenAI Analysis',
                        'Timestamp',
                        'Hash',
                        'Google Search-Cache',
                        'OpenAI Search-Cache'
                    ]]
                }
            });

            log('✅ Cache sheet cleared and reset successfully');
            return true;
        } catch (error) {
            log('❌ Error clearing cache sheet:', error);
            return false;
        }
    }

    _generateHash(text) {
        return crypto.createHash('md5').update(text).digest('hex');
    }

    _getEntryAge(timestamp) {
        const entryDate = new Date(timestamp);
        const now = new Date();
        const ageInHours = (now - entryDate) / (1000 * 60 * 60);
        return Math.round(ageInHours * 100) / 100;
    }

    _isEntryValid(timestamp) {
        const age = this._getEntryAge(timestamp);
        return age < 336; // Cache entries are valid for 14 days (14 * 24 = 336 hours)
    }

    async _removeExpiredEntry(hash) {
        if (!this.enabled) return;
        try {
            log('Removing expired entry with hash:', hash);
            
            // Get all values
            const response = await this.sheets.spreadsheets.values.get({
                spreadsheetId: this.spreadsheetId,
                range: 'Cache!A:H'
            });

            const rows = response.data.values || [];
            if (rows.length <= 1) return; // Only header row or empty

            // Find the row index with matching hash (hash is in column F/index 5)
            const rowIndex = rows.findIndex(row => row[5] === hash);
            if (rowIndex === -1) return; // Hash not found

            // Delete the row
            await this.sheets.spreadsheets.batchUpdate({
                spreadsheetId: this.spreadsheetId,
                resource: {
                    requests: [{
                        deleteDimension: {
                            range: {
                                sheetId: 0, // Assuming Cache is the first sheet
                                dimension: 'ROWS',
                                startIndex: rowIndex,
                                endIndex: rowIndex + 1
                            }
                        }
                    }]
                }
            });

            log('Successfully removed expired entry');
        } catch (error) {
            log('Error removing expired entry:', true);
            log('Error details:', {
                message: error.message,
                code: error.code,
                status: error.status,
                details: error.details
            });
        }
    }

    async testConnection() {
        try {
            log('🔍 Testing Google Sheets connection...');
            const response = await this.sheets.spreadsheets.get({
                spreadsheetId: this.spreadsheetId
            });
            
            log('✅ Successfully connected to Google Sheets:', {
                title: response.data.properties.title,
                sheets: response.data.sheets.map(s => s.properties.title)
            });
            
            return true;
        } catch (error) {
            log('❌ Failed to connect to Google Sheets:', error);
            log('Error details:', {
                message: error.message,
                code: error.code,
                status: error.status,
                details: error.details
            });
            this.enabled = false;
            return false;
        }
    }
}

export { GoogleSheetsCache };
