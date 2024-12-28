import { google } from 'googleapis';
import crypto from 'crypto';
import { sendLogToClient, logError, logAPIResponse } from '../../netlify/functions/services/logging-utils.mjs';
import { validateCacheEntry } from '../../netlify/functions/services/validation-utils.mjs';

export class GoogleSheetsCache {
    constructor() {
        sendLogToClient('Cache → Constructor | Initializing', {
            spreadsheetId: process.env.GOOGLE_SHEETS_SPREADSHEET_ID ? '✓' : '✗',
            credentials: process.env.GOOGLE_SHEETS_CREDENTIALS ? '✓' : '✗'
        });
        
        this.spreadsheetId = process.env.GOOGLE_SHEETS_SPREADSHEET_ID;
        this.enabled = !!this.spreadsheetId;
        
        sendLogToClient('Cache → Constructor | Status', {
            enabled: this.enabled
        });
    }

    async initialize() {
        if (!this.enabled) {
            sendLogToClient('Cache → Initialize | Cache disabled');
            return false;
        }

        try {
            sendLogToClient('Cache → Initialize | Setting up Google auth');
            const auth = new google.auth.GoogleAuth({
                credentials: JSON.parse(process.env.GOOGLE_SHEETS_CREDENTIALS),
                scopes: ['https://www.googleapis.com/auth/spreadsheets']
            });

            sendLogToClient('Cache → Initialize | Getting auth client');
            const authClient = await auth.getClient();
            
            sendLogToClient('Cache → Initialize | Creating sheets client');
            this.sheets = google.sheets({ version: 'v4', auth: authClient });
            
            // Test the connection
            const test = await this.sheets.spreadsheets.get({
                spreadsheetId: this.spreadsheetId
            });
            
            sendLogToClient('Cache → Initialize | Connection successful', {
                spreadsheetTitle: test.data.properties.title
            });
            
            return true;
        } catch (error) {
            logError('Cache Initialize', error);
            return false;
        }
    }

    // Utility Methods
    generateHash(query, level) {
        return crypto
            .createHash('md5')
            .update(`${query}|${level}`)
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
    async getSheetRows(range = 'Cache!A:H') {
        try {
            const response = await this.sheets.spreadsheets.values.get({
                spreadsheetId: this.spreadsheetId,
                range
            });
            return response.data.values || [];
        } catch (error) {
            logError('Get Sheet Rows', error);
            throw error;
        }
    }

    async updateRow(range, values) {
        try {
            await this.sheets.spreadsheets.values.update({
                spreadsheetId: this.spreadsheetId,
                range,
                valueInputOption: 'RAW',
                resource: { values: [values] }
            });
        } catch (error) {
            logError('Update Row', error);
            throw error;
        }
    }

    async appendNewRow(values) {
        try {
            await this.sheets.spreadsheets.values.append({
                spreadsheetId: this.spreadsheetId,
                range: 'Cache!A:H',
                valueInputOption: 'RAW',
                insertDataOption: 'INSERT_ROWS',
                resource: { values: [values] }
            });
        } catch (error) {
            logError('Append Row', error);
            throw error;
        }
    }

    // Core Cache Operations
    async logSearch(data) {
        if (!this.enabled) return;

        const formattedQuery = this.normalizeQuery(data.query);
        const hash = this.generateHash(formattedQuery, data.level);
        const timestamp = this.getPSTTimestamp();

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
                row[0]?.toLowerCase() === formattedQuery.toLowerCase() && 
                row[1] === data.level
            );

            if (existingRowIndex > 0) {
                await this.updateRow(`Cache!A${existingRowIndex + 1}:H${existingRowIndex + 1}`, rowValues);
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

        try {
            const rows = await this.getSheetRows();
            
            const match = rows.slice(1).find(row => 
                row[5] === hash && 
                row[0].toLowerCase().trim() === normalizedQuery.toLowerCase() &&
                row[1] === level
            );

            if (match) {
                try {
                    const cacheEntry = {
                        found: true,
                        googleResults: JSON.parse(match[2] || 'null'),
                        openaiAnalysis: JSON.parse(match[3] || 'null'),
                        timestamp: match[4],
                        hash: match[5]
                    };

                    sendLogToClient('Cache → Hit', {
                        query: normalizedQuery,
                        level,
                        hash
                    });

                    return cacheEntry;
                } catch (parseError) {
                    logError('Parse Cache Entry', parseError);
                    return { found: false };
                }
            }

            sendLogToClient('Cache → Miss', {
                query: normalizedQuery,
                level,
                hash
            });

            return { found: false };
        } catch (error) {
            logError('Check Cache', error);
            return { found: false };
        }
    }
}
