import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterOutlet } from '@angular/router';
import { MaterialModule } from './material.module';
import { SearchComponent } from './components/search/search.component';
import { ResultsComponent } from './components/results/results.component';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [CommonModule, RouterOutlet, MaterialModule, SearchComponent, ResultsComponent],
  template: `
    <div class="app-container">
      <mat-toolbar color="primary" class="app-toolbar">
        <div class="toolbar-content">
          <span class="logo">🌟 Rebates Calculator</span>
          <div class="toolbar-actions">
            <button mat-button>About</button>
            <button mat-button>Help</button>
          </div>
        </div>
      </mat-toolbar>
      
      <main class="main-content fade-in">
        <div class="hero-section">
          <h1>Find Energy Rebates & Incentives</h1>
          <p>Discover available rebates for your energy-efficient home improvements</p>
        </div>

        <div class="content-container">
          <app-search></app-search>
          <app-results></app-results>
        </div>
      </main>

      <footer class="app-footer">
        <div class="footer-content">
          <p>&copy; 2024 Rebates Calculator. All rights reserved.</p>
        </div>
      </footer>
    </div>
  `,
  styles: [`
    .app-container {
      min-height: 100vh;
      display: flex;
      flex-direction: column;
    }

    .app-toolbar {
      position: fixed;
      top: 0;
      left: 0;
      right: 0;
      z-index: 1000;
      background: linear-gradient(135deg, #2196f3, #1976d2);
    }

    .toolbar-content {
      max-width: 1200px;
      width: 100%;
      margin: 0 auto;
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 0 1rem;
    }

    .logo {
      font-size: 1.5rem;
      font-weight: 500;
      letter-spacing: 0.5px;
    }

    .main-content {
      flex: 1;
      margin-top: 64px;
      background-color: #f5f5f5;
      min-height: calc(100vh - 64px);
    }

    .hero-section {
      background: linear-gradient(135deg, #2196f3, #1976d2);
      color: white;
      padding: 4rem 2rem;
      text-align: center;
      
      h1 {
        font-size: 2.5rem;
        margin: 0;
        margin-bottom: 1rem;
        font-weight: 300;
      }

      p {
        font-size: 1.2rem;
        margin: 0;
        opacity: 0.9;
      }
    }

    .content-container {
      max-width: 1200px;
      margin: 0 auto;
      padding: 2rem;
      position: relative;
      top: -2rem;
    }

    .app-footer {
      background-color: #f5f5f5;
      padding: 1rem 0;
      margin-top: auto;
      border-top: 1px solid #e0e0e0;
    }

    .footer-content {
      max-width: 1200px;
      margin: 0 auto;
      padding: 0 2rem;
      text-align: center;
      color: #666;
    }

    @media (max-width: 600px) {
      .hero-section {
        padding: 3rem 1rem;
        
        h1 {
          font-size: 2rem;
        }

        p {
          font-size: 1rem;
        }
      }

      .content-container {
        padding: 1rem;
      }
    }

    .fade-in {
      animation: fadeIn 0.5s ease-in;
    }

    @keyframes fadeIn {
      from {
        opacity: 0;
        transform: translateY(20px);
      }
      to {
        opacity: 1;
        transform: translateY(0);
      }
    }
  `]
})
export class AppComponent {
  title = 'Rebates Calculator';
}
