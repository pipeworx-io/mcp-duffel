interface McpToolDefinition {
  name: string;
  description: string;
  inputSchema: {
    type: 'object';
    properties: Record<string, unknown>;
    required?: string[];
  };
}

interface McpToolExport {
  tools: McpToolDefinition[];
  callTool: (name: string, args: Record<string, unknown>) => Promise<unknown>;
  meter?: { credits: number };
  cost?: Record<string, unknown>;
  provider?: string;
}

/**
 * Duffel MCP — live flight search + pricing via the Duffel Flights API (duffel.com)
 *
 * Tools:
 * - duffel_flight_search: search real bookable flight offers between two airports.
 *
 * Auth: Duffel access token. Pass _apiKey = your Duffel token.
 *   - Live tokens (`duffel_live_...`) hit real inventory.
 *   - Test tokens (`duffel_test_...`) return sandbox inventory — use one to try it out.
 * BYO-key only; the user's own token bears any Duffel cost.
 */


const BASE_URL = 'https://api.duffel.com';

const tools: McpToolExport['tools'] = [
  {
    name: 'duffel_flight_search',
    description:
      'Search flights (with pricing) from <origin> to <destination> on <date> — returns the 5 cheapest real, bookable offers from the Duffel Flights API, each with total price, airline, and per-segment flight numbers/times. Pass `return_date` for a round trip. This is REAL flight inventory: use a Duffel test token (duffel_test_...) for sandbox results. Example: duffel_flight_search({ origin: "JFK", destination: "LHR", departure_date: "2026-08-15", passengers: 2, cabin_class: "economy", _apiKey: "duffel_test_..." })',
    inputSchema: {
      type: 'object' as const,
      properties: {
        origin: {
          type: 'string',
          description: 'Origin airport IATA code, e.g. "JFK"',
        },
        destination: {
          type: 'string',
          description: 'Destination airport IATA code, e.g. "LHR"',
        },
        departure_date: {
          type: 'string',
          description: 'Outbound date in YYYY-MM-DD format, e.g. "2026-08-15"',
        },
        return_date: {
          type: 'string',
          description: 'Optional return date (YYYY-MM-DD). If given, searches a round trip (destination back to origin on this date).',
        },
        passengers: {
          type: 'integer',
          description: 'Number of adult passengers (default 1, max 9)',
        },
        cabin_class: {
          type: 'string',
          description: 'Optional cabin: economy, premium_economy, business, or first',
          enum: ['economy', 'premium_economy', 'business', 'first'],
        },
        _apiKey: {
          type: 'string',
          description: 'Your Duffel access token (from duffel.com). A test token "duffel_test_..." works against the sandbox.',
        },
      },
      required: ['origin', 'destination', 'departure_date', '_apiKey'],
    },
  },
];

interface DuffelError {
  title?: string;
  message?: string;
}

async function duffelPost(path: string, body: unknown, apiKey: string, tool: string): Promise<Record<string, unknown>> {
  if (!apiKey) {
    throw new Error(
      `${tool} requires a Duffel access token. Pass your token as _apiKey (get one at duffel.com — a test token "duffel_test_..." works against the sandbox). This is a BYO-key flight data source; your own Duffel account bears the cost.`,
    );
  }
  const res = await fetch(`${BASE_URL}${path}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Duffel-Version': 'v2',
      Accept: 'application/json',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });

  if (res.status === 401) {
    throw new Error('Duffel auth failed (HTTP 401) — check your Duffel token (_apiKey).');
  }

  if (!res.ok) {
    let errors: DuffelError[] | undefined;
    try {
      const parsed = (await res.json()) as { errors?: DuffelError[] };
      errors = parsed.errors;
    } catch {
      /* body not JSON */
    }
    const first = errors?.[0];
    if (first && (first.message || first.title)) {
      throw new Error(`Duffel: ${first.message ?? first.title}`);
    }
    throw new Error(`Duffel error: HTTP ${res.status}`);
  }

  const data = (await res.json()) as { data?: Record<string, unknown> };
  return data.data ?? {};
}

function str(v: unknown): string | null {
  return typeof v === 'string' ? v : null;
}

async function flightSearch(args: Record<string, unknown>, apiKey: string) {
  const origin = str(args.origin);
  const destination = str(args.destination);
  const departure_date = str(args.departure_date);

  if (!origin) throw new Error('duffel_flight_search requires an `origin` airport IATA code, e.g. "JFK".');
  if (!destination) throw new Error('duffel_flight_search requires a `destination` airport IATA code, e.g. "LHR".');
  if (!departure_date) throw new Error('duffel_flight_search requires a `departure_date` in YYYY-MM-DD format.');

  const return_date = str(args.return_date);
  const paxCount = Math.min(Math.max(Math.floor(Number(args.passengers ?? 1)) || 1, 1), 9);
  const cabin_class = str(args.cabin_class);

  const slices: Array<Record<string, string>> = [
    { origin, destination, departure_date },
  ];
  if (return_date) {
    slices.push({ origin: destination, destination: origin, departure_date: return_date });
  }

  const passengers = Array.from({ length: paxCount }, () => ({ type: 'adult' }));

  const requestData: Record<string, unknown> = { slices, passengers };
  if (cabin_class) requestData.cabin_class = cabin_class;

  const data = await duffelPost(
    '/air/offer_requests?return_offers=true',
    { data: requestData },
    apiKey,
    'duffel_flight_search',
  );

  const offers = Array.isArray(data.offers) ? (data.offers as Array<Record<string, unknown>>) : [];

  const sorted = offers
    .slice()
    .sort((a, b) => parseFloat(String(a.total_amount ?? 'Infinity')) - parseFloat(String(b.total_amount ?? 'Infinity')))
    .slice(0, 5);

  const results = sorted.map((offer) => {
    const owner = (offer.owner ?? {}) as Record<string, unknown>;
    const offerSlices = Array.isArray(offer.slices) ? (offer.slices as Array<Record<string, unknown>>) : [];

    return {
      total_amount: str(offer.total_amount),
      currency: str(offer.total_currency),
      airline: str(owner.name),
      slices: offerSlices.map((slice) => {
        const sOrigin = (slice.origin ?? {}) as Record<string, unknown>;
        const sDest = (slice.destination ?? {}) as Record<string, unknown>;
        const segments = Array.isArray(slice.segments) ? (slice.segments as Array<Record<string, unknown>>) : [];
        return {
          origin: str(sOrigin.iata_code),
          destination: str(sDest.iata_code),
          duration: str(slice.duration),
          segments: segments.map((seg) => {
            const segOrigin = (seg.origin ?? {}) as Record<string, unknown>;
            const segDest = (seg.destination ?? {}) as Record<string, unknown>;
            const carrier = (seg.marketing_carrier ?? {}) as Record<string, unknown>;
            const aircraft = (seg.aircraft ?? null) as Record<string, unknown> | null;
            return {
              from: str(segOrigin.iata_code),
              to: str(segDest.iata_code),
              departing_at: str(seg.departing_at),
              arriving_at: str(seg.arriving_at),
              carrier: str(carrier.name),
              flight_number: str(seg.marketing_carrier_flight_number),
              aircraft: aircraft ? str(aircraft.name) : null,
            };
          }),
        };
      }),
    };
  });

  return {
    origin,
    destination,
    departure_date,
    return_date: return_date ?? null,
    passengers: paxCount,
    cabin_class: cabin_class ?? null,
    total_offers: offers.length,
    offers: results,
  };
}

async function callTool(name: string, args: Record<string, unknown>): Promise<unknown> {
  const apiKey = args._apiKey as string;
  delete args._apiKey;

  switch (name) {
    case 'duffel_flight_search':
      return flightSearch(args, apiKey);
    default:
      throw new Error(`Unknown tool: ${name}`);
  }
}

export default { tools, callTool, meter: { credits: 1 } } satisfies McpToolExport;
