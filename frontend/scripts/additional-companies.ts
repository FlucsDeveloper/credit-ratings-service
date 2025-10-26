/**
 * Additional Companies - Expanding to 1000+
 * Public data from mid-cap and large-cap indices globally
 */

export interface Company {
  ticker: string;
  name: string;
  exchange: string;
  country: string;
  sector?: string;
  index?: string;
}

/**
 * S&P MidCap 400 (US Mid-Cap Companies)
 * Source: Public index constituent data
 */
export const SP_MIDCAP400: Company[] = [
  // Regional Banks
  { ticker: 'FITB', name: 'Fifth Third Bancorp', exchange: 'NASDAQ', country: 'US', sector: 'Financial', index: 'S&P MidCap 400' },
  { ticker: 'HBAN', name: 'Huntington Bancshares Incorporated', exchange: 'NASDAQ', country: 'US', sector: 'Financial', index: 'S&P MidCap 400' },
  { ticker: 'KEY', name: 'KeyCorp', exchange: 'NYSE', country: 'US', sector: 'Financial', index: 'S&P MidCap 400' },
  { ticker: 'RF', name: 'Regions Financial Corporation', exchange: 'NYSE', country: 'US', sector: 'Financial', index: 'S&P MidCap 400' },
  { ticker: 'CFG', name: 'Citizens Financial Group Inc.', exchange: 'NYSE', country: 'US', sector: 'Financial', index: 'S&P MidCap 400' },
  { ticker: 'ZION', name: 'Zions Bancorporation N.A.', exchange: 'NASDAQ', country: 'US', sector: 'Financial', index: 'S&P MidCap 400' },
  { ticker: 'CBSH', name: 'Commerce Bancshares Inc.', exchange: 'NASDAQ', country: 'US', sector: 'Financial', index: 'S&P MidCap 400' },
  { ticker: 'SNV', name: 'Synovus Financial Corp.', exchange: 'NYSE', country: 'US', sector: 'Financial', index: 'S&P MidCap 400' },
  { ticker: 'WTFC', name: 'Wintrust Financial Corporation', exchange: 'NASDAQ', country: 'US', sector: 'Financial', index: 'S&P MidCap 400' },
  { ticker: 'CMA', name: 'Comerica Incorporated', exchange: 'NYSE', country: 'US', sector: 'Financial', index: 'S&P MidCap 400' },

  // Industrials
  { ticker: 'CHRW', name: 'C.H. Robinson Worldwide Inc.', exchange: 'NASDAQ', country: 'US', sector: 'Industrial', index: 'S&P MidCap 400' },
  { ticker: 'JBHT', name: 'J.B. Hunt Transport Services Inc.', exchange: 'NASDAQ', country: 'US', sector: 'Industrial', index: 'S&P MidCap 400' },
  { ticker: 'ODFL', name: 'Old Dominion Freight Line Inc.', exchange: 'NASDAQ', country: 'US', sector: 'Industrial', index: 'S&P MidCap 400' },
  { ticker: 'XPO', name: 'XPO Inc.', exchange: 'NYSE', country: 'US', sector: 'Industrial', index: 'S&P MidCap 400' },
  { ticker: 'R', name: 'Ryder System Inc.', exchange: 'NYSE', country: 'US', sector: 'Industrial', index: 'S&P MidCap 400' },
  { ticker: 'EXPD', name: 'Expeditors International of Washington Inc.', exchange: 'NASDAQ', country: 'US', sector: 'Industrial', index: 'S&P MidCap 400' },
  { ticker: 'FAST', name: 'Fastenal Company', exchange: 'NASDAQ', country: 'US', sector: 'Industrial', index: 'S&P MidCap 400' },
  { ticker: 'POOL', name: 'Pool Corporation', exchange: 'NASDAQ', country: 'US', sector: 'Industrial', index: 'S&P MidCap 400' },
  { ticker: 'WSO', name: 'Watsco Inc.', exchange: 'NYSE', country: 'US', sector: 'Industrial', index: 'S&P MidCap 400' },
  { ticker: 'AIT', name: 'Applied Industrial Technologies Inc.', exchange: 'NYSE', country: 'US', sector: 'Industrial', index: 'S&P MidCap 400' },

  // Technology
  { ticker: 'SMCI', name: 'Super Micro Computer Inc.', exchange: 'NASDAQ', country: 'US', sector: 'Technology', index: 'S&P MidCap 400' },
  { ticker: 'NTAP', name: 'NetApp Inc.', exchange: 'NASDAQ', country: 'US', sector: 'Technology', index: 'S&P MidCap 400' },
  { ticker: 'FFIV', name: 'F5 Inc.', exchange: 'NASDAQ', country: 'US', sector: 'Technology', index: 'S&P MidCap 400' },
  { ticker: 'JNPR', name: 'Juniper Networks Inc.', exchange: 'NYSE', country: 'US', sector: 'Technology', index: 'S&P MidCap 400' },
  { ticker: 'AKAM', name: 'Akamai Technologies Inc.', exchange: 'NASDAQ', country: 'US', sector: 'Technology', index: 'S&P MidCap 400' },
  { ticker: 'MPWR', name: 'Monolithic Power Systems Inc.', exchange: 'NASDAQ', country: 'US', sector: 'Technology', index: 'S&P MidCap 400' },
  { ticker: 'MCHP', name: 'Microchip Technology Incorporated', exchange: 'NASDAQ', country: 'US', sector: 'Technology', index: 'S&P MidCap 400' },
  { ticker: 'SWKS', name: 'Skyworks Solutions Inc.', exchange: 'NASDAQ', country: 'US', sector: 'Technology', index: 'S&P MidCap 400' },
  { ticker: 'QRVO', name: 'Qorvo Inc.', exchange: 'NASDAQ', country: 'US', sector: 'Technology', index: 'S&P MidCap 400' },
  { ticker: 'ZBRA', name: 'Zebra Technologies Corporation', exchange: 'NASDAQ', country: 'US', sector: 'Technology', index: 'S&P MidCap 400' },

  // Healthcare
  { ticker: 'TECH', name: 'Bio-Techne Corporation', exchange: 'NASDAQ', country: 'US', sector: 'Healthcare', index: 'S&P MidCap 400' },
  { ticker: 'HOLX', name: 'Hologic Inc.', exchange: 'NASDAQ', country: 'US', sector: 'Healthcare', index: 'S&P MidCap 400' },
  { ticker: 'INCY', name: 'Incyte Corporation', exchange: 'NASDAQ', country: 'US', sector: 'Healthcare', index: 'S&P MidCap 400' },
  { ticker: 'EXAS', name: 'Exact Sciences Corporation', exchange: 'NASDAQ', country: 'US', sector: 'Healthcare', index: 'S&P MidCap 400' },
  { ticker: 'DGX', name: 'Quest Diagnostics Incorporated', exchange: 'NYSE', country: 'US', sector: 'Healthcare', index: 'S&P MidCap 400' },
  { ticker: 'LH', name: 'Laboratory Corporation of America Holdings', exchange: 'NYSE', country: 'US', sector: 'Healthcare', index: 'S&P MidCap 400' },
  { ticker: 'WAT', name: 'Waters Corporation', exchange: 'NYSE', country: 'US', sector: 'Healthcare', index: 'S&P MidCap 400' },
  { ticker: 'PKI', name: 'PerkinElmer Inc.', exchange: 'NYSE', country: 'US', sector: 'Healthcare', index: 'S&P MidCap 400' },
  { ticker: 'VTRS', name: 'Viatris Inc.', exchange: 'NASDAQ', country: 'US', sector: 'Healthcare', index: 'S&P MidCap 400' },
  { ticker: 'ZBH', name: 'Zimmer Biomet Holdings Inc.', exchange: 'NYSE', country: 'US', sector: 'Healthcare', index: 'S&P MidCap 400' },

  // Consumer
  { ticker: 'DPZ', name: "Domino's Pizza Inc.", exchange: 'NYSE', country: 'US', sector: 'Consumer', index: 'S&P MidCap 400' },
  { ticker: 'YUM', name: 'Yum! Brands Inc.', exchange: 'NYSE', country: 'US', sector: 'Consumer', index: 'S&P MidCap 400' },
  { ticker: 'CMG', name: 'Chipotle Mexican Grill Inc.', exchange: 'NYSE', country: 'US', sector: 'Consumer', index: 'S&P MidCap 400' },
  { ticker: 'QSR', name: 'Restaurant Brands International Inc.', exchange: 'NYSE', country: 'CA', sector: 'Consumer', index: 'S&P MidCap 400' },
  { ticker: 'DRI', name: 'Darden Restaurants Inc.', exchange: 'NYSE', country: 'US', sector: 'Consumer', index: 'S&P MidCap 400' },
  { ticker: 'POOL', name: 'Pool Corporation', exchange: 'NASDAQ', country: 'US', sector: 'Consumer', index: 'S&P MidCap 400' },
  { ticker: 'BBY', name: 'Best Buy Co. Inc.', exchange: 'NYSE', country: 'US', sector: 'Consumer', index: 'S&P MidCap 400' },
  { ticker: 'GPS', name: 'The Gap Inc.', exchange: 'NYSE', country: 'US', sector: 'Consumer', index: 'S&P MidCap 400' },
  { ticker: 'RL', name: 'Ralph Lauren Corporation', exchange: 'NYSE', country: 'US', sector: 'Consumer', index: 'S&P MidCap 400' },
  { ticker: 'UAA', name: 'Under Armour Inc.', exchange: 'NYSE', country: 'US', sector: 'Consumer', index: 'S&P MidCap 400' },

  // Energy
  { ticker: 'DVN', name: 'Devon Energy Corporation', exchange: 'NYSE', country: 'US', sector: 'Energy', index: 'S&P MidCap 400' },
  { ticker: 'FANG', name: 'Diamondback Energy Inc.', exchange: 'NASDAQ', country: 'US', sector: 'Energy', index: 'S&P MidCap 400' },
  { ticker: 'MRO', name: 'Marathon Oil Corporation', exchange: 'NYSE', country: 'US', sector: 'Energy', index: 'S&P MidCap 400' },
  { ticker: 'APA', name: 'APA Corporation', exchange: 'NASDAQ', country: 'US', sector: 'Energy', index: 'S&P MidCap 400' },
  { ticker: 'CTRA', name: 'Coterra Energy Inc.', exchange: 'NYSE', country: 'US', sector: 'Energy', index: 'S&P MidCap 400' },
  { ticker: 'OVV', name: 'Ovintiv Inc.', exchange: 'NYSE', country: 'US', sector: 'Energy', index: 'S&P MidCap 400' },
  { ticker: 'NOV', name: 'NOV Inc.', exchange: 'NYSE', country: 'US', sector: 'Energy', index: 'S&P MidCap 400' },
  { ticker: 'FTI', name: 'TechnipFMC plc', exchange: 'NYSE', country: 'GB', sector: 'Energy', index: 'S&P MidCap 400' },
  { ticker: 'HP', name: 'Helmerich & Payne Inc.', exchange: 'NYSE', country: 'US', sector: 'Energy', index: 'S&P MidCap 400' },
  { ticker: 'CHX', name: 'ChampionX Corporation', exchange: 'NASDAQ', country: 'US', sector: 'Energy', index: 'S&P MidCap 400' },

  // Materials
  { ticker: 'ALB', name: 'Albemarle Corporation', exchange: 'NYSE', country: 'US', sector: 'Materials', index: 'S&P MidCap 400' },
  { ticker: 'FMC', name: 'FMC Corporation', exchange: 'NYSE', country: 'US', sector: 'Materials', index: 'S&P MidCap 400' },
  { ticker: 'CE', name: 'Celanese Corporation', exchange: 'NYSE', country: 'US', sector: 'Materials', index: 'S&P MidCap 400' },
  { ticker: 'EMN', name: 'Eastman Chemical Company', exchange: 'NYSE', country: 'US', sector: 'Materials', index: 'S&P MidCap 400' },
  { ticker: 'WLK', name: 'Westlake Corporation', exchange: 'NYSE', country: 'US', sector: 'Materials', index: 'S&P MidCap 400' },
  { ticker: 'CF', name: 'CF Industries Holdings Inc.', exchange: 'NYSE', country: 'US', sector: 'Materials', index: 'S&P MidCap 400' },
  { ticker: 'MOS', name: 'The Mosaic Company', exchange: 'NYSE', country: 'US', sector: 'Materials', index: 'S&P MidCap 400' },
  { ticker: 'IFF', name: 'International Flavors & Fragrances Inc.', exchange: 'NYSE', country: 'US', sector: 'Materials', index: 'S&P MidCap 400' },
  { ticker: 'VMC', name: 'Vulcan Materials Company', exchange: 'NYSE', country: 'US', sector: 'Materials', index: 'S&P MidCap 400' },
  { ticker: 'MLM', name: 'Martin Marietta Materials Inc.', exchange: 'NYSE', country: 'US', sector: 'Materials', index: 'S&P MidCap 400' },

  // Utilities
  { ticker: 'AEE', name: 'Ameren Corporation', exchange: 'NYSE', country: 'US', sector: 'Utilities', index: 'S&P MidCap 400' },
  { ticker: 'AES', name: 'The AES Corporation', exchange: 'NYSE', country: 'US', sector: 'Utilities', index: 'S&P MidCap 400' },
  { ticker: 'CMS', name: 'CMS Energy Corporation', exchange: 'NYSE', country: 'US', sector: 'Utilities', index: 'S&P MidCap 400' },
  { ticker: 'D', name: 'Dominion Energy Inc.', exchange: 'NYSE', country: 'US', sector: 'Utilities', index: 'S&P MidCap 400' },
  { ticker: 'ED', name: 'Consolidated Edison Inc.', exchange: 'NYSE', country: 'US', sector: 'Utilities', index: 'S&P MidCap 400' },
  { ticker: 'EIX', name: 'Edison International', exchange: 'NYSE', country: 'US', sector: 'Utilities', index: 'S&P MidCap 400' },
  { ticker: 'ES', name: 'Eversource Energy', exchange: 'NYSE', country: 'US', sector: 'Utilities', index: 'S&P MidCap 400' },
  { ticker: 'ETR', name: 'Entergy Corporation', exchange: 'NYSE', country: 'US', sector: 'Utilities', index: 'S&P MidCap 400' },
  { ticker: 'EXC', name: 'Exelon Corporation', exchange: 'NASDAQ', country: 'US', sector: 'Utilities', index: 'S&P MidCap 400' },
  { ticker: 'FE', name: 'FirstEnergy Corp.', exchange: 'NYSE', country: 'US', sector: 'Utilities', index: 'S&P MidCap 400' },

  // Real Estate
  { ticker: 'AVB', name: 'AvalonBay Communities Inc.', exchange: 'NYSE', country: 'US', sector: 'Real Estate', index: 'S&P MidCap 400' },
  { ticker: 'EQR', name: 'Equity Residential', exchange: 'NYSE', country: 'US', sector: 'Real Estate', index: 'S&P MidCap 400' },
  { ticker: 'ESS', name: 'Essex Property Trust Inc.', exchange: 'NYSE', country: 'US', sector: 'Real Estate', index: 'S&P MidCap 400' },
  { ticker: 'MAA', name: 'Mid-America Apartment Communities Inc.', exchange: 'NYSE', country: 'US', sector: 'Real Estate', index: 'S&P MidCap 400' },
  { ticker: 'UDR', name: 'UDR Inc.', exchange: 'NYSE', country: 'US', sector: 'Real Estate', index: 'S&P MidCap 400' },
  { ticker: 'HST', name: 'Host Hotels & Resorts Inc.', exchange: 'NASDAQ', country: 'US', sector: 'Real Estate', index: 'S&P MidCap 400' },
  { ticker: 'VTR', name: 'Ventas Inc.', exchange: 'NYSE', country: 'US', sector: 'Real Estate', index: 'S&P MidCap 400' },
  { ticker: 'PEAK', name: 'Healthpeak Properties Inc.', exchange: 'NYSE', country: 'US', sector: 'Real Estate', index: 'S&P MidCap 400' },
  { ticker: 'BXP', name: 'Boston Properties Inc.', exchange: 'NYSE', country: 'US', sector: 'Real Estate', index: 'S&P MidCap 400' },
  { ticker: 'ARE', name: 'Alexandria Real Estate Equities Inc.', exchange: 'NYSE', country: 'US', sector: 'Real Estate', index: 'S&P MidCap 400' },
];

// Continue with more companies to reach 1000+
// This file will be imported by generate-universe.ts
