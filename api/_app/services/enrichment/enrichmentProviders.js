/**
 * Enrichment Providers - Barrel Re-export
 *
 * Re-exports all provider functions from sub-modules for backward compatibility.
 * Consumers import from this file; actual implementations live in:
 * - braveSearchProvider.js  (Brave Search API + LLM extraction + comprehensive search waterfall)
 * - dataProviders.js        (People Data Labs, Scrapin.io, Reverse Contact)
 * - searchProviders.js      (LinkedIn URL discovery, career search, Perplexity, social profiles, web search)
 */

// Brave Search + comprehensive search orchestration
export {
  braveWebSearch,
  fetchPageText,
  searchWithBrave,
  extractPersonalLife,
  extractStructuredProfile,
  comprehensivePersonSearch,
  searchWithSonar,
  searchWithGoogleGrounding,
  searchWithOpenRouter,
  parseComprehensiveSearchResult,
} from './braveSearchProvider.js';

// Data provider APIs (PDL, Scrapin, Reverse Contact)
export {
  callPeopleDataLabsAPI,
  convertPDLToEnrichment,
  formatPDLLocation,
  buildPDLBio,
  formatPDLExperience,
  formatPDLEducation,
  callScrapinAPI,
  fetchScrapinFullProfile,
  formatScrapinPositions,
  formatScrapinEducation,
  extractScrapinCompany,
  extractScrapinTitle,
  formatScrapinLocation,
  callReverseContactAPI,
  extractCompanyFromPerson,
  formatRCLocation,
} from './dataProviders.js';

// Web search providers (LinkedIn, Perplexity, social profiles, career search)
export {
  findLinkedInUrlViaWebSearch,
  searchWebForCareerHistory,
  parseCareerFromWebSearch,
  parseEducationFromWebSearch,
  callPerplexityAPI,
  enrichFromLinkedIn,
  parseEnrichmentResponse,
  searchWebForSocialProfiles,
  parseSocialProfileResponse,
  searchWebForPerson,
  parseWebSearchResponse,
  buildSearchQuery,
  combineEnrichmentSources,
} from './searchProviders.js';
