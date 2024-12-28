import { google } from 'googleapis';
import { GoogleSheetsInitializer } from './GoogleSheetsInitializer.mjs';
import { GoogleSheetsOperations } from './GoogleSheetsOperations.mjs';
import { GoogleSheetsStructure } from './GoogleSheetsStructure.mjs';

/**
 * Core Google Sheets Cache Class
 * Manages cache operations using Google Sheets as storage
 */
export class GoogleSheetsCache {
    constructor() {
        this.spreadsheetId = process.env.GOOGLE_SHEETS_SPREADSHEET_ID;
        this.enabled = !!this.spreadsheetId;
        this.initialized = false;
        
        // Initialize components
        this.initializer = new GoogleSheetsInitializer(this);
        this.operations = new GoogleSheetsOperations(this);
        this.structure = new GoogleSheetsStructure(this);
    }

    /**
     * Initialize the cache service
     */
    async initialize() {
        return this.initializer.initialize();
    }

    /**
     * Get cached data
     */
    async netlifyGetCache(level, county, category) {
        return this.operations.getCache(level, county, category);
    }

    /**
     * Set cache data
     */
    async netlifySetCache(level, county, category, data) {
        return this.operations.setCache(level, county, category, data);
    }

    /**
     * Normalize level string
     */
    normalizeLevel(level) {
        return this.operations.normalizeLevel(level);
    }

    /**
     * Normalize county string
     */
    normalizeCounty(county) {
        return this.operations.normalizeCounty(county);
    }
}
