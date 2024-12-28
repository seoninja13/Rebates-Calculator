import { google } from 'googleapis';

export class GoogleSheetsInitializer {
    constructor(cacheInstance) {
        this.cache = cacheInstance;
    }

    async initialize() {
        console.group('🔍 CACHE INITIALIZATION');
        
        if (!this.cache.enabled) {
            console.error('Cache Disabled: spreadsheetId missing');
            console.groupEnd();
            return false;
        }

        if (this.cache.initialized) {
            console.log('Already Initialized');
            console.groupEnd();
            return true;
        }

        try {
            await this.setupGoogleAuth();
            await this.testConnection();
            await this.cache.structure.ensureStructure();
            
            this.cache.initialized = true;
            console.log('Cache Initialization Complete');
            console.groupEnd();
            return true;
        } catch (error) {
            console.error('CACHE INITIALIZATION FAILED:', error);
            console.groupEnd();
            throw error;
        }
    }

    async setupGoogleAuth() {
        if (!process.env.GOOGLE_SHEETS_CREDENTIALS) {
            throw new Error('GOOGLE_SHEETS_CREDENTIALS missing');
        }

        const credentials = JSON.parse(process.env.GOOGLE_SHEETS_CREDENTIALS);
        const auth = new google.auth.GoogleAuth({
            credentials,
            scopes: ['https://www.googleapis.com/auth/spreadsheets']
        });

        const authClient = await auth.getClient();
        this.cache.sheets = google.sheets({ version: 'v4', auth: authClient });
    }

    async testConnection() {
        const test = await this.cache.sheets.spreadsheets.get({
            spreadsheetId: this.cache.spreadsheetId
        });
        console.log('Spreadsheet Connection Successful:', test.data.properties.title);
    }
}
