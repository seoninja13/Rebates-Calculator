import { Injectable } from '@angular/core';

export interface Location {
  id: string;
  name: string;
  icon: string;
}

@Injectable({
  providedIn: 'root'
})
export class LocationService {
  private readonly locations: Location[] = [
    { id: 'alameda', name: 'Alameda County', icon: 'location_city' },
    { id: 'alpine', name: 'Alpine County', icon: 'location_city' },
    { id: 'amador', name: 'Amador County', icon: 'location_city' },
    { id: 'butte', name: 'Butte County', icon: 'location_city' },
    { id: 'calaveras', name: 'Calaveras County', icon: 'location_city' },
    { id: 'colusa', name: 'Colusa County', icon: 'location_city' },
    { id: 'contra_costa', name: 'Contra Costa County', icon: 'location_city' },
    { id: 'del_norte', name: 'Del Norte County', icon: 'location_city' },
    { id: 'el_dorado', name: 'El Dorado County', icon: 'location_city' },
    { id: 'fresno', name: 'Fresno County', icon: 'location_city' },
    { id: 'glenn', name: 'Glenn County', icon: 'location_city' },
    { id: 'humboldt', name: 'Humboldt County', icon: 'location_city' },
    { id: 'imperial', name: 'Imperial County', icon: 'location_city' },
    { id: 'inyo', name: 'Inyo County', icon: 'location_city' },
    { id: 'kern', name: 'Kern County', icon: 'location_city' },
    { id: 'kings', name: 'Kings County', icon: 'location_city' },
    { id: 'lake', name: 'Lake County', icon: 'location_city' },
    { id: 'lassen', name: 'Lassen County', icon: 'location_city' },
    { id: 'los_angeles', name: 'Los Angeles County', icon: 'location_city' },
    { id: 'madera', name: 'Madera County', icon: 'location_city' },
    { id: 'marin', name: 'Marin County', icon: 'location_city' },
    { id: 'mariposa', name: 'Mariposa County', icon: 'location_city' },
    { id: 'mendocino', name: 'Mendocino County', icon: 'location_city' },
    { id: 'merced', name: 'Merced County', icon: 'location_city' },
    { id: 'modoc', name: 'Modoc County', icon: 'location_city' },
    { id: 'mono', name: 'Mono County', icon: 'location_city' },
    { id: 'monterey', name: 'Monterey County', icon: 'location_city' },
    { id: 'napa', name: 'Napa County', icon: 'location_city' },
    { id: 'nevada', name: 'Nevada County', icon: 'location_city' },
    { id: 'orange', name: 'Orange County', icon: 'location_city' },
    { id: 'placer', name: 'Placer County', icon: 'location_city' },
    { id: 'plumas', name: 'Plumas County', icon: 'location_city' },
    { id: 'riverside', name: 'Riverside County', icon: 'location_city' },
    { id: 'sacramento', name: 'Sacramento County', icon: 'location_city' },
    { id: 'san_benito', name: 'San Benito County', icon: 'location_city' },
    { id: 'san_bernardino', name: 'San Bernardino County', icon: 'location_city' },
    { id: 'san_diego', name: 'San Diego County', icon: 'location_city' },
    { id: 'san_francisco', name: 'San Francisco County', icon: 'location_city' },
    { id: 'san_joaquin', name: 'San Joaquin County', icon: 'location_city' },
    { id: 'san_luis_obispo', name: 'San Luis Obispo County', icon: 'location_city' },
    { id: 'san_mateo', name: 'San Mateo County', icon: 'location_city' },
    { id: 'santa_barbara', name: 'Santa Barbara County', icon: 'location_city' },
    { id: 'santa_clara', name: 'Santa Clara County', icon: 'location_city' },
    { id: 'santa_cruz', name: 'Santa Cruz County', icon: 'location_city' },
    { id: 'shasta', name: 'Shasta County', icon: 'location_city' },
    { id: 'sierra', name: 'Sierra County', icon: 'location_city' },
    { id: 'siskiyou', name: 'Siskiyou County', icon: 'location_city' },
    { id: 'solano', name: 'Solano County', icon: 'location_city' },
    { id: 'sonoma', name: 'Sonoma County', icon: 'location_city' },
    { id: 'stanislaus', name: 'Stanislaus County', icon: 'location_city' },
    { id: 'sutter', name: 'Sutter County', icon: 'location_city' },
    { id: 'tehama', name: 'Tehama County', icon: 'location_city' },
    { id: 'trinity', name: 'Trinity County', icon: 'location_city' },
    { id: 'tulare', name: 'Tulare County', icon: 'location_city' },
    { id: 'tuolumne', name: 'Tuolumne County', icon: 'location_city' },
    { id: 'ventura', name: 'Ventura County', icon: 'location_city' },
    { id: 'yolo', name: 'Yolo County', icon: 'location_city' },
    { id: 'yuba', name: 'Yuba County', icon: 'location_city' }
  ];

  getLocations(): Location[] {
    return this.locations;
  }
}
