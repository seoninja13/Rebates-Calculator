import { GoogleSheetsCache } from '../../backend/services/sheets-cache.js';
import { OpenAI } from 'openai';
import fetch from 'node-fetch';

// Helper function to get search queries
function netlifyGetSearchQueries(level, county) {
    if (!level) throw new Error('Level is required');
    
    // Enhanced logging
    console.log('🔎 Generating Search Queries', { 
        level, 
        county: county || 'N/A' 
    });

    switch (level.trim()) {
        case 'Federal':
            return [
                'federal energy rebate programs california',
                'US government energy efficiency incentives for homeowners',
                'federal tax credits for renewable energy installations',
                'energy savings programs for residential and commercial properties'
            ];
        case 'State':
            return [
                'California state energy rebate programs for solar and efficiency',
                'California government energy incentives for home upgrades',
                'California clean energy financial assistance programs',
                'state-level energy efficiency rebates and grants'
            ];
        case 'County':
            if (!county) throw new Error('County is required for county-level search');
            const cleanCounty = county.replace(/^County:/, '').trim();
            return [
                `${cleanCounty} County energy rebate and efficiency programs`,
                `local energy incentives in ${cleanCounty} County for residential upgrades`,
                `${cleanCounty} County utility company energy savings programs`,
                `renewable energy and efficiency rebates in ${cleanCounty} County`
            ];
        default:
            throw new Error(`Invalid level: ${level}`);
    }
}

// Advanced API Call Management
class APICallManager {
    constructor(maxRetries = 2, initialBackoff = 1000) {
        this.maxRetries = maxRetries;
        this.initialBackoff = initialBackoff;
        this.metrics = {
            totalCalls: 0,
            successfulCalls: 0,
            failedCalls: 0,
            retriedCalls: 0
        };
        this.circuitBreaker = {
            failures: 0,
            lastFailureTime: null,
            state: 'CLOSED',
            failureThreshold: 3,
            resetTimeout: 30000 // 30 seconds
        };
    }

    // Exponential backoff for retries
    calculateBackoff(attempt) {
        return this.initialBackoff * Math.pow(2, attempt);
    }

    // Circuit breaker state management
    updateCircuitBreakerState(isSuccess) {
        if (isSuccess) {
            this.circuitBreaker.failures = 0;
            this.circuitBreaker.state = 'CLOSED';
            return;
        }

        this.circuitBreaker.failures++;
        this.circuitBreaker.lastFailureTime = Date.now();

        if (this.circuitBreaker.failures >= this.circuitBreaker.failureThreshold) {
            this.circuitBreaker.state = 'OPEN';
        }
    }

    // Check if circuit is open
    isCircuitOpen() {
        if (this.circuitBreaker.state !== 'OPEN') return false;
        
        const timeSinceLastFailure = Date.now() - this.circuitBreaker.lastFailureTime;
        if (timeSinceLastFailure >= this.circuitBreaker.resetTimeout) {
            this.circuitBreaker.state = 'HALF_OPEN';
        }

        return this.circuitBreaker.state === 'OPEN';
    }

    // Enhanced fetch with retry and circuit breaker
    async fetchWithRetry(url, options = {}, timeout = 7000) {
        // Check circuit breaker
        if (this.isCircuitOpen()) {
            throw new Error('Circuit is OPEN. Blocking further requests.');
        }

        this.metrics.totalCalls++;

        for (let attempt = 0; attempt <= this.maxRetries; attempt++) {
            try {
                const controller = new AbortController();
                const timeoutId = setTimeout(() => controller.abort(), timeout);

                const fetchOptions = {
                    ...options,
                    signal: controller.signal
                };

                const response = await fetch(url, fetchOptions);
                clearTimeout(timeoutId);

                // Validate response
                if (!response.ok) {
                    throw new Error(`HTTP error! status: ${response.status}`);
                }

                const data = await response.json();
                
                // Success handling
                this.updateCircuitBreakerState(true);
                this.metrics.successfulCalls++;

                return data;

            } catch (error) {
                // Retry logic
                if (attempt < this.maxRetries) {
                    this.metrics.retriedCalls++;
                    const backoffTime = this.calculateBackoff(attempt);
                    await new Promise(resolve => setTimeout(resolve, backoffTime));
                    continue;
                }

                // Final failure
                this.metrics.failedCalls++;
                this.updateCircuitBreakerState(false);
                
                throw error;
            }
        }
    }

    // Diagnostic method for API call metrics
    getMetrics() {
        return {
            ...this.metrics,
            circuitBreakerState: this.circuitBreaker.state
        };
    }
}

// Specialized Google Search API Manager
class GoogleSearchAPIManager extends APICallManager {
    constructor() {
        super(2, 1000); // 2 retries, 1 second initial backoff
    }

    async search(query, timeout = 7000) {
        console.log('🌐 Initiating Google Search', {
            query,
            timeout,
            apiKeyPresence: process.env.GOOGLE_API_KEY ? '✅ PRESENT' : '❌ MISSING',
            searchEngineIdPresence: process.env.GOOGLE_SEARCH_ENGINE_ID ? '✅ PRESENT' : '❌ MISSING'
        });

        if (!process.env.GOOGLE_API_KEY || !process.env.GOOGLE_SEARCH_ENGINE_ID) {
            throw new Error('Google Search API configuration is missing');
        }

        const url = `https://www.googleapis.com/customsearch/v1?key=${process.env.GOOGLE_API_KEY}&cx=${process.env.GOOGLE_SEARCH_ENGINE_ID}&q=${encodeURIComponent(query)}&num=5`;
        
        try {
            console.log('🔍 Executing Search URL', { 
                encodedQuery: encodeURIComponent(query),
                urlLength: url.length
            });

            const response = await this.fetchWithRetry(url, {}, timeout);
            
            console.log('📊 Search Response Metadata', {
                totalResults: response.searchInformation?.totalResults,
                searchTime: response.searchInformation?.searchTime,
                itemsCount: response.items?.length || 0,
                firstResultTitle: response.items?.[0]?.title,
                firstResultLink: response.items?.[0]?.link
            });

            // Detailed logging of each search result
            if (response.items) {
                response.items.forEach((item, index) => {
                    console.log(`🔎 Result #${index + 1}`, {
                        title: item.title,
                        link: item.link,
                        snippet: item.snippet?.substring(0, 200) + '...',
                        displayLink: item.displayLink
                    });
                });
            }

            return response;
        } catch (error) {
            console.error('❌ Google Search API Error', {
                query,
                errorMessage: error.message,
                errorStack: error.stack,
                apiMetrics: this.getMetrics()
            });
            throw error;
        }
    }
}

// Enhanced OpenAI Prompting and Analysis Strategies
const OPENAI_PROMPTS = {
    SYSTEM_PROMPT: `You are an expert assistant specializing in energy rebate program analysis. 
Your task is to extract comprehensive information about energy rebate, incentive, and efficiency programs.

CRITICAL GUIDELINES:
1. ALWAYS return a VALID JSON object with a "programs" array
2. If no programs are found, return an empty array
3. Prioritize programs related to energy efficiency, renewable energy, and sustainability
4. Include detailed program information

REQUIRED PROGRAM STRUCTURE:
{
    "programs": [
        {
            "name": "Program Name",
            "description": "Detailed program description",
            "type": "Rebate/Incentive/Tax Credit",
            "eligibility": {
                "residential": boolean,
                "commercial": boolean,
                "requirements": ["Specific requirements"]
            },
            "funding_source": "Federal/State/County/Utility",
            "url": "Official program URL (optional)",
            "estimated_value": {
                "min": number,
                "max": number,
                "currency": "USD"
            }
        }
    ]
}`,

    FALLBACK_PROMPTS: [
        `Extract energy efficiency and rebate programs from the most general search results. Focus on any financial incentives for energy improvements.`,
        `Identify any government or utility-sponsored programs supporting energy conservation, even if details are minimal.`,
        `Find any mentions of financial support for energy-related projects, regardless of specificity.`
    ]
};

// Enhanced OpenAI Analysis Strategy
class OpenAIAPIManager extends APICallManager {
    constructor(openaiClient) {
        super(1, 2000); // 1 retry, 2 seconds initial backoff
        this.openaiClient = openaiClient;
        this.retryCount = 0;
        this.maxRetries = 3;
    }

    // Construct comprehensive user message
    constructUserMessage(searchContext, level, county, category) {
        // Limit the number of search results to reduce message length
        const limitedContext = searchContext.slice(0, 3).map(result => 
            `Title: ${result.title || 'Untitled'}\n` +
            `URL: ${result.link}\n` +
            `Snippet: ${result.snippet?.substring(0, 200) || 'No snippet available'}\n`
        ).join('\n\n');

        return `Extract energy rebate programs for ${level} level${county ? ` in ${county} County` : ''}:

Search Context (Top Results):
${limitedContext}

Requirements:
- Focus on current, active energy efficiency programs
- Include residential and commercial rebates
- Capture programs related to: solar, insulation, HVAC, appliance upgrades
- Prioritize programs with clear eligibility and value

Return a JSON with these program details:
{
    "programs": [
        {
            "name": "Program Name",
            "description": "Brief program description",
            "type": "Rebate/Incentive/Tax Credit",
            "eligibility": {
                "residential": boolean,
                "commercial": boolean,
                "requirements": ["Specific requirements"]
            },
            "estimated_value": {
                "min": number,
                "max": number,
                "currency": "USD"
            }
        }
    ]
}`;
    }

    // Perform OpenAI analysis with advanced error handling
    async analyzeSearchResults(searchContext, level, county, category) {
        const startTime = Date.now();
        const TIMEOUT_MS = 25000; // Increased from previous timeout

        console.log('🕒 OpenAI Analysis Start', {
            searchResultCount: searchContext?.length || 0,
            level,
            county,
            category,
            inputSize: JSON.stringify(searchContext).length
        });

        try {
            // Validate inputs
            if (!searchContext || searchContext.length === 0) {
                console.warn('No search context provided for analysis');
                return { programs: [] };
            }

            const userMessage = this.constructUserMessage(searchContext, level, county, category);

            console.log('📝 OpenAI Request Details', {
                messageLength: userMessage.length,
                firstLines: userMessage.split('\n').slice(0, 5).join('\n')
            });

            console.time('OpenAI API Call');
            const openaiResponse = await Promise.race([
                this.openaiClient.chat.completions.create({
                    model: "gpt-3.5-turbo-1106", // More stable model
                    response_format: { type: "json_object" },
                    messages: [
                        {
                            role: "system", 
                            content: "You are an expert in energy rebate program analysis. Always return a structured JSON response."
                        },
                        { 
                            role: "user", 
                            content: userMessage 
                        }
                    ],
                    max_tokens: 1500, // Limit token usage
                    temperature: 0.7
                }).then(result => {
                    console.timeEnd('OpenAI API Call');
                    console.log('✅ OpenAI Response Received', {
                        responseLength: result?.choices?.[0]?.message?.content?.length || 0,
                        tokenUsage: result?.usage
                    });
                    return result; // Return the full response object
                }),
                new Promise((_, reject) => 
                    setTimeout(() => {
                        console.log('⏰ OpenAI Request Timeout Triggered');
                        reject(new Error('OpenAI Analysis Timeout'));
                    }, TIMEOUT_MS)
                )
            ]);

            console.log('🤖 OpenAI Raw Response', {
                responseLength: JSON.stringify(openaiResponse).length,
                responsePreview: JSON.stringify(openaiResponse.choices[0].message.content).slice(0, 500)
            });

            // Process OpenAI response
            const processedPrograms = await processOpenAIResponse(openaiResponse, level, county);

            console.log('✅ Processed Programs', {
                level: processedPrograms.level,
                programCount: processedPrograms.count,
                programDetails: processedPrograms.programs
            });

            return processedPrograms;

        } catch (error) {
            console.error('❌ OpenAI Analysis Error', {
                error: error.message,
                stack: error.stack,
                level, 
                county, 
                category
            });

            // Implement retry with fallback
            if (this.retryCount < this.maxRetries) {
                this.retryCount++;
                console.log(`🔄 Retry ${this.retryCount}`);

                return this.analyzeSearchResults(searchContext, level, county, category);
            }

            // If all retries fail, return empty result
            console.warn('⚠️ All OpenAI analysis attempts failed. Returning empty result.', {
                level,
                county,
                category,
                searchResultCount: searchContext.length
            });

            return {
                level,
                count: 0,
                programs: []
            };
        }
    }
}

// Search Results Processing Utility
class SearchResultsProcessor {
    constructor(options = {}) {
        this.options = {
            maxResults: 5,  // Reduced back to 5
            maxSnippetLength: 300,
            minRelevanceScore: 0.1,  // Lowered from 0.3 to 0.1
            deduplicationFields: options.deduplicationFields || ['link']
        };
    }

    // Process and filter search results
    processSearchResults(searchResults) {
        // Flatten results from multiple search queries
        const allResults = searchResults.flatMap(result => result.items || []);

        // Deduplicate results
        const uniqueResults = this.deduplicateResults(allResults);

        // Filter and score results
        const filteredResults = this.filterAndScoreResults(uniqueResults);

        // Sort results by relevance
        const sortedResults = this.sortResultsByRelevance(filteredResults);

        // Limit and transform results
        const processedResults = this.limitAndTransformResults(sortedResults);

        return {
            totalResultsReceived: allResults.length,
            uniqueResultsCount: uniqueResults.length,
            processedResultsCount: processedResults.length,
            results: processedResults,
            resultLimit: 5  // Explicitly track result limit
        };
    }

    // Remove duplicate results based on specified fields
    deduplicateResults(results) {
        const seen = new Set();
        return results.filter(result => {
            const key = this.options.deduplicationFields
                .map(field => result[field])
                .join('||');
            
            if (seen.has(key)) return false;
            seen.add(key);
            return true;
        });
    }

    // Score and filter results for relevance
    filterAndScoreResults(results) {
        return results
            .map(result => ({
                ...result,
                relevanceScore: this.calculateRelevanceScore(result)
            }))
            .filter(result => result.relevanceScore >= this.options.minRelevanceScore);
    }

    // Calculate relevance score for a result
    calculateRelevanceScore(result) {
        let score = 0;

        // Comprehensive relevance scoring
        const relevanceKeywords = [
            'rebate', 'energy', 'incentive', 'efficiency', 
            'savings', 'program', 'grant', 'subsidy', 
            'tax credit', 'renewable', 'upgrade'
        ];

        // Expanded keyword matching
        relevanceKeywords.forEach(keyword => {
            const matchMultiplier = keyword.split(' ').length;
            
            if (result.title && result.title.toLowerCase().includes(keyword)) {
                score += 0.2 * matchMultiplier;
            }
            
            if (result.snippet && result.snippet.toLowerCase().includes(keyword)) {
                score += 0.15 * matchMultiplier;
            }
        });

        // Bonus for longer, more detailed snippets
        if (result.snippet && result.snippet.length > 150) {
            score += 0.1;
        }

        // Ensure a minimum score of 0.1 if any match is found
        return Math.max(Math.min(score, 1), 0.1);
    }

    // Sort results by relevance score
    sortResultsByRelevance(results) {
        return results.sort((a, b) => b.relevanceScore - a.relevanceScore);
    }

    // Limit and transform results
    limitAndTransformResults(results) {
        return results
            .slice(0, 5)  // Hard limit to 5 results
            .map(result => ({
                title: this.truncateText(result.title, 100),
                link: result.link,
                snippet: this.truncateText(result.snippet, this.options.maxSnippetLength),
                relevanceScore: result.relevanceScore
            }));
    }

    // Truncate text to specified length
    truncateText(text, maxLength) {
        if (!text) return '';
        return text.length > maxLength 
            ? text.substring(0, maxLength) + '...' 
            : text;
    }
}

// Global API Managers
const googleSearchManager = new GoogleSearchAPIManager();
const openAIManager = new OpenAIAPIManager(new OpenAI(process.env.OPENAI_API_KEY));

// Helper function to create collapsed summary
function createCollapsedSummary(program) {
    if (!program) return 'No program details available';
    
    const type = program.programType || 'Not Available';
    const projects = Array.isArray(program.eligibleProjects) ? program.eligibleProjects : [];
    
    if (projects.length > 0) {
        return projects.map(project => {
            let projectAmount = program.amount || 'Not specified';
            if (typeof project === 'object' && project.amount) {
                projectAmount = project.amount;
            }
            return `${projectAmount} ${type.toLowerCase()} for ${typeof project === 'object' ? project.name : project}`;
        }).join(', ');
    }
    
    return `${program.amount || 'Not specified'} ${type.toLowerCase()} available`;
}

// Validate and enhance individual program entries
function validateAndEnhanceProgram(entry) {
    // Basic validation checks
    if (!entry || typeof entry !== 'object') {
        console.warn('Invalid program entry:', entry);
        return null;
    }

    // Required fields validation
    const requiredFields = [
        'programName', 
        'programType', 
        'amount', 
        'eligibleProjects', 
        'geographicScope'
    ];

    const missingFields = requiredFields.filter(field => !entry[field]);
    
    if (missingFields.length > 0) {
        console.warn('Program entry missing required fields', { 
            entry, 
            missingFields 
        });
        return null;
    }

    // Enhancement: Normalize and standardize data
    const enhancedEntry = {
        ...entry,
        // Ensure amount is a string
        amount: String(entry.amount || 'Not specified'),
        
        // Standardize geographic scope
        geographicScope: entry.geographicScope 
            ? entry.geographicScope.charAt(0).toUpperCase() + entry.geographicScope.slice(1).toLowerCase()
            : 'Not specified',
        
        // Ensure eligibleProjects is an array
        eligibleProjects: Array.isArray(entry.eligibleProjects) 
            ? entry.eligibleProjects 
            : [{ name: entry.programName, amount: entry.amount }],
        
        // Add a collapsed summary if not present
        collapsedSummary: entry.collapsedSummary || createCollapsedSummary(entry)
    };

    return enhancedEntry;
}

// Helper function to analyze results with OpenAI
async function netlifyAnalyzeResults(results, level, county, category, query) {
    console.log('🔬 Analyzing Search Results', {
        resultsType: typeof results,
        resultsLength: results ? results.length : 'N/A',
        level,
        county,
        category,
        query
    });

    // Ensure results is an array and not empty
    if (!results || !Array.isArray(results) || results.length === 0) {
        console.warn('❗ No search results to analyze', { 
            results, 
            level, 
            county, 
            category 
        });
        return [];
    }

    try {
        // Prepare context for OpenAI analysis
        const searchContext = results.map(result => ({
            title: result.title || '',
            link: result.link || '',
            snippet: result.snippet || ''
        }));

        console.log('📝 Prepared Search Context', {
            contextLength: searchContext.length,
            firstResultTitle: searchContext[0]?.title
        });

        // Perform OpenAI analysis
        const openaiResponse = await openAIManager.analyzeSearchResults(
            searchContext, 
            level, 
            county, 
            category
        );

        console.log('🤖 OpenAI Analysis Response', {
            responseType: typeof openaiResponse,
            responseLength: openaiResponse ? JSON.stringify(openaiResponse).length : 'N/A'
        });

        // Process and validate OpenAI response
        const processedResponse = processOpenAIResponse(openaiResponse, level, county);

        console.log('✅ Processed OpenAI Response', {
            processedResponseType: typeof processedResponse,
            processedResponseLength: processedResponse ? processedResponse.length : 'N/A'
        });

        return processedResponse || [];
    } catch (error) {
        console.error('❌ Analysis Error', {
            errorMessage: error.message,
            errorStack: error.stack,
            level,
            county,
            category
        });
        return [];
    }
}

// Process and validate OpenAI response
async function processOpenAIResponse(openaiResponse, level, county) {
    try {
        // Extract the content from the OpenAI response
        const parsedResponse = openaiResponse?.choices?.[0]?.message?.content;

        // Validate the parsed response
        if (!parsedResponse || typeof parsedResponse !== 'object') {
            console.error('❌ Invalid OpenAI response', { 
                responseType: typeof parsedResponse,
                responseContent: parsedResponse 
            });
            return { programs: [] };
        }

        // Validate programs structure
        const programs = parsedResponse.programs;
        if (!Array.isArray(programs) || programs.length === 0) {
            console.error('❌ No programs found in response', { 
                programsType: typeof programs,
                programsLength: programs?.length 
            });
            return { programs: [] };
        }

        // Process programs with robust validation
        const processedPrograms = programs.map(program => {
            // Validate each program has required fields
            if (!program.name || !program.description) {
                console.warn('⚠️ Incomplete program information', { program });
                return null;
            }

            return {
                programName: program.name || 'Unnamed Program',
                programType: program.type || 'Rebate',
                summary: program.description || 'No description available',
                amount: program.estimated_value 
                    ? `$${program.estimated_value.min || 0} - $${program.estimated_value.max || 0}` 
                    : (program.amount || 'Not specified'),
                eligibleProjects: program.eligibleProjects || [],
                eligibleRecipients: program.eligibility?.residential ? 'Residential' : 
                                    program.eligibility?.commercial ? 'Commercial' : 'Not specified',
                geographicScope: county ? `${county} County` : 'Not specified',
                websiteLink: '#',
                requirements: program.eligibility?.requirements || [],
                applicationProcess: 'Not specified',
                deadline: 'Not specified',
                contactInfo: 'Not specified',
                processingTime: 'Not specified',
                collapsedSummary: `${program.name} - ${(program.description || '').slice(0, 100)}....`
            };
        }).filter(program => program !== null); // Remove any null entries

        console.log('✅ Processed Programs', {
            level,
            programCount: processedPrograms.length,
            programDetails: processedPrograms
        });

        return {
            level,
            count: processedPrograms.length,
            programs: processedPrograms
        };

    } catch (error) {
        console.error('❌ Analysis Processing Error', {
            error: error.message,
            stack: error.stack,
            level, 
            county, 
            category: 'energy'
        });

        return {
            level,
            count: 0,
            programs: []
        };
    }
}

// Timeout Management Utility
class TimeoutManager {
    constructor(maxExecutionTime = 25000) {
        this.startTime = Date.now();
        this.maxExecutionTime = maxExecutionTime;
    }

    // Calculate remaining time
    getRemainingTime() {
        const elapsedTime = Date.now() - this.startTime;
        return Math.max(this.maxExecutionTime - elapsedTime, 0);
    }

    // Check if enough time remains for an operation
    hasTimeRemaining(requiredTime = 5000) {
        return this.getRemainingTime() > requiredTime;
    }

    // Dynamically allocate timeout for sub-operations
    getSubOperationTimeout(totalOperations, currentOperationIndex) {
        const remainingTime = this.getRemainingTime();
        const averageTimePerOperation = remainingTime / (totalOperations - currentOperationIndex);
        return Math.max(averageTimePerOperation, 2000); // Minimum 2 seconds
    }

    // Throw error if timeout is imminent
    throwIfTimeoutApproaching() {
        const remainingTime = this.getRemainingTime();
        if (remainingTime <= 3000) {
            throw new Error(`Timeout imminent. Only ${remainingTime}ms remaining.`);
        }
    }
}

// Wrap Promise with timeout
function promiseWithTimeout(promise, timeout, errorMessage) {
    let timeoutId;
    const timeoutPromise = new Promise((_, reject) => {
        timeoutId = setTimeout(() => reject(new Error(errorMessage)), timeout);
    });

    return Promise.race([
        promise.finally(() => clearTimeout(timeoutId)),
        timeoutPromise
    ]);
}

// Modified handler with timeout management
// Initialize cache instance
const sheetsCache = new GoogleSheetsCache();

export async function handler(event, context) {
    console.group('🚀 HANDLER EXECUTION DIAGNOSTICS');
    console.log('📋 Incoming Event', {
        method: event.httpMethod,
        queryParams: event.queryStringParameters,
        headers: event.headers
    });

    // Test route for API key verification
    if (event.httpMethod === 'GET' && event.path === '/.netlify/functions/analyze/test-auth') {
        return {
            statusCode: 200,
            body: JSON.stringify({
                googleApiKey: process.env.GOOGLE_API_KEY ? {
                    present: true,
                    length: process.env.GOOGLE_API_KEY.length,
                    prefix: process.env.GOOGLE_API_KEY.substring(0, 5),
                    suffix: process.env.GOOGLE_API_KEY.slice(-5)
                } : 'MISSING',
                googleSearchEngineId: process.env.GOOGLE_SEARCH_ENGINE_ID ? {
                    present: true,
                    length: process.env.GOOGLE_SEARCH_ENGINE_ID.length,
                    value: process.env.GOOGLE_SEARCH_ENGINE_ID
                } : 'MISSING'
            })
        };
    }

    // Validate API credentials at startup
    console.log('🔑 API Credentials Check', {
        googleApiKey: process.env.GOOGLE_API_KEY ? `${process.env.GOOGLE_API_KEY.substring(0, 5)}...${process.env.GOOGLE_API_KEY.slice(-5)}` : 'MISSING',
        googleSearchEngineId: process.env.GOOGLE_SEARCH_ENGINE_ID ? `${process.env.GOOGLE_SEARCH_ENGINE_ID.substring(0, 5)}...` : 'MISSING',
        googleApiKeyLength: process.env.GOOGLE_API_KEY?.length || 0,
        searchEngineIdLength: process.env.GOOGLE_SEARCH_ENGINE_ID?.length || 0
    });

    if (!process.env.GOOGLE_API_KEY || !process.env.GOOGLE_SEARCH_ENGINE_ID) {
        console.error('❌ Missing Google API credentials');
        return {
            statusCode: 500,
            body: JSON.stringify({ 
                error: 'Google Search API configuration is missing',
                details: {
                    apiKeyPresent: !!process.env.GOOGLE_API_KEY,
                    searchEngineIdPresent: !!process.env.GOOGLE_SEARCH_ENGINE_ID
                }
            })
        };
    }

    try {
        // Initialize cache
        const cacheInitialized = await sheetsCache.initialize();
        if (!cacheInitialized) {
            console.warn('⚠️ Cache initialization failed, proceeding without caching');
        }

        // Parse request body
        const { query, category, county, shouldSearch } = JSON.parse(event.body || '{}');

        console.log('🔍 Search Parameters', {
            query,
            category, // This represents Federal/State/County
            county,
            shouldSearch
        });

        // Validate input parameters
        if (!category || !['Federal', 'State', 'County'].includes(category)) {
            console.error('❌ Missing or invalid category (Federal/State/County)');
            return {
                statusCode: 400,
                body: JSON.stringify({ error: 'Missing or invalid category (Federal/State/County)' })
            };
        }

        // For County searches, ensure county is provided
        if (category === 'County' && !county) {
            console.error('❌ County is required for County-level searches');
            return {
                statusCode: 400,
                body: JSON.stringify({ error: 'County is required for County-level searches' })
            };
        }

        // Get search queries based on category (which represents Federal/State/County) and county
        const searchQueries = netlifyGetSearchQueries(category, county);

        console.log('🔎 Generated Search Queries', {
            queryCount: searchQueries.length,
            queries: searchQueries
        });

        // Perform Google searches for each query
        const searchResultPromises = searchQueries.map(async (query) => {
            console.log('🌐 Executing Search for Query', { query });
            const searchResults = await netlifyPerformGoogleSearch(query);
            
            console.log('📊 Search Results for Query', {
                query,
                resultsCount: searchResults ? searchResults.length : 0,
                firstResultTitle: searchResults && searchResults[0] ? searchResults[0].title : 'N/A'
            });

            return searchResults;
        });

        // Wait for all searches to complete
        const allSearchResults = await Promise.all(searchResultPromises);

        console.log('🧩 Combined Search Results', {
            totalSearchResultsCount: allSearchResults.length,
            searchResultsDetails: allSearchResults.map(results => ({
                count: results ? results.length : 0,
                firstResultTitle: results && results[0] ? results[0].title : 'N/A'
            }))
        });

        // Flatten search results
        const flattenedSearchResults = allSearchResults.flat().filter(result => result);

        console.log('📝 Flattened Search Results', {
            totalFlattenedResults: flattenedSearchResults.length,
            firstResultTitle: flattenedSearchResults[0] ? flattenedSearchResults[0].title : 'N/A'
        });

        let analyzedResults;
        if (cacheInitialized) {
            // Check cache before analysis
            const cacheResult = await sheetsCache.checkCache(query || '', category);
            
            if (cacheResult?.found && cacheResult.openaiAnalysis) {
                console.log('📦 Cache Hit', {
                    query: query || '',
                    category,
                    timestamp: cacheResult.timestamp
                });
                analyzedResults = cacheResult.openaiAnalysis;
            }
        }

        if (!analyzedResults) {
            // Analyze search results
            analyzedResults = await netlifyAnalyzeResults(
                flattenedSearchResults, 
                category, 
                county, 
                category
            );

            // Log to cache if initialized
            if (cacheInitialized) {
                await sheetsCache.logSearch({
                query: query || '',
                level: category,
                googleResults: flattenedSearchResults,
                openaiAnalysis: analyzedResults,
                isGoogleCached: false,
                isOpenAICached: false
                });
            }

            console.log('🤖 Fresh Analysis Results', {
                analyzedResultsType: typeof analyzedResults,
                analyzedResultsCount: analyzedResults ? analyzedResults.length : 0
            });
        }

        // Prepare response
        const responseBody = JSON.stringify({
            level: category, // Store Federal/State/County in the Level column
            county,
            results: analyzedResults || []
        });

        console.groupEnd();

        return {
            statusCode: 200,
            body: responseBody,
            headers: {
                'Content-Type': 'application/json'
            }
        };

    } catch (error) {
        console.error('❌ Handler Execution Error', {
            errorMessage: error.message,
            errorStack: error.stack
        });
        console.groupEnd();

        return {
            statusCode: error.message.includes('timeout') ? 408 : 500,
            body: JSON.stringify({
                error: error.message,
                type: error.name,
                timestamp: new Date().toISOString(),
                details: error.stack
            })
        };
    }
}

// Modified Google search function with comprehensive error handling and logging
async function netlifyPerformGoogleSearch(query) {
    console.log('🌐 Executing Google Search', { query });

    if (!query || typeof query !== 'string') {
        console.warn('⚠️ Invalid search query', { query });
        return [];
    }

    try {
        const url = `https://www.googleapis.com/customsearch/v1?key=${process.env.GOOGLE_API_KEY}&cx=${process.env.GOOGLE_SEARCH_ENGINE_ID}&q=${encodeURIComponent(query)}&num=10`;
        
        const response = await googleSearchManager.fetchWithRetry(url);

        console.log('📡 Google Search Response', {
            status: response.status,
            totalResults: response.searchInformation?.totalResults || 0
        });

        // Check if items exist in the response
        if (!response.items || response.items.length === 0) {
            console.warn('🚫 No search results found', { query });
            return [];
        }

        // Process and validate search results
        const processedResults = response.items.map(item => ({
            title: item.title || 'Untitled',
            link: item.link || '',
            snippet: item.snippet || '',
            displayLink: item.displayLink || ''
        })).filter(result => result.link);  // Ensure each result has a valid link

        console.log('✅ Processed Search Results', {
            query,
            processedResultsCount: processedResults.length
        });

        return processedResults;

    } catch (error) {
        // Enhanced error logging
        console.error('❌ Google Search Error', {
            query,
            errorMessage: error.message,
            apiKeyLength: process.env.GOOGLE_API_KEY?.length || 0,
            searchEngineIdLength: process.env.GOOGLE_SEARCH_ENGINE_ID?.length || 0,
            apiKeyPresent: !!process.env.GOOGLE_API_KEY,
            searchEngineIdPresent: !!process.env.GOOGLE_SEARCH_ENGINE_ID,
            errorResponse: error.response ? {
                status: error.response.status,
                data: error.response.data
            } : 'No response data'
        });

        if (error.message.includes('403')) {
            console.error('🔑 Google API Authentication Error', {
                message: 'API key may be invalid, expired, or reached quota limit',
                apiKeyPrefix: process.env.GOOGLE_API_KEY?.substring(0, 5) + '...',
                searchEngineIdPrefix: process.env.GOOGLE_SEARCH_ENGINE_ID?.substring(0, 5) + '...'
            });
        }

        // Return empty array instead of throwing an error
        return [];
    }
}
