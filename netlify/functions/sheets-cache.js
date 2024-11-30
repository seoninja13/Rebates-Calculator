import { google } from 'googleapis';
import crypto from 'crypto';

export class GoogleSheetsCache {
    constructor() {
        console.log('GoogleSheetsCache: Starting initialization...');
        try {
            // Use the provided spreadsheet ID
            this.spreadsheetId = "1lzUS63kvhh_ICyeZhdDs46fk7l72r0ulZ5tLSKNjcJc";
            this.credentialsJson = process.env.GOOGLE_SHEETS_CREDENTIALS;

            console.log('Spreadsheet ID:', this.spreadsheetId);
            console.log('Environment variables status:', {
                credentialsJson: this.credentialsJson ? 'Present' : 'Missing'
            });

            if (!this.credentialsJson) {
                console.error('GoogleSheetsCache: Missing credentials');
                this.enabled = false;
                return;
            }

            try {
                // Initialize Google Sheets API
                const credentials = JSON.parse(this.credentialsJson);
                console.log('Credentials parsed successfully. Initializing GoogleAuth...');
                
                this.auth = new google.auth.GoogleAuth({
                    credentials,
                    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
                });
                
                this.enabled = true;
                console.log('GoogleSheetsCache: Successfully initialized auth');
            } catch (parseError) {
                console.error('GoogleSheetsCache: Error parsing credentials:', parseError);
                this.enabled = false;
            }
        } catch (error) {
            console.error('GoogleSheetsCache: Initialization error:', error);
            this.enabled = false;
        }
    }

    async initialize() {
        if (!this.enabled) {
            console.log('GoogleSheetsCache: Cache is disabled, skipping initialization');
            return;
        }
        try {
            this.sheets = google.sheets({ version: 'v4', auth: this.auth });
            
            // Check if Cache sheet exists, if not create it
            try {
                const response = await this.sheets.spreadsheets.get({
                    spreadsheetId: this.spreadsheetId
                });
                
                const cacheSheet = response.data.sheets.find(
                    sheet => sheet.properties.title === 'Cache'
                );
                
                if (!cacheSheet) {
                    console.log('Creating Cache sheet...');
                    await this.sheets.spreadsheets.batchUpdate({
                        spreadsheetId: this.spreadsheetId,
                        resource: {
                            requests: [{
                                addSheet: {
                                    properties: {
                                        title: 'Cache',
                                        gridProperties: {
                                            rowCount: 1000,
                                            columnCount: 7
                                        }
                                    }
                                }
                            }]
                        }
                    });
                    
                    // Add headers
                    await this.sheets.spreadsheets.values.update({
                        spreadsheetId: this.spreadsheetId,
                        range: 'Cache!A1:G1',
                        valueInputOption: 'RAW',
                        resource: {
                            values: [['Query', 'Category', 'Results', 'Timestamp (PST)', 'Hash', 'Google Search', 'OpenAI Analysis']]
                        }
                    });
                }
                
                console.log('GoogleSheetsCache: Cache sheet is ready');
            } catch (error) {
                console.error('Error checking/creating Cache sheet:', error);
                throw error;
            }
        } catch (error) {
            console.error('GoogleSheetsCache: Failed to initialize sheets API:', error);
            this.enabled = false;
        }
    }

    convertToPST(timestamp) {
        const date = new Date(timestamp);
        return date.toLocaleString('en-US', {
            timeZone: 'America/Los_Angeles',
            year: 'numeric',
            month: '2-digit',
            day: '2-digit',
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit',
            hour12: true
        });
    }

    async get(query, category) {
        if (!this.enabled) return null;
        try {
            console.log('GoogleSheetsCache: 🔍 Checking cache for query:', query, 'category:', category);
            const hash = this._generateHash(query, category);
            
            const response = await this.sheets.spreadsheets.values.get({
                spreadsheetId: this.spreadsheetId,
                range: 'Cache!A:G'
            });

            const rows = response.data.values || [];
            if (rows.length <= 1) {
                console.log('GoogleSheetsCache: Cache is empty');
                return null;
            }

            // Skip header row
            const cacheEntry = rows.slice(1).find(row => row[4] === hash);

            if (cacheEntry) {
                console.log('GoogleSheetsCache: ✨ Cache entry found! Age:', this._getEntryAge(cacheEntry[3]), 'hours');
                // Check if cache entry is still valid
                if (this._isEntryValid(cacheEntry[3])) {
                    console.log('GoogleSheetsCache: ✅ Cache entry is valid, returning cached results');
                    return JSON.parse(cacheEntry[2]);
                } else {
                    console.log('GoogleSheetsCache: ⏰ Cache entry expired, will perform fresh search');
                    await this._removeExpiredEntry(hash);
                    return null;
                }
            } else {
                console.log('GoogleSheetsCache: ❌ No cache entry found for this query');
                return null;
            }
        } catch (error) {
            console.error('GoogleSheetsCache: ❌ Error accessing cache:', error);
            return null;
        }
    }

    async storeInCache(query, category, results, type) {
        if (!this.enabled) return;
        
        try {
            const timestamp = new Date().toISOString();
            const pstTimestamp = this.convertToPST(timestamp);
            const hash = this._generateHash(query, category);
            
            // Remove old entries for this query/category
            await this._removeExpiredEntry(hash);
            
            // Store new entry
            const googleSearch = type === 'google' ? '✓' : '';
            const openaiAnalysis = type === 'openai' ? '✓' : '';
            
            await this.sheets.spreadsheets.values.append({
                spreadsheetId: this.spreadsheetId,
                range: 'Cache!A:G',
                valueInputOption: 'RAW',
                resource: {
                    values: [[
                        query,
                        category,
                        JSON.stringify(results),
                        pstTimestamp,
                        hash,
                        googleSearch,
                        openaiAnalysis
                    ]]
                }
            });
            
            console.log('GoogleSheetsCache: ✅ Successfully cached results');
        } catch (error) {
            console.error('GoogleSheetsCache: Error storing in cache:', error);
        }
    }

    _isEntryValid(timestamp) {
        const entryAge = this._getEntryAge(timestamp);
        const isValid = entryAge < 336; // 14 days in hours
        console.log(`GoogleSheetsCache: 🕒 Cache entry age: ${entryAge} hours, Valid: ${isValid}`);
        return isValid;
    }

    _getEntryAge(timestamp) {
        const entryDate = new Date(timestamp);
        const now = new Date();
        const ageInHours = (now - entryDate) / (1000 * 60 * 60);
        return Math.round(ageInHours * 10) / 10; // Round to 1 decimal place
    }

    _generateHash(query, category) {
        const str = `${query}-${category}`;
        const hash = crypto.createHash('md5').update(str).digest('hex');
        return hash.slice(0, 8); // Use first 8 characters of MD5 hash
    }

    async _removeExpiredEntry(hash) {
        try {
            console.log('GoogleSheetsCache: Removing entry with hash:', hash);
            const range = 'Cache!A:G';
            const response = await this.sheets.spreadsheets.values.get({
                spreadsheetId: this.spreadsheetId,
                range,
            });

            const rows = response.data.values || [];
            if (rows.length <= 1) return; // Only header row or empty

            const rowIndex = rows.findIndex(row => row[4] === hash);

            if (rowIndex !== -1) {
                console.log('GoogleSheetsCache: Found entry at row:', rowIndex + 1);
                // Delete the row using batchUpdate
                await this.sheets.spreadsheets.batchUpdate({
                    spreadsheetId: this.spreadsheetId,
                    resource: {
                        requests: [{
                            deleteDimension: {
                                range: {
                                    sheetId: 0,
                                    dimension: 'ROWS',
                                    startIndex: rowIndex,
                                    endIndex: rowIndex + 1
                                }
                            }
                        }]
                    }
                });
                console.log('GoogleSheetsCache: Entry removed successfully');
            }
        } catch (error) {
            console.error('GoogleSheetsCache: Error removing entry:', error);
        }
    }
}
