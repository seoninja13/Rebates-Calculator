const express = require('express');
const path = require('path');
const googleSheetsCache = require('./netlify/functions/sheets-cache.js');
const dotenv = require('dotenv');
const cors = require('cors');

// Load environment variables
dotenv.config();

// Function to get search queries based on category
function getSearchQueries(category, userQuery) {
    const queries = [];
    
    // Add the user's direct query
    queries.push(userQuery);
    
    // Add category-specific queries
    if (category === 'Federal') {
        queries.push('US government energy incentives california');
    } else if (category === 'State') {
        queries.push('California energy incentives');
    }
    
    // Add a combined query for more comprehensive results
    queries.push(`${category}_combined`);
    
    return queries;
}

const app = express();

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(path.dirname(__filename))));

// Root route
app.get('/', (req, res) => {
    res.sendFile(path.join(path.dirname(__filename), 'index.html'));
});

// Previous imports and setup remain the same...

app.post('/api/analyze', async (req, res) => {
    const { query, category, maxResults = 10 } = req.body;
    
    try {
        console.log('Frontend → API | Received | Query:', {
            query,
            category,
            maxResults,
            timestamp: new Date().toISOString(),
            type: 'incoming_request'
        });

        // Get all search queries for this category
        const searchQueries = getSearchQueries(category, query);
        let allSearchResults = [];
        let cacheHits = 0;

        // Process each search query
        for (const searchQuery of searchQueries) {
            try {
                // Try to get from cache first
                let cachedResult = null;
                try {
                    cachedResult = await googleSheetsCache.get(searchQuery, category);
                } catch (error) {
                    console.error('Cache error:', error);
                }
                
                if (cachedResult) {
                    console.log('Cache → API | Hit | Using cached results for query:', searchQuery);
                    if (cachedResult.results) {
                        allSearchResults = allSearchResults.concat(cachedResult.results);
                    }
                    cacheHits++;
                    continue;  // Skip to next query if we have cached results
                }
            } catch (error) {
                console.error('Cache → Error | Failed to get from cache:', error);
                // Continue with Google search even if cache fails
            }

            // API to Google
            sendLogToClient(`API → Google | Searching | Query: "${searchQuery}"`, {
                query: searchQuery,
                searchUrl: `https://www.googleapis.com/customsearch/v1?cx=${process.env.GOOGLE_SEARCH_ENGINE_ID}&q=${encodeURIComponent(searchQuery)}`,
                timestamp: new Date().toISOString(),
                type: 'google_request'
            });
            
            const googleData = await searchGoogle(searchQuery, maxResults);
            if (googleData.items) {
                allSearchResults = allSearchResults.concat(googleData.items);
            }
            
            // Google to API
            sendLogToClient(`Google → API | Results: ${googleData.items?.length || 0} | Total: ${googleData.searchInformation.totalResults}`, {
                totalResults: parseInt(googleData.searchInformation.totalResults),
                returnedResults: googleData.items?.length || 0,
                searchTime: googleData.searchInformation.searchTime,
                items: googleData.items?.map(item => ({
                    title: item.title,
                    link: item.link,
                    snippet: item.snippet
                })),
                timestamp: new Date().toISOString(),
                type: 'google_response'
            });

            // Try to cache the results
            try {
                if (googleData.items) {
                    await googleSheetsCache.set(searchQuery, category, {
                        results: googleData.items,
                        timestamp: new Date().toISOString()
                    });
                }
            } catch (error) {
                console.error('Cache → Error | Failed to set in cache:', error);
                // Continue even if caching fails
            }
        }

        // Remove duplicates based on URL
        allSearchResults = allSearchResults.filter((result, index, self) =>
            index === self.findIndex((r) => r.link === result.link)
        );

        // API to OpenAI for combined results
        sendLogToClient(`API → OpenAI | Analyzing | Results: ${allSearchResults.length} | Category: ${category}`, {
            resultsCount: allSearchResults.length,
            category,
            model: "gpt-4-turbo-preview",
            timestamp: new Date().toISOString(),
            type: 'openai_request'
        });
        
        // Get OpenAI analysis
        const analysis = await analyzeSearchResults(allSearchResults, category);
        
        // Log OpenAI analysis results
        sendLogToClient(`OpenAI → API | Analysis Complete | Programs Found: ${analysis.programs?.length || 0}`, {
            category,
            programsCount: analysis.programs?.length || 0,
            programs: analysis.programs,
            timestamp: new Date().toISOString(),
            type: 'openai_response'
        });

        // Only cache if we have valid OpenAI analysis
        if (analysis && analysis.programs && analysis.programs.length > 0) {
            // Cache results for each search query
            for (const searchQuery of searchQueries) {
                try {
                    await googleSheetsCache.set(searchQuery, category, {
                        results: allSearchResults,
                        analysis: analysis,
                        source: {
                            googleSearch: true,
                            openaiAnalysis: true
                        }
                    });
                } catch (error) {
                    console.error('Cache → Error | Failed to set in cache:', error);
                    // Continue even if caching fails
                }
            }
        }

        res.json(analysis);
    } catch (error) {
        console.error('Error in /api/analyze:', error);
        res.status(500).json({ error: 'Internal server error', details: error.message });
    }
});

// Rest of the server.js code remains the same...

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});
