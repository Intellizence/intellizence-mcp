import { postJson } from '../api.js';
import { COMPANY_INDUSTRY_ENUM, COMPANY_TYPE_ENUM, CURRENCY_ENUM, DATE_SCHEMA } from './constants.js';

function registerFundraising(server) {
  const FUNDING_ROUND_ENUM = [
    'Angel',
    'Crowdfunding',
    'Pre-Seed',
    'Seed',
    'Post-Seed / Pre-Series A',
    'Series A',
    'Series B',
    'Series C',
    'Series D',
    'Series E',
    'Series F',
    'Series G',
    'Series H',
    'Series I',
    'Series J',
    'Private Equity',
    'Secondary Offering',
    'Venture - Series Unknown',
    'Debt Financing',
    'Corporate Round',
    'Grant',
  ];

  server.registerResource(
    'funding.about',
    'funding://about',
    { mimeType: 'text/plain' },
    async () => {
      return {
        contents: [
          {
            uri: 'funding://about',
            text: [
              'Funding Dataset MCP Server',
              '',
              'Overview:',
              'This server provides AI-native access to a structured global funding events dataset.',
              "'Startup' and 'company' are interchangeable terms in this dataset.",
              '',
              'Dataset Coverage:',
              '- Coverage start date: January 01, 2020 (announcement date)',
              '- Historical access may vary based on subscription plan',
              '- Global coverage (sources in English)',
              '- Stronger coverage in the order: North America, Europe, Asia Pacific, Middle East, Africa, Latin America',
              '- Data is continuously updated; typical latency is 1–2 business days from the announced date',
              '',
              'Data Normalization:',
              '- Deal amounts are provided in the reported currency where available',
              '- Currency conversion/normalization is not guaranteed; use the currency field and filters',
              '- Currency is required when filtering or calculating by deal amount and valuation',
              '- Dates represent publicly announced funding dates',
              '',
              'Capabilities:',
              '- Search funding events with structured filters',
              '- Compute aggregated funding statistics (total funding, average deal size, deal count)',
              '- Retrieve top deals/companies ranked by deal amount (when available)',
              '- Use for lead discovery, scoring, enrichment, alerts, and trend analysis',
              '',
              'Notes:',
              '- For best matching, prefer domain-based company filters when available',
              '- Some records may have missing valuation, investors, and leadInvestors data depending on public disclosure',
              '- openingBalance, closingBalance, and creditsConsumed are returned only for Pay-Per-Use billing plans',
              '- lastModified is useful for tracking record updates when using dateType: "LAST-MODIFIED" queries',
            ].join('\n'),
          },
        ],
      };
    }
  );

  server.registerTool(
    'search_funding_data',
    {
      description: [
        "Searches Intellizence's funding dataset and returns structured, deduplicated investment event records — one record per deal.",
        'Each record includes company, funding round type (Angel, Seed, Series A–J, PE, Debt, Grant), deal amount, currency, and date.',
        'Use to identify recently funded companies, qualify prospects by funding stage, track investment trends, or enrich CRM accounts with the latest investment event.',
        '',
        'Use structured filters such as date range, company domain/name, funding round, industry/type/location, deal amount filters, and limit.',
        '',
        'dateType:',
        '- Default is "ANNOUNCED". Use "LAST-MODIFIED" only when the user explicitly asks for updated or modified records.',
        '',
        'Company filters:',
        '- Prefer passing companyDomain when available.',
        '- If only companyName is provided, the client MAY attempt to infer company domains based on general knowledge.',
        '',
        'Deal amount filter (structured):',
        '- Use dealAmountOp + dealAmountValue for single-value filters.',
        '  - Example: dealAmountOp=">=" and dealAmountValue=1000000',
        '- Use dealAmountOp="between" + dealAmountMin + dealAmountMax for ranges.',
        '  - Example: dealAmountOp="between", dealAmountMin=1000000, dealAmountMax=4000000',
        '- Use raw numbers (e.g. 1000000), not "1M".',
        '- Currency behavior:',
        '  - currency supports one or more currencies (e.g. ["USD", "EUR", "GBP"]).',
        '  - If currency is omitted, it defaults to all supported currencies.',
        '  - If filtering by dealAmount, include currency to interpret the threshold consistently.',
        '  - Do not convert non-USD amounts to USD unless the user explicitly asks and you have a reliable FX source; otherwise present amounts in the reported currency and label the currency clearly.',
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
          fundingRound: { type: 'array', items: { type: 'string', enum: FUNDING_ROUND_ENUM } },
          dealAmountOp: {
            type: 'string',
            enum: ['>', '>=', '<', '<=', '=', '!=', 'between'],
            description: 'Structured deal amount operator. Use with dealAmountValue or dealAmountMin/dealAmountMax when op is between.',
          },
          dealAmountValue: { type: 'number', description: 'Structured deal amount value used with dealAmountOp when op is not between.' },
          dealAmountMin: { type: 'number', description: 'Structured minimum deal amount used when dealAmountOp is between.' },
          dealAmountMax: { type: 'number', description: 'Structured maximum deal amount used when dealAmountOp is between.' },
          currency: { type: 'array', items: { type: 'string', enum: CURRENCY_ENUM } },
          limit: { type: 'integer', minimum: 1, maximum: 100 },
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

      if (!payload.dealAmount && payload.dealAmountOp) {
        if (payload.dealAmountOp === 'between') {
          if (typeof payload.dealAmountMin === 'number' && typeof payload.dealAmountMax === 'number') {
            payload.dealAmount = `(${payload.dealAmountMin},${payload.dealAmountMax})`;
          }
        } else if (typeof payload.dealAmountValue === 'number') {
          payload.dealAmount = `${payload.dealAmountOp}${payload.dealAmountValue}`;
        }
      }

      delete payload.dealAmountOp;
      delete payload.dealAmountValue;
      delete payload.dealAmountMin;
      delete payload.dealAmountMax;

      const result = await postJson('/api/dataset/fundraising', payload);
      return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
    }
  );
}

export { registerFundraising };
