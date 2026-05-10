import { postJson } from '../api.js';
import { COMPANY_INDUSTRY_ENUM, COMPANY_TYPE_ENUM, CURRENCY_ENUM, DATE_SCHEMA } from './constants.js';

function registerMna(server) {
  const MNA_TYPE_ENUM = [
    'Acquisition - Total',
    'Acquisition - Asset / Business Division Sale',
    'Acquisition - Financial Stake',
    'Acquisition - Joint Venture Stake',
    'Merger',
    'Reverse Takeover',
    'Tender Offer',
    'Other',
    'Merger - Business Operations',
    'Merger - Internal Operations/Subsidiaries',
    'Acqui-hire',
  ];

  const MNA_STATUS_ENUM = [
    'Announced',
    'Rumours & Speculation',
    'Regulator Approved',
    'Shareholder Approved',
    'Terminated',
    'Completed',
    'Board Rejected',
    'Shareholder Rejected',
    'Regulator Rejected',
    'Bid/Offer',
    'In Discussion/Negotiation',
    'Regulator Review',
    'Legal Dispute',
  ];

  server.registerResource('mergers-acquisitions.about', 'mergers-acquisitions://about', { mimeType: 'text/plain' }, async () => {
    return {
      contents: [
        {
          uri: 'mergers-acquisitions://about',
          text: [
            'Mergers & Acquisitions Dataset MCP Server',
            '',
            'Overview:',
            'This server provides AI-native access to a structured global M&A deals dataset (one record per deal).',
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
            '- Dates represent publicly announced deal dates where available',
            '',
            'Capabilities:',
            '- Search M&A deals with structured filters',
            '- Filter independently by company role: acquiring, acquired, and selling',
            '- Filter by deal type, deal status, deal amount, currency, and date',
            '',
            'Notes:',
            '- For best matching, prefer domain-based company filters when available',
            "- 'Startup' and 'company' are interchangeable terms in this dataset",
            '- Default deal status is Announced when no mnaStatus is provided',
            '- dealAmount and currency are only populated when publicly disclosed; check for null before displaying',
            '- sellingCompany is only populated for divestment deals; it may be absent or null for standard acquisitions',
            '- openingBalance, closingBalance, and creditsConsumed are returned only for Pay-Per-Use billing plans',
            '- lastModified is useful for tracking record updates when using dateType: "LAST-MODIFIED" queries',
          ].join('\n'),
        },
      ],
    };
  });

  server.registerTool(
    'search_mergers_acquisitions_data',
    {
      description: [
        "Searches Intellizence's M&A dataset and returns structured, deduplicated merger and acquisition deal records — one record per deal.",
        'Supports independent filtering on three company roles: acquiring, acquired, and selling.',
        'Each record includes deal type, deal status, deal amount, currency, and date.',
        'Use to detect acquisition activity, monitor customers for M&A events, track M&A trends, or identify divestments.',
        'Default mnaStatus is Announced.',
        '',
        'Use structured filters: date range, company domains/names (by role), industries, locations, deal amount filters, mnaStatus, mnaType, currency, limit.',
        '',
        'dateType:',
        '- Default is "ANNOUNCED". Use "LAST-MODIFIED" only when the user explicitly asks for updated or modified records.',
        '',
        'Company filters:',
        '- Prefer passing company domain fields when available (acquiringCompanyDomain/acquiredCompanyDomain/sellingCompanyDomain).',
        '- If only company name fields are provided (acquiringCompanyName/acquiredCompanyName/sellingCompanyName), the client MAY attempt to infer company domains based on general knowledge.',
        '',
        'Location:',
        '- Use full location names as stored in the dataset (no abbreviations). Examples: "United States of America", "United Kingdom".',
        '',
        'Deal amount filter (structured):',
        '- Use dealAmountOp + dealAmountValue for single-value filters.',
        '  - Example: dealAmountOp=">=" and dealAmountValue=1000000',
        '- Use dealAmountOp="between" + dealAmountMin + dealAmountMax for ranges.',
        '  - Example: dealAmountOp="between", dealAmountMin=1000000, dealAmountMax=4000000',
        '- Use raw numbers (e.g. 1000000), not "1M".',
        '',
        'Currency:',
        '- You can pass one or more currencies via the currency filter (e.g. ["USD", "EUR", "GBP"]).',
        '- If currency is omitted, it defaults to all supported currencies.',
        '- If filtering by dealAmount, include currency to interpret the threshold consistently.',
        '- Do not convert non-USD amounts to USD unless the user explicitly asks and you have a reliable FX source; otherwise present amounts in the reported currency and label the currency clearly.',
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
          acquiringCompanyDomain: { type: 'array', items: { type: 'string' } },
          acquiredCompanyDomain: { type: 'array', items: { type: 'string' } },
          sellingCompanyDomain: { type: 'array', items: { type: 'string' } },
          acquiringCompanyName: { type: 'array', items: { type: 'string' } },
          acquiredCompanyName: { type: 'array', items: { type: 'string' } },
          sellingCompanyName: { type: 'array', items: { type: 'string' } },
          acquiringCompanyIndustry: { type: 'array', items: { type: 'string', enum: COMPANY_INDUSTRY_ENUM } },
          acquiredCompanyIndustry: { type: 'array', items: { type: 'string', enum: COMPANY_INDUSTRY_ENUM } },
          sellingCompanyIndustry: { type: 'array', items: { type: 'string', enum: COMPANY_INDUSTRY_ENUM } },
          acquiringCompanyLocation: {
            type: 'array',
            items: { type: 'string' },
            description:
              'Use full location names as stored in the dataset (no abbreviations). Examples: "United States of America", "United Kingdom".',
          },
          acquiredCompanyLocation: {
            type: 'array',
            items: { type: 'string' },
            description:
              'Use full location names as stored in the dataset (no abbreviations). Examples: "United States of America", "United Kingdom".',
          },
          sellingCompanyLocation: {
            type: 'array',
            items: { type: 'string' },
            description:
              'Use full location names as stored in the dataset (no abbreviations). Examples: "United States of America", "United Kingdom".',
          },
          acquiringCompanyType: { type: 'array', items: { type: 'string', enum: COMPANY_TYPE_ENUM } },
          acquiredCompanyType: { type: 'array', items: { type: 'string', enum: COMPANY_TYPE_ENUM } },
          sellingCompanyType: { type: 'array', items: { type: 'string', enum: COMPANY_TYPE_ENUM } },
          acquiringCompanyTicker: { type: 'array', items: { type: 'string' } },
          acquiredCompanyTicker: { type: 'array', items: { type: 'string' } },
          sellingCompanyTicker: { type: 'array', items: { type: 'string' } },
          dealAmountOp: { type: 'string', enum: ['>', '>=', '<', '<=', '=', '!=', 'between'] },
          dealAmountValue: { type: 'number' },
          dealAmountMin: { type: 'number' },
          dealAmountMax: { type: 'number' },
          mnaStatus: { type: 'array', items: { type: 'string', enum: MNA_STATUS_ENUM } },
          mnaType: { type: 'array', items: { type: 'string', enum: MNA_TYPE_ENUM } },
          currency: { type: 'array', items: { type: 'string', enum: CURRENCY_ENUM } },
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

      const result = await postJson('/api/dataset/mna', payload);
      return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
    }
  );
}

export { registerMna };
