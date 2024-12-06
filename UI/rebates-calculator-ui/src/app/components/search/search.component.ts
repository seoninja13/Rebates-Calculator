import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule, ReactiveFormsModule, Validators } from '@angular/forms';
import { MaterialModule } from '../../material.module';
import { FormBuilder, FormGroup } from '@angular/forms';
import { LocationService, Location } from '../../services/location.service';
import { MatIconModule } from '@angular/material/icon';

@Component({
  selector: 'app-search',
  standalone: true,
  imports: [CommonModule, MaterialModule, FormsModule, ReactiveFormsModule, MatIconModule],
  template: `
    <mat-card class="search-card fade-in">
      <form [formGroup]="searchForm" (ngSubmit)="onSearch()">
        <div class="search-grid">
          <div class="search-field">
            <mat-form-field appearance="outline">
              <mat-label>Select Your County</mat-label>
              <mat-select formControlName="county" placeholder="Select your county">
                <mat-option *ngFor="let location of locations" [value]="location.id">
                  <mat-icon>location_on</mat-icon>
                  <span>{{ location.name }}</span>
                </mat-option>
              </mat-select>
              <mat-hint>Choose your county to see Federal, State, and County programs</mat-hint>
            </mat-form-field>
          </div>

          <div class="search-field">
            <mat-form-field appearance="outline">
              <mat-label>Project Type</mat-label>
              <mat-select formControlName="projectType">
                <mat-option value="solar">
                  <mat-icon>wb_sunny</mat-icon>
                  Solar Installation
                </mat-option>
                <mat-option value="energy_efficiency">
                  <mat-icon>eco</mat-icon>
                  Energy Efficiency
                </mat-option>
                <mat-option value="home_improvement">
                  <mat-icon>home</mat-icon>
                  Home Improvement
                </mat-option>
              </mat-select>
              <mat-hint>Choose your project category</mat-hint>
            </mat-form-field>
          </div>
        </div>

        <div class="search-actions">
          <button mat-stroked-button type="reset" class="reset-button" (click)="onReset()">
            <mat-icon>refresh</mat-icon>
            Reset
          </button>
          <button mat-raised-button color="primary" type="submit" [disabled]="!searchForm.valid">
            <mat-icon>search</mat-icon>
            Find Rebates
          </button>
        </div>
      </form>
    </mat-card>
  `,
  styles: [`
    .search-card {
      padding: 2rem;
      background: white;
    }

    .search-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
      gap: 1.5rem;
      margin-bottom: 1.5rem;
    }

    .search-field {
      width: 100%;
    }

    .search-actions {
      display: flex;
      justify-content: flex-end;
      gap: 1rem;
      margin-top: 1rem;
    }

    .reset-button {
      opacity: 0.7;
    }

    mat-form-field {
      width: 100%;
    }

    mat-icon {
      margin-right: 8px;
      vertical-align: middle;
    }

    ::ng-deep .mat-mdc-select-panel {
      max-height: 400px !important;
    }

    @media (max-width: 600px) {
      .search-card {
        padding: 1rem;
      }

      .search-grid {
        grid-template-columns: 1fr;
        gap: 1rem;
      }

      .search-actions {
        flex-direction: column-reverse;
        
        button {
          width: 100%;
        }
      }
    }
  `]
})
export class SearchComponent implements OnInit {
  searchForm: FormGroup = this.fb.group({
    county: ['', Validators.required],
    projectType: ['', Validators.required]
  });

  locations: Location[] = [];

  constructor(
    private fb: FormBuilder,
    private locationService: LocationService
  ) { }

  ngOnInit() {
    this.locations = this.locationService.getLocations();
  }

  onSearch() {
    if (this.searchForm.valid) {
      console.log('Search form submitted:', this.searchForm.value);
    }
  }

  onReset() {
    this.searchForm.reset();
  }
}
