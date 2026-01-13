#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Generate Baltimore Port Intelligence Dashboard for GitHub Pages
"""

import json
import os
from datetime import datetime
from commodities import BaltimorePortCommodities, TRADING_PARTNERS, VESSEL_COMMODITY_MAP

HTML_TEMPLATE = """<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Baltimore Port Intelligence</title>
    <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" />
    <style>
        * {{ margin: 0; padding: 0; box-sizing: border-box; }}

        body {{
            font-family: 'Segoe UI', system-ui, sans-serif;
            background: #0a0e17;
            color: #e0e6ed;
            min-height: 100vh;
        }}

        .header {{
            background: linear-gradient(135deg, #1a1f2e 0%, #0d1117 100%);
            padding: 20px 30px;
            border-bottom: 1px solid #30363d;
            display: flex;
            justify-content: space-between;
            align-items: center;
        }}

        .header h1 {{
            font-size: 1.5rem;
            font-weight: 600;
            color: #58a6ff;
        }}

        .header .status {{
            display: flex;
            gap: 20px;
            font-size: 0.9rem;
        }}

        .status-item {{
            display: flex;
            align-items: center;
            gap: 8px;
        }}

        .status-dot {{
            width: 8px;
            height: 8px;
            border-radius: 50%;
            background: #3fb950;
            animation: pulse 2s infinite;
        }}

        @keyframes pulse {{
            0%, 100% {{ opacity: 1; }}
            50% {{ opacity: 0.5; }}
        }}

        .container {{
            display: grid;
            grid-template-columns: 1fr 400px;
            height: calc(100vh - 80px);
        }}

        #map {{
            height: 100%;
            background: #0d1117;
        }}

        .sidebar {{
            background: #161b22;
            border-left: 1px solid #30363d;
            overflow-y: auto;
            padding: 20px;
        }}

        .section {{
            margin-bottom: 24px;
        }}

        .section-title {{
            font-size: 0.85rem;
            font-weight: 600;
            color: #8b949e;
            text-transform: uppercase;
            letter-spacing: 0.5px;
            margin-bottom: 12px;
            padding-bottom: 8px;
            border-bottom: 1px solid #30363d;
        }}

        .commodity-card {{
            background: #21262d;
            border-radius: 8px;
            padding: 12px 16px;
            margin-bottom: 10px;
            border: 1px solid #30363d;
        }}

        .commodity-header {{
            display: flex;
            justify-content: space-between;
            align-items: center;
            margin-bottom: 4px;
        }}

        .commodity-name {{
            font-weight: 500;
            font-size: 0.95rem;
        }}

        .commodity-price {{
            font-family: 'SF Mono', monospace;
            font-size: 1.1rem;
            font-weight: 600;
        }}

        .commodity-change {{
            font-size: 0.85rem;
            padding: 2px 8px;
            border-radius: 4px;
            font-weight: 500;
        }}

        .positive {{
            background: rgba(63, 185, 80, 0.2);
            color: #3fb950;
        }}

        .negative {{
            background: rgba(248, 81, 73, 0.2);
            color: #f85149;
        }}

        .commodity-relevance {{
            font-size: 0.8rem;
            color: #8b949e;
            margin-top: 6px;
        }}

        .alert-card {{
            background: #2d1b1b;
            border: 1px solid #f85149;
            border-radius: 8px;
            padding: 12px 16px;
            margin-bottom: 10px;
        }}

        .alert-card.medium {{
            background: #2d2a1b;
            border-color: #d29922;
        }}

        .alert-message {{
            font-weight: 500;
            margin-bottom: 4px;
        }}

        .alert-impact {{
            font-size: 0.8rem;
            color: #8b949e;
        }}

        .partner-card {{
            display: flex;
            justify-content: space-between;
            padding: 8px 12px;
            background: #21262d;
            border-radius: 6px;
            margin-bottom: 6px;
            font-size: 0.9rem;
        }}

        .partner-country {{
            font-weight: 500;
        }}

        .partner-share {{
            color: #58a6ff;
        }}

        .footer {{
            position: fixed;
            bottom: 0;
            left: 0;
            right: 0;
            background: #161b22;
            border-top: 1px solid #30363d;
            padding: 10px 30px;
            display: flex;
            justify-content: space-between;
            font-size: 0.85rem;
            color: #8b949e;
        }}

        .vessel-types {{
            display: flex;
            flex-wrap: wrap;
            gap: 8px;
        }}

        .vessel-badge {{
            background: #21262d;
            padding: 4px 10px;
            border-radius: 12px;
            font-size: 0.8rem;
            border: 1px solid #30363d;
        }}

        @media (max-width: 900px) {{
            .container {{
                grid-template-columns: 1fr;
            }}
            .sidebar {{
                border-left: none;
                border-top: 1px solid #30363d;
            }}
        }}
    </style>
</head>
<body>
    <header class="header">
        <h1>⚓ Baltimore Port Intelligence</h1>
        <div class="status">
            <div class="status-item">
                <span class="status-dot"></span>
                <span>Live</span>
            </div>
            <div class="status-item">
                <span>Updated: {timestamp}</span>
            </div>
        </div>
    </header>

    <div class="container">
        <div id="map"></div>

        <div class="sidebar">
            {alerts_section}

            <div class="section">
                <div class="section-title">📤 Export Commodities</div>
                {exports_html}
            </div>

            <div class="section">
                <div class="section-title">📥 Import Indicators</div>
                {imports_html}
            </div>

            <div class="section">
                <div class="section-title">🚢 Shipping Indices</div>
                {shipping_html}
            </div>

            <div class="section">
                <div class="section-title">🌍 Top Trading Partners</div>
                <div style="margin-bottom: 12px;">
                    <div style="font-size: 0.8rem; color: #8b949e; margin-bottom: 8px;">Exports To:</div>
                    {export_partners_html}
                </div>
                <div>
                    <div style="font-size: 0.8rem; color: #8b949e; margin-bottom: 8px;">Imports From:</div>
                    {import_partners_html}
                </div>
            </div>

            <div class="section">
                <div class="section-title">🚢 Vessel Type Correlations</div>
                <div class="vessel-types">
                    {vessel_types_html}
                </div>
            </div>
        </div>
    </div>

    <footer class="footer">
        <span>Data sources: Yahoo Finance, FRED</span>
        <span>Port of Baltimore Intelligence Dashboard</span>
    </footer>

    <script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
    <script>
        // Initialize map centered on Baltimore
        const map = L.map('map').setView([39.2904, -76.6122], 11);

        // Dark tile layer
        L.tileLayer('https://{{s}}.basemaps.cartocdn.com/dark_all/{{z}}/{{x}}/{{y}}{{r}}.png', {{
            attribution: '&copy; OpenStreetMap contributors &copy; CARTO',
            subdomains: 'abcd',
            maxZoom: 19
        }}).addTo(map);

        // Port of Baltimore marker
        const portIcon = L.divIcon({{
            className: 'port-marker',
            html: '<div style="background: #58a6ff; width: 20px; height: 20px; border-radius: 50%; border: 3px solid #fff; box-shadow: 0 0 10px rgba(88, 166, 255, 0.5);"></div>',
            iconSize: [20, 20]
        }});

        L.marker([39.2667, -76.5783], {{icon: portIcon}})
            .addTo(map)
            .bindPopup('<b>Port of Baltimore</b><br>Seagirt Marine Terminal');

        // Key terminals
        const terminals = [
            {{name: "Seagirt Marine Terminal", lat: 39.2667, lon: -76.5783, type: "Container"}},
            {{name: "Dundalk Marine Terminal", lat: 39.2522, lon: -76.5269, type: "RoRo/Auto"}},
            {{name: "Fairfield Auto Terminal", lat: 39.2181, lon: -76.5689, type: "Auto"}},
            {{name: "South Locust Point", lat: 39.2614, lon: -76.5908, type: "Bulk"}},
            {{name: "CNX Marine Terminal", lat: 39.2089, lon: -76.5292, type: "Coal"}},
        ];

        terminals.forEach(t => {{
            L.circleMarker([t.lat, t.lon], {{
                radius: 8,
                fillColor: '#3fb950',
                color: '#fff',
                weight: 2,
                opacity: 1,
                fillOpacity: 0.8
            }}).addTo(map).bindPopup(`<b>${{t.name}}</b><br>Type: ${{t.type}}`);
        }});

        // Chesapeake Bay shipping channel
        const channelCoords = [
            [36.9, -76.0],
            [37.5, -76.2],
            [38.5, -76.4],
            [39.0, -76.5],
            [39.27, -76.58]
        ];

        L.polyline(channelCoords, {{
            color: '#58a6ff',
            weight: 2,
            opacity: 0.5,
            dashArray: '10, 10'
        }}).addTo(map);
    </script>
</body>
</html>
"""


def generate_commodity_card(commodity: dict) -> str:
    """Generate HTML for a commodity card."""
    change_class = "positive" if commodity["change_pct"] >= 0 else "negative"
    arrow = "▲" if commodity["change_pct"] >= 0 else "▼"

    return f"""
    <div class="commodity-card">
        <div class="commodity-header">
            <span class="commodity-name">{commodity['name']}</span>
            <span class="commodity-price">{commodity['price']:.2f}</span>
        </div>
        <div class="commodity-header">
            <span class="commodity-relevance">{commodity.get('currency', 'USD')}</span>
            <span class="commodity-change {change_class}">{arrow} {commodity['change_pct']:+.2f}%</span>
        </div>
        <div class="commodity-relevance">{commodity['relevance']}</div>
    </div>
    """


def generate_alert_card(alert: dict) -> str:
    """Generate HTML for an alert card."""
    severity_class = alert.get("severity", "medium")
    return f"""
    <div class="alert-card {severity_class}">
        <div class="alert-message">⚠️ {alert['message']}</div>
        <div class="alert-impact">Impact: {alert['relevance']}</div>
    </div>
    """


def generate_partner_card(country: str, data: dict) -> str:
    """Generate HTML for a trading partner card."""
    value = data.get('value', data.get('share', ''))
    return f"""
    <div class="partner-card">
        <span class="partner-country">{country}</span>
        <span class="partner-share">{value}</span>
    </div>
    """


def generate_dashboard():
    """Generate the full dashboard HTML."""
    print("Fetching commodity data...")
    tracker = BaltimorePortCommodities()
    data = tracker.get_all_commodities()

    # Generate exports HTML
    exports_html = ""
    for key in data["categories"]["exports"]:
        if key in data["commodities"]:
            exports_html += generate_commodity_card(data["commodities"][key])

    # Generate imports HTML
    imports_html = ""
    for key in data["categories"]["imports"]:
        if key in data["commodities"]:
            imports_html += generate_commodity_card(data["commodities"][key])

    # Generate shipping HTML
    shipping_html = ""
    for key in data["categories"]["shipping"]:
        if key in data["commodities"]:
            shipping_html += generate_commodity_card(data["commodities"][key])

    # Generate alerts section
    alerts_section = ""
    if data["alerts"]:
        alerts_section = '<div class="section"><div class="section-title">⚠️ Market Alerts</div>'
        for alert in data["alerts"]:
            alerts_section += generate_alert_card(alert)
        alerts_section += '</div>'

    # Generate trading partners HTML
    export_partners_html = ""
    for country, info in TRADING_PARTNERS["exports"].items():
        export_partners_html += generate_partner_card(country, info)

    import_partners_html = ""
    for country, info in TRADING_PARTNERS["imports"].items():
        import_partners_html += generate_partner_card(country, info)

    # Generate vessel types HTML
    vessel_types_html = ""
    for vessel_type in VESSEL_COMMODITY_MAP.keys():
        display_name = vessel_type.replace("_", " ").title()
        vessel_types_html += f'<span class="vessel-badge">{display_name}</span>'

    # Format timestamp
    timestamp = datetime.now().strftime("%Y-%m-%d %H:%M UTC")

    # Generate final HTML
    html = HTML_TEMPLATE.format(
        timestamp=timestamp,
        alerts_section=alerts_section,
        exports_html=exports_html or '<div class="commodity-card">No data available</div>',
        imports_html=imports_html or '<div class="commodity-card">No data available</div>',
        shipping_html=shipping_html or '<div class="commodity-card">No data available</div>',
        export_partners_html=export_partners_html,
        import_partners_html=import_partners_html,
        vessel_types_html=vessel_types_html
    )

    # Write files
    os.makedirs("docs", exist_ok=True)

    with open("docs/index.html", "w") as f:
        f.write(html)
    print("Generated docs/index.html")

    # Also save JSON data
    with open("docs/data.json", "w") as f:
        json.dump(data, f, indent=2)
    print("Generated docs/data.json")

    return data


if __name__ == "__main__":
    generate_dashboard()
    print("Dashboard generation complete!")
