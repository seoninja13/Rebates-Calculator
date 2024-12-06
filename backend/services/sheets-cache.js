import { google } from 'googleapis';
import crypto from 'crypto';

export class GoogleSheetsCache {
    constructor() {
        console.log('Cache → Constructor | Initializing with:', {
            spreadsheetId: process.env.GOOGLE_SHEETS_SPREADSHEET_ID ? '✓' : '✗',
            credentials: process.env.GOOGLE_SHEETS_CREDENTIALS ? '✓' : '✗'
        });
        this.spreadsheetId = process.env.GOOGLE_SHEETS_SPREADSHEET_ID;
        this.enabled = !!this.spreadsheetId;
        console.log('Cache → Constructor | Status:', {
            enabled: this.enabled
        });
    }

    async initialize() {
        if (!this.enabled) {
            console.log('Cache → Initialize | Cache disabled');
            return;
        }

        try {
            console.log('Cache → Initialize | Setting up Google auth');
            const auth = new google.auth.GoogleAuth({
                credentials: JSON.parse(process.env.GOOGLE_SHEETS_CREDENTIALS),
                scopes: ['https://www.googleapis.com/auth/spreadsheets']
            });

            console.log('Cache → Initialize | Getting auth client');
            const authClient = await auth.getClient();
            
            console.log('Cache → Initialize | Creating sheets client');
            this.sheets = google.sheets({ version: 'v4', auth: authClient });
            
            // Test the connection
            console.log('Cache → Initialize | Testing connection');
            const test = await this.sheets.spreadsheets.get({
                spreadsheetId: this.spreadsheetId
            });
            
            console.log('Cache → Initialize | Connection successful:', {
                spreadsheetTitle: test.data.properties.title
            });
        } catch (error) {
            console.error('Cache → Initialize | Error:', {
                message: error.message,
                stack: error.stack
            });
            throw error;
        }
    }

    // Generate a unique hash for the query and category
    localGenerateHash(query, category) {
        return crypto
            .createHash('md5')
            .update(`${query}|${category}`)
            .digest('hex');
    }

    // Convert to PST timestamp
    localGetPSTTimestamp() {
        return new Date().toLocaleString('en-US', {
            timeZone: 'America/Los_Angeles'
        });
    }

    // Log a new search to the cache
    async localLogSearch(data) {
        if (!this.enabled) return;

        const hash = this.localGenerateHash(data.query, data.category);
        const timestamp = this.localGetPSTTimestamp();

        try {
            await this.appendRow({
                query: data.query,
                category: data.category,
                googleResults: JSON.stringify(data.googleResults),
                openaiAnalysis: JSON.stringify(data.openaiAnalysis),
                timestamp: timestamp,
                hash: hash,
                googleSearchCache: data.isGoogleCached ? 'Cache' : 'Search',
                openaiSearchCache: data.isOpenAICached ? 'Cache' : 'Search'
            });

            console.log('Cache → Sheets | Search logged:', {
                query: data.query,
                category: data.category,
                timestamp: timestamp,
                googleCache: data.isGoogleCached ? 'Cache' : 'Search',
                openaiCache: data.isOpenAICached ? 'Cache' : 'Search'
            });

        } catch (error) {
            console.error('Cache → Sheets | Log failed:', error);
            throw error;
        }
    }

    // Append a row to the cache sheet
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
                        data.openaiSearchCache || 'Search'
                    ]]
                }
            });

            return response;
        } catch (error) {
            console.error('Cache → Sheets | Row append failed:', error);
            throw error;
        }
    }

    // Check if results exist in cache
    async checkCache(query, category) {
        if (!this.enabled) return null;

        const hash = this.localGenerateHash(query, category);

        try {
            const response = await this.sheets.spreadsheets.values.get({
                spreadsheetId: this.spreadsheetId,
                range: 'Cache!A:H'
            });

            const rows = response.data.values || [];
            // Skip header row and find matching hash
            const match = rows.slice(1).find(row => row[5] === hash);

            if (match) {
                return {
                    found: true,
                    googleResults: JSON.parse(match[2] || 'null'),
                    openaiAnalysis: JSON.parse(match[3] || 'null'),
                    timestamp: match[4],
                    hash: match[5]
                };
            }

            return { found: false };

        } catch (error) {
            console.error('Cache → Sheets | Cache check failed:', error);
            return { found: false };
        }
    }
}
