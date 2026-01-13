# -*- coding: utf-8 -*-
"""
Baltimore Port Commodities Tracker

Tracks commodity prices and indicators relevant to Port of Baltimore operations:
- Automobiles (imports from Germany, Japan, Mexico)
- Coal (exports to Asia - India, China, Japan)
- LNG (exports)
- Soybeans/Agriculture (exports)
- Shipping indices
"""

import requests
import json
from datetime import datetime, timedelta
from typing import Dict, List, Optional
import os

# Free API endpoints
YAHOO_FINANCE_API = "https://query1.finance.yahoo.com/v8/finance/chart/{symbol}"
FRED_API = "https://api.stlouisfed.org/fred/series/observations"

# Baltimore-relevant commodity symbols
COMMODITIES = {
    # Coal & Energy
    "coal": {
        "symbol": "MTF=F",  # Coal futures
        "name": "Coal Futures",
        "relevance": "Baltimore #1 export - $2.86B to Asia",
        "category": "exports"
    },
    "natural_gas": {
        "symbol": "NG=F",  # Henry Hub Natural Gas
        "name": "Natural Gas (Henry Hub)",
        "relevance": "LNG exports - $1.88B",
        "category": "exports"
    },

    # Agriculture
    "soybeans": {
        "symbol": "ZS=F",  # Soybean futures
        "name": "Soybean Futures",
        "relevance": "Agricultural exports - 415K MT annually",
        "category": "exports"
    },
    "corn": {
        "symbol": "ZC=F",  # Corn futures
        "name": "Corn Futures",
        "relevance": "Agricultural exports",
        "category": "exports"
    },

    # Auto Industry (imports)
    "german_auto": {
        "symbol": "BMW.DE",  # BMW as proxy for German auto
        "name": "BMW (German Auto Proxy)",
        "relevance": "German auto imports - $8.8B",
        "category": "imports"
    },
    "japanese_auto": {
        "symbol": "7203.T",  # Toyota
        "name": "Toyota (Japanese Auto Proxy)",
        "relevance": "Japanese auto imports - $5.68B",
        "category": "imports"
    },
    "us_auto_sales": {
        "symbol": "GM",  # GM as US market proxy
        "name": "GM (US Auto Market Proxy)",
        "relevance": "US auto demand indicator",
        "category": "imports"
    },

    # Shipping Indices
    "baltic_dry": {
        "symbol": "BDRY",  # Baltic Dry Index ETF
        "name": "Baltic Dry Index ETF",
        "relevance": "Dry bulk shipping rates (coal, grain)",
        "category": "shipping"
    },

    # Crude Oil (affects shipping costs)
    "crude_oil": {
        "symbol": "CL=F",  # WTI Crude
        "name": "WTI Crude Oil",
        "relevance": "Shipping fuel costs",
        "category": "shipping"
    },
}

# FRED indicators (requires free API key from https://fred.stlouisfed.org/)
FRED_INDICATORS = {
    "us_auto_sales": {
        "series_id": "TOTALSA",  # Total Vehicle Sales
        "name": "US Total Vehicle Sales",
        "relevance": "Demand for imported automobiles"
    },
    "industrial_production": {
        "series_id": "INDPRO",
        "name": "Industrial Production Index",
        "relevance": "Machinery/equipment demand"
    },
}


class BaltimorePortCommodities:
    """Track commodities relevant to Port of Baltimore."""

    def __init__(self, fred_api_key: Optional[str] = None):
        self.fred_api_key = fred_api_key or os.getenv("FRED_API_KEY")
        self.session = requests.Session()
        self.session.headers.update({
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"
        })

    def fetch_yahoo_quote(self, symbol: str) -> Optional[Dict]:
        """Fetch current price from Yahoo Finance."""
        try:
            url = YAHOO_FINANCE_API.format(symbol=symbol)
            params = {"interval": "1d", "range": "5d"}
            response = self.session.get(url, params=params, timeout=10)

            if response.status_code != 200:
                return None

            data = response.json()
            result = data.get("chart", {}).get("result", [])

            if not result:
                return None

            meta = result[0].get("meta", {})
            indicators = result[0].get("indicators", {}).get("quote", [{}])[0]

            closes = indicators.get("close", [])
            current_price = meta.get("regularMarketPrice", closes[-1] if closes else None)
            prev_close = meta.get("previousClose", closes[-2] if len(closes) > 1 else None)

            if current_price and prev_close:
                change = current_price - prev_close
                change_pct = (change / prev_close) * 100
            else:
                change = 0
                change_pct = 0

            return {
                "symbol": symbol,
                "price": current_price,
                "prev_close": prev_close,
                "change": round(change, 2),
                "change_pct": round(change_pct, 2),
                "currency": meta.get("currency", "USD"),
                "exchange": meta.get("exchangeName", "Unknown"),
                "timestamp": datetime.now().isoformat()
            }

        except Exception as e:
            print(f"Error fetching {symbol}: {e}")
            return None

    def fetch_fred_data(self, series_id: str, limit: int = 30) -> Optional[Dict]:
        """Fetch data from FRED API."""
        if not self.fred_api_key:
            return None

        try:
            params = {
                "series_id": series_id,
                "api_key": self.fred_api_key,
                "file_type": "json",
                "sort_order": "desc",
                "limit": limit
            }
            response = self.session.get(FRED_API, params=params, timeout=10)

            if response.status_code != 200:
                return None

            data = response.json()
            observations = data.get("observations", [])

            if not observations:
                return None

            latest = observations[0]
            prev = observations[1] if len(observations) > 1 else None

            current_value = float(latest["value"]) if latest["value"] != "." else None
            prev_value = float(prev["value"]) if prev and prev["value"] != "." else None

            if current_value and prev_value:
                change = current_value - prev_value
                change_pct = (change / prev_value) * 100
            else:
                change = 0
                change_pct = 0

            return {
                "series_id": series_id,
                "value": current_value,
                "prev_value": prev_value,
                "change": round(change, 2),
                "change_pct": round(change_pct, 2),
                "date": latest["date"],
                "timestamp": datetime.now().isoformat()
            }

        except Exception as e:
            print(f"Error fetching FRED {series_id}: {e}")
            return None

    def get_all_commodities(self) -> Dict:
        """Fetch all Baltimore-relevant commodity data."""
        results = {
            "timestamp": datetime.now().isoformat(),
            "port": "Baltimore",
            "commodities": {},
            "categories": {
                "exports": [],
                "imports": [],
                "shipping": []
            },
            "alerts": []
        }

        for key, config in COMMODITIES.items():
            quote = self.fetch_yahoo_quote(config["symbol"])
            if quote:
                quote["name"] = config["name"]
                quote["relevance"] = config["relevance"]
                quote["category"] = config["category"]
                results["commodities"][key] = quote
                results["categories"][config["category"]].append(key)

                # Generate alerts for significant moves
                if abs(quote["change_pct"]) >= 3.0:
                    direction = "up" if quote["change_pct"] > 0 else "down"
                    results["alerts"].append({
                        "commodity": config["name"],
                        "message": f"{config['name']} {direction} {abs(quote['change_pct']):.1f}%",
                        "relevance": config["relevance"],
                        "severity": "high" if abs(quote["change_pct"]) >= 5.0 else "medium"
                    })

        return results

    def generate_report(self) -> str:
        """Generate a human-readable report."""
        data = self.get_all_commodities()

        lines = [
            "=" * 60,
            "PORT OF BALTIMORE - COMMODITY INTELLIGENCE REPORT",
            f"Generated: {data['timestamp']}",
            "=" * 60,
            ""
        ]

        # Export commodities
        lines.append("EXPORTS (Coal, LNG, Agriculture)")
        lines.append("-" * 40)
        for key in data["categories"]["exports"]:
            if key in data["commodities"]:
                c = data["commodities"][key]
                arrow = "▲" if c["change_pct"] >= 0 else "▼"
                lines.append(f"  {c['name']}: {c['price']:.2f} {c['currency']} {arrow} {c['change_pct']:+.2f}%")
                lines.append(f"    → {c['relevance']}")

        lines.append("")

        # Import indicators
        lines.append("IMPORTS (Automobiles, Machinery)")
        lines.append("-" * 40)
        for key in data["categories"]["imports"]:
            if key in data["commodities"]:
                c = data["commodities"][key]
                arrow = "▲" if c["change_pct"] >= 0 else "▼"
                lines.append(f"  {c['name']}: {c['price']:.2f} {c['currency']} {arrow} {c['change_pct']:+.2f}%")
                lines.append(f"    → {c['relevance']}")

        lines.append("")

        # Shipping indices
        lines.append("SHIPPING & LOGISTICS")
        lines.append("-" * 40)
        for key in data["categories"]["shipping"]:
            if key in data["commodities"]:
                c = data["commodities"][key]
                arrow = "▲" if c["change_pct"] >= 0 else "▼"
                lines.append(f"  {c['name']}: {c['price']:.2f} {c['currency']} {arrow} {c['change_pct']:+.2f}%")
                lines.append(f"    → {c['relevance']}")

        lines.append("")

        # Alerts
        if data["alerts"]:
            lines.append("⚠️  ALERTS")
            lines.append("-" * 40)
            for alert in data["alerts"]:
                severity_icon = "🔴" if alert["severity"] == "high" else "🟡"
                lines.append(f"  {severity_icon} {alert['message']}")
                lines.append(f"     Impact: {alert['relevance']}")

        lines.append("")
        lines.append("=" * 60)

        return "\n".join(lines)

    def to_json(self, filepath: str = "baltimore_commodities.json"):
        """Export data to JSON file."""
        data = self.get_all_commodities()
        with open(filepath, 'w') as f:
            json.dump(data, f, indent=2)
        return filepath


# Vessel-Commodity Correlation
VESSEL_COMMODITY_MAP = {
    # Ship types → relevant commodities
    "bulk_carrier": ["coal", "soybeans", "corn"],
    "tanker": ["crude_oil", "natural_gas"],
    "container": ["german_auto", "japanese_auto"],
    "roro": ["german_auto", "japanese_auto", "us_auto_sales"],
    "cargo": ["soybeans", "corn", "coal"],
    "lng_carrier": ["natural_gas"],
}

# Trading partners relevant to Baltimore
TRADING_PARTNERS = {
    "exports": {
        "Australia": {"commodities": ["coal"], "share": "15%"},
        "India": {"commodities": ["coal"], "share": "14%"},
        "China": {"commodities": ["coal", "soybeans"], "share": "10%"},
        "Japan": {"commodities": ["coal"], "share": "8%"},
        "Netherlands": {"commodities": ["coal", "soybeans"], "share": "7%"},
    },
    "imports": {
        "Germany": {"commodities": ["german_auto"], "share": "35%", "value": "$8.8B"},
        "Japan": {"commodities": ["japanese_auto"], "share": "22%", "value": "$5.68B"},
        "Mexico": {"commodities": ["us_auto_sales"], "share": "22%", "value": "$5.5B"},
        "United Kingdom": {"commodities": ["german_auto"], "share": "20%", "value": "$5.06B"},
        "China": {"commodities": [], "share": "9%", "value": "$2.21B"},
    }
}


def correlate_vessel_with_commodities(vessel_type: str, origin_country: str = None) -> Dict:
    """
    Correlate a vessel with relevant commodity indicators.

    Args:
        vessel_type: Type of vessel (bulk_carrier, tanker, roro, etc.)
        origin_country: Country of origin/destination

    Returns:
        Dict with relevant commodities and their current status
    """
    tracker = BaltimorePortCommodities()
    all_data = tracker.get_all_commodities()

    relevant_commodities = VESSEL_COMMODITY_MAP.get(vessel_type.lower(), [])

    result = {
        "vessel_type": vessel_type,
        "origin_country": origin_country,
        "relevant_commodities": [],
        "market_signals": [],
        "risk_assessment": "normal"
    }

    risk_score = 0

    for commodity_key in relevant_commodities:
        if commodity_key in all_data["commodities"]:
            commodity = all_data["commodities"][commodity_key]
            result["relevant_commodities"].append({
                "name": commodity["name"],
                "price": commodity["price"],
                "change_pct": commodity["change_pct"],
                "relevance": commodity["relevance"]
            })

            # Assess risk based on price movements
            if abs(commodity["change_pct"]) >= 5.0:
                risk_score += 2
                result["market_signals"].append(
                    f"SIGNIFICANT: {commodity['name']} moved {commodity['change_pct']:+.1f}%"
                )
            elif abs(commodity["change_pct"]) >= 3.0:
                risk_score += 1
                result["market_signals"].append(
                    f"NOTABLE: {commodity['name']} moved {commodity['change_pct']:+.1f}%"
                )

    # Check trading partner relevance
    if origin_country:
        for direction in ["imports", "exports"]:
            if origin_country in TRADING_PARTNERS[direction]:
                partner = TRADING_PARTNERS[direction][origin_country]
                result["market_signals"].append(
                    f"Trading partner: {origin_country} ({partner['share']} of Baltimore {direction})"
                )

    # Set risk level
    if risk_score >= 3:
        result["risk_assessment"] = "elevated"
    elif risk_score >= 1:
        result["risk_assessment"] = "watch"

    return result


if __name__ == "__main__":
    tracker = BaltimorePortCommodities()
    print(tracker.generate_report())
    tracker.to_json()
