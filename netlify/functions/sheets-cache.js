import { google } from 'googleapis';
import crypto from 'crypto';

export class GoogleSheetsCache {
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
                    
                    await this.sheets.spreadsheets.values.update({
                        spreadsheetId: this.spreadsheetId,
                        range: 'Cache!A1:G1',
                        valueInputOption: 'RAW',
                        resource: {
                            values: [['Query', 'Category', 'Results', 'Timestamp (PST)', 'Hash', 'Google Search-Cache', 'OpenAI Search-Cache']]
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

    convertToPST(timestamp) {
        return new Date(timestamp).toLocaleString('en-US', {
            timeZone: 'America/Los_Angeles',
            year: 'numeric',
            month: '2-digit',
            day: '2-digit',
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit',
            hour12: true
        });
    }

    generateHash(query, category) {
        return crypto.createHash('md5')
            .update(`${query}-${category}`)
            .digest('hex')
            .slice(0, 8);
    }

    async getRows() {
        try {
            const response = await this.sheets.spreadsheets.values.get({
                spreadsheetId: this.spreadsheetId,
                range: 'Cache!A:G'
            });

            const rows = response.data.values || [];
            if (rows.length <= 1) {
                console.log('GoogleSheetsCache: Cache is empty');
                return null;
            }

            return rows.slice(1).map(row => ({
                query: row[0],
                category: row[1],
                results: row[2],
                timestamp: row[3],
                hash: row[4],
                googleSearchCache: row[5],
                openaiSearchCache: row[6]
            }));
        } catch (error) {
            console.error('Error getting rows:', error);
            return null;
        }
    }

    async appendRow(row) {
        try {
            await this.sheets.spreadsheets.values.append({
                spreadsheetId: this.spreadsheetId,
                range: 'Cache!A:G',
                valueInputOption: 'RAW',
                resource: {
                    values: [[
                        row.query,
                        row.category,
                        row.results,
                        row.timestamp,
                        row.hash,
                        row.googleSearchCache,
                        row.openaiSearchCache
                    ]]
                }
            });
        } catch (error) {
            console.error('Error appending row:', error);
        }
    }

    async getCacheEntry(query, category) {
        try {
            // Clean and normalize the query
            const normalizedQuery = query.toLowerCase().trim();
            const hash = this.generateHash(normalizedQuery, category);
            
            console.log('🔍 Looking for cache entry:', {
                query: normalizedQuery,
                category,
                hash
            });

            // Get all rows from the sheet
            const rows = await this.getRows();
            if (!rows || rows.length === 0) {
                console.log('❌ No rows found in cache');
                return null;
            }

            // Find all matching rows by hash
            const matchingRows = rows.filter(row => row.hash === hash);
            if (matchingRows.length === 0) {
                console.log('❌ No matching cache entries found');
                return null;
            }

            // Get the latest timestamp
            const latestTimestamp = Math.max(...matchingRows.map(row => new Date(row.timestamp)));
            
            // Check if cache is still valid (14 days)
            const cacheAge = new Date() - latestTimestamp;
            const cacheValidDays = 14;
            if (cacheAge > cacheValidDays * 24 * 60 * 60 * 1000) {
                console.log(`❌ Cache entry expired (older than ${cacheValidDays} days)`);
                return null;
            }

            // Get the most recent entries
            const latestEntries = matchingRows.filter(row => {
                const rowDate = new Date(row.timestamp);
                return Math.abs(rowDate - latestTimestamp) < 1000; // within 1 second
            });

            // Find the search results and analysis results
            const searchEntry = latestEntries.find(row => 
                row.googleSearchCache === 'Search' || row.googleSearchCache === 'Cache'
            );
            const analysisEntry = latestEntries.find(row => {
                // Only consider entries with valid analysis results
                if (row.openaiSearchCache !== 'Search' && row.openaiSearchCache !== 'Cache') {
                    return false;
                }
                try {
                    const results = JSON.parse(row.results);
                    return results && results.programs && results.programs.length > 0;
                } catch (e) {
                    console.warn('Invalid analysis results in cache:', e);
                    return false;
                }
            });

            if (!searchEntry || !analysisEntry) {
                console.log('❌ No valid cache entries found');
                return null;
            }

            console.log('✅ Found valid cache entry:', {
                google: searchEntry.googleSearchCache,
                openai: analysisEntry.openaiSearchCache,
                timestamp: new Date(latestTimestamp).toISOString()
            });

            return {
                searchResults: JSON.parse(searchEntry.results),
                analysis: JSON.parse(analysisEntry.results)
            };
        } catch (error) {
            console.error('Error getting cache entry:', error);
            return null;
        }
    }

    async logSearchOperation(query, category, searchResults, analysisResults, cacheStatus) {
        // Always try to log, even if cache is disabled
        const hash = this.generateHash(query, category);
        const timestamp = new Date().toLocaleString('en-US', { timeZone: 'America/Los_Angeles' });
        
        console.log(`📝 Logging search operation for ${category}:`, {
            query,
            hash,
            cacheStatus
        });

        // Log Google Search results
        if (searchResults) {
            await this.appendRow({
                query,
                category,
                results: JSON.stringify(searchResults),
                timestamp,
                hash,
                googleSearchCache: cacheStatus.googleCache ? 'Cache' : 'Search',
                openaiSearchCache: 'None'
            });
        }

        // Log OpenAI analysis results only if we have valid results
        if (analysisResults && analysisResults.programs) {
            await this.appendRow({
                query,
                category,
                results: JSON.stringify(analysisResults),
                timestamp,
                hash,
                googleSearchCache: 'None',
                openaiSearchCache: cacheStatus.openaiCache ? 'Cache' : 'Search'
            });
        } else {
            // If analysis is null or has no programs, log it as a Search attempt
            await this.appendRow({
                query,
                category,
                results: 'null',
                timestamp,
                hash,
                googleSearchCache: 'None',
                openaiSearchCache: 'Search'  // Mark as Search since it's a fresh attempt
            });
        }
    }
}
