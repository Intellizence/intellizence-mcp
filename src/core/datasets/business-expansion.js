import { postJson } from '../api.js';
import { COMPANY_INDUSTRY_ENUM, COMPANY_TYPE_ENUM, CURRENCY_ENUM, DATE_SCHEMA } from './constants.js';

function registerBusinessExpansion(server) {

  const EXPANSION_TYPE_ENUM = [
    'Store',
    'Restaurant',
    'Data Centre',
    'Factory/Plant',
    'Country Expansion',
    'HQ',
    'Mine',
    'Branch/Office',
    'Oil/Gas Well',
    'Other',
    'Product/Service Availability',
    'Research/Lab/Innovation',
    'Renewables',
    'Fulfillment/Distribution Centre/Warehouse',
    'New Business',
    'Fleet',
    'Route',
    'Airport/Airline Hub/Cargo Facility',
    'Healthcare Facility',
    'Hotel/Resort',
    'Delivery/Pickup',
    'Education',
    'Lease/Land Purchase',
  ];

  server.registerResource('business-expansion.about', 'business-expansion://about', { mimeType: 'text/plain' }, async () => {
    return {
      contents: [
        {
          uri: 'business-expansion://about',
          text: [
            'Business Expansion Dataset MCP Server',
            '',
            'Overview:',
            'This server provides AI-native access to a structured global business expansion events dataset (one record per event).',
            '',
            'Dataset Coverage:',
            '- Coverage start date: January 01, 2021 (announcement date)',
            '- Historical access may vary based on subscription plan',
            '- Global coverage (sources in English)',
            '- Stronger coverage in the order: North America, Europe, Asia Pacific, Middle East, Africa, Latin America',
            '- Data is continuously updated; typical latency is 1–2 business days from the announced date',
            '',
            'Data Normalization:',
            '- Events are structured and deduplicated where possible',
            '- Investment amounts and jobs created may be missing depending on disclosure',
            '- Currency conversion/normalization is not guaranteed; use the currency field and filters when available',
            '- Currency is required when filtering or calculating by deal amount',
            '- Dates represent publicly announced expansion dates where available',
            '',
            'Capabilities:',
            '- Search expansion events with structured filters',
            '- Filter by expansion type, location, investment amount, jobs created, and date range',
            '- Identify companies expanding their physical and operational footprint, entering new markets, making large capital investments, or announcing significant hiring and economic development in a region',
            '- Use for lead discovery, scoring, enrichment, alerts, and trend analysis',
            '',
            'Notes:',
            '- For best matching, prefer domain-based company filters when available',
            "- 'Startup' and 'company' are interchangeable terms in this dataset",
            '- openingBalance, closingBalance, and creditsConsumed are returned only for Pay-Per-Use billing plans',
            '- lastModified is useful for tracking record updates when using dateType: "LAST-MODIFIED" queries',
          ].join('\n'),
        },
      ],
    };
  });

  server.registerTool(
    'search_expansion_data',
    {
      description: [
        "Searches Intellizence's business expansion dataset and returns structured, deduplicated operational expansion event records — one record per event.",
        'Each record includes company, expansion type (Office, Factory, Data Centre, HQ, Country Expansion, Research Lab, Major Hiring and more), expansion location, investment amount, jobs created, and date.',
        'Use to identify companies growing their footprint, entering new markets, or making large capital investments.',
        '',
        'Use structured filters: date range, company domains/names, industries, locations, expansion type, investment filters, jobs filters, limit.',
        '',
        'dateType:',
        '- Default is "ANNOUNCED". Use "LAST-MODIFIED" only when the user explicitly asks for updated or modified records.',
        '',
        'Company filters:',
        '- Prefer passing companyDomain when available.',
        '- If only companyName is provided, the client MAY attempt to infer company domains based on general knowledge.',
        '',
        'Location:',
        '- Use full location names as stored in the dataset (no abbreviations). Examples: "United States of America", "United Kingdom".',
        '',
        'Investment filter (structured):',
        '- Use investmentOp + investmentValue for single-value filters.',
        '  - Example: investmentOp=">=" and investmentValue=1000000',
        '- Use investmentOp="between" + investmentMin + investmentMax for ranges.',
        '  - Example: investmentOp="between", investmentMin=1000000, investmentMax=4000000',
        '- Use raw numbers (e.g. 1000000), not "1M".',
        '- Currency behavior:',
        '  - currency supports one or more currencies (e.g. ["USD", "EUR", "GBP"]).',
        '  - If currency is omitted, it defaults to all supported currencies.',
        '  - If filtering by investment, include currency to interpret the threshold consistently.',
        '  - Do not convert non-USD amounts to USD unless the user explicitly asks and you have a reliable FX source; otherwise present amounts in the reported currency and label the currency clearly.',

        'Jobs filter (structured):',
        '- Use jobsOp + jobsValue for single-value filters.',
        '  - Example: jobsOp=">=" and jobsValue=100',
        '- Use jobsOp="between" + jobsMin + jobsMax for ranges.',
        '  - Example: jobsOp="between", jobsMin=10, jobsMax=200',
        '- Use raw numbers (e.g. 100), not "100 jobs".',
        '',
        'LIMIT GUIDANCE - match depth of response to user intent:',
        '- "quick update" / "anything new" / "highlights": 5–10',
        '- Standard query (default): 25',
        '- "full briefing" / "comprehensive" / "all": 50–100',
        '- Pre-call prep: 10',
      ].join('\n'),
      inputSchema: {
        type: 'object',
        properties: {
          startDate: DATE_SCHEMA,
          endDate: DATE_SCHEMA,
          date: DATE_SCHEMA,
          dateType: { type: 'string', enum: ['ANNOUNCED', 'LAST-MODIFIED'] },
          companyDomain: { type: 'array', items: { type: 'string' } },
          companyName: { type: 'array', items: { type: 'string' } },
          companyIndustry: { type: 'array', items: { type: 'string', enum: COMPANY_INDUSTRY_ENUM } },
          companyTicker: { type: 'array', items: { type: 'string' } },
          companyLocation: {
            type: 'array',
            items: { type: 'string' },
            description:
              'Use full location names as stored in the dataset (no abbreviations). Examples: "United States of America", "United Kingdom".',
          },
          companyType: { type: 'array', items: { type: 'string', enum: COMPANY_TYPE_ENUM } },
          expansionType: { type: 'array', items: { type: 'string', enum: EXPANSION_TYPE_ENUM } },
          expansionLocation: {
            type: 'array',
            items: { type: 'string' },
            description:
              'Use full location names as stored in the dataset (no abbreviations). Examples: "United States of America", "United Kingdom".',
          },
          investmentOp: {
            type: 'string',
            enum: ['>', '>=', '<', '<=', '=', '!=', 'between'],
          },
          investmentValue: { type: 'number' },
          investmentMin: { type: 'number' },
          investmentMax: { type: 'number' },
          currency: { type: 'array', items: { type: 'string', enum: CURRENCY_ENUM } },
          jobsOp: {
            type: 'string',
            enum: ['>', '>=', '<', '<=', '=', '!=', 'between'],
          },
          jobsValue: { type: 'number' },
          jobsMin: { type: 'number' },
          jobsMax: { type: 'number' },
          limit: { type: 'integer', minimum: 1, maximum: 100 }
        },
      },
    },
    async (args) => {
      const payload = { ...(args ?? {}) };

      if (typeof payload.currency === 'string' && payload.currency) {
        payload.currency = [payload.currency];
      }
      if (!Array.isArray(payload.currency) || payload.currency.length === 0) {
        payload.currency = [...CURRENCY_ENUM];
      }

      if (!payload.investment && payload.investmentOp) {
        if (payload.investmentOp === 'between') {
          if (typeof payload.investmentMin === 'number' && typeof payload.investmentMax === 'number') {
            payload.investment = `(${payload.investmentMin},${payload.investmentMax})`;
          }
        } else if (typeof payload.investmentValue === 'number') {
          payload.investment = `${payload.investmentOp}${payload.investmentValue}`;
        }
      }

      if (!payload.jobs && payload.jobsOp) {
        if (payload.jobsOp === 'between') {
          if (typeof payload.jobsMin === 'number' && typeof payload.jobsMax === 'number') {
            payload.jobs = `(${payload.jobsMin},${payload.jobsMax})`;
          }
        } else if (typeof payload.jobsValue === 'number') {
          payload.jobs = `${payload.jobsOp}${payload.jobsValue}`;
        }
      }

      delete payload.investmentOp;
      delete payload.investmentValue;
      delete payload.investmentMin;
      delete payload.investmentMax;
      delete payload.jobsOp;
      delete payload.jobsValue;
      delete payload.jobsMin;
      delete payload.jobsMax;

      const result = await postJson('/api/dataset/business-expansion', payload);
      return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
    }
  );
}

export { registerBusinessExpansion };
