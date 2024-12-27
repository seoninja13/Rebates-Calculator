import { GoogleSheetsCache } from './services/sheets-cache.mjs';
import { OpenAI } from 'openai';
import fetch from 'node-fetch';

// Helper function to get search queries
function netlifyGetSearchQueries(level, county) {
    if (!level) throw new Error('Level is required');
    
    switch (level.trim()) {
        case 'Federal':
            return [
                'federal energy rebate programs california, US government energy incentives california'
            ];
        case 'State':
            return [
                'California state energy rebate programs, California state government energy incentives'
            ];
        case 'County':
            if (!county) throw new Error('County is required for county-level search');
            const cleanCounty = county.replace(/^County:/, '').trim();
            return [
                `${cleanCounty} County energy rebate programs, ${cleanCounty} County energy incentives`
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
        if (!process.env.GOOGLE_API_KEY || !process.env.GOOGLE_SEARCH_ENGINE_ID) {
            throw new Error('Google Search API configuration is missing');
        }

        const url = `https://www.googleapis.com/customsearch/v1?key=${process.env.GOOGLE_API_KEY}&cx=${process.env.GOOGLE_SEARCH_ENGINE_ID}&q=${encodeURIComponent(query)}&num=7`;
        
        try {
            const searchResults = await this.fetchWithRetry(url, {}, timeout);
            
            console.log('📥 GOOGLE SEARCH RESULTS:', {
                query: query,
                totalResults: searchResults.searchInformation?.totalResults,
                itemsCount: searchResults.items?.length,
                firstResult: searchResults.items?.[0]?.title,
                timestamp: new Date().toISOString()
            });

            return searchResults;
        } catch (error) {
            console.error('Google Search API Error:', {
                query,
                error: error.message,
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
        const contextDetails = searchContext.map(result => 
            `Title: ${result.title}\n` +
            `URL: ${result.link}\n` +
            `Snippet: ${result.snippet}\n`
        ).join('\n\n');

        return `Analyze energy rebate programs for ${level} level${county ? ` in ${county} County` : ''}:

Search Result Context:
${contextDetails}

Specific Requirements:
- Focus on energy efficiency programs
- Include residential and commercial rebates
- Capture programs related to: solar, insulation, HVAC, appliance upgrades
- Prioritize current and active programs

Extract ALL relevant energy rebate and incentive programs from these results.`;
    }

    // Perform OpenAI analysis with advanced error handling
    async analyzeSearchResults(searchContext, level, county, category) {
        try {
            // Detailed logging of input
            console.log('🔍 OpenAI Analysis Attempt', {
                searchResultCount: searchContext.length,
                level,
                county,
                category,
                attempt: this.retryCount + 1
            });

            const userMessage = this.constructUserMessage(
                searchContext, 
                level, 
                county, 
                category
            );

            // Log message details
            console.log('📝 OpenAI User Message', {
                length: userMessage.length,
                firstLines: userMessage.split('\n').slice(0, 5).join('\n')
            });

            const completion = await this.fetchWithRetry(
                'https://api.openai.com/v1/chat/completions', 
                {
                    method: 'POST',
                    headers: {
                        'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({
                        model: "gpt-4-1106-preview",
                        messages: [
                            { role: "system", content: OPENAI_PROMPTS.SYSTEM_PROMPT },
                            { role: "user", content: userMessage }
                        ],
                        response_format: { type: "json_object" },
                        temperature: 0.3,  // More conservative
                        max_tokens: 4096
                    })
                },
                10000
            );

            // Log raw completion
            console.log('🤖 OpenAI Raw Completion', {
                tokenUsage: completion.usage,
                responseLength: completion.choices[0].message.content.length
            });

            return completion.choices[0].message.content;

        } catch (error) {
            console.error('❌ OpenAI Analysis Error', {
                error: error.message,
                stack: error.stack,
                retryCount: this.retryCount
            });

            // Implement retry with fallback prompts
            if (this.retryCount < this.maxRetries) {
                this.retryCount++;
                
                // Use fallback prompt
                const fallbackPrompt = OPENAI_PROMPTS.FALLBACK_PROMPTS[
                    this.retryCount - 1
                ];

                console.log(`🔄 Retry ${this.retryCount} with Fallback Prompt`);

                return this.analyzeSearchResults(
                    searchContext, 
                    level, 
                    county, 
                    category
                );
            }

            // If all retries fail, return empty result
            return JSON.stringify({ programs: [] });
        }
    }
}

// Search Results Processing Utility
class SearchResultsProcessor {
    constructor(options = {}) {
        this.options = {
            maxResults: 5,  // Explicitly set to 5 results
            maxSnippetLength: options.maxSnippetLength || 250,
            minRelevanceScore: options.minRelevanceScore || 0.5,
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
            'savings', 'program', 'grant', 'subsidy'
        ];

        // Check title for keywords
        relevanceKeywords.forEach(keyword => {
            if (result.title && result.title.toLowerCase().includes(keyword)) {
                score += 0.2;
            }
        });

        // Check snippet for keywords
        relevanceKeywords.forEach(keyword => {
            if (result.snippet && result.snippet.toLowerCase().includes(keyword)) {
                score += 0.2;
            }
        });

        return Math.min(score, 1);
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
    // Log input parameters for debugging
    console.log('OpenAI Analysis Input: {', 
        `resultsCount: ${results?.length || 0},`, 
        `level: '${level}',`, 
        `county: '${county}',`, 
        `category: '${category}',`, 
        `query: ${query},`, 
        `resultTitles: [${results?.map(r => r.title).join(', ') || 'none'}]`, 
    '}');

    try {
        // Prepare search results for OpenAI
        const searchContext = results.map(result => ({
            title: result.title || 'Untitled Result',
            link: result.link || '',
            snippet: result.snippet || ''
        }));

        // Construct OpenAI prompt
        const userMessage = openAIManager.constructUserMessage(
            searchContext, 
            level, 
            county, 
            category
        );

        // Perform OpenAI analysis with timeout
        const openaiResponse = await promiseWithTimeout(
            openAIManager.analyzeSearchResults(
                searchContext, 
                level, 
                county, 
                category
            ),
            25000,  // 25-second timeout
            "OpenAI analysis timed out"
        );

        // Parse OpenAI response
        const parsedPrograms = await processOpenAIResponse(
            openaiResponse, 
            level, 
            county
        );

        // Log parsed programs
        console.log('Parsed OpenAI Programs:', {
            count: parsedPrograms.programs.length,
            programs: parsedPrograms.programs
        });

        // Handle empty program set
        if (parsedPrograms.programs.length === 0) {
            console.warn('No programs found', { 
                level, 
                county, 
                category,
                searchResultsCount: results.length 
            });

            // Return a default empty result set
            return {
                level,
                count: 0,
                programs: [],
                searchContext: searchContext
            };
        }

        return parsedPrograms;

    } catch (error) {
        console.error('OpenAI Analysis Error:', {
            error: error.message,
            stack: error.stack,
            level,
            county,
            category
        });

        // Return a structured error response
        return {
            level,
            count: 0,
            programs: [],
            error: error.message
        };
    }
}

// Process and validate OpenAI response
async function processOpenAIResponse(openaiResponse, level, county) {
    try {
        // Parse the JSON string directly
        const parsedResponse = JSON.parse(openaiResponse);

        console.log('Parsed OpenAI Programs:', {
            count: parsedResponse.programs ? parsedResponse.programs.length : 0,
            programs: parsedResponse.programs
        });

        // Use the new ensureMultipleCountyPrograms function
        const processedPrograms = ensureMultipleCountyPrograms(parsedResponse.programs || []);

        console.log('Final Processed Programs:', {
            level: processedPrograms.level,
            count: processedPrograms.count
        });

        // If no programs were processed, log a warning
        if (processedPrograms.count === 0) {
            console.warn('No valid programs found in OpenAI response', {
                rawProgramsCount: parsedResponse.programs ? parsedResponse.programs.length : 0,
                level,
                county
            });
        }

        return processedPrograms;

    } catch (error) {
        console.error('Error processing OpenAI response:', {
            message: error.message,
            stack: error.stack,
            rawResponse: openaiResponse,
            level,
            county
        });
        
        // Return a standardized empty response
        return {
            level,
            count: 0,
            programs: []
        };
    }
}

// Ensure multiple county programs are processed and validated
function ensureMultipleCountyPrograms(rawPrograms) {
    // Validate input
    if (!Array.isArray(rawPrograms) || rawPrograms.length === 0) {
        console.warn('No programs to process');
        return { level: 'County', count: 0, programs: [] };
    }

    // Transform raw programs to match expected structure
    const processedPrograms = rawPrograms.map(program => ({
        programName: program.name || program.title,
        programType: program.type || program.programType || 'Rebate',
        summary: program.description || program.summary || 'No description available',
        amount: program.estimated_value?.amount || 'Not specified',
        eligibleProjects: program.eligibility?.projects || [],
        eligibleRecipients: program.eligibility?.recipients || 'Not specified',
        geographicScope: program.funding_source || 'Not specified',
        websiteLink: program.url || '#',
        requirements: program.eligibility?.requirements || [],
        applicationProcess: 'Not specified',
        deadline: 'Not specified',
        contactInfo: 'Not specified',
        processingTime: 'Not specified',
        collapsedSummary: program.description ? 
            `${program.name || program.title} - ${program.description.substring(0, 100)}...` 
            : 'No summary available'
    }));

    // Validate each processed program
    const validatedPrograms = processedPrograms
        .map(program => validateAndEnhanceProgram(program))
        .filter(program => program !== null);

    return {
        level: 'County',
        count: validatedPrograms.length,
        programs: validatedPrograms
    };
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
        timeoutId = setTimeout(() => {
            reject(new Error(errorMessage));
        }, timeout);
    });

    return Promise.race([
        promise.finally(() => clearTimeout(timeoutId)),
        timeoutPromise
    ]);
}

// Modified handler with timeout management
export async function handler(event, context) {
    // Initialize timeout manager
    const timeoutManager = new TimeoutManager();

    try {
        // Early parameter validation
        const { level, county, category = 'all' } = JSON.parse(event.body);
        
        if (!level) {
            return {
                statusCode: 400,
                body: JSON.stringify({ error: 'Level parameter is required' })
            };
        }

        // Check initial timeout
        timeoutManager.throwIfTimeoutApproaching();

        // Cache retrieval with timeout awareness
        const cache = new GoogleSheetsCache();
        let cacheResult;
        try {
            cacheResult = await promiseWithTimeout(
                cache.netlifyGetCache(level, county, category),
                timeoutManager.getSubOperationTimeout(4, 0),
                'Cache retrieval timed out'
            );
        } catch (cacheError) {
            console.error('Cache retrieval error:', cacheError);
            // Continue with search if cache fails
        }

        // Check timeout after cache attempt
        timeoutManager.throwIfTimeoutApproaching();

        // Return cached result if available
        if (cacheResult && cacheResult.found && cacheResult.data) {
            return {
                statusCode: 200,
                body: JSON.stringify({
                    programs: cacheResult.data.openaiAnalysis || { 
                        level, 
                        count: 0, 
                        programs: [],
                        source: 'empty_cache'
                    },
                    source: 'cache'
                })
            };
        }

        // Prepare search queries
        const queries = netlifyGetSearchQueries(level, county);

        // Perform search with timeout
        let searchResults;
        try {
            searchResults = await promiseWithTimeout(
                Promise.all(queries.map(query => netlifyPerformGoogleSearch(query))),
                timeoutManager.getSubOperationTimeout(4, 1),
                'Google Search timed out'
            );
        } catch (searchError) {
            console.error('Search error:', searchError);
            throw searchError; // Rethrow to be caught by outer handler
        }

        // Check timeout after search
        timeoutManager.throwIfTimeoutApproaching();

        // Analyze results with timeout
        let openaiResult;
        try {
            openaiResult = await promiseWithTimeout(
                netlifyAnalyzeResults(searchResults, level, county, category),
                timeoutManager.getSubOperationTimeout(4, 2),
                'OpenAI analysis timed out'
            );
        } catch (analysisError) {
            console.error('Analysis error:', analysisError);
            throw analysisError; // Rethrow to be caught by outer handler
        }

        // Final timeout check before caching
        timeoutManager.throwIfTimeoutApproaching();

        // Cache the results with timeout
        try {
            await promiseWithTimeout(
                cache.netlifySetCache(level, county, category, openaiResult),
                timeoutManager.getSubOperationTimeout(4, 3),
                'Cache storage timed out'
            );
        } catch (cacheSetError) {
            console.error('Cache storage error:', cacheSetError);
            // Non-critical error, continue with response
        }

        // Return successful response
        return {
            statusCode: 200,
            body: JSON.stringify(openaiResult)
        };

    } catch (error) {
        // Comprehensive error handling
        console.error('Function execution error:', error);

        const errorResponse = {
            statusCode: error.message.includes('timeout') ? 408 : 500,
            body: JSON.stringify({
                error: error.message,
                type: error.name,
                timestamp: new Date().toISOString(),
                details: error.stack
            })
        };

        return errorResponse;
    }
}

// Modify existing search function to use SearchResultsProcessor
async function netlifyPerformGoogleSearch(query, timeout = 7000) {
    const searchResults = await googleSearchManager.search(query, timeout);
    
    const resultsProcessor = new SearchResultsProcessor({
        maxResults: 5,
        maxSnippetLength: 250,
        minRelevanceScore: 0.5
    });

    const processedResults = resultsProcessor.processSearchResults([searchResults]);

    console.log('🔍 PROCESSED SEARCH RESULTS:', {
        totalResultsReceived: processedResults.totalResultsReceived,
        uniqueResultsCount: processedResults.uniqueResultsCount,
        processedResultsCount: processedResults.processedResultsCount,
        resultLimit: processedResults.resultLimit
    });

    return processedResults.results;
}
