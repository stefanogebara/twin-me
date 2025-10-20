# Connector Alignment Report

## Problem
Connectors in Soul Dashboard and Connectors (Onboarding) page are misaligned:

### Provider ID Mismatches
- **InstantTwinOnboarding**: `google_gmail`, `google_calendar`
- **SoulSignatureDashboard**: `gmail`, `calendar`

This causes connected platforms to not show as connected across pages!

### Missing Connectors in Soul Dashboard
1. **LinkedIn** - exists in Professional cluster but hardcoded to `status: false`
2. **Instagram** - exists in Personal cluster but hardcoded to `status: false` 
3. **Twitter** - exists in Personal cluster but hardcoded to `status: false`
4. **GitHub** - exists in Personal cluster but hardcoded to `status: false`

### Extra Connectors in Soul Dashboard (not in Onboarding)
1. **Netflix** - no OAuth API available
2. **Steam** - requires separate implementation
3. **Teams** - not in onboarding flow

## Root Causes
1. **Inconsistent provider naming** between pages
2. **Hardcoded connection status** for some platforms
3. **Different connector lists** between pages

## Fix Strategy
1. Standardize provider IDs to match backend (use `gmail`, `calendar`, not `google_gmail`, `google_calendar`)
2. Remove hardcoded `false` status - let API determine connection status
3. Align connector lists between both pages
4. Use same ConnectionStatus interface
