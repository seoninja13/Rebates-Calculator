import crypto from 'crypto';

export class GoogleSheetsOperations {
    constructor(cacheInstance) {
        this.cache = cacheInstance;
    }

    async getCache(level, county, category) {
        if (!this.cache.initialized) {
            await this.cache.initialize();
        }

        const hash = this.generateHash(level, county, category);
        const rows = await this.findRowsByHash(hash);
        
        return rows.length > 0 ? this.formatCacheData(rows[0]) : null;
    }

    async setCache(level, county, category, data) {
        if (!this.cache.initialized) {
            await this.cache.initialize();
        }

        const hash = this.generateHash(level, county, category);
        const row = this.formatRowData(level, county, category, data, hash);
        
        await this.appendRow(row);
        return true;
    }

    generateHash(level, county, category = 'all') {
        const normalizedLevel = this.normalizeLevel(level);
        const normalizedCounty = county ? this.normalizeCounty(county) : null;
        
        let hashBase = '';
        switch (normalizedLevel.toUpperCase()) {
            case 'FEDERAL':
                hashBase = 'FEDERAL::ALL';
                break;
            case 'STATE':
                hashBase = 'STATE::CALIFORNIA::ALL';
                break;
            case 'COUNTY':
                hashBase = `COUNTY::${normalizedCounty}::ALL`;
                break;
            default:
                throw new Error('Invalid level');
        }

        return crypto.createHash('md5').update(hashBase).digest('hex');
    }

    normalizeLevel(level) {
        return level.trim().toLowerCase();
    }

    normalizeCounty(county) {
        return county.trim().toLowerCase().replace(/\s+/g, '_');
    }

    async findRowsByHash(hash) {
        const response = await this.cache.sheets.spreadsheets.values.get({
            spreadsheetId: this.cache.spreadsheetId,
            range: 'Cache!A2:F',
        });

        return (response.data.values || [])
            .filter(row => row[5] === hash);
    }

    formatCacheData(row) {
        return {
            query: row[0],
            level: row[1],
            results: JSON.parse(row[2] || '[]'),
            timestamp: row[4],
            hash: row[5]
        };
    }

    formatRowData(level, county, category, data, hash) {
        return [
            data.query || '',
            level,
            JSON.stringify(data.results || []),
            data.analysis || '',
            new Date().toLocaleString('en-US', { timeZone: 'America/Los_Angeles' }),
            hash
        ];
    }

    async appendRow(row) {
        await this.cache.sheets.spreadsheets.values.append({
            spreadsheetId: this.cache.spreadsheetId,
            range: 'Cache!A1',
            valueInputOption: 'RAW',
            resource: {
                values: [row]
            }
        });
    }
}
