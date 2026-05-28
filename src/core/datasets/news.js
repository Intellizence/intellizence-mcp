import { postJson, getJson } from '../api.js';

function registerNews(server) {
  server.registerResource('news.about', 'news://about', { mimeType: 'text/plain' }, async () => {
    return {
      contents: [
        {
          uri: 'news://about',
          text: [
            'News Dataset MCP Server',
            '',
            'Overview:',
            'This server provides AI-native access to Intellizence\'s real-time news feed of narrative company news articles.',
            '',
            'Coverage:',
            '- Coverage start date: January 01, 2020',
            '- Only records with announcement dates >= 2020-01-01 are supported',
            '- Historical access may vary based on subscription plan',
            '- Global news coverage - English language',
            '- Focus on corporate events, growth, sales, risk and distress signal themes (e.g., M&A, fundraising, layoffs, leadership changes, product launches, legal/regulatory, and security breaches)',
            '',
            'Data Normalization:',
            '- Articles are narrative/unstructured; not deduplicated event records',
            '- Publish date is standardized to YYYY-MM-DD format',
            '- Each article is tagged with company domains, company names, and signal themes by Intellizence',
            '- Related or clustered articles are grouped under similarNews within the primary record',
            '',
            'Capabilities:',
            '- Use for company intelligence, sales intelligence, risk intelligence, competitive intelligence, customer intelligence, and market intelligence.',
            '- Supports account briefings, pre-call research, executive reports, and real-time event notifications with narrative context across all signal themes.',
            '- For precise event-level data (deduplicated records), prefer the structured signal tools (M&A, Funding, Layoffs, Executive Changes, Business Expansion, Data Breach) when available. Use news for narrative context or when no structured tool applies.',
            '',
            'Themes Reference:',
            '- Mergers & Acquisitions: acquisition, merger, divestment, spin-off, buyout, going private',
            '- Leadership & Mgmt Changes: executive appointment, resignation, retirement, restructuring, demise',
            '- Fundraising & Investment: funding rounds, venture capital, investment',
            '- Initial Public Offering (IPO): IPO, public listing',
            '- Business Expansion: office opening, hiring, relocation, branch/store opening',
            '- Financial Results & Outlook: earnings, revenue, business projections, executive statements',
            '- Product & Service Launch: new product, new service, product shutdown',
            '- Innovation & Initiatives: new programs, experiments, trials, pilots',
            '- Partnerships & Joint Ventures: alliance, partnership, joint venture',
            '- Layoffs & Cost-Cutting: downsizing, layoff, cost reduction',
            '- Bankruptcy & Business Shutdown: bankruptcy, business closure, store closing',
            '- Awards & Recognition: awards, certifications',
            '- Advertising & Marketing: campaigns, branding, promotions, rebranding',
            '- Customer Acquisition & Sourcing: customer growth, procurement, sourcing',
            '- Customer Churn: customer loss, growth decline',
            '- Pricing: price changes, pricing strategy',
            '- Legal: lawsuit, judgment, settlement, patent dispute',
            '- Regulatory: approval, investigation, legislation, ban, enforcement, settlement',
            '- Research & Publications: research, publications, studies',
            '- Scandals, Rumours & Activism: scandals, fraud, rumours, shareholder activism',
            '- Security Breaches & Outages: security breach, vulnerability, outage',
            '- Employee & Labor Dispute: employee dispute, strike',
            '- Accidents & Disasters: natural disaster, industrial accident',
            '- Recalls & Disruptions: recall, supply chain disruption, production cut',
            '',
            'Notes:',
            '- For best matching, prefer company domain over company name when available',
            "- 'Startup' refers to a company",
            'Response Fields (per record):',
            '- Article level: publishDate, title, desc, publisher, url',
            '- Signal context: triggerNames, companyNames',
          ].join('\n'),
        },
      ],
    };
  });

  server.registerTool(
    'search_news',
    {
      description: [
        "Searches Intellizence's real-time news feed and returns narrative news articles about companies across 30 growth, sales, risk signal themes including M&A, Fundraising, Layoffs, Leadership Changes, Product Launches, Bankruptcy, Legal, Regulatory, and Security Breaches.",
        'IMPORTANT: On error, show the exact error message and stop (no retries / no parameter changes / no alternative tools) unless the user explicitly approves.',
        "IMPORTANT: Do NOT pass 'companies' filter unless the user explicitly names specific companies. For general industry queries, rely on 'themes', 'industries', and 'locations' filters only.",
        'If hasMore=true, ask the user: "There are more results available. Would you like to see more, or narrow down by date range, company, or topic?"',
        'Pagination: if hasMore=true and user wants more results, call search_news again passing the nextCursor value as the "nextCursor" parameter (not "cursor"). Keep all other filters identical.',
        'Filters: companies, themes, industries, stockMarkets, companyTypes, locations, startDate, endDate, limit.',
        "companyTypes: choose from 'Public' or 'Private' when applicable.",
        'Locations: expand abbreviations, but keep the granularity the user asked for. If user provides city+state+country, send as "city, state/province, country". If ambiguous, ask the user to clarify.',
        'Dates: if user says recent/latest → last 30 days; this week → 7 days; today/pre-call → 7 days. If no dates mentioned, omit startDate/endDate.',
        'Limit: default 25. Highlights 5–10. Comprehensive 50–100.',
      ].join('\n'),
      inputSchema: {
        type: 'object',
        properties: {
          companies: { type: 'array', items: { type: 'string' } },
          nextCursor: { type: 'string' },
          industries: { type: 'array', items: { type: 'string' } },
          stockMarkets: { type: 'array', items: { type: 'string' } },
          companyTypes: { type: 'array', items: { type: 'string', enum: ['Public', 'Private'] } },
          locations: { type: 'array', items: { type: 'string' } },
          themes: {
            type: 'array',
            items: {
              type: 'string',
              enum: [
                'Mergers & Acquisitions',
                'Fundraising & Investment',
                'Initial Public Offering (IPO)',
                'Business Expansion',
                'Partnerships & Joint Ventures',
                'Product & Service Launch',
                'Innovation & Initiatives',
                'Customer Acquisition & Sourcing',
                'Awards & Recognition',
                'Leadership & Mgmt Changes',
                'Financial Results & Outlook',
                'Advertising & Marketing',
                'Pricing',
                'Research & Publications',
                'Layoffs & Cost-Cutting',
                'Bankruptcy & Business Shutdown',
                'Customer Churn',
                'Legal',
                'Regulatory',
                'Scandals, Rumours & Activism',
                'Security Breaches & Outages',
                'Employee & Labor Dispute',
                'Accidents & Disasters',
                'Recalls & Disruptions'
              ],
            },
          },
          startDate: { type: 'string' },
          endDate: { type: 'string' },
          limit: { type: 'integer', minimum: 1, maximum: 100 },
        },
      },
    },
    async (args) => {
      try {
        const result = await postJson('/api/news/search', args ?? {});

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

  server.registerTool(
    'get_news_by_id',
    {
      description: [
        'Fetch a single news record by id (use when the user asks for more details about a specific news item returned by search_news).',
        'Input: id (news id).',
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

        const result = await getJson(`/api/news/${encodeURIComponent(id)}`);
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

export { registerNews };
