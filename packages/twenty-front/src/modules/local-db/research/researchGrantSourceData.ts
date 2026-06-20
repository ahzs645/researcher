// Built-in research grant-source library — ported from the societyer
// curated source catalogue (CIHR, NRC, Innovate BC, UBC/SFU, NDIT, …). These
// seed the `grantSource` object so a fresh local workspace already lists real
// databases to scan for opportunities. Regenerate-friendly: this is plain data.

export type ResearchGrantSourceSeed = {
  libraryKey: string;
  name: string;
  url: string;
  sourceType: string;
  jurisdiction: string | null;
  funderType: string;
  topicTags: string[];
  eligibilityTags: string[];
  scrapeCadence: string;
  trustLevel: string;
  status: string;
  notes: string | null;
};

export const RESEARCH_GRANT_SOURCE_SEEDS: ResearchGrantSourceSeed[] =
[
  {
    "libraryKey": "accelerate-okanagan",
    "name": "Accelerate Okanagan programs",
    "url": "https://accelerateokanagan.com/programs/",
    "sourceType": "FUNDER_SITE",
    "jurisdiction": "British Columbia",
    "funderType": "OTHER",
    "topicTags": [
      "accelerator",
      "mentorship",
      "startup-basics",
      "revup"
    ],
    "eligibilityTags": [
      "startup",
      "early-stage",
      "growth",
      "okanagan"
    ],
    "scrapeCadence": "MONTHLY",
    "trustLevel": "OFFICIAL",
    "status": "ACTIVE",
    "notes": "Official Accelerate Okanagan programs source for RevUp, Startup Basics, and related startup support programs."
  },
  {
    "libraryKey": "accelerateip",
    "name": "AccelerateIP",
    "url": "https://www.accelerateip.ca/",
    "sourceType": "FUNDER_SITE",
    "jurisdiction": "British Columbia, Yukon, Northwest Territories, Nunavut",
    "funderType": "OTHER",
    "topicTags": [
      "ip",
      "commercialization",
      "new-ventures-bc",
      "innovate-bc"
    ],
    "eligibilityTags": [
      "startup",
      "intellectual-property",
      "small-business"
    ],
    "scrapeCadence": "MONTHLY",
    "trustLevel": "OFFICIAL",
    "status": "ACTIVE",
    "notes": "Official AccelerateIP source led by New Ventures BC with Innovate BC collaboration."
  },
  {
    "libraryKey": "bc-agriculture-programs",
    "name": "B.C. agriculture programs",
    "url": "https://www2.gov.bc.ca/gov/content/industry/agriculture-seafood/programs",
    "sourceType": "GOVERNMENT_PORTAL",
    "jurisdiction": "British Columbia",
    "funderType": "GOVERNMENT",
    "topicTags": [
      "agriculture-wildlife",
      "production-insurance",
      "tree-fruit",
      "buy-bc"
    ],
    "eligibilityTags": [
      "agriculture",
      "farmers",
      "producers",
      "provincial"
    ],
    "scrapeCadence": "MONTHLY",
    "trustLevel": "OFFICIAL",
    "status": "ACTIVE",
    "notes": "Official B.C. agriculture and seafood programs portal for farm, crop, livestock, and sector support programs."
  },
  {
    "libraryKey": "bc-arts-council",
    "name": "BC Arts Council programs",
    "url": "https://www.bcartscouncil.ca/program/",
    "sourceType": "GOVERNMENT_PORTAL",
    "jurisdiction": "British Columbia",
    "funderType": "GOVERNMENT",
    "topicTags": [
      "arts-impact",
      "project-assistance",
      "creative-industries"
    ],
    "eligibilityTags": [
      "arts",
      "culture",
      "nonprofit",
      "collectives"
    ],
    "scrapeCadence": "WEEKLY",
    "trustLevel": "OFFICIAL",
    "status": "ACTIVE",
    "notes": "Official BC Arts Council program source, including Arts Impact Grant and related arts funding."
  },
  {
    "libraryKey": "bc-manufacturing-jobs-fund",
    "name": "BC Manufacturing Jobs Fund",
    "url": "https://www2.gov.bc.ca/ManufacturingJobsFund",
    "sourceType": "GOVERNMENT_PORTAL",
    "jurisdiction": "British Columbia",
    "funderType": "GOVERNMENT",
    "topicTags": [
      "capital-investment",
      "project-readiness",
      "equipment",
      "infrastructure"
    ],
    "eligibilityTags": [
      "manufacturing",
      "for-profit",
      "indigenous-owned",
      "regional"
    ],
    "scrapeCadence": "WEEKLY",
    "trustLevel": "OFFICIAL",
    "status": "ACTIVE",
    "notes": "Official B.C. Manufacturing Jobs Fund page for Project Readiness and Capital Investment streams."
  },
  {
    "libraryKey": "bc-tax-credits",
    "name": "B.C. business tax credits and incentives",
    "url": "https://www2.gov.bc.ca/gov/content/taxes/income-taxes/corporate/credits",
    "sourceType": "GOVERNMENT_PORTAL",
    "jurisdiction": "British Columbia",
    "funderType": "GOVERNMENT",
    "topicTags": [
      "sr-ed",
      "book-publishing",
      "interactive-digital-media",
      "training-tax-credit"
    ],
    "eligibilityTags": [
      "business",
      "tax-credit",
      "provincial"
    ],
    "scrapeCadence": "MONTHLY",
    "trustLevel": "OFFICIAL",
    "status": "ACTIVE",
    "notes": "Official B.C. corporate income tax credits source for several incentive-style programs."
  },
  {
    "libraryKey": "bc-tech",
    "name": "BC Tech programs",
    "url": "https://wearebctech.com/",
    "sourceType": "FUNDER_SITE",
    "jurisdiction": "British Columbia",
    "funderType": "OTHER",
    "topicTags": [
      "scaleup-academy",
      "ip-accelerator",
      "growth",
      "talent"
    ],
    "eligibilityTags": [
      "technology",
      "startup",
      "scale-up",
      "members"
    ],
    "scrapeCadence": "MONTHLY",
    "trustLevel": "OFFICIAL",
    "status": "ACTIVE",
    "notes": "Official BC Tech Association source for member growth, scaleup, IP, talent, and accelerator programs."
  },
  {
    "libraryKey": "buy-bc",
    "name": "Buy BC Partnership Program",
    "url": "https://buybc.gov.bc.ca/members/become-a-buy-bc-member/",
    "sourceType": "GOVERNMENT_PORTAL",
    "jurisdiction": "British Columbia",
    "funderType": "GOVERNMENT",
    "topicTags": [
      "marketing",
      "buy-bc",
      "partnership"
    ],
    "eligibilityTags": [
      "agriculture",
      "food",
      "seafood",
      "producers",
      "processors"
    ],
    "scrapeCadence": "MONTHLY",
    "trustLevel": "OFFICIAL",
    "status": "ACTIVE",
    "notes": "Official Buy BC source for producers, processors, and industry association funding references."
  },
  {
    "libraryKey": "childcarebc-operating-funding",
    "name": "ChildCareBC operating funding",
    "url": "https://www2.gov.bc.ca/gov/content/family-social-supports/caring-for-young-children/childcarebc-programs/child-care-operating-funding",
    "sourceType": "GOVERNMENT_PORTAL",
    "jurisdiction": "British Columbia",
    "funderType": "GOVERNMENT",
    "topicTags": [
      "operating-funding",
      "fee-reduction",
      "wage-enhancement"
    ],
    "eligibilityTags": [
      "child-care",
      "providers",
      "small-business",
      "nonprofit"
    ],
    "scrapeCadence": "MONTHLY",
    "trustLevel": "OFFICIAL",
    "status": "ACTIVE",
    "notes": "Official ChildCareBC source for base operating funding, fee reduction, and ECE wage enhancement."
  },
  {
    "libraryKey": "cihr-researchnet",
    "name": "CIHR ResearchNet current funding opportunities",
    "url": "https://www.researchnet-recherchenet.ca/rnetsso/ssologin?language=en",
    "sourceType": "GOVERNMENT_PORTAL",
    "jurisdiction": "Canada",
    "funderType": "GOVERNMENT",
    "topicTags": [
      "cihr",
      "researchnet",
      "health",
      "grants"
    ],
    "eligibilityTags": [
      "research",
      "health-research",
      "canada",
      "institutional-applicants"
    ],
    "scrapeCadence": "WEEKLY",
    "trustLevel": "OFFICIAL",
    "status": "ACTIVE",
    "notes": "Official CIHR ResearchNet sign-in page exposes a public Current funding opportunities list with opportunity links, registration/LOI deadlines, and application deadlines. Deeper application/project pages may require ResearchNet authentication."
  },
  {
    "libraryKey": "city-surrey-cultural-grants",
    "name": "City of Surrey cultural grants",
    "url": "https://www.surrey.ca/arts-culture/cultural-grants",
    "sourceType": "GOVERNMENT_PORTAL",
    "jurisdiction": "Surrey, British Columbia",
    "funderType": "GOVERNMENT",
    "topicTags": [
      "surrey",
      "cultural-grants",
      "community"
    ],
    "eligibilityTags": [
      "nonprofit",
      "arts",
      "culture",
      "regional"
    ],
    "scrapeCadence": "MONTHLY",
    "trustLevel": "OFFICIAL",
    "status": "ACTIVE",
    "notes": "Official City of Surrey cultural grants source; separate from older third-party ACS card references."
  },
  {
    "libraryKey": "community-futures-bc",
    "name": "Community Futures British Columbia",
    "url": "https://www.communityfutures.ca/our-services/loans-funding",
    "sourceType": "FUNDER_SITE",
    "jurisdiction": "British Columbia",
    "funderType": "OTHER",
    "topicTags": [
      "loans",
      "micro-loans",
      "business-advisory"
    ],
    "eligibilityTags": [
      "rural",
      "entrepreneurs",
      "small-business",
      "nonprofit"
    ],
    "scrapeCadence": "MONTHLY",
    "trustLevel": "OFFICIAL",
    "status": "ACTIVE",
    "notes": "Official Community Futures BC loans and funding source; local offices administer many details."
  },
  {
    "libraryKey": "first-nations-clean-energy-business-fund",
    "name": "First Nations Clean Energy Business Fund",
    "url": "https://www2.gov.bc.ca/gov/content/environment/natural-resource-stewardship/consulting-with-first-nations/first-nations-clean-energy-business-fund",
    "sourceType": "GOVERNMENT_PORTAL",
    "jurisdiction": "British Columbia",
    "funderType": "GOVERNMENT",
    "topicTags": [
      "capacity-funding",
      "equity-funding",
      "revenue-sharing",
      "clean-energy"
    ],
    "eligibilityTags": [
      "first-nations",
      "indigenous",
      "clean-energy",
      "communities"
    ],
    "scrapeCadence": "WEEKLY",
    "trustLevel": "OFFICIAL",
    "status": "ACTIVE",
    "notes": "Official B.C. source for FNCEBF capacity funding, equity funding, and revenue sharing."
  },
  {
    "libraryKey": "innovate-bc",
    "name": "Innovate BC programs",
    "url": "https://www.innovatebc.ca/programs",
    "sourceType": "FUNDER_SITE",
    "jurisdiction": "British Columbia",
    "funderType": "GOVERNMENT",
    "topicTags": [
      "ignite",
      "skills",
      "commercialization",
      "tech-adoption"
    ],
    "eligibilityTags": [
      "innovation",
      "research",
      "small-business",
      "technology"
    ],
    "scrapeCadence": "MONTHLY",
    "trustLevel": "OFFICIAL",
    "status": "ACTIVE",
    "notes": "Official Innovate BC programs source, including Ignite and innovation workforce initiatives."
  },
  {
    "libraryKey": "new-relationship-trust",
    "name": "New Relationship Trust funding programs",
    "url": "https://newrelationshiptrust.ca/apply-for-funding/funding-overview/overview-of-funding-programs/",
    "sourceType": "FUNDER_SITE",
    "jurisdiction": "British Columbia",
    "funderType": "OTHER",
    "topicTags": [
      "cannabis-business-fund",
      "equity-matching",
      "capacity",
      "grants"
    ],
    "eligibilityTags": [
      "first-nations",
      "indigenous",
      "communities",
      "economic-development"
    ],
    "scrapeCadence": "MONTHLY",
    "trustLevel": "OFFICIAL",
    "status": "ACTIVE",
    "notes": "Official New Relationship Trust funding overview source for First Nations funding programs."
  },
  {
    "libraryKey": "northern-development-initiative-trust",
    "name": "Northern Development Initiative Trust funding programs",
    "url": "https://www.northerndevelopment.bc.ca/funding-programs/",
    "sourceType": "FUNDER_SITE",
    "jurisdiction": "Northern British Columbia",
    "funderType": "OTHER",
    "topicTags": [
      "consulting-rebate",
      "innovation",
      "economic-development"
    ],
    "eligibilityTags": [
      "regional",
      "small-business",
      "nonprofit",
      "local-government"
    ],
    "scrapeCadence": "MONTHLY",
    "trustLevel": "OFFICIAL",
    "status": "ACTIVE",
    "notes": "Official Northern Development funding program source for regional business and community development supports."
  },
  {
    "libraryKey": "nrc-research-collaboration",
    "name": "National Research Council research collaboration programs",
    "url": "https://nrc.canada.ca/en/research-development/research-collaboration",
    "sourceType": "GOVERNMENT_PORTAL",
    "jurisdiction": "Canada",
    "funderType": "GOVERNMENT",
    "topicTags": [
      "aerospace",
      "automotive",
      "research-centres",
      "collaboration"
    ],
    "eligibilityTags": [
      "research",
      "commercialization",
      "national",
      "industry-partnership"
    ],
    "scrapeCadence": "MONTHLY",
    "trustLevel": "OFFICIAL",
    "status": "ACTIVE",
    "notes": "Official NRC source for research collaboration opportunities and research centre partnership pages."
  },
  {
    "libraryKey": "pacifican-funding",
    "name": "PacifiCan funding programs",
    "url": "https://www.canada.ca/en/pacific-economic-development/services/funding.html",
    "sourceType": "GOVERNMENT_PORTAL",
    "jurisdiction": "British Columbia",
    "funderType": "GOVERNMENT",
    "topicTags": [
      "business-scale-up-productivity",
      "regional-innovation-ecosystems",
      "regional-ai",
      "homebuilding"
    ],
    "eligibilityTags": [
      "business",
      "nonprofit",
      "regional",
      "scale-up"
    ],
    "scrapeCadence": "WEEKLY",
    "trustLevel": "OFFICIAL",
    "status": "ACTIVE",
    "notes": "Official PacifiCan funding source for BSP, RIE, RAII, RHII, and related regional economic development programs."
  },
  {
    "libraryKey": "sfu-venturelabs",
    "name": "SFU VentureLabs programs",
    "url": "https://venturelabs.ca/programs-services/",
    "sourceType": "FUNDER_SITE",
    "jurisdiction": "British Columbia",
    "funderType": "UNIVERSITY",
    "topicTags": [
      "accelerator",
      "perago",
      "venturelabs",
      "commercialization"
    ],
    "eligibilityTags": [
      "startup",
      "scale-up",
      "deeptech",
      "life-sciences"
    ],
    "scrapeCadence": "MONTHLY",
    "trustLevel": "OFFICIAL",
    "status": "ACTIVE",
    "notes": "Official SFU VentureLabs source for accelerator and venture support programs."
  },
  {
    "libraryKey": "tacc-financing",
    "name": "Tale'awtxw Aboriginal Capital Corporation",
    "url": "https://www.tacc.ca/",
    "sourceType": "FUNDER_SITE",
    "jurisdiction": "Coast Salish territories",
    "funderType": "OTHER",
    "topicTags": [
      "business-loans",
      "business-equity",
      "first-citizens-fund"
    ],
    "eligibilityTags": [
      "indigenous-owned",
      "small-business",
      "entrepreneurs"
    ],
    "scrapeCadence": "MONTHLY",
    "trustLevel": "OFFICIAL",
    "status": "ACTIVE",
    "notes": "Official TACC source for Indigenous business financing and support services."
  },
  {
    "libraryKey": "ubc-hatch",
    "name": "UBC HATCH Venture Builder",
    "url": "https://icics.ubc.ca/hatch/",
    "sourceType": "FUNDER_SITE",
    "jurisdiction": "University of British Columbia",
    "funderType": "UNIVERSITY",
    "topicTags": [
      "hatch",
      "concept-fund",
      "venture-builder",
      "incubator"
    ],
    "eligibilityTags": [
      "startup",
      "university",
      "research",
      "social-impact"
    ],
    "scrapeCadence": "MONTHLY",
    "trustLevel": "OFFICIAL",
    "status": "ACTIVE",
    "notes": "Official UBC HATCH source for venture-building support and related funding opportunities."
  },
  {
    "libraryKey": "venture-for-canada",
    "name": "Venture for Canada programs",
    "url": "https://www.ventureforcanada.ca/programs",
    "sourceType": "FUNDER_SITE",
    "jurisdiction": "Canada",
    "funderType": "OTHER",
    "topicTags": [
      "internship",
      "workforce",
      "wage-subsidy",
      "entrepreneurship"
    ],
    "eligibilityTags": [
      "startup",
      "small-business",
      "students",
      "hiring"
    ],
    "scrapeCadence": "MONTHLY",
    "trustLevel": "OFFICIAL",
    "status": "ACTIVE",
    "notes": "Official Venture for Canada programs source for internships and entrepreneur workforce supports."
  },
  {
    "libraryKey": "webc-financing",
    "name": "WeBC financing and business support",
    "url": "https://we-bc.ca/what-we-offer/financing/business-loans-for-women/",
    "sourceType": "FUNDER_SITE",
    "jurisdiction": "British Columbia",
    "funderType": "OTHER",
    "topicTags": [
      "business-loans",
      "skills-development",
      "weoc"
    ],
    "eligibilityTags": [
      "women-owned",
      "small-business",
      "startup",
      "growth"
    ],
    "scrapeCadence": "MONTHLY",
    "trustLevel": "OFFICIAL",
    "status": "ACTIVE",
    "notes": "Official WeBC source for business loans and related entrepreneur supports."
  },
  {
    "libraryKey": "workbc-employer-training-grant",
    "name": "B.C. Employer Training Grant",
    "url": "https://www.workbc.ca/ETG",
    "sourceType": "GOVERNMENT_PORTAL",
    "jurisdiction": "British Columbia",
    "funderType": "GOVERNMENT",
    "topicTags": [
      "workbc",
      "skills-training",
      "workforce-development"
    ],
    "eligibilityTags": [
      "employers",
      "training",
      "small-business",
      "large-business"
    ],
    "scrapeCadence": "WEEKLY",
    "trustLevel": "OFFICIAL",
    "status": "ACTIVE",
    "notes": "Official WorkBC source for the B.C. Employer Training Grant."
  }
];
