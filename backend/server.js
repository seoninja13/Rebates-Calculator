const express = require('express');
const cors = require('cors');
const rateLimit = require('express-rate-limit');
const NodeCache = require('node-cache');
const OpenAI = require('openai');
require('dotenv').config();

const app = express();
const cache = new NodeCache({ stdTTL: 24 * 60 * 60 }); // 24 hour cache

// Initialize OpenAI
const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY
});

// Rate limiting
const limiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 100 // limit each IP to 100 requests per windowMs
});

// CORS configuration
const corsOptions = {
    origin: ['http://127.0.0.1:3000', 'http://localhost:3000', 'https://green-rebates-calculator.netlify.app'],
    methods: ['GET', 'POST', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    credentials: true
};

// Middleware
app.use(cors(corsOptions));
app.use(limiter);
app.use(express.json());

// Helper function to analyze results
async function analyzeResults(results, category) {
    const cacheKey = `${category}-${JSON.stringify(results)}`;
    
    if (cache.has(cacheKey)) {
        return cache.get(cacheKey);
    }

    try {
        const resultsText = results.map(r => `Title: ${r.title}\nDescription: ${r.snippet}`).join('\n\n');
        const prompt = `Analyze these ${category} rebate programs and extract detailed information about all programs. For each program, provide the following information in this exact format:

Title: [Program Name]

Summary: Provide a concise 320-character summary focusing on the program's key benefits and eligibility criteria.

Program Type: Specify if it's a rebate, grant, tax credit, or low-interest loan. This helps categorize the program.

Amount: Format as exact amount (e.g., "$5,000") or range (e.g., "Up to $X,XXX"). Always include dollar signs and commas.

Eligible Projects: List specific projects that qualify, such as:
- Solar panels
- HVAC systems
- Insulation
- Electric vehicles
- Energy-efficient appliances
- Home improvements

Eligible Recipients: Specify who can apply, including:
- Type of applicant (homeowners, businesses, municipalities)
- Income requirements if any
- Other qualifying criteria

Geographic Scope: Specify the exact coverage area:
- Nationwide
- State-specific (specify which state)
- County or city-specific
- Utility service area

Requirements: List all required documents and conditions, such as:
- Application forms
- Proof of purchase/installation
- Contractor requirements
- Energy audits
- Income verification
- Property documentation

Application Process: Provide a clear 1-2 line description of how to apply (e.g., "Apply online through government portal" or "Submit application to local utility company")

Deadline: Specify the application deadline or if it's ongoing. Include exact date if available.

Website Link: Provide the official program URL for more information or application.

Contact Information: Include phone numbers, email addresses, or office locations for support.

Processing Time: Specify how long it typically takes to receive funds or approval (e.g., "6-8 weeks" or "30 days after approval")

If any field's information is not found in the source text, use these defaults:
- Summary: "This program offers financial incentives for energy-efficient home improvements. Contact program administrator for specific details."
- Program Type: "Rebate"
- Amount: "Amount varies"
- Eligible Projects: "Contact administrator for eligible projects"
- Eligible Recipients: "Contact administrator for eligibility requirements"
- Geographic Scope: "Contact administrator for coverage area"
- Requirements: ["Contact program administrator for specific requirements"]
- Application Process: "Contact administrator for application details"
- Deadline: "Ongoing"
- Processing Time: "Contact administrator for processing time details"

Here are the programs to analyze:

${resultsText}`;

        const completion = await openai.chat.completions.create({
            model: "gpt-3.5-turbo",
            messages: [
                {
                    role: "system",
                    content: "You are a helpful assistant that analyzes rebate programs. Extract and format information exactly as requested, focusing on accuracy and completeness. Always include specific details when available, and use the default values only when information is not provided. Format all amounts with dollar signs and commas. Keep summaries informative and within 320 characters."
                },
                {
                    role: "user",
                    content: prompt
                }
            ],
            temperature: 0.7,
            max_tokens: 1500
        });

        const content = completion.choices[0].message.content;
        console.log('OpenAI Response:', content);

        // Split content into program sections and parse
        const sections = content.split(/\n\n(?=Title:)/g).filter(Boolean);
        const programs = sections.map(section => {
            const lines = section.split('\n');
            return {
                name: lines.find(l => l.startsWith('Title:'))?.replace('Title:', '').trim(),
                summary: lines.find(l => l.startsWith('Summary:'))?.replace('Summary:', '').trim() ||
                    'This program offers financial incentives for energy-efficient home improvements. Contact program administrator for specific details.',
                programType: lines.find(l => l.startsWith('Program Type:'))?.replace('Program Type:', '').trim() || 'Rebate',
                amount: lines.find(l => l.startsWith('Amount:'))?.replace('Amount:', '').trim() || 'Amount varies',
                eligibleProjects: lines.find(l => l.startsWith('Eligible Projects:'))?.replace('Eligible Projects:', '').trim(),
                eligibleRecipients: lines.find(l => l.startsWith('Eligible Recipients:'))?.replace('Eligible Recipients:', '').trim(),
                geographicScope: lines.find(l => l.startsWith('Geographic Scope:'))?.replace('Geographic Scope:', '').trim(),
                requirements: lines
                    .filter(l => l.trim().startsWith('-'))
                    .map(l => l.replace('-', '').trim()),
                applicationProcess: lines.find(l => l.startsWith('Application Process:'))?.replace('Application Process:', '').trim(),
                deadline: lines.find(l => l.startsWith('Deadline:'))?.replace('Deadline:', '').trim() || 'Ongoing',
                websiteLink: lines.find(l => l.startsWith('Website Link:'))?.replace('Website Link:', '').trim(),
                contactInfo: lines.find(l => l.startsWith('Contact Information:'))?.replace('Contact Information:', '').trim(),
                processingTime: lines.find(l => l.startsWith('Processing Time:'))?.replace('Processing Time:', '').trim() || 'Processing time varies'
            };
        });

        const analysis = {
            programs: programs,
            timestamp: new Date().toISOString()
        };

        cache.set(cacheKey, analysis);
        return analysis;
    } catch (error) {
        console.error('OpenAI API Error:', error);
        throw new Error('Failed to analyze results');
    }
}

// API endpoint for analysis
app.post('/api/analyze', async (req, res) => {
    try {
        const { results, category } = req.body;
        
        if (!results || !category) {
            return res.status(400).json({ error: 'Missing required parameters' });
        }

        const analysis = await analyzeResults(results, category);
        res.json(analysis);
    } catch (error) {
        console.error('Analysis Error:', error);
        res.status(500).json({ error: 'Analysis failed' });
    }
});

// Health check endpoint
app.get('/health', (req, res) => {
    res.json({ status: 'healthy' });
});

const PORT = process.env.PORT || 3001;  // Changed to 3001 for local development
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
