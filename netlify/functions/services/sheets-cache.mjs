/**
 * Cache Service for Energy Rebate Programs
 * 
 * IMPORTANT PATTERNS - DO NOT MODIFY WITHOUT CHECKING AGAINST THESE:
 * 
 * 1. Hash Generation Patterns:
 *    - Federal level: "FEDERAL::ALL"
 *    - State level: "STATE::CALIFORNIA::ALL"
 *    - County level: "COUNTY::${countyHash}::ALL"
 * 
 * 2. Query Format Patterns:
 *    - Federal: "federal energy rebate programs california, US government energy incentives california"
 *    - State: "California state energy rebate programs, California state government energy incentives"
 *    - County: "${countyName} County energy rebate programs california, ${countyName} County utility incentives california"
 * 
 * 3. Timestamp Format:
 *    - Format: "MM/DD/YYYY, HH:MM:SS AM/PM"
 *    - Example: "12/26/2024, 09:05:58 AM"
 *    - Must be in PST timezone
 *    - Must include leading zeros for month/day
 * 
 * 4. Working Example Row Structure:
 *    {
 *      query: "California State energy rebate programs",
 *      level: "State",
 *      results: [...],  // Array of search results
 *      timestamp: "12/26/2024, 09:05:58 AM",
 *      hash: "md5_hash_of_STATE::all"
 *    }
 */

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
        this.initialized = false;
        console.log('Cache → Constructor | Status:', {
            enabled: this.enabled,
            env: {
                GOOGLE_SHEETS_SPREADSHEET_ID: process.env.GOOGLE_SHEETS_SPREADSHEET_ID ? '✓' : '✗',
                GOOGLE_SHEETS_CREDENTIALS: process.env.GOOGLE_SHEETS_CREDENTIALS ? '✓' : '✗'
            }
        });
    }

    async initialize() {
        console.group('🔍 CACHE INITIALIZATION DIAGNOSTICS');
        console.log('Initialization Start', {
            timestamp: new Date().toISOString(),
            nodeEnv: process.env.NODE_ENV,
            platformInfo: {
                arch: process.arch,
                platform: process.platform
            }
        });

        if (!this.enabled) {
            console.error('❌ Cache Disabled: spreadsheetId is missing');
            console.groupEnd();
            return false;
        }

        if (this.initialized) {
            console.log('✅ Already Initialized');
            console.groupEnd();
            return true;
        }

        try {
            // Detailed credentials check
            if (!process.env.GOOGLE_SHEETS_CREDENTIALS) {
                console.error('❌ CRITICAL: GOOGLE_SHEETS_CREDENTIALS is MISSING', {
                    credentialsLength: process.env.GOOGLE_SHEETS_CREDENTIALS ? 
                        process.env.GOOGLE_SHEETS_CREDENTIALS.length : 0,
                    spreadsheetIdPresent: !!this.spreadsheetId
                });
                throw new Error('GOOGLE_SHEETS_CREDENTIALS is missing');
            }

            console.log('🔐 Parsing Credentials', {
                credentialsType: typeof process.env.GOOGLE_SHEETS_CREDENTIALS,
                credentialsLength: process.env.GOOGLE_SHEETS_CREDENTIALS.length
            });

            let parsedCredentials;
            try {
                parsedCredentials = JSON.parse(process.env.GOOGLE_SHEETS_CREDENTIALS);
            } catch (parseError) {
                console.error('❌ CREDENTIALS PARSE ERROR', {
                    errorMessage: parseError.message,
                    rawCredentials: process.env.GOOGLE_SHEETS_CREDENTIALS.substring(0, 50) + '...'
                });
                throw new Error('Failed to parse Google Sheets credentials');
            }

            console.log('🚀 Setting up Google Auth', {
                scopesRequested: ['https://www.googleapis.com/auth/spreadsheets']
            });

            const auth = new google.auth.GoogleAuth({
                credentials: parsedCredentials,
                scopes: ['https://www.googleapis.com/auth/spreadsheets']
            });

            console.log('🔑 Getting Auth Client');
            const authClient = await auth.getClient();
            
            console.log('📊 Creating Sheets Client');
            this.sheets = google.sheets({ version: 'v4', auth: authClient });
            
            console.log('🕵️ Testing Spreadsheet Connection', {
                spreadsheetId: this.spreadsheetId
            });

            const test = await this.sheets.spreadsheets.get({
                spreadsheetId: this.spreadsheetId
            });

            console.log('✅ Spreadsheet Connection Successful', {
                spreadsheetTitle: test.data.properties.title,
                spreadsheetId: this.spreadsheetId
            });

            // Ensure the Cache sheet exists with correct headers
            await this.ensureSheetStructure();
            
            this.initialized = true;
            console.log('🎉 Cache Initialization Complete');
            console.groupEnd();
            return true;
        } catch (error) {
            console.error('❌ CACHE INITIALIZATION FAILED', {
                errorMessage: error.message,
                errorStack: error.stack,
                errorName: error.name,
                credentialsPresent: !!process.env.GOOGLE_SHEETS_CREDENTIALS,
                spreadsheetIdPresent: !!this.spreadsheetId
            });
            console.groupEnd();
            
            // Rethrow to allow caller to handle
            throw error;
        }
    }

    async ensureSheetStructure() {
        console.group('🔍 SHEET STRUCTURE DIAGNOSTICS');
        console.log('Ensuring Sheet Structure', {
            spreadsheetId: this.spreadsheetId,
            timestamp: new Date().toISOString()
        });

        try {
            // Check if Cache sheet exists
            console.log('🕵️ Retrieving Spreadsheet Details');
            const sheets = await this.sheets.spreadsheets.get({
                spreadsheetId: this.spreadsheetId
            });

            console.log('📋 Existing Sheets', {
                sheetCount: sheets.data.sheets.length,
                sheetTitles: sheets.data.sheets.map(s => s.properties.title)
            });

            const cacheSheet = sheets.data.sheets.find(s => 
                s.properties.title === 'Cache'
            );

            if (!cacheSheet) {
                console.log('❌ Cache Sheet Not Found. Creating new sheet.');
                const addSheetResponse = await this.sheets.spreadsheets.batchUpdate({
                    spreadsheetId: this.spreadsheetId,
                    resource: {
                        requests: [{
                            addSheet: {
                                properties: {
                                    title: 'Cache'
                                }
                            }
                        }]
                    }
                });

                console.log('✅ New Cache Sheet Created', {
                    sheetId: addSheetResponse.data.replies[0].addSheet.properties.sheetId
                });
            }

            // Set headers
            const headers = [
                'Query',
                'Level',
                'Google Results',
                'OpenAI Analysis',
                'Timestamp',
                'Hash',
                'Google Search-Cache',
                'OpenAI Search-Cache'
            ];

            console.log('📝 Setting Sheet Headers');
            const updateResponse = await this.sheets.spreadsheets.values.update({
                spreadsheetId: this.spreadsheetId,
                range: 'Cache!A1:H1',
                valueInputOption: 'RAW',
                resource: {
                    values: [headers]
                }
            });

            console.log('✅ Headers Updated Successfully', {
                updatedRange: updateResponse.data.updatedRange,
                updatedCells: updateResponse.data.updatedCells
            });

            console.groupEnd();
        } catch (error) {
            console.error('❌ SHEET STRUCTURE ERROR', {
                errorMessage: error.message,
                errorName: error.name,
                errorStack: error.stack,
                spreadsheetId: this.spreadsheetId
            });
            console.groupEnd();
            throw error;
        }
    }

    // Get query format based on working examples
    normalizeQueryFormat(county, level) {
        switch (level.trim()) {
            case 'Federal':
                return 'federal energy rebate programs california, US government energy incentives california';
            case 'State':
                return 'California state energy rebate programs, California state government energy incentives';
            case 'County':
                if (!county) return null;
                const cleanCounty = county.replace(/^County:/, '').replace(/ County$/i, '').trim();
                return `${cleanCounty} County energy rebate programs california, ${cleanCounty} County utility incentives california`;
            default:
                return null;
        }
    }

    // Normalize level with more robust handling
    normalizeLevel(level) {
        if (!level) return '';
        const normalized = level.trim().toLowerCase();
        const levelMap = {
            'federal': 'Federal',
            'state': 'State',
            'county': 'County'
        };
        return levelMap[normalized] || normalized;
    }

    // Normalize county with improved consistency
    normalizeCounty(county) {
        if (!county) return '';
        
        // Remove any 'County:' prefix, 'county' word, and trim
        county = county.replace(/^County:\s*/i, '')
                      .replace(/\s*county\s*/i, '')
                      .trim();
        
        // Capitalize first letter of each word
        return county.split(/\s+/)
            .map(word => 
                word.charAt(0).toUpperCase() + word.slice(1).toLowerCase()
            )
            .join(' ');
    }

    // Comprehensive error logging utility
    _logError(context, error, additionalMetadata = {}) {
        const errorLog = {
            timestamp: new Date().toISOString(),
            context,
            errorMessage: error.message,
            errorName: error.name,
            errorStack: error.stack,
            ...additionalMetadata
        };

        // Log to console with structured format
        console.error(`❌ ERROR in ${context}:`, JSON.stringify(errorLog, null, 2));

        // Optional: Add more advanced error tracking (e.g., external logging service)
        // You could integrate with services like Sentry, LogRocket, etc.
        try {
            // Example of potential external error logging (commented out)
            // if (this.errorTracker) {
            //     this.errorTracker.captureException(error, errorLog);
            // }
        } catch (trackingError) {
            console.error('Error logging failed:', trackingError);
        }

        return errorLog;
    }

    // Generate a unique hash for the query and category with consistent mechanism
    netlifyGenerateHash(level, county, category = 'all') {
        try {
            // Normalize inputs with clear, simple rules
            const normalizedLevel = this.normalizeLevel(level || '');
            const normalizedCounty = this.normalizeCounty(county || '');
            const normalizedCategory = category.toUpperCase();
            
            if (!normalizedLevel) {
                throw new Error('Invalid or empty level provided');
            }

            // Create hash input without unnecessary prefix
            let hashInput = '';
            
            switch (normalizedLevel) {
                case 'Federal':
                    hashInput = 'FEDERAL::ALL';
                    break;
                case 'State':
                    hashInput = 'STATE::CALIFORNIA::ALL';
                    break;
                case 'County':
                    if (!normalizedCounty) {
                        throw new Error('County level requires a valid county name');
                    }
                    hashInput = `COUNTY::${normalizedCounty.toUpperCase()}::ALL`;
                    break;
                default:
                    throw new Error(`Unsupported level: ${normalizedLevel}`);
            }

            // Consistent hash generation
            const hash = crypto.createHash('md5')
                .update(hashInput)
                .digest('hex');

            // Detailed logging with safeguards
            console.log('🔐 Hash Generation Details:', {
                inputLevel: level,
                inputCounty: county,
                inputCategory: category,
                normalizedLevel,
                normalizedCounty,
                normalizedCategory,
                hashInput,
                hashLength: hash.length
            });

            return hash;
        } catch (error) {
            // Comprehensive error handling
            this._logError('netlifyGenerateHash', error, {
                inputLevel: level,
                inputCounty: county,
                inputCategory: category
            });
            
            // Return a fallback hash to prevent complete failure
            return crypto.createHash('md5')
                .update(`FALLBACK::${level || 'UNKNOWN'}::${county || 'UNKNOWN'}::${category}`)
                .digest('hex');
        }
    }

    async netlifyGetCache(level, county, requestedCategory = 'all') {
        try {
            // Validate initialization
            if (!this.initialized) {
                console.warn('⚠️ Cache not initialized before retrieval');
                await this.initialize();
            }

            // Normalize inputs
            const normalizedLevel = this.normalizeLevel(level);
            const normalizedCounty = this.normalizeCounty(county);
            const normalizedCategory = (requestedCategory || 'all').toUpperCase();

            // Generate hash for lookup
            const hash = this.netlifyGenerateHash(normalizedLevel, normalizedCounty, normalizedCategory);

            if (!hash) {
                console.error('❌ Hash generation failed', {
                    level: normalizedLevel,
                    county: normalizedCounty,
                    category: normalizedCategory
                });
                return { 
                    found: false, 
                    reason: 'Invalid hash generation',
                    data: null,
                    diagnostics: { 
                        level: normalizedLevel, 
                        county: normalizedCounty,
                        category: normalizedCategory
                    }
                };
            }

            // Retrieve spreadsheet data
            const response = await this.sheets.spreadsheets.values.get({
                spreadsheetId: this.spreadsheetId,
                range: 'Cache!A:H'
            }).catch(error => {
                this._logError('Google Sheets Retrieval', error, {
                    spreadsheetId: this.spreadsheetId,
                    range: 'Cache!A:H'
                });
                throw error;
            });

            const rows = response.data.values || [];
            
            if (rows.length <= 1) {
                console.warn('⚠️ Cache is empty or only contains headers');
                return { 
                    found: false, 
                    reason: 'No cache entries',
                    data: null,
                    diagnostics: { 
                        totalRows: rows.length 
                    }
                };
            }

            // Find matching row
            const matchingRowIndex = rows.findIndex((row, index) => {
                if (index === 0) return false;
                const rowHash = row[row.length - 1];
                return rowHash === hash;
            });

            // No matching row found
            if (matchingRowIndex === -1) {
                return {
                    found: false,
                    reason: 'No matching cache entry',
                    data: null,
                    diagnostics: {
                        hash,
                        level: normalizedLevel,
                        county: normalizedCounty,
                        category: normalizedCategory
                    }
                };
            }

            // Extract matching row data
            const matchingRow = rows[matchingRowIndex];
            
            // Validate row structure
            if (matchingRow.length < 4) {
                console.warn('⚠️ Incomplete cache row', { rowData: matchingRow });
                return {
                    found: false,
                    reason: 'Incomplete cache row',
                    data: null,
                    diagnostics: { rowData: matchingRow }
                };
            }

            // Parse row data with robust error handling
            try {
                const googleResults = JSON.parse(matchingRow[2] || '[]');
                const openaiAnalysis = JSON.parse(matchingRow[3] || '{}');

                return {
                    found: true,
                    data: {
                        query: matchingRow[0],
                        level: matchingRow[1],
                        googleResults,
                        openaiAnalysis,
                        timestamp: matchingRow[4] || 'Unknown'
                    },
                    source: 'cache'
                };
            } catch (parseError) {
                console.error('❌ Failed to parse cache row', {
                    error: parseError,
                    rowData: matchingRow
                });
                return {
                    found: false,
                    reason: 'Cache data parsing failed',
                    data: null,
                    diagnostics: { 
                        rowData: matchingRow,
                        error: parseError.message
                    }
                };
            }
        } catch (error) {
            const errorDetails = this._logError('netlifyGetCache', error, {
                inputLevel: level,
                inputCounty: county,
                requestedCategory,
                initializationStatus: this.initialized
            });

            return {
                found: false,
                reason: 'Retrieval failed',
                data: null,
                errorDetails: {
                    message: error.message,
                    context: errorDetails,
                    initializationStatus: this.initialized
                }
            };
        }
    }

    // Get timestamp in PST with exact format
    netlifyGetPSTTimestamp() {
        const now = new Date();
        const pstDate = new Date(now.toLocaleString("en-US", { timeZone: "America/Los_Angeles" }));
        
        // Format: "MM/DD/YYYY, HH:MM:SS AM/PM"
        const month = String(pstDate.getMonth() + 1).padStart(2, '0');
        const day = String(pstDate.getDate()).padStart(2, '0');
        const year = pstDate.getFullYear();
        const hours = String(pstDate.getHours() % 12 || 12).padStart(2, '0');
        const minutes = String(pstDate.getMinutes()).padStart(2, '0');
        const seconds = String(pstDate.getSeconds()).padStart(2, '0');
        const ampm = pstDate.getHours() >= 12 ? 'PM' : 'AM';
        
        return `${month}/${day}/${year}, ${hours}:${minutes}:${seconds} ${ampm}`;
    }

    // Test hash generation across different scenarios
    testHashGeneration() {
        console.group('🧪 Hash Generation Test Suite');
        
        const testCases = [
            // Federal Level Tests
            { 
                level: 'Federal', 
                county: null, 
                expectedPrefix: 'FEDERAL::ALL' 
            },
            { 
                level: 'federal', 
                county: null, 
                expectedPrefix: 'FEDERAL::ALL' 
            },
            
            // State Level Tests
            { 
                level: 'State', 
                county: null, 
                expectedPrefix: 'STATE::CALIFORNIA::ALL' 
            },
            { 
                level: 'state', 
                county: null, 
                expectedPrefix: 'STATE::CALIFORNIA::ALL' 
            },
            
            // County Level Tests
            { 
                level: 'County', 
                county: 'Alameda', 
                expectedPrefix: 'COUNTY::' 
            },
            { 
                level: 'county', 
                county: 'alameda county', 
                expectedPrefix: 'COUNTY::' 
            },
            { 
                level: 'County', 
                county: 'County:Los Angeles', 
                expectedPrefix: 'COUNTY::' 
            }
        ];

        testCases.forEach((testCase, index) => {
            console.log(`\n🔍 Test Case #${index + 1}:`, {
                level: testCase.level,
                county: testCase.county
            });

            try {
                const hash = this.netlifyGenerateHash(testCase.level, testCase.county);
                
                // Validate hash generation
                if (!hash || hash.length !== 32) {
                    throw new Error('Invalid hash length');
                }

                // Optional: You can add more specific validation here
                console.log('✅ Hash Generated Successfully:', {
                    hash: hash,
                    length: hash.length
                });

            } catch (error) {
                console.error('❌ Hash Generation Failed:', {
                    level: testCase.level,
                    county: testCase.county,
                    error: error.message
                });
            }
        });

        console.groupEnd();
    }

    // Helper method to truncate for logging
    _truncateForLogging(data) {
        // If data is null or undefined, return an empty array
        if (!data) return [];

        // If data is already an array, process it
        if (Array.isArray(data)) {
            return data.map(entry => {
                // Handle different types of entries
                if (entry === null || entry === undefined) return null;
                
                // If entry is a primitive, return it directly
                if (typeof entry !== 'object') return entry;

                // If entry is an object, truncate its properties
                const truncatedEntry = {};
                for (const [key, value] of Object.entries(entry)) {
                    // Convert numeric keys to strings if needed
                    const safeKey = String(key);
                    
                    if (typeof value === 'string') {
                        truncatedEntry[safeKey] = value.length > 500 
                            ? value.substring(0, 500) + '...' 
                            : value;
                    } else if (value === null || value === undefined) {
                        truncatedEntry[safeKey] = null;
                    } else {
                        // For other types, convert to string or keep as is
                        truncatedEntry[safeKey] = String(value);
                    }
                }
                return truncatedEntry;
            }).filter(entry => entry !== null).slice(0, 50);  // Limit to 50 entries
        }

        // If data is an object, handle it similarly
        if (typeof data === 'object') {
            const truncatedObject = {};
            for (const [key, value] of Object.entries(data)) {
                const safeKey = String(key);
                
                if (typeof value === 'string') {
                    truncatedObject[safeKey] = value.length > 500 
                        ? value.substring(0, 500) + '...' 
                        : value;
                } else if (value === null || value === undefined) {
                    truncatedObject[safeKey] = null;
                } else {
                    truncatedObject[safeKey] = String(value);
                }
            }
            return [truncatedObject];
        }

        // For any other type, return it as a single-item array
        return [data];
    }

    // Append a row to the cache sheet
    async appendRow(data) {
        if (!this.enabled) {
            console.log('Cache → Append | Cache disabled');
            return;
        }
        
        if (!this.initialized) await this.initialize();

        try {
            const hash = this.netlifyGenerateHash(data.level, data.county, 'all');
            if (!hash) throw new Error('Failed to generate hash');

            // Format query correctly for county searches
            const query = this.normalizeQueryFormat(data.county, data.level);
            if (!query) throw new Error('Failed to normalize query format');

            // Safely stringify JSON data
            const googleResultsJson = typeof data.googleResults === 'string' 
                ? data.googleResults 
                : JSON.stringify(data.googleResults || []);
                
            const openaiAnalysisJson = typeof data.openaiAnalysis === 'string'
                ? data.openaiAnalysis
                : JSON.stringify(data.openaiAnalysis || []);

            console.log('Cache → Append | Preparing data:', {
                query,
                level: data.level,
                resultsCount: Array.isArray(data.googleResults) ? data.googleResults.length : 0,
                analysisCount: Array.isArray(data.openaiAnalysis) ? data.openaiAnalysis.length : 0
            });

            const rowData = [
                query,                           // A: Query
                data.level || '',               // B: Level
                googleResultsJson,              // C: Google Results
                openaiAnalysisJson,             // D: openAI Analysis
                this.netlifyGetPSTTimestamp(),  // E: Timestamp
                hash,                           // F: Hash
                data.googleSearchCache || 'Search',  // G: Google Search-Cache
                data.openaiSearchCache || 'Search'   // H: OpenAI Search-Cache
            ];

            // Log the exact row structure for verification
            console.log('Cache → Append | Row matches example:', {
                query: rowData[0],
                level: rowData[1],
                timestamp: rowData[4],
                hash: rowData[5]
            });

            // Append to sheet
            const response = await this.sheets.spreadsheets.values.append({
                spreadsheetId: this.spreadsheetId,
                range: 'Cache!A:H',
                valueInputOption: 'RAW',
                insertDataOption: 'INSERT_ROWS',
                resource: {
                    values: [rowData]
                }
            });

            console.log('Cache → Append | Success:', {
                updatedRange: response.data.updates.updatedRange,
                updatedRows: response.data.updates.updatedRows,
                timestamp: this.netlifyGetPSTTimestamp()
            });

            return response;

        } catch (error) {
            console.error('Cache → Append | Error:', error);
            throw error;
        }
    }

    // Set cache entry
    async netlifySetCache(level, county, category, data) {
        // Validate data before caching
        const googleResults = data.googleResults || [];
        const openaiAnalysis = data.openaiAnalysis || [];

        // Only cache if there are meaningful results
        if (googleResults.length > 0 || (openaiAnalysis && openaiAnalysis.length > 0)) {
            console.log('Cache → Append | Preparing data', {
                query: data.query,
                level,
                googleResultsCount: googleResults.length,
                analysisCount: openaiAnalysis ? openaiAnalysis.length : 0
            });

            // Prepare row data following the specified structure
            const rowData = [
                data.query,                  // Query
                level,                       // Level
                JSON.stringify(googleResults),  // Google Results
                JSON.stringify(openaiAnalysis || []),  // OpenAI Analysis
                this.netlifyGetPSTTimestamp(),  // Timestamp
                this.netlifyGenerateHash(level, county, category),  // Hash
                googleResults.length > 0 ? 'Search' : 'Cache',  // Google Search Cache
                openaiAnalysis && openaiAnalysis.length > 0 ? 'Search' : 'Cache'  // OpenAI Search Cache
            ];

            try {
                // Append the row to the cache sheet
                const appendResponse = await this.sheets.spreadsheets.values.append({
                    spreadsheetId: this.spreadsheetId,
                    range: 'Cache!A:H',
                    valueInputOption: 'RAW',
                    insertDataOption: 'INSERT_ROWS',
                    resource: { values: [rowData] }
                });

                console.log('Cache → Append | Success', {
                    updatedRange: appendResponse.data.updates.updatedRange,
                    updatedRows: appendResponse.data.updates.updatedRows,
                    timestamp: rowData[4]  // Timestamp
                });

                return appendResponse;
            } catch (error) {
                console.error('Cache → Append | Error', {
                    errorMessage: error.message,
                    query: data.query,
                    level
                });
                throw error;
            }
        } else {
            console.log('Cache → Skipped | No meaningful results to cache', {
                query: data.query,
                level,
                googleResultsCount: googleResults.length,
                openaiAnalysisCount: openaiAnalysis ? openaiAnalysis.length : 0
            });
            
            // Return null to indicate no caching occurred
            return null;
        }
    }

    // Comprehensive diagnostics method
    async runDiagnostics() {
        console.log('🔬 Running Comprehensive Cache Diagnostics');
        
        try {
            // 1. Consistent Hash Generation Across Levels
            console.group('🔍 Hash Generation Consistency Test');
            const testScenarios = [
                { 
                    name: 'Federal Level Consistency', 
                    inputs: [
                        { level: 'Federal', county: null },
                        { level: 'federal', county: null }
                    ]
                },
                { 
                    name: 'State Level Consistency', 
                    inputs: [
                        { level: 'State', county: null },
                        { level: 'state', county: null }
                    ]
                },
                { 
                    name: 'County Level Consistency', 
                    inputs: [
                        { level: 'County', county: 'Alameda' },
                        { level: 'county', county: 'alameda county' },
                        { level: 'County', county: 'County:Los Angeles' }
                    ]
                }
            ];

            testScenarios.forEach(scenario => {
                console.log(`\n📋 Scenario: ${scenario.name}`);
                const hashes = scenario.inputs.map(input => 
                    this.netlifyGenerateHash(input.level, input.county)
                );

                // Check if all hashes in the scenario are identical
                const uniqueHashes = new Set(hashes);
                if (uniqueHashes.size === 1) {
                    console.log('✅ Consistent Hash Generation:', {
                        scenario: scenario.name,
                        hash: hashes[0],
                        inputs: scenario.inputs
                    });
                } else {
                    console.error('❌ Inconsistent Hash Generation:', {
                        scenario: scenario.name,
                        hashes: hashes,
                        inputs: scenario.inputs
                    });
                }
            });
            console.groupEnd();

            // 2. Input Format Normalization
            console.group('🧹 Input Normalization Test');
            const normalizationTests = [
                { 
                    type: 'Level Normalization', 
                    method: this.normalizeLevel,
                    inputs: ['Federal', 'federal', 'FEDERAL', ' Federal ', '']
                },
                { 
                    type: 'County Normalization', 
                    method: this.normalizeCounty,
                    inputs: [
                        'Alameda', 
                        'alameda county', 
                        'County:Los Angeles', 
                        ' los angeles ', 
                        ''
                    ]
                }
            ];

            normalizationTests.forEach(test => {
                console.log(`\n📝 ${test.type} Test:`);
                test.inputs.forEach(input => {
                    try {
                        const normalized = test.method.call(this, input);
                        console.log(`Input: "${input}" → Normalized: "${normalized}"`);
                    } catch (error) {
                        console.error(`❌ Normalization Failed for "${input}":`, error);
                    }
                });
            });
            console.groupEnd();

            // 3. Detailed Logging Process
            console.group('📊 Detailed Hash Generation Logging');
            const detailedTestCases = [
                { level: 'Federal', county: null },
                { level: 'State', county: null },
                { level: 'County', county: 'Alameda' }
            ];

            detailedTestCases.forEach(testCase => {
                console.log(`\n🔢 Detailed Hash for ${testCase.level} Level:`);
                const hash = this.netlifyGenerateHash(testCase.level, testCase.county);
                console.log('Comprehensive Hash Details:', {
                    input: {
                        level: testCase.level,
                        county: testCase.county
                    },
                    normalizedLevel: this.normalizeLevel(testCase.level),
                    normalizedCounty: testCase.county ? this.normalizeCounty(testCase.county) : 'N/A',
                    generatedHash: hash
                });
            });
            console.groupEnd();

            // Optional: Cache Initialization Test
            console.group('🗄️ Cache Initialization');
            try {
                await this.initialize();
                console.log('✅ Cache Initialization Successful');
            } catch (initError) {
                console.error('❌ Cache Initialization Failed:', initError);
            }
            console.groupEnd();

            console.log('🎉 Diagnostics Completed Successfully');
        } catch (error) {
            console.error('🚨 Comprehensive Diagnostics Failed:', error);
        }
    }
}