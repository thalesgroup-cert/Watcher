# Baltimore Port Intelligence

Real-time commodity tracking and market signals relevant to the Port of Baltimore.

## Live Dashboard

🌐 **[View Live Dashboard](https://arandomguyhere.github.io/baltimore_intel/)**

## What This Tracks

### Export Commodities (Baltimore's Outbound Trade)
| Commodity | Why It Matters |
|-----------|----------------|
| **Coal Futures** | Baltimore's #1 export ($2.86B) - primarily to Asia |
| **Natural Gas** | LNG exports ($1.88B) |
| **Soybeans** | Agricultural exports - 415K MT annually |
| **Corn** | Agricultural exports |

### Import Indicators (Baltimore's Inbound Trade)
| Indicator | Why It Matters |
|-----------|----------------|
| **German Auto (BMW)** | Auto imports from Germany - $8.8B |
| **Japanese Auto (Toyota)** | Auto imports from Japan - $5.68B |
| **US Auto Sales (GM)** | Domestic demand for imported vehicles |

### Shipping & Logistics
| Index | Why It Matters |
|-------|----------------|
| **Baltic Dry Index** | Dry bulk shipping rates (coal, grain) |
| **Crude Oil** | Shipping fuel costs |

## Trading Partners

### Top Export Destinations
- 🇦🇺 Australia (15%) - Coal
- 🇮🇳 India (14%) - Coal
- 🇨🇳 China (10%) - Coal, Soybeans
- 🇯🇵 Japan (8%) - Coal
- 🇳🇱 Netherlands (7%) - Coal, Soybeans

### Top Import Origins
- 🇩🇪 Germany (35%) - $8.8B - Automobiles
- 🇯🇵 Japan (22%) - $5.68B - Automobiles
- 🇲🇽 Mexico (22%) - $5.5B - Automobiles
- 🇬🇧 United Kingdom (20%) - $5.06B - Automobiles
- 🇨🇳 China (9%) - $2.21B - Various

## Vessel-Commodity Correlation

When tracking vessels with AIS, use this mapping to understand cargo relevance:

| Vessel Type | Relevant Commodities |
|-------------|---------------------|
| Bulk Carrier | Coal, Soybeans, Corn |
| Tanker | Crude Oil, Natural Gas |
| Container | German Auto, Japanese Auto |
| RoRo | German Auto, Japanese Auto, Farm Equipment |
| LNG Carrier | Natural Gas |

## Integration with AIS_Tracker

```python
from commodities import correlate_vessel_with_commodities

# When a vessel is detected
result = correlate_vessel_with_commodities(
    vessel_type="bulk_carrier",
    origin_country="Australia"
)

# Returns:
# {
#     "vessel_type": "bulk_carrier",
#     "origin_country": "Australia",
#     "relevant_commodities": [coal, soybeans, corn data...],
#     "market_signals": ["Coal up 3.2%", "Trading partner: Australia (15% of exports)"],
#     "risk_assessment": "watch"
# }
```

## Alert Thresholds

- **High Alert**: Commodity moves ≥5% in a day
- **Medium Alert**: Commodity moves ≥3% in a day

## Local Development

```bash
# Install dependencies
pip install requests

# Generate dashboard locally
python generate_dashboard.py

# View at docs/index.html
```

## GitHub Actions

The dashboard auto-updates every 6 hours via GitHub Actions.

To add FRED economic data, add your API key as a repository secret:
1. Get a free key from https://fred.stlouisfed.org/docs/api/api_key.html
2. Add `FRED_API_KEY` to repository secrets

## Data Sources

- **Yahoo Finance** - Commodity prices, stock quotes
- **FRED** - US economic indicators (optional)
- **Census Bureau** - Port trade statistics
- **Maryland Port Administration** - Port cargo data

## Related Projects

- [AIS_Tracker](https://github.com/arandomguyhere/AIS_Tracker) - Maritime vessel tracking
- [geopolitical-threat-mapper](https://github.com/arandomguyhere/geopolitical-threat-mapper) - OSINT dashboard
- [Watcher](https://github.com/thalesgroup-cert/Watcher) - Threat intelligence platform
