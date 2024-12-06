# Rebates Calculator

A modern web application for calculating and finding available rebates across federal, state, and local programs.

## Project Structure

```
RebatesCalculator/
├── UI/                     # Angular 17 Frontend
├── API/                    # .NET 8 Backend
├── Cache/                  # Google Cache Sheet Integration
└── Requirements/           # Project Documentation
```

## Prerequisites

- Node.js v18.19.0 or later
- .NET SDK 8.0 or later
- Angular CLI 17.0.0 or later

## Setup Instructions

### Backend (.NET 8)
1. Navigate to the API directory
2. Run `dotnet restore`
3. Run `dotnet build`
4. Run `dotnet run --project RebatesCalculator.API`

### Frontend (Angular 17)
1. Navigate to the UI directory
2. Run `npm install`
3. Run `ng serve`

### Development Environment
- Visual Studio 2022 or later
- Visual Studio Code with following extensions:
  - Angular Language Service
  - C# Dev Kit
  - ESLint
  - Prettier

## Architecture

This project follows Clean Architecture principles and SOLID design patterns:

### Frontend (Angular 17)
- Standalone components
- Signal-based state management
- Lazy-loaded features
- Material Design components

### Backend (.NET 8)
- Clean Architecture
- CQRS with MediatR
- Domain-driven design
- Repository pattern

## Features

- Federal, state, and local rebate program search
- Smart filtering and categorization
- Eligibility checking
- Program comparison
- Cached results for performance
- Google Sheets integration for data persistence

## Contributing

1. Create a feature branch
2. Make your changes
3. Submit a pull request

## License

[MIT License](LICENSE)
