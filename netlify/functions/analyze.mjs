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

// Helper function to perform Google search
async function netlifyPerformGoogleSearch(query) {
    if (!process.env.GOOGLE_API_KEY || !process.env.GOOGLE_SEARCH_ENGINE_ID) {
        throw new Error('Google Search API configuration is missing');
    }

    console.log('🔍 GOOGLE SEARCH REQUEST:', {
        query: query,
        timestamp: new Date().toISOString()
    });

    // Limit to 7 results per query
    const url = `https://www.googleapis.com/customsearch/v1?key=${process.env.GOOGLE_API_KEY}&cx=${process.env.GOOGLE_SEARCH_ENGINE_ID}&q=${encodeURIComponent(query)}&num=7`;
    
    const response = await fetch(url);
    if (!response.ok) {
        const error = await response.text();
        throw new Error(`Google Search API error: ${response.status} - ${error}`);
    }
    const searchResults = await response.json();
    
    console.log('📥 GOOGLE SEARCH RESULTS:', {
        query: query,
        totalResults: searchResults.searchInformation?.totalResults,
        itemsCount: searchResults.items?.length,
        firstResult: searchResults.items?.[0]?.title,
        timestamp: new Date().toISOString()
    });

    return searchResults;
}

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

// Helper function to normalize program type
function normalizeRebateType(type) {
    if (!type) return 'Not Available';
    
    const typeMap = {
        'rebate': 'Rebate',
        'grant': 'Grant',
        'tax credit': 'Tax Credit',
        'tax-credit': 'Tax Credit',
        'low-interest loan': 'Low-Interest Loan',
        'loan': 'Low-Interest Loan',
        'incentive': 'Rebate',
        'reimbursement': 'Rebate'
    };

    return typeMap[type.toLowerCase()] || type;
}

// Helper function to create program entries for each eligible project
function createProgramEntries(program) {
    if (!program) return [];
    
    const type = normalizeRebateType(program.programType);
    const projects = Array.isArray(program.eligibleProjects) ? program.eligibleProjects : [];
    
    if (projects.length === 0) {
        return [{
            title: program.programName || 'Not Available',
            programType: type,
            summary: program.summary || 'No summary available',
            amount: program.amount || 'Not specified',
            eligibleProjects: [],
            eligibleRecipients: program.eligibleRecipients || 'Not specified',
            geographicScope: program.geographicScope || 'Not specified',
            requirements: Array.isArray(program.requirements) ? program.requirements : [],
            applicationProcess: program.applicationProcess || 'Not specified',
            deadline: program.deadline || 'Not specified',
            websiteLink: program.websiteLink || '#',
            contactInfo: program.contactInfo || 'Not specified',
            processingTime: program.processingTime || 'Not specified',
            collapsedSummary: createCollapsedSummary(program)
        }];
    }
    
    return projects.map(project => {
        const projectName = typeof project === 'object' ? project.name : project;
        const projectAmount = (typeof project === 'object' && project.amount) ? project.amount : program.amount;
        
        const entry = {
            title: program.programName || 'Not Available',
            programType: type,
            summary: program.summary || 'No summary available',
            amount: projectAmount || 'Not specified',
            eligibleProjects: [projectName],
            eligibleRecipients: program.eligibleRecipients || 'Not specified',
            geographicScope: program.geographicScope || 'Not specified',
            requirements: Array.isArray(program.requirements) ? program.requirements : [],
            applicationProcess: program.applicationProcess || 'Not specified',
            deadline: program.deadline || 'Not specified',
            websiteLink: program.websiteLink || '#',
            contactInfo: program.contactInfo || 'Not specified',
            processingTime: program.processingTime || 'Not specified'
        };
        
        entry.collapsedSummary = createCollapsedSummary(entry);
        return entry;
    });
}

// Helper function to analyze results with OpenAI
async function netlifyAnalyzeResults(results, level, county, category, query) {
    try {
        const openai = new OpenAI({
            apiKey: process.env.OPENAI_API_KEY
        });

        // Create system message
        const systemMessage = `You are a helpful assistant that analyzes search results about energy rebate programs and extracts structured information. Format your response as a JSON array of program objects.`;

        // Create user message with search results
        const userMessage = `Here are search results about ${level} level energy rebate programs${county ? ` in ${county} County` : ''}. Please analyze them and return a JSON array of programs with their details:

${results.map(result => `Title: ${result.title}\nURL: ${result.link}\nDescription: ${result.snippet}\n`).join('\n')}`;

        const completion = await openai.chat.completions.create({
            model: "gpt-4-1106-preview",
            messages: [
                { role: "system", content: systemMessage },
                { role: "user", content: userMessage }
            ],
            temperature: 0,
            response_format: { type: "json_object" }
        });

        return processOpenAIResponse(completion, level);
    } catch (error) {
        console.error('OpenAI Analysis Error:', error);
        throw error;
    }
}

// Process and validate OpenAI response
function processOpenAIResponse(completion, level) {
    try {
        const content = completion.choices[0]?.message?.content;
        if (!content) {
            console.error('Empty OpenAI response');
            return [];
        }

        let programs = [];
        try {
            programs = JSON.parse(content);
        } catch (e) {
            console.error('Failed to parse OpenAI response:', e);
            return [];
        }

        if (!Array.isArray(programs)) {
            console.error('OpenAI response is not an array');
            return [];
        }

        // Process each program
        const processedPrograms = programs.map(program => {
            // Create program entries for each project
            const entries = createProgramEntries(program);
            
            // Validate and enhance each entry
            return entries.map(entry => validateAndEnhanceProgram(entry));
        }).flat();

        // Apply level-specific validation and enhancement
        switch (level) {
            case 'Federal':
                return ensureFederalPrograms(processedPrograms);
            case 'State':
                return ensureStatePrograms(processedPrograms);
            case 'County':
                return ensureMultipleCountyPrograms(processedPrograms);
            default:
                return processedPrograms;
        }
    } catch (error) {
        console.error('Error processing OpenAI response:', error);
        return [];
    }
}

// Main handler function
export async function handler(event, context) {
    console.log('🚀 FUNCTION INVOCATION:', {
        path: event.path,
        httpMethod: event.httpMethod,
        timestamp: new Date().toISOString()
    });

    try {
        // Parse both query parameters and request body
        const params = event.queryStringParameters || {};
        const body = event.body ? JSON.parse(event.body) : {};
        
        // Get parameters from either query or body
        const level = params.level || body.level;
        const county = params.county || body.county;
        const category = params.category || body.category;

        if (!level) {
            return {
                statusCode: 400,
                body: JSON.stringify({ error: 'Level parameter is required' })
            };
        }

        // For County level, ensure county is provided
        if (level.trim() === 'County' && !county) {
            return {
                statusCode: 400,
                body: JSON.stringify({ error: 'County parameter is required for County level search' })
            };
        }

        // Initialize cache first
        const cache = new GoogleSheetsCache();
        await cache.initialize();

        // Check cache first
        const cacheResult = await cache.netlifyGetCache(level, county, category);
        if (cacheResult.found) {
            console.log('Cache → Hit | Returning cached data');
            return {
                statusCode: 200,
                body: JSON.stringify({
                    programs: cacheResult.data.openaiAnalysis,
                    source: 'cache'
                })
            };
        }

        console.log('Cache → Miss | Performing search');

        // Get search queries
        const queries = netlifyGetSearchQueries(level, county);

        // Perform searches
        const searchPromises = queries.map(query => netlifyPerformGoogleSearch(query));
        const searchResults = await Promise.all(searchPromises);

        // Combine and deduplicate results
        const allResults = searchResults.flatMap(result => result.items || []);
        const uniqueResults = Array.from(new Map(allResults.map(item => [item.link, item])).values());

        // Analyze results
        const analysis = await netlifyAnalyzeResults(uniqueResults, level, county, category, queries[0]);

        // Store results in cache with exact format
        const cacheData = {
            query: queries[0],
            level: level.trim(),
            googleResults: uniqueResults,
            openaiAnalysis: analysis,
            timestamp: cache.netlifyGetPSTTimestamp(),
            hash: cache.netlifyGenerateHash(level, county, 'all'),
            googleSearchCache: "Search",
            openaiSearchCache: "Search"
        };

        await cache.netlifySetCache(level, county, 'all', cacheData);

        return {
            statusCode: 200,
            body: JSON.stringify({
                programs: analysis,
                source: 'search'
            })
        };

    } catch (error) {
        console.error('🚨 ERROR:', error);
        
        return {
            statusCode: 500,
            body: JSON.stringify({
                error: error.message,
                timestamp: new Date().toISOString()
            })
        };
    }
}
