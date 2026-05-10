import { postJson } from '../api.js';
import { COMPANY_INDUSTRY_ENUM, COMPANY_TYPE_ENUM, DATE_SCHEMA } from './constants.js';

function registerExecutiveChange(server) {

  const EXECUTIVE_TITLE_CATEGORY_ENUM = [
    'Chief Executive Officer ( CEO)/President/Managing Director',
    'Chair/Vice-Chair',
    'Board of Director',
    'Chief Operating Officer ( COO)',
    'Chief Financial Officer ( CFO) / Head of Finance',
    'Chief Investment Officer ( CIO)',
    'Chief Information Officer ( CIO) / Head of IT',
    'Chief Technology Officer ( CTO)',
    'Chief Product Officer ( CPO) / Head of Product',
    'Chief Risk Officer ( CRO) / Head of Risk',
    'Chief Information Security Officer ( CISO)',
    'Chief Human Resource / People Officer',
    'Chief Marketing Officer ( CMO)',
    'Chief Revenue Officer ( CRO) / Head of Sales',
    'Head of Customer Success/Support',
    'Other',
  ];

  const EXECUTIVE_REASON_ENUM = [
    'New Appointment',
    'Promoted/Role Change',
    'Retired',
    'Terminated',
    'Health',
    'Resigned',
    'Demise',
    'Others',
  ];

  server.registerResource('executive_change.about', 'executive-change://about', { mimeType: 'text/plain' }, async () => {
    return {
      contents: [
        {
          uri: 'executive-change://about',
          text: [
            'Executive Change Dataset MCP Server',
            '',
            'Overview:',
            'This server provides AI-native access to a structured global executive and leadership change events dataset (one record per event).',
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
            '- Executive title categories and change reasons are normalized to a structured taxonomy where possible',
            '- Dates represent publicly announced leadership change dates where available',
            '',
            'Capabilities:',
            '- Search leadership transition events with structured filters',
            '- Filter by title category (CEO, CFO, CTO, CRO, CMO, CISO, Board, and more), reason, company, and date range',
            '- Use for lead discovery, scoring, enrichment, alerts, risk detection, and trend analysis',
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
    'search_executive_changes_data',
    {
      description: [
        "Searches Intellizence's executive change dataset and returns structured, deduplicated leadership transition records — one record per event.",
        'Each record includes executive name, title, title category (CEO, CFO, CTO, CRO, CMO, CISO, Board, and more), company, change reason (New Appointment, Resigned, Retired, Terminated, and more), and date.',
        'Use to identify leadership transitions that trigger new buying cycles, strategy changes, budget reviews, or churn risk.',
        '',
        'Use structured filters: date range, company domains/names, industries, locations, executiveName, executiveTitle, executiveTitleCategory, reason, limit.',
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
          executiveName: { type: 'array', items: { type: 'string' } },
          executiveTitle: { type: 'array', items: { type: 'string' } },
          executiveTitleCategory: { type: 'array', items: { type: 'string', enum: EXECUTIVE_TITLE_CATEGORY_ENUM } },
          reason: { type: 'array', items: { type: 'string', enum: EXECUTIVE_REASON_ENUM } },
          limit: { type: 'integer', minimum: 1, maximum: 100 }
        },
      },
    },
    async (args) => {
      const result = await postJson('/api/dataset/executive-change', args ?? {});
      return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
    }
  );
}

export { registerExecutiveChange };
