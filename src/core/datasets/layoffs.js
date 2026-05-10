import { postJson } from '../api.js';
import { COMPANY_INDUSTRY_ENUM, COMPANY_TYPE_ENUM, DATE_SCHEMA } from './constants.js';

function registerLayoffs(server) {

  const LAYOFF_REASON_ENUM = [
    'Economic Crisis',
    'Pandemic',
    'Restructuring',
    'Cost-cutting',
    'M&A',
    'Automation',
    'Outsourcing',
    'Privatization',
    'Trade Tariff/Treaty',
    'Business Closure',
    'Relocation',
    'Not Specified',
    'Divestment',
    'Contract Loss',
    'Loss of Funding',
    'Sales Decline',
    'Other',
    'Bankruptcy',
    'Financial Distress',
    'Production Cut',
    'Employee Strike',
    'IPO',
    'Staff Redudancies',
    'Voluntary Dismissal',
    'Employees Performance Metrics',
    'Strategic and Business Changes',
    'Annual Review Process',
    'AI Automation',
    'Natural Disaster',
  ];

  const LAYOFF_TYPE_ENUM = [
    'Downsizing/Layoff',
    'Furlough/Temporary',
    'Hiring Freeze',
    'Voluntary Retirement',
    'Other',
    'Temporary Plant Closure',
    'Permanent Plant Closure',
    'Voluntary Separation Program',
  ];

  server.registerResource(
    'layoffs.about',
    'layoffs://about',
    { mimeType: 'text/plain' },
    async () => {
      return {
        contents: [
          {
            uri: 'layoffs://about',
            text: [
              'Layoffs Dataset MCP Server',
              '',
              'Overview:',
              'This server provides AI-native access to a structured global layoffs and workforce reduction events dataset (one record per event).',
              '',
              'Dataset Coverage:',
              '- Coverage start date: January 01, 2020 (announcement date)',
              '- Historical access may vary based on subscription plan',
              '- Sources include both news and WARN filings identified by sourceType (available only for records created after May 1, 2025)',
              '- Global coverage (sources in English)',
              '- Stronger coverage in the order: North America, Europe, Asia Pacific, Middle East, Africa, Latin America',
              '- Data is continuously updated; typical latency is 1–2 business days from the announced date',
              '',
              'Data Normalization:',
              '- Events are structured and deduplicated where possible',
              '- Dates represent publicly announced layoff dates where available',
              '- Layoff count, layoff percent, layoff location, and business division may be missing depending on disclosure',
              '- Layoff reason and type are normalized to a structured taxonomy based on the source',
              '',
              'Capabilities:',
              '- Search layoffs events with structured filters (company, reason, type, location, date range)',
              '- Use for organizational stress signals, churn indicators, budget freeze risk, and workforce reduction trend analysis',
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
    }
  );

  server.registerTool(
    'search_layoffs_data',
    {
      description: [
        "Searches Intellizence's layoffs dataset and returns structured, deduplicated workforce reduction event records — one record per event.",
        'Each record includes company, layoff type, layoff reason (Restructuring, Cost-cutting, M&A, AI Automation, Financial Distress, and more), location, and date.',
        'Use to identify organizational stress signals, budget freeze risk, churn indicators, or sector-wide workforce reduction trends.',
        '',
        'Use structured filters: date range, company domains/names, industries, location, layoffReason, layoffType, limit.',
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
          companyType: { type: 'array', items: { type: 'string', enum: COMPANY_TYPE_ENUM } },
          companyTicker: { type: 'array', items: { type: 'string' } },
          companyLocation: {
            type: 'string',
            description:
              'Use full location names as stored in the dataset (no abbreviations). Examples: "United States of America", "United Kingdom".',
          },
          layoffLocation: { type: 'array', items: { type: 'string' } },
          layoffReason: { type: 'array', items: { type: 'string', enum: LAYOFF_REASON_ENUM } },
          layoffType: { type: 'array', items: { type: 'string', enum: LAYOFF_TYPE_ENUM } },
          limit: { type: 'integer', minimum: 1, maximum: 100 },
        },
      },
    },
    async (args) => {
      const result = await postJson('/api/dataset/layoff', args ?? {});

      return {
        content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
      };
    }
  );
}

export { registerLayoffs };
