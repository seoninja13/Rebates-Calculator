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
            
            // Handle credentials that may be string or object
            let credentials = process.env.GOOGLE_SHEETS_CREDENTIALS;
            if (typeof credentials === 'string') {
                try {
                    credentials = JSON.parse(credentials);
                } catch (parseError) {
                    logError('Parse Credentials', parseError);
                    return false;
                }
            }

            const auth = new google.auth.GoogleAuth({
                credentials,
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
        if (!this.enabled || !query) {
            return { found: false };
        }

        try {
            // Generate hash and log details
            const normalizedQuery = query.toLowerCase().trim();
            const normalizedLevel = level.toLowerCase().trim();
            const hashInput = `${normalizedQuery}|${normalizedLevel}`;
            const hash = crypto.createHash('md5').update(hashInput).digest('hex');
            
            sendLogToClient('Cache → Hash Generation', {
                originalQuery: query,
                originalLevel: level,
                normalizedQuery,
                normalizedLevel,
                hashInput,
                generatedHash: hash
            });

            // Get all cache data
            const response = await this.sheets.spreadsheets.values.get({
                spreadsheetId: this.spreadsheetId,
                range: 'Cache!A:H'  // Get all columns
            });

            const rows = response.data.values || [];
            
            // Find matching row by query and level (columns A and B)
            const match = rows.find(row => 
                row[0]?.toLowerCase().trim() === normalizedQuery && 
                row[1]?.toLowerCase().trim() === normalizedLevel
            );
            
            sendLogToClient('Cache → Lookup Result', {
                queryFound: !!match,
                storedHash: match ? match[5] : null,  // Hash is in column F (index 5)
                generatedHash: hash,
                hashesMatch: match ? match[5] === hash : false,
                totalCacheEntries: rows.length
            });

            if (!match) {
                return { found: false };
            }

            return {
                found: true,
                hash: match[5],  // Hash from column F
                query: match[0], // Original query from column A
                level: match[1], // Level from column B
                data: {
                    googleResults: JSON.parse(match[2] || '[]'),     // Google results from column C
                    openaiAnalysis: JSON.parse(match[3] || '{}'),    // OpenAI analysis from column D
                    timestamp: match[4],                             // Timestamp from column E
                    googleSearchType: match[6],                      // Google search type from column G
                    openaiSearchType: match[7]                       // OpenAI search type from column H
                }
            };

        } catch (error) {
            logError('Cache Check', error);
            return { found: false };
        }
    }
}
