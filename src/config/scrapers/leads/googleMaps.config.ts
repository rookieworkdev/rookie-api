import type { GoogleMapsScraperConfig } from '../../../types/scraper.types.js';

export const googleMapsConfig: GoogleMapsScraperConfig = {
  source: 'google_maps',
  apifyActorId: 'nwua9Gu5YrADL7ZDj', // compass/crawler-google-places
  defaultMaxItemsPerQuery: 50,
  countryFilter: 'SE',
  language: 'sv',
  scrapeBusinessLeads: true,
  maximumLeadsEnrichmentRecords: 3,
  leadsEnrichmentDepartments: [
    'human_resources',
    'operations',
    'engineering_technical',
    'marketing',
    'consulting',
  ],
  leadsSeniority: ['manager', 'director', 'vp', 'c_suite'],
  // Test queries — full production list below in comments
  defaultSearchQueries: [
    'juristfirma Stockholm',
    'strategikonsult Stockholm',
    'it-bolag Stockholm',
  ],
};

// Full production search queries (uncomment / swap into defaultSearchQueries when ready):
// [
//   'techbolag Stockholm', 'tech startup Stockholm', 'SaaS företag Stockholm',
//   'IT-konsult Stockholm', 'IT-bolag Stockholm', 'mjukvaruföretag Stockholm',
//   'advokatbyrå Stockholm', 'juristfirma Stockholm', 'revisionsbyrå Stockholm',
//   'redovisningsbyrå Stockholm', 'ekonomikonsult Stockholm', 'managementkonsult Stockholm',
//   'strategikonsult Stockholm', 'affärskonsult Stockholm', 'finansbolag Stockholm',
//   'fondbolag Stockholm', 'kapitalförvaltare Stockholm', 'investmentbolag Stockholm',
//   'venture capital Stockholm', 'fastighetsbolag Stockholm', 'arkitektkontor Stockholm',
//   'designbyrå Stockholm', 'reklambyrå Stockholm', 'mediabyrå Stockholm',
//   'kommunikationsbyrå Stockholm', 'PR-byrå Stockholm', 'eventbyrå Stockholm',
//   'ingenjörsfirma Stockholm', 'byggkonsult Stockholm', 'miljökonsult Stockholm',
//   'energibolag Stockholm', 'cleantech Stockholm', 'logistikföretag Stockholm',
//   'e-handel Stockholm', 'e-commerce Stockholm', 'fintech Stockholm',
//   'healthtech Stockholm', 'edtech Stockholm', 'proptech Stockholm',
//   'cybersäkerhet Stockholm', 'informationssäkerhet Stockholm',
//   'techbolag Göteborg', 'IT-bolag Göteborg', 'advokatbyrå Göteborg',
//   'managementkonsult Göteborg', 'ingenjörsfirma Göteborg',
//   'techbolag Malmö', 'IT-bolag Malmö', 'advokatbyrå Malmö',
//   'managementkonsult Malmö', 'techbolag Uppsala', 'IT-bolag Linköping',
//   'försvarsindustri Sverige', 'försvarsbolag Sverige', 'säkerhetsföretag Stockholm',
//   'telekom Stockholm', 'telekombolag Sverige',
//   'life science Stockholm', 'biotech Stockholm', 'medtech Stockholm',
//   'försäkringsbolag Stockholm', 'bank Stockholm',
// ]

/**
 * Competitor exclusion list — exact company names to filter out before AI scoring.
 * These are recruitment/staffing agencies that compete with Rookie.
 * Matching is case-insensitive against the place title.
 */
export const competitorExclusions: string[] = [
  'academic work',
  'adecco',
  'manpower',
  'randstad',
  'poolia',
  'tng',
  'proffice',
  'jefferson wells',
  'wise professionals',
  'ants',
  'nexer recruit',
  'incluso',
  'studentconsulting',
  'lernia',
  'barona',
  'uniflex',
  'bemannia',
  'hays',
  'robert half',
  'michael page',
  'kfx',
  'competens',
  'academic search',
  'amendo',
  'arena personal',
  'eventpersonal',
  'human online',
  'kontorsfixarna',
  'inhouse',
  'the place',
  'woow',
  'salesonly',
  'rubino rekrytering',
  'swesale',
  'säljpoolen',
  'made for sales',
  'teknisk säljkraft',
  'fincruit',
];

/**
 * Google Maps categories that indicate a recruitment/staffing company.
 * Used for pre-filtering before AI scoring to save API costs.
 */
export const recruitmentCategories: string[] = [
  'rekrytering',
  'bemanning',
  'staffing',
  'recruitment',
  'employment agency',
  'temp agency',
  'personaluthyrning',
];

/**
 * Lead job titles that indicate the company is recruitment-focused.
 * If ALL leads at a company have these titles, it's likely a staffing firm.
 */
export const recruitmentRoles: string[] = [
  'rekryterare',
  'recruiter',
  'rekryteringskonsult',
  'staffing',
  'bemanning',
  'talent acquisition',
  'headhunter',
];
