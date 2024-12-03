import { google } from 'googleapis';
import crypto from 'crypto';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

// Initialize environment variables with the correct path
const envPath = path.join(dirname(fileURLToPath(import.meta.url)), '..', '.env');

const log = (message, details = null, type = 'info') => {
    const timestamp = new Date().toISOString();
    const logObject = {
        message,
        details,
        timestamp,
        type
    };

    if (type === 'error') {
        console.error(JSON.stringify(logObject, null, 2));
    } else {
        console.log(JSON.stringify(logObject, null, 2));
    }
};

log('Cache → System | Loading environment variables', { path: envPath }, 'system_init');
dotenv.config({ path: envPath });

class GoogleSheetsCache {
    constructor() {
        log('Cache → System | Initializing cache service', null, 'system_init');
        try {
            this.spreadsheetId = process.env.GOOGLE_SHEETS_SPREADSHEET_ID;
            this.credentialsJson = process.env.GOOGLE_SHEETS_CREDENTIALS;

            log('Cache → System | Environment loaded', {
                spreadsheetId: this.spreadsheetId ? '✅' : '❌',
                credentials: this.credentialsJson ? '✅' : '❌'
            }, 'system_status');

            if (!this.spreadsheetId || !this.credentialsJson) {
                throw new Error('Missing required environment variables');
            }

            const credentials = JSON.parse(this.credentialsJson);
            this.auth = new google.auth.GoogleAuth({
                credentials,
                scopes: ['https://www.googleapis.com/auth/spreadsheets'],
            });

            this.enabled = true;
            log('Cache → System | Initialization complete', { status: 'enabled' }, 'system_ready');
        } catch (error) {
            this.enabled = false;
            log('Cache → System | Initialization failed', {
                error: error.message,
                stack: error.stack
            }, 'error');
        }
    }

    async initialize() {
        if (!this.enabled) {
            log('Cache → System | Cache disabled', null, 'system_status');
            return false;
        }

        try {
            this.sheets = google.sheets({ version: 'v4', auth: this.auth });
            const response = await this.sheets.spreadsheets.get({
                spreadsheetId: this.spreadsheetId
            });

            const sheets = response.data.sheets;
            const cacheSheet = sheets.find(sheet => sheet.properties.title === 'Cache');

            if (!cacheSheet) {
                log('Cache → Sheets | Creating cache sheet', null, 'sheets_operation');
                await this._createCacheSheet();
            }

            log('Cache → System | Sheet initialization complete', null, 'system_ready');
            return true;
        } catch (error) {
            log('Cache → System | Sheet initialization failed', {
                error: error.message,
                stack: error.stack
            }, 'error');
            return false;
        }
    }

    async _createCacheSheet() {
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
    }

    async set(query, category, data) {
        if (!this.enabled) {
            log('Cache → System | Cache disabled, skipping set', null, 'cache_skip');
            return false;
        }

        // Skip if query contains "_combined"
        if (query.includes('_combined')) {
            log('Cache → System | Skipping _combined query', { query }, 'cache_skip');
            return false;
        }

        try {
            log('Cache → Sheets | Caching results', {
                query,
                category,
                timestamp: new Date().toISOString()
            }, 'cache_write');

            const hash = this._generateHash(`${category}:${query}`);
            const timestamp = new Date().toLocaleString("en-US", {
                timeZone: "America/Los_Angeles"
            });

            // Single row with both Google results and OpenAI analysis
            await this.appendRow({
                query,
                category,
                googleResults: JSON.stringify(data.results || []),
                openaiAnalysis: JSON.stringify(data.analysis || {}),
                timestamp,
                hash,
                googleSearchCache: data.source.googleSearch ? 'Search' : 'Cache',
                openaiSearchCache: 'Search'  // Always set to "Search"
            });

            log('Cache → System | Cache operation complete', {
                category,
                entriesAdded: 1
            }, 'cache_write_complete');

            return true;
        } catch (error) {
            log('Cache → System | Cache operation failed', {
                error: error.message,
                stack: error.stack
            }, 'error');
            return false;
        }
    }

    async appendRow(data) {
        try {
            const response = await this.sheets.spreadsheets.values.append({
                spreadsheetId: this.spreadsheetId,
                range: 'Cache!A:H',
                valueInputOption: 'RAW',
                insertDataOption: 'INSERT_ROWS',
                resource: {
                    values: [[
                        data.query || '',
                        data.category || '',
                        data.googleResults || '',
                        data.openaiAnalysis || '',
                        data.timestamp || '',
                        data.hash || '',
                        data.googleSearchCache || 'Search',
                        'Search'  // Always set to "Search"
                    ]]
                }
            });

            log('Cache → Sheets | Row appended', {
                category: data.category,
                type: 'Combined Results'
            }, 'cache_append');

            return response;
        } catch (error) {
            log('Cache → Sheets | Row append failed', {
                error: error.message,
                stack: error.stack
            }, 'error');
            throw error;
        }
    }

    async get(query, category) {
        if (!this.enabled) {
            log('Cache → System | Cache disabled, skipping get', null, 'cache_skip');
            return null;
        }

        // Skip if query contains "_combined"
        if (query.includes('_combined')) {
            log('Cache → System | Skipping _combined query', { query }, 'cache_skip');
            return null;
        }

        try {
            const hash = this._generateHash(`${category}:${query}`);
            
            log('Cache → Sheets | Retrieving cache entry', {
                query,
                category,
                hash
            }, 'cache_read');

            const response = await this.sheets.spreadsheets.values.get({
                spreadsheetId: this.spreadsheetId,
                range: 'Cache!A:H'
            });

            const rows = response.data.values || [];
            if (rows.length <= 1) {
                log('Cache → System | Cache empty', null, 'cache_miss');
                return null;
            }

            const matchingRows = rows.slice(1).filter(row => row[5] === hash);
            if (matchingRows.length === 0) {
                log('Cache → System | No matching cache entry', null, 'cache_miss');
                return null;
            }

            const latestRow = matchingRows[matchingRows.length - 1];
            if (!this._isEntryValid(latestRow[4])) {
                log('Cache → System | Cache entry expired', {
                    timestamp: latestRow[4]
                }, 'cache_expired');
                return null;
            }

            const result = {
                results: JSON.parse(latestRow[2] || '[]'),
                analysis: JSON.parse(latestRow[3] || '{}'),
                source: {
                    googleSearch: latestRow[6] === 'Search',
                    openaiAnalysis: true  // Always true since we only store Search entries
                }
            };

            log('Cache → System | Cache hit', {
                query,
                category,
                timestamp: latestRow[4]
            }, 'cache_hit');

            return result;
        } catch (error) {
            log('Cache → System | Cache retrieval failed', {
                error: error.message,
                stack: error.stack
            }, 'error');
            return null;
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

    async testConnection() {
        try {
            log('Cache → Sheets | Testing connection', null, 'system_test');
            const response = await this.sheets.spreadsheets.get({
                spreadsheetId: this.spreadsheetId
            });
            
            log('Cache → System | Connection test successful', {
                title: response.data.properties.title,
                sheets: response.data.sheets.map(s => s.properties.title)
            }, 'system_test_success');
            
            return true;
        } catch (error) {
            log('Cache → System | Connection test failed', {
                error: error.message,
                stack: error.stack
            }, 'error');
            this.enabled = false;
            return false;
        }
    }
}

export { GoogleSheetsCache };
