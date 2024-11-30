import { google } from 'googleapis';
import crypto from 'crypto';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

// Initialize environment variables with the correct path
dotenv.config({ path: path.join(dirname(fileURLToPath(import.meta.url)), '../../.env') });

class GoogleSheetsCache {
    constructor() {
        console.log('GoogleSheetsCache: Starting initialization...');
        try {
            // Use the provided spreadsheet ID
            this.spreadsheetId = "1lzUS63kvhh_ICyeZhdDs46fk7l72r0ulZ5tLSKNjcJc";
            this.credentialsJson = process.env.GOOGLE_SHEETS_CREDENTIALS;

            console.log('Spreadsheet ID:', this.spreadsheetId);
            console.log('Environment variables status:', {
                credentialsJson: this.credentialsJson ? 'Present' : 'Missing'
            });

            if (!this.credentialsJson) {
                console.error('GoogleSheetsCache: Missing credentials');
                this.enabled = false;
                return;
            }

            try {
                // Initialize Google Sheets API
                const credentials = JSON.parse(this.credentialsJson);
                console.log('Credentials parsed successfully. Initializing GoogleAuth...');
                
                this.auth = new google.auth.GoogleAuth({
                    credentials,
                    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
                });
                
                this.enabled = true;
                console.log('GoogleSheetsCache: Successfully initialized auth');
            } catch (parseError) {
                console.error('GoogleSheetsCache: Error parsing credentials:', parseError);
                this.enabled = false;
            }
        } catch (error) {
            console.error('GoogleSheetsCache: Initialization error:', error);
            this.enabled = false;
        }
    }

    async initialize() {
        if (!this.enabled) {
            console.log('GoogleSheetsCache: Cache is disabled, skipping initialization');
            return;
        }
        try {
            this.sheets = google.sheets({ version: 'v4', auth: this.auth });
            
            // Check if Cache sheet exists, if not create it
            try {
                const response = await this.sheets.spreadsheets.get({
                    spreadsheetId: this.spreadsheetId
                });
                
                const cacheSheet = response.data.sheets.find(
                    sheet => sheet.properties.title === 'Cache'
                );
                
                if (!cacheSheet) {
                    console.log('Creating Cache sheet...');
                    await this.sheets.spreadsheets.batchUpdate({
                        spreadsheetId: this.spreadsheetId,
                        resource: {
                            requests: [{
                                addSheet: {
                                    properties: {
                                        title: 'Cache',
                                        gridProperties: {
                                            rowCount: 1000,
                                            columnCount: 7
                                        }
                                    }
                                }
                            }]
                        }
                    });
                    
                    // Add headers
                    await this.sheets.spreadsheets.values.update({
                        spreadsheetId: this.spreadsheetId,
                        range: 'Cache!A1:G1',
                        valueInputOption: 'RAW',
                        resource: {
                            values: [['Query', 'Category', 'Results', 'Timestamp (PST)', 'Hash', 'Google Search', 'OpenAI Analysis']]
                        }
                    });
                }
                
                console.log('GoogleSheetsCache: Cache sheet is ready');
            } catch (error) {
                console.error('Error checking/creating Cache sheet:', error);
                throw error;
            }
        } catch (error) {
            console.error('GoogleSheetsCache: Failed to initialize sheets API:', error);
            this.enabled = false;
        }
    }

    async get(query, category) {
        if (!this.enabled) return null;
        try {
            console.log('🔍 Checking cache for query:', query, 'category:', category);
            const hash = this._generateHash(query + category);
            
            // Preserve all columns including checkmarks (A:G)
            const response = await this.sheets.spreadsheets.values.get({
                spreadsheetId: this.spreadsheetId,
                range: 'Cache!A:G'  // A:G includes Query, Category, Results, Timestamp, Hash, Google✓, OpenAI✓
            });

            const rows = response.data.values || [];
            console.log(`📊 Found ${rows.length} total cache entries`);
            
            const cacheEntry = rows.find(row => row[4] === hash);

            if (cacheEntry) {
                const age = this._getEntryAge(cacheEntry[3]);
                console.log('✨ Cache entry found!', {
                    query: cacheEntry[0],
                    category: cacheEntry[1],
                    age: `${age} hours`,
                    googleSearch: cacheEntry[5] === '✓' ? 'Yes' : 'No',
                    openaiAnalysis: cacheEntry[6] === '✓' ? 'Yes' : 'No'
                });

                if (this._isEntryValid(cacheEntry[3])) {
                    console.log('✅ Cache entry is valid, returning cached results');
                    const results = JSON.parse(cacheEntry[2]);
                    results.source = {
                        googleSearch: cacheEntry[5] === '✓',
                        openaiAnalysis: cacheEntry[6] === '✓'
                    };
                    return results;
                } else {
                    console.log('⏰ Cache entry expired, will perform fresh search');
                    await this._removeExpiredEntry(hash);
                    return null;
                }
            } else {
                console.log('❌ No cache entry found for this query');
                return null;
            }
        } catch (error) {
            console.error('❌ Error checking cache:', error);
            return null;
        }
    }

    async set(query, category, results, source = 'google') {
        if (!this.enabled) return false;
        try {
            console.log('💾 Caching results:', {
                query,
                category,
                source,
                resultsSize: JSON.stringify(results).length
            });
            
            const hash = this._generateHash(query + category);
            const timestamp = new Date().toLocaleString("en-US", {
                timeZone: "America/Los_Angeles",
                year: 'numeric',
                month: '2-digit',
                day: '2-digit',
                hour: '2-digit',
                minute: '2-digit',
                second: '2-digit'
            });
            const isGoogleSearch = source === 'google' ? '✓' : '';
            const isOpenAIAnalysis = source === 'openai' ? '✓' : '';

            await this.sheets.spreadsheets.values.append({
                spreadsheetId: this.spreadsheetId,
                range: 'Cache!A:G',  // A:G includes Query, Category, Results, Timestamp, Hash, Google✓, OpenAI✓
                valueInputOption: 'RAW',
                insertDataOption: 'INSERT_ROWS',
                resource: {
                    values: [[query, category, JSON.stringify(results), timestamp, hash, isGoogleSearch, isOpenAIAnalysis]]
                }
            });

            console.log('✅ Successfully cached results:', {
                query,
                category,
                timestamp,
                source,
                checkmarks: {
                    googleSearch: isGoogleSearch,
                    openaiAnalysis: isOpenAIAnalysis
                }
            });
            return true;
        } catch (error) {
            console.error('❌ Error caching results:', error);
            return false;
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
        return age < 24; // Cache entries are valid for 24 hours
    }

    async _removeExpiredEntry(hash) {
        try {
            // Implementation for removing expired entries
            console.log('Removing expired entry with hash:', hash);
            // Note: Actual implementation would delete the row with matching hash
        } catch (error) {
            console.error('Error removing expired entry:', error);
        }
    }
}

export { GoogleSheetsCache };
