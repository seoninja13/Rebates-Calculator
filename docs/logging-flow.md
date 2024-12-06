# Data Flow and Property Mapping

## 1. Raw Data Properties
- programName
- programType
- summary
- collapsedSummary
- amount
- eligibleProjects
- eligibleRecipients
- geographicScope
- requirements
- applicationProcess
- deadline
- websiteLink
- contactInfo
- processingTime
- category

## 2. Transformed Properties (with trans_ prefix)
- trans_title (from programName)
- trans_type (from programType)
- trans_summary
- trans_collapsedSummary
- trans_amount
- trans_eligibleProjects
- trans_eligibleRecipients
- trans_geographicScope
- trans_requirements
- trans_applicationProcess
- trans_deadline
- trans_websiteLink
- trans_contactInfo
- trans_processingTime
- trans_category

## 3. Data Flow
Raw Data -> Transformation (adds trans_ prefix) -> Cache -> Display
