import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MaterialModule } from '../../material.module';
import { MatIconModule } from '@angular/material/icon';
import { MatMenuModule } from '@angular/material/menu';
import { MatTabsModule } from '@angular/material/tabs';

interface RebateProgram {
  name: string;
  summary: string;
  amount: string;
  eligibleProjects: string[];
  provider: string;
  deadline: string;
  status: 'active' | 'ending_soon' | 'closed';
  category: 'Federal' | 'State' | 'County';
}

@Component({
  selector: 'app-results',
  standalone: true,
  imports: [CommonModule, MaterialModule, MatIconModule, MatMenuModule, MatTabsModule],
  template: `
    <div class="results-section fade-in">
      <div class="results-header">
        <h2>Available Programs</h2>
        <div class="results-filters">
          <button mat-button [matMenuTriggerFor]="sortMenu">
            <mat-icon>sort</mat-icon>
            Sort by
          </button>
          <mat-menu #sortMenu="matMenu">
            <button mat-menu-item>Amount (High to Low)</button>
            <button mat-menu-item>Amount (Low to High)</button>
            <button mat-menu-item>Deadline (Soonest)</button>
          </mat-menu>
          
          <button mat-button [matMenuTriggerFor]="filterMenu">
            <mat-icon>filter_list</mat-icon>
            Filter
          </button>
          <mat-menu #filterMenu="matMenu">
            <button mat-menu-item>Active Only</button>
            <button mat-menu-item>Include Closed</button>
          </mat-menu>
        </div>
      </div>

      <mat-tab-group>
        <mat-tab *ngFor="let category of ['Federal', 'State', 'County']" [label]="category">
          <div class="results-grid">
            <mat-card *ngFor="let program of getProgramsByCategory(category)" class="program-card" [ngClass]="program.status">
              <mat-card-header>
                <div mat-card-avatar class="program-icon">
                  <mat-icon>card_giftcard</mat-icon>
                </div>
                <mat-card-title>{{ program.name }}</mat-card-title>
                <mat-card-subtitle>{{ program.provider }}</mat-card-subtitle>
                <div class="status-badge" [ngClass]="program.status">
                  {{ program.status === 'ending_soon' ? 'Ending Soon' : program.status | titlecase }}
                </div>
              </mat-card-header>

              <mat-card-content>
                <p class="program-summary">{{ program.summary }}</p>
                
                <div class="program-details">
                  <div class="detail-item">
                    <mat-icon>attach_money</mat-icon>
                    <span class="amount">{{ program.amount }}</span>
                  </div>
                  
                  <div class="detail-item">
                    <mat-icon>event</mat-icon>
                    <span>Deadline: {{ program.deadline }}</span>
                  </div>
                </div>

                <div class="eligible-projects">
                  <h4>Eligible Projects:</h4>
                  <mat-chip-listbox>
                    <mat-chip-option *ngFor="let project of program.eligibleProjects">
                      {{ project }}
                    </mat-chip-option>
                  </mat-chip-listbox>
                </div>
              </mat-card-content>

              <mat-card-actions align="end">
                <button mat-stroked-button color="primary">
                  <mat-icon>info</mat-icon>
                  Details
                </button>
                <button mat-raised-button color="primary">
                  <mat-icon>launch</mat-icon>
                  Apply Now
                </button>
              </mat-card-actions>
            </mat-card>
          </div>
        </mat-tab>
      </mat-tab-group>
    </div>
  `,
  styles: [`
    .results-section {
      margin-top: 2rem;
    }

    .results-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 1.5rem;

      h2 {
        margin: 0;
        font-weight: 300;
        font-size: 1.8rem;
      }
    }

    .results-filters {
      display: flex;
      gap: 0.5rem;
    }

    .results-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
      gap: 1.5rem;
    }

    .program-card {
      height: 100%;
      display: flex;
      flex-direction: column;

      &.ending_soon {
        border: 1px solid #ffa726;
      }

      &.closed {
        opacity: 0.7;
      }
    }

    .program-icon {
      background-color: #e3f2fd;
      display: flex;
      align-items: center;
      justify-content: center;
      
      mat-icon {
        color: #1976d2;
      }
    }

    .status-badge {
      position: absolute;
      top: 1rem;
      right: 1rem;
      padding: 0.25rem 0.75rem;
      border-radius: 1rem;
      font-size: 0.8rem;
      font-weight: 500;

      &.active {
        background-color: #e8f5e9;
        color: #2e7d32;
      }

      &.ending_soon {
        background-color: #fff3e0;
        color: #ef6c00;
      }

      &.closed {
        background-color: #f5f5f5;
        color: #616161;
      }
    }

    .program-summary {
      margin: 1rem 0;
      color: rgba(0, 0, 0, 0.7);
      line-height: 1.5;
    }

    .program-details {
      margin: 1rem 0;
    }

    .detail-item {
      display: flex;
      align-items: center;
      margin-bottom: 0.5rem;

      mat-icon {
        margin-right: 0.5rem;
        color: rgba(0, 0, 0, 0.54);
      }

      .amount {
        color: #2e7d32;
        font-weight: 500;
      }
    }

    .eligible-projects {
      margin-top: 1rem;

      h4 {
        margin: 0 0 0.5rem 0;
        font-weight: 500;
      }

      mat-chip-listbox {
        display: flex;
        flex-wrap: wrap;
        gap: 0.5rem;
      }
    }

    mat-card-actions {
      margin-top: auto;
      padding: 1rem;
      gap: 0.5rem;
    }

    @media (max-width: 600px) {
      .results-header {
        flex-direction: column;
        align-items: flex-start;
        gap: 1rem;
      }

      .results-filters {
        width: 100%;
        justify-content: space-between;
      }
    }
  `]
})
export class ResultsComponent {
  rebatePrograms: RebateProgram[] = [
    {
      name: 'Federal Solar Tax Credit',
      provider: 'U.S. Department of Energy',
      summary: 'Get up to 30% tax credit for solar panel installation and battery storage systems for your home.',
      amount: '30% of total cost',
      deadline: 'December 31, 2024',
      status: 'active',
      eligibleProjects: ['Solar PV Systems', 'Battery Storage', 'Solar Water Heaters'],
      category: 'Federal'
    },
    {
      name: 'California Clean Vehicle Rebate',
      provider: 'California Air Resources Board',
      summary: 'Receive rebates for purchasing or leasing eligible zero-emission vehicles.',
      amount: 'Up to $7,000',
      deadline: 'March 31, 2024',
      status: 'ending_soon',
      eligibleProjects: ['Electric Vehicles', 'Plug-in Hybrids', 'Fuel Cell Vehicles'],
      category: 'State'
    },
    {
      name: 'Home Energy Renovation Opportunity (HERO)',
      provider: 'Los Angeles County',
      summary: 'Finance energy and water efficiency improvements with no upfront costs.',
      amount: 'Varies by project',
      deadline: 'Ongoing',
      status: 'active',
      eligibleProjects: ['HVAC Systems', 'Windows & Doors', 'Insulation'],
      category: 'County'
    }
  ];

  getProgramsByCategory(category: string) {
    return this.rebatePrograms.filter(program => program.category === category);
  }
}
