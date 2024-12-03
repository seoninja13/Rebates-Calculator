const { google } = require('googleapis');
const crypto = require('crypto');
const fetch = (...args) => import('node-fetch').then(({default: fetch}) => fetch(...args));

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

class GoogleSheetsCache {
    constructor() {
        log('Cache → System | Initializing cache service', null, 'system_init');
        try {
            if (!process.env.GOOGLE_SHEETS_ID || !process.env.GOOGLE_CLIENT_EMAIL || !process.env.GOOGLE_PRIVATE_KEY) {
                throw new Error('Missing environment variables. Please set GOOGLE_SHEETS_ID, GOOGLE_CLIENT_EMAIL, and GOOGLE_PRIVATE_KEY');
            }

            this.spreadsheetId = process.env.GOOGLE_SHEETS_ID;
            this.auth = new google.auth.GoogleAuth({
                credentials: {
                    client_email: process.env.GOOGLE_CLIENT_EMAIL,
                    private_key: process.env.GOOGLE_PRIVATE_KEY.replace(/\\n/g, '\n')
                },
                scopes: ['https://www.googleapis.com/auth/spreadsheets']
            });

            this.sheets = google.sheets({ version: 'v4', auth: this.auth });
            this.enabled = true;
            log('Cache → System | Initialization complete', { status: 'enabled' }, 'system_ready');
        } catch (error) {
            this.enabled = false;
            log('Cache → System | Initialization failed', {
                error: error.message,
                stack: error.stack
            }, 'error');
            this.initError = error;
        }
    }

    async initialize() {
        if (!this.enabled) {
            log('Cache → System | Cache disabled', null, 'system_status');
            return false;
        }

        try {
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

    async getRows() {
        try {
            const response = await this.sheets.spreadsheets.values.get({
                spreadsheetId: this.spreadsheetId,
                range: 'Cache!A:H'
            });

            const rows = response.data.values || [];
            if (rows.length <= 1) {
                log('Cache → System | No rows found', null, 'cache_empty');
                return null;
            }

            return rows.slice(1).map(row => ({
                query: row[0],
                category: row[1],
                googleResults: row[2],
                openaiAnalysis: row[3],
                timestamp: row[4],
                hash: row[5],
                googleSearchCache: row[6],
                openaiSearchCache: row[7]
            }));
        } catch (error) {
            log('Cache → System | Error getting rows', {
                error: error.message,
                stack: error.stack
            }, 'error');
            return null;
        }
    }

    async appendRow(data) {
        try {
            // Skip if OpenAI analysis is empty
            if (data.openaiAnalysis === '{}') {
                log('Cache → System | Skipping empty OpenAI analysis', null, 'cache_skip');
                return null;
            }

            const response = await this.sheets.spreadsheets.values.append({
                spreadsheetId: this.spreadsheetId,
                range: 'Cache!A:H',
                valueInputOption: 'RAW',
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

    _generateHash(text) {
        return crypto.createHash('md5').update(text).digest('hex');
    }

    _isEntryValid(timestamp) {
        const entryDate = new Date(timestamp);
        const now = new Date();
        const ageInHours = (now - entryDate) / (1000 * 60 * 60);
        return ageInHours < 336; // 14 days
    }

    async getCacheEntry(query, category) {
        if (!this.enabled) {
            log('Cache → System | Cache disabled', null, 'cache_skip');
            return null;
        }

        // Skip if query contains "_combined"
        if (query.includes('_combined')) {
            log('Cache → System | Skipping _combined query', { query }, 'cache_skip');
            return null;
        }

        try {
            const hash = this._generateHash(`${category}:${query}`);
            log('Cache → Sheets | Looking up entry', {
                query,
                category,
                hash
            }, 'cache_lookup');

            const rows = await this.getRows();
            if (!rows || rows.length === 0) {
                log('Cache → System | Cache empty', null, 'cache_miss');
                return null;
            }

            const matchingRows = rows.filter(row => row.hash === hash);
            if (matchingRows.length === 0) {
                log('Cache → System | No matching entry', null, 'cache_miss');
                return null;
            }

            const latestRow = matchingRows[matchingRows.length - 1];
            if (!this._isEntryValid(latestRow.timestamp)) {
                log('Cache → System | Entry expired', {
                    timestamp: latestRow.timestamp
                }, 'cache_expired');
                return null;
            }

            const result = {
                results: JSON.parse(latestRow.googleResults || '[]'),
                analysis: JSON.parse(latestRow.openaiAnalysis || '{}'),
                source: {
                    googleSearch: latestRow.googleSearchCache === 'Search',
                    openaiAnalysis: true  // Always true since we only store Search entries
                }
            };

            log('Cache → System | Cache hit', {
                query,
                category,
                timestamp: latestRow.timestamp
            }, 'cache_hit');

            return result;
        } catch (error) {
            log('Cache → System | Cache lookup failed', {
                error: error.message,
                stack: error.stack
            }, 'error');
            return null;
        }
    }

    async logSearchOperation(query, category, data) {
        if (!this.enabled) {
            log('Cache → System | Cache disabled, skipping log', null, 'cache_skip');
            return;
        }

        // Skip if query contains "_combined"
        if (query.includes('_combined')) {
            log('Cache → System | Skipping _combined query', { query }, 'cache_skip');
            return;
        }

        try {
            log('Cache → Sheets | Logging search operation', {
                query,
                category
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

            log('Cache → System | Search operation logged', {
                category,
                entriesAdded: 1
            }, 'cache_write_complete');
        } catch (error) {
            log('Cache → System | Log operation failed', {
                error: error.message,
                stack: error.stack
            }, 'error');
        }
    }
}

const instance = new GoogleSheetsCache();
module.exports = instance;
