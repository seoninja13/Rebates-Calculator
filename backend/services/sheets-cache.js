import { google } from 'googleapis';
import crypto from 'crypto';
import dotenv from 'dotenv';

dotenv.config();

export class GoogleSheetsCache {
    constructor() {
        console.log('Initializing Google Sheets Cache...');
        try {
            console.log('Environment variables:');
            console.log('GOOGLE_SHEETS_SPREADSHEET_ID:', process.env.GOOGLE_SHEETS_SPREADSHEET_ID);
            console.log('Raw credentials length:', process.env.GOOGLE_SHEETS_CREDENTIALS?.length);

            this.spreadsheetId = process.env.GOOGLE_SHEETS_SPREADSHEET_ID;
            this.credentialsJson = process.env.GOOGLE_SHEETS_CREDENTIALS;

            if (!this.spreadsheetId) {
                throw new Error('GOOGLE_SHEETS_SPREADSHEET_ID not found in environment variables');
            }
            if (!this.credentialsJson) {
                throw new Error('GOOGLE_SHEETS_CREDENTIALS not found in environment variables');
            }

            // Initialize Google Sheets API
            const credentials = JSON.parse(this.credentialsJson);
            const auth = new google.auth.GoogleAuth({
                credentials,
                scopes: ['https://www.googleapis.com/auth/spreadsheets'],
            });

            this.sheets = google.sheets({ version: 'v4', auth });
            this.TTL = 14 * 24 * 60 * 60 * 1000; // 14 days in milliseconds

            console.log('Successfully initialized Google Sheets API');
            console.log('Constructor completed. Spreadsheet ID:', this.spreadsheetId);
        } catch (error) {
            console.error('Error in constructor:', error);
            throw error;
        }
    }

    async initialize() {
        try {
            console.log('Starting sheet initialization...');
            // Check if the sheet exists
            const response = await this.sheets.spreadsheets.get({
                spreadsheetId: this.spreadsheetId
            });

            if (!response.data.sheets.some(sheet => sheet.properties.title === 'Cache')) {
                // Create the Cache sheet if it doesn't exist
                await this.sheets.spreadsheets.batchUpdate({
                    spreadsheetId: this.spreadsheetId,
                    resource: {
                        requests: [{
                            addSheet: {
                                properties: {
                                    title: 'Cache',
                                    gridProperties: {
                                        rowCount: 1000,
                                        columnCount: 5
                                    }
                                }
                            }
                        }]
                    }
                });

                // Add headers
                await this.sheets.spreadsheets.values.update({
                    spreadsheetId: this.spreadsheetId,
                    range: 'Cache!A1:E1',
                    valueInputOption: 'RAW',
                    resource: {
                        values: [['Query', 'Category', 'Results', 'Timestamp', 'Hash']]
                    }
                });
            }

            console.log('Sheet initialization completed successfully');
        } catch (error) {
            console.error('Error initializing sheet:', error);
            throw error;
        }
    }

    async get(query, category) {
        try {
            console.log('Getting cache for query:', query, 'category:', category);
            const hash = this._generateHash(query + category);
            
            const response = await this.sheets.spreadsheets.values.get({
                spreadsheetId: this.spreadsheetId,
                range: 'Cache!A2:E',
            });

            const rows = response.data.values || [];
            const row = rows.find(r => r[4] === hash); // Check hash (column E)
            
            if (row) {
                const [storedQuery, storedCategory, resultsStr, timestamp] = row;
                const age = Date.now() - new Date(timestamp).getTime();
                
                // Check if cache is still valid
                if (age < this.TTL) {
                    const results = JSON.parse(resultsStr);
                    // Verify that we have valid program data
                    if (results && results.programs && results.programs.length > 0) {
                        console.log('Cache hit, returning data');
                        return results;
                    } else {
                        console.log('Cache hit but no valid programs, forcing refresh');
                        return null;
                    }
                } else {
                    console.log('Cache expired, forcing refresh');
                    return null;
                }
            }
            
            console.log('Cache miss');
            return null;
        } catch (error) {
            console.error('Error getting from cache:', error);
            return null;
        }
    }

    async set(query, category, results) {
        try {
            console.log('Setting cache for query:', query, 'category:', category);
            const hash = this._generateHash(query, category);
            const timestamp = new Date().toISOString();
            
            // First, remove any existing entries for this query
            await this._removeExpiredEntry(hash);

            // Append new cache entry
            const response = await this.sheets.spreadsheets.values.append({
                spreadsheetId: this.spreadsheetId,
                range: 'Cache!A2:E',
                valueInputOption: 'RAW',
                insertDataOption: 'INSERT_ROWS',
                requestBody: {
                    values: [[
                        query,
                        category,
                        JSON.stringify(results),
                        timestamp,
                        hash
                    ]]
                }
            });

            console.log('Cache entry added successfully:', response.data);
            return true;
        } catch (error) {
            console.error('Error writing to cache:', error);
            return false;
        }
    }

    async _removeExpiredEntry(hash) {
        try {
            console.log('Removing expired entry with hash:', hash);
            const range = 'Cache!A2:E';
            const response = await this.sheets.spreadsheets.values.get({
                spreadsheetId: this.spreadsheetId,
                range,
            });

            const rows = response.data.values || [];
            const rowIndex = rows.findIndex(row => row[4] === hash);

            if (rowIndex !== -1) {
                console.log('Found expired entry at row:', rowIndex + 2);
                // Delete the row using batchUpdate
                await this.sheets.spreadsheets.batchUpdate({
                    spreadsheetId: this.spreadsheetId,
                    requestBody: {
                        requests: [{
                            deleteDimension: {
                                range: {
                                    sheetId: 0, // Assuming Cache is the first sheet
                                    dimension: 'ROWS',
                                    startIndex: rowIndex + 1, // +1 because of headers
                                    endIndex: rowIndex + 2
                                }
                            }
                        }]
                    }
                });
                console.log('Expired entry removed successfully');
            } else {
                console.log('No expired entry found to remove');
            }
        } catch (error) {
            console.error('Error removing expired entry:', error);
        }
    }

    _generateHash(query, category) {
        // Simple hash function for query+category
        let str = `${query}-${category}`;
        let hash = 0;
        for (let i = 0; i < str.length; i++) {
            const char = str.charCodeAt(i);
            hash = ((hash << 5) - hash) + char;
            hash = hash & hash;
        }
        return hash.toString(36);
    }
}

export default GoogleSheetsCache;
