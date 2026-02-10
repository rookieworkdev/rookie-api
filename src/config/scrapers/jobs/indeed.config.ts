import type { IndeedScraperConfig } from '../../../types/scraper.types.js';

export const indeedConfig: IndeedScraperConfig = {
  source: 'indeed',
  apifyActorId: 'hMvNSpz3JnHgl5jkh', // misceres/indeed-scraper
  defaultCountry: 'SE',
  defaultMaxItems: 50,
  fieldMapping: {
    externalId: 'id',
    title: 'positionName',
    company: 'company',
    location: 'location',
    description: 'description',
    url: 'url',
    postedAt: 'postingDateParsed',
    applicationUrl: 'externalApplyLink',
    jobType: 'jobType',
    salary: 'salary',
  },
};

// Default keywords for Indeed search (can be overridden via API)
export const defaultIndeedKeywords = `nyexad OR nyexaminerad OR nyutbildad OR junior OR graduate OR karriärstart OR entry level OR assistent OR ekonom OR ingenjör OR engineer OR developer OR utvecklare OR finans OR finance OR redovisning OR accounting OR tech OR tekniker OR software OR data OR analytics OR logistik OR logistics OR inköp OR sales OR säljare OR marketing OR konsult OR juridik OR jurist OR administration OR administratör OR kundtjänst OR customer service OR support OR HR`;

