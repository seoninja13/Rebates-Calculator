# Rebates Calculator - Architecture Overview

## Project Structure

```plaintext
RebatesCalculator/
├── UI/                     # Angular 17 Frontend
├── API/                    # .NET 8 Backend
├── Cache/                  # Google Cache Sheet Integration
└── Requirements/   
    Netlify        # Project Documentation
```

## SOLID Principles Implementation

### 1. Single Responsibility Principle (SRP)

- Each service and component has one specific responsibility
- Clear separation between UI, API, and Cache layers
- Dedicated modules for specific features (search, analysis, results display)

### 2. Open/Closed Principle (OCP)

- Abstract interfaces for services
- Plugin architecture for different rebate providers
- Extensible analysis strategies

### 3. Liskov Substitution Principle (LSP)

- Base classes and interfaces for rebate programs
- Interchangeable cache implementations
- Consistent service contracts

### 4. Interface Segregation Principle (ISP)

- Granular service interfaces
- Feature-specific components
- Focused data contracts

### 5. Dependency Inversion Principle (DIP)

- Dependency injection throughout
- Abstract service interfaces
- Configurable implementations

## Component Details

### UI (Angular 17)

- Standalone components architecture
- Signal-based state management
- Server-side rendering capability
- Modular feature structure
- Lazy-loaded modules

### API (.NET 8)

- Clean Architecture
- CQRS pattern with MediatR
- Domain-driven design
- Repository pattern
- Unit of Work pattern

### Cache

- Google Sheets integration
- Caching strategies
- Data persistence
- Cache invalidation rules

## Security Considerations

- JWT authentication
- Role-based authorization
- API rate limiting
- Data encryption
- Secure configuration management

## Performance Optimizations

- Distributed caching
- Lazy loading
- Response compression
- Query optimization
- Asset optimization
