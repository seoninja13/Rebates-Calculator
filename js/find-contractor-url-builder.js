export class FindContractorUrlBuilder {
    constructor() {
        this.baseUrl = 'https://gclist.us/search-page/';
    }

    buildUrl(county, latitude, longitude) {
        // Format county name for URL
        const formattedCounty = county.toLowerCase().replace(/ /g, '+');
        
        // Construct URL parameters
        const params = new URLSearchParams({
            geodir_search: 1,
            stype: 'gd_place',
            s: '',
            snear: `near+${formattedCounty}`,
            sgeo_lat: latitude,
            sgeo_lon: longitude
        });

        return `${this.baseUrl}?${params.toString()}`;
    }

    openContractorSearch(county, latitude, longitude) {
        const url = this.buildUrl(county, latitude, longitude);
        window.open(url, '_blank');
    }
}
