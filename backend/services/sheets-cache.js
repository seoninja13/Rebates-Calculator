import { google } from 'googleapis';
import crypto from 'crypto';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

// Initialize environment variables with the correct path
dotenv.config({ path: path.join(dirname(fileURLToPath(import.meta.url)), '../.env') });

export class GoogleSheetsCache {
    constructor() {
        console.log('Initializing Google Sheets Cache...');
        try {
            this.spreadsheetId = process.env.GOOGLE_SHEETS_SPREADSHEET_ID;
            this.credentialsJson = process.env.GOOGLE_SHEETS_CREDENTIALS;

            console.log('Environment variables loaded:');
            console.log('GOOGLE_SHEETS_SPREADSHEET_ID:', this.spreadsheetId ? 'Found' : 'Not found');
            console.log('GOOGLE_SHEETS_CREDENTIALS:', this.credentialsJson ? 'Found' : 'Not found');

            // Make Google Sheets cache optional
            if (!this.spreadsheetId || !this.credentialsJson) {
                console.log('Google Sheets cache disabled: Missing required environment variables');
                this.enabled = false;
                return;
            }

            // Initialize Google Sheets API
            const credentials = JSON.parse(this.credentialsJson);
            this.auth = new google.auth.GoogleAuth({
                credentials,
                scopes: ['https://www.googleapis.com/auth/spreadsheets'],
            });
            this.enabled = true;
            console.log('Google Sheets API initialized successfully');
        } catch (error) {
            console.error('Error initializing Google Sheets cache:', error);
            this.enabled = false;
        }
    }

    async initialize() {
        if (!this.enabled) {
            console.log('Google Sheets cache is disabled, skipping initialization');
            return;
        }
        try {
            this.sheets = google.sheets({ version: 'v4', auth: this.auth });
            console.log('Google Sheets cache initialized successfully');
        } catch (error) {
            console.error('Failed to initialize Google Sheets cache:', error);
            this.enabled = false;
        }
    }

    async get(query, category) {
        if (!this.enabled) return null;
        try {
            console.log('🔍 Checking cache for query:', query, 'category:', category);
            const hash = this._generateHash(query + category);
            
            const response = await this.sheets.spreadsheets.values.get({
                spreadsheetId: this.spreadsheetId,
                range: 'Cache!A:E'
            });

            const rows = response.data.values || [];
            const cacheEntry = rows.find(row => row[4] === hash);

            if (cacheEntry) {
                console.log('✨ Cache entry found! Age:', this._getEntryAge(cacheEntry[3]), 'hours');
                // Check if cache entry is still valid
                if (this._isEntryValid(cacheEntry[3])) {
                    console.log('✅ Cache entry is valid, returning cached results');
                    return JSON.parse(cacheEntry[2]);
                } else {
                    console.log('⏰ Cache entry expired, will perform fresh search');
                    return null;
                }
            } else {
                console.log('❌ No cache entry found for this query');
                return null;
            }
        } catch (error) {
            console.error('❌ Error accessing cache:', error);
            return null;
        }
    }

    async set(query, category, results) {
        if (!this.enabled) return false;
        try {
            console.log('💾 Caching results for query:', query, 'category:', category);
            const hash = this._generateHash(query + category);
            const timestamp = new Date().toISOString();

            await this.sheets.spreadsheets.values.append({
                spreadsheetId: this.spreadsheetId,
                range: 'Cache!A:E',
                valueInputOption: 'RAW',
                insertDataOption: 'INSERT_ROWS',
                resource: {
                    values: [[query, category, JSON.stringify(results), timestamp, hash]]
                }
            });

            console.log('✅ Successfully cached results');
            return true;
        } catch (error) {
            console.error('❌ Error caching results:', error);
            return false;
        }
    }

    _isEntryValid(timestamp) {
        const entryAge = this._getEntryAge(timestamp);
        const isValid = entryAge < 336; // 14 days in hours
        console.log(`🕒 Cache entry age: ${entryAge} hours, Valid: ${isValid}`);
        return isValid;
    }

    _getEntryAge(timestamp) {
        const entryDate = new Date(timestamp);
        const now = new Date();
        const ageInHours = (now - entryDate) / (1000 * 60 * 60);
        return Math.round(ageInHours * 10) / 10; // Round to 1 decimal place
    }

    async _removeExpiredEntry(hash) {
        try {
            console.log('Removing expired entry with hash:', hash);
            const range = 'Cache!A:E';
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
