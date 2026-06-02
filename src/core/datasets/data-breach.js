import { getJson, postJson } from '../api.js';
import { COMPANY_INDUSTRY_ENUM, COMPANY_TYPE_ENUM, DATE_SCHEMA } from './constants.js';

function registerDataBreach(server) {

  const INCIDENT_TYPE_ENUM = [
    'Data Breach/Theft/Leak',
    'Security Breach',
    'Ransomware',
    'Malware',
    'DDOS',
    'POS Attack',
    'Hack',
    'Others',
  ];

  server.registerResource('data_breach.about', 'data-breach://about', { mimeType: 'text/plain' }, async () => {
    return {
      contents: [
        {
          uri: 'data-breach://about',
          text: [
            'Security Breaches Dataset MCP Server',
            '',
            'Overview:',
            'This server provides AI-native access to a structured global security incident dataset (one record per event).',
            '',
            'Dataset Coverage:',
            '- Coverage start date: January 01, 2022 (announcement date)',
            '- Historical access may vary based on subscription plan',
            '- Global coverage (sources in English)',
            '- Stronger coverage in the order: North America, Europe, Asia Pacific, Middle East, Africa, Latin America',
            '- Data is continuously updated; typical latency is 1–2 business days from the announced date',
            '',
            'Data Normalization:',
            '- Events are structured and deduplicated where possible',
            '- Incident types are normalized to a structured taxonomy where possible',
            '- People impacted counts may be missing or estimated depending on disclosure',
            '- Dates represent publicly announced incident dates where available',
            '',
            'Capabilities:',
            '- Search security incidents with structured filters (company, incident type, people impacted, location, date range)',
            '- Use for cybersecurity risk exposure assessment and breach-triggered buying signals',
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
    'search_security_breaches_data',
    {
      description: [
        "Searches Intellizence's security breach dataset and returns structured, deduplicated incident records — one record per event.",
        'Each record includes company, incident type (Ransomware, Malware, Hack, Data Breach/Leak, DDOS, and more), people impacted, location, and date.',
        'Use to assess cybersecurity risk exposure, identify breach-triggered buying signals for security and compliance vendors, or monitor a customer portfolio for active incidents.',
        '',
        'Use structured filters: date range, company domains/names, industries, locations, incidentType, people impacted filters, limit.',
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
        'People impacted filter (structured):',
        '- Use peopleImpactedOp + peopleImpactedValue for single-value filters.',
        '  - Example: peopleImpactedOp=">=" and peopleImpactedValue=100000',
        '- Use peopleImpactedOp="between" + peopleImpactedMin + peopleImpactedMax for ranges.',
        '  - Example: peopleImpactedOp="between", peopleImpactedMin=100000, peopleImpactedMax=500000',
        '- Use raw numbers (e.g. 100000), not "100k".',
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
          incidentType: { type: 'array', items: { type: 'string', enum: INCIDENT_TYPE_ENUM } },
          peopleImpactedOp: { type: 'string', enum: ['>', '>=', '<', '<=', '=', '!=', 'between'] },
          peopleImpactedValue: { type: 'number' },
          peopleImpactedMin: { type: 'number' },
          peopleImpactedMax: { type: 'number' },
          limit: { type: 'integer', minimum: 1, maximum: 100 }
        },
      },
    },
    async (args) => {
      const payload = { ...(args ?? {}) };

      if (!payload.peopleImpacted && payload.peopleImpactedOp) {
        if (payload.peopleImpactedOp === 'between') {
          if (typeof payload.peopleImpactedMin === 'number' && typeof payload.peopleImpactedMax === 'number') {
            payload.peopleImpacted = `(${payload.peopleImpactedMin},${payload.peopleImpactedMax})`;
          }
        } else if (typeof payload.peopleImpactedValue === 'number') {
          payload.peopleImpacted = `${payload.peopleImpactedOp}${payload.peopleImpactedValue}`;
        }
      }

      delete payload.peopleImpactedOp;
      delete payload.peopleImpactedValue;
      delete payload.peopleImpactedMin;
      delete payload.peopleImpactedMax;

      const result = await postJson('/api/mcp/dataset/data-breach', payload);
      return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
    }
  );

  server.registerTool(
    'get_data_breach_by_id',
    {
      description: [
        'Fetch a single data breach record by id (use when the user asks for more details about a specific security incident returned by search_security_breaches_data).',
        'Input: id (data breach id).',
      ].join('\n'),
      inputSchema: {
        type: 'object',
        properties: {
          id: { type: 'string' },
        },
        required: ['id'],
      },
    },
    async (args) => {
      try {
        const id = args && typeof args.id === 'string' ? args.id.trim() : '';
        if (!id) {
          const payload = {
            ok: false,
            error: { type: 'invalid_params', message: 'id is required' },
          };
          return {
            ...payload,
            content: [{ type: 'text', text: JSON.stringify(payload) }],
          };
        }

        const result = await getJson(`/api/mcp/dataset/data-breach/${encodeURIComponent(id)}`);
        const payload = result && typeof result === 'object' ? result : { ok: true, result };
        return {
          ...payload,
          content: [{ type: 'text', text: JSON.stringify(payload) }],
        };
      } catch (err) {
        const msg = err && typeof err.message === 'string' ? err.message : String(err);
        const payload = {
          ok: false,
          error: {
            type: 'exception',
            message: msg,
          },
        };
        return {
          ...payload,
          content: [{ type: 'text', text: JSON.stringify(payload) }],
        };
      }
    }
  );
}

export { registerDataBreach };
