import { google } from 'googleapis';
import crypto from 'crypto';
import fetch from 'node-fetch';

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
            if (!process.env.GOOGLE_SHEETS_SPREADSHEET_ID || !process.env.GOOGLE_SHEETS_CREDENTIALS) {
                throw new Error('Missing environment variables. Please set GOOGLE_SHEETS_SPREADSHEET_ID and GOOGLE_SHEETS_CREDENTIALS');
            }

            log('Cache → System | Environment variables present', {
                hasSpreadsheetId: !!process.env.GOOGLE_SHEETS_SPREADSHEET_ID,
                hasCredentials: !!process.env.GOOGLE_SHEETS_CREDENTIALS
            }, 'debug');

            this.spreadsheetId = process.env.GOOGLE_SHEETS_SPREADSHEET_ID;
            const credentials = JSON.parse(process.env.GOOGLE_SHEETS_CREDENTIALS);
            this.auth = new google.auth.GoogleAuth({
                credentials,
                scopes: ['https://www.googleapis.com/auth/spreadsheets']
            });

            this.sheets = google.sheets({ version: 'v4', auth: this.auth });
            this.enabled = true;
            log('Cache → System | Cache service initialized', {
                enabled: this.enabled,
                hasSheets: !!this.sheets,
                hasAuth: !!this.auth
            }, 'debug');
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
            log('Cache → System | Checking spreadsheet', {
                spreadsheetId: this.spreadsheetId
            }, 'debug');

            const response = await this.sheets.spreadsheets.get({
                spreadsheetId: this.spreadsheetId
            });

            const sheets = response.data.sheets;
            log('Cache → System | Found sheets', {
                sheetCount: sheets.length,
                sheetNames: sheets.map(s => s.properties.title)
            }, 'debug');

            const cacheSheet = sheets.find(sheet => sheet.properties.title === 'Cache');

            if (!cacheSheet) {
                log('Cache → Sheets | Creating cache sheet', {
                    spreadsheetId: this.spreadsheetId
                }, 'sheets_operation');
                await this._createCacheSheet();
            } else {
                log('Cache → System | Cache sheet exists', {
                    sheetId: cacheSheet.properties.sheetId,
                    title: cacheSheet.properties.title
                }, 'debug');
            }

            log('Cache → System | Sheet initialization complete', null, 'system_ready');
            return true;
        } catch (error) {
            log('Cache → System | Sheet initialization failed', {
                error: error.message,
                stack: error.stack,
                spreadsheetId: this.spreadsheetId
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
            // Skip if OpenAI analysis is empty or invalid JSON
            try {
                const analysis = JSON.parse(data.openaiAnalysis);
                if (!analysis || Object.keys(analysis).length === 0) {
                    log('Cache → System | Invalid analysis data', {
                        analysis,
                        openaiAnalysis: data.openaiAnalysis
                    }, 'cache_skip');
                    return null;
                }
            } catch (e) {
                log('Cache → System | Failed to parse analysis', {
                    error: e.message,
                    openaiAnalysis: data.openaiAnalysis
                }, 'cache_skip');
                return null;
            }

            log('Cache → System | Appending row', {
                spreadsheetId: this.spreadsheetId,
                range: 'Cache!A:H',
                query: data.query,
                category: data.category,
                timestamp: data.timestamp,
                hasSheets: !!this.sheets,
                hasAuth: !!this.auth
            }, 'debug');

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
                        'Search'
                    ]]
                }
            });

            log('Cache → System | Row appended', {
                updatedRange: response.data.updates.updatedRange,
                updatedRows: response.data.updates.updatedRows,
                spreadsheetId: this.spreadsheetId
            }, 'debug');

            return response;
        } catch (error) {
            log('Cache → System | Row append failed', {
                error: error.message,
                stack: error.stack,
                spreadsheetId: this.spreadsheetId,
                data
            }, 'error');
            throw error;
        }
    }

    _generateHash(text) {
        // Normalize the text by removing all whitespace and converting to lowercase
        const normalizedText = text.trim().toLowerCase().replace(/\s+/g, '');
        const hash = crypto.createHash('md5').update(normalizedText).digest('hex');
        
        log('Cache → System | Hash Generation', {
            originalText: text,
            normalizedText,
            hash
        }, 'debug');
        
        return hash;
    }

    _isEntryValid(timestamp) {
        const entryDate = new Date(timestamp);
        const now = new Date();
        const ageInHours = (now - entryDate) / (1000 * 60 * 60);
        return ageInHours < 336; // 14 days
    }

    async get(query, category) {
        if (!this.enabled) {
            log('Cache → System | Cache disabled', null, 'cache_skip');
            return null;
        }

        try {
            const hash = this._generateHash(`${category}:${query}`);
            
            log('Cache → System | Cache Lookup Debug', {
                input: {
                    query,
                    category,
                    lookupKey: `${category}:${query}`,
                    hash
                }
            }, 'debug');

            const rows = await this.getRows();
            
            // Log all rows for debugging
            log('Cache → System | All Cache Rows', {
                rowCount: rows ? rows.length : 0,
                rows: rows ? rows.map(row => ({
                    query: row.query,
                    category: row.category,
                    hash: row.hash,
                    timestamp: row.timestamp
                })) : []
            }, 'debug');

            if (!rows || rows.length === 0) {
                log('Cache → System | Cache empty', null, 'cache_miss');
                return null;
            }

            const matchingRows = rows.filter(row => row.hash === hash);
            
            log('Cache → System | Hash Comparison', {
                lookingFor: hash,
                foundMatches: matchingRows.length,
                matches: matchingRows.map(row => ({
                    query: row.query,
                    category: row.category,
                    hash: row.hash,
                    timestamp: row.timestamp
                }))
            }, 'debug');

            if (matchingRows.length === 0) {
                log('Cache → System | No matching entry', {
                    searchHash: hash,
                    availableHashes: rows.map(row => row.hash)
                }, 'cache_miss');
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
                    openaiAnalysis: true
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
            log('Cache → System | Cache disabled', null, 'cache_skip');
            return;
        }

        try {
            log('Cache → System | Starting cache operation', {
                query,
                category,
                hasResults: !!data.results,
                resultsCount: data.results?.length || 0,
                hasAnalysis: !!data.analysis,
                analysisPrograms: data.analysis?.programs?.length || 0,
                enabled: this.enabled,
                spreadsheetId: this.spreadsheetId
            }, 'debug');

            const hash = this._generateHash(`${category}:${query}`);
            const timestamp = new Date().toLocaleString("en-US", {
                timeZone: "America/Los_Angeles"
            });

            const rowData = {
                query,
                category,
                googleResults: JSON.stringify(data.results || []),
                openaiAnalysis: JSON.stringify(data.analysis || {}),
                timestamp,
                hash,
                googleSearchCache: data.source.googleSearch ? 'Search' : 'Cache',
                openaiSearchCache: 'Search'
            };

            log('Cache → System | Prepared row data', {
                query,
                category,
                hash,
                timestamp,
                googleResultsLength: rowData.googleResults.length,
                openaiAnalysisLength: rowData.openaiAnalysis.length
            }, 'debug');

            // Single row with both Google results and OpenAI analysis
            const appendResult = await this.appendRow(rowData);
            
            log('Cache → System | Append result', {
                success: !!appendResult,
                updatedRange: appendResult?.data?.updates?.updatedRange,
                updatedRows: appendResult?.data?.updates?.updatedRows,
                spreadsheetId: this.spreadsheetId
            }, 'debug');

            return appendResult;
        } catch (error) {
            log('Cache → System | Cache operation failed', {
                error: error.message,
                stack: error.stack,
                query,
                category,
                spreadsheetId: this.spreadsheetId
            }, 'error');
            throw error;
        }
    }
}

// Create and export a single instance
const instance = new GoogleSheetsCache();
export { GoogleSheetsCache };
export default instance;
