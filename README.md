# mcp-duffel

Duffel MCP — live flight search + pricing via the Duffel Flights API (duffel.com)

Part of [Pipeworx](https://pipeworx.io) — an MCP gateway connecting AI agents to 1394+ live data sources.

## Tools

| Tool | Description |
|------|-------------|
| `duffel_flight_search` | Search flights (with pricing) from <origin> to <destination> on <date> — returns the 5 cheapest real, bookable offers from the Duffel Flights API, each with total price, airline, and per-segment flight numbers/times. Pass `return_date` for a round trip. This is REAL flight inventory: use a Duffel test token (duffel_test_...) for sandbox results. Example: duffel_flight_search({ origin: "JFK", destination: "LHR", departure_date: "2026-08-15", passengers: 2, cabin_class: "economy", _apiKey: "duffel_test_..." }) |

## Quick Start

Add to your MCP client (Claude Desktop, Cursor, Windsurf, etc.):

```json
{
  "mcpServers": {
    "duffel": {
      "url": "https://gateway.pipeworx.io/duffel/mcp"
    }
  }
}
```

Or connect to the full Pipeworx gateway for access to all 1394+ data sources:

```json
{
  "mcpServers": {
    "pipeworx": {
      "url": "https://gateway.pipeworx.io/mcp"
    }
  }
}
```

## Using with ask_pipeworx

Instead of calling tools directly, you can ask questions in plain English:

```
ask_pipeworx({ question: "your question about Duffel data" })
```

The gateway picks the right tool and fills the arguments automatically.

## More

- [Docs and guides](https://pipeworx.io/docs)
- [pipeworx.io](https://pipeworx.io)

## License

MIT
