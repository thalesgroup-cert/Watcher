#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Integration bridge between Baltimore Port Intelligence and AIS_Tracker.

This module provides:
1. Vessel enrichment with commodity data
2. Alert generation based on vessel + market correlation
3. API endpoints for AIS_Tracker to call
"""

import json
import requests
from typing import Dict, List, Optional
from datetime import datetime
from commodities import (
    BaltimorePortCommodities,
    correlate_vessel_with_commodities,
    VESSEL_COMMODITY_MAP,
    TRADING_PARTNERS
)

# Baltimore port boundaries (approximate)
BALTIMORE_PORT_BOUNDS = {
    "north": 39.35,
    "south": 39.15,
    "east": -76.45,
    "west": -76.70
}

# Chesapeake Bay approach
CHESAPEAKE_APPROACH_BOUNDS = {
    "north": 39.35,
    "south": 36.90,
    "east": -75.90,
    "west": -76.70
}

# Key shipping lanes and chokepoints
CHOKEPOINTS = {
    "baltimore_channel": {
        "name": "Baltimore Ship Channel",
        "coords": [[39.27, -76.58], [39.15, -76.52]],
        "depth": "50ft",
        "critical": True
    },
    "key_bridge": {
        "name": "Francis Scott Key Bridge (Rebuilt)",
        "coords": [39.2167, -76.5286],
        "clearance": "185ft",
        "critical": True
    },
    "chesapeake_bay_bridge": {
        "name": "Chesapeake Bay Bridge",
        "coords": [38.9933, -76.3808],
        "clearance": "186ft",
        "critical": True
    },
    "cape_henry": {
        "name": "Cape Henry (Bay Entrance)",
        "coords": [36.9300, -76.0080],
        "critical": True
    }
}


class BaltimoreAISIntegration:
    """
    Integrates Baltimore commodity intelligence with AIS vessel tracking.
    """

    def __init__(self, ais_tracker_url: str = "http://localhost:8080"):
        self.ais_tracker_url = ais_tracker_url
        self.commodities = BaltimorePortCommodities()
        self._commodity_cache = None
        self._cache_time = None

    def _get_cached_commodities(self) -> Dict:
        """Get commodity data with 5-minute cache."""
        now = datetime.now()
        if self._commodity_cache is None or self._cache_time is None:
            self._commodity_cache = self.commodities.get_all_commodities()
            self._cache_time = now
        elif (now - self._cache_time).seconds > 300:  # 5 minute cache
            self._commodity_cache = self.commodities.get_all_commodities()
            self._cache_time = now
        return self._commodity_cache

    def is_in_baltimore_area(self, lat: float, lon: float) -> bool:
        """Check if coordinates are in Baltimore port area."""
        return (
            BALTIMORE_PORT_BOUNDS["south"] <= lat <= BALTIMORE_PORT_BOUNDS["north"] and
            BALTIMORE_PORT_BOUNDS["west"] <= lon <= BALTIMORE_PORT_BOUNDS["east"]
        )

    def is_approaching_baltimore(self, lat: float, lon: float) -> bool:
        """Check if vessel is in Chesapeake Bay approach to Baltimore."""
        return (
            CHESAPEAKE_APPROACH_BOUNDS["south"] <= lat <= CHESAPEAKE_APPROACH_BOUNDS["north"] and
            CHESAPEAKE_APPROACH_BOUNDS["west"] <= lon <= CHESAPEAKE_APPROACH_BOUNDS["east"]
        )

    def classify_vessel_type(self, ship_type: int) -> str:
        """
        Convert AIS ship type code to commodity-relevant category.

        AIS Ship Type Codes:
        - 70-79: Cargo
        - 80-89: Tanker
        - 60-69: Passenger
        - 30-39: Fishing
        """
        if 70 <= ship_type <= 79:
            # Cargo - could be bulk, container, or general
            if ship_type == 70:
                return "cargo"
            elif ship_type == 71:
                return "bulk_carrier"  # Hazardous A
            elif ship_type == 72:
                return "bulk_carrier"  # Hazardous B
            elif ship_type == 73:
                return "container"     # Hazardous C
            elif ship_type == 74:
                return "container"     # Hazardous D
            else:
                return "cargo"
        elif 80 <= ship_type <= 89:
            if ship_type == 84:
                return "lng_carrier"
            return "tanker"
        elif ship_type == 29:
            return "roro"  # Special category often used for RoRo
        else:
            return "cargo"  # Default

    def enrich_vessel(self, vessel: Dict) -> Dict:
        """
        Enrich a vessel with Baltimore-relevant commodity intelligence.

        Args:
            vessel: Dict with keys like mmsi, ship_type, lat, lon, destination, flag

        Returns:
            Enriched vessel dict with commodity correlation
        """
        enriched = vessel.copy()

        # Classify vessel type
        ship_type = vessel.get("ship_type", 0)
        vessel_category = self.classify_vessel_type(ship_type)
        enriched["vessel_category"] = vessel_category

        # Check location relevance
        lat = vessel.get("lat", vessel.get("latitude", 0))
        lon = vessel.get("lon", vessel.get("longitude", 0))

        enriched["in_baltimore_port"] = self.is_in_baltimore_area(lat, lon)
        enriched["approaching_baltimore"] = self.is_approaching_baltimore(lat, lon)

        # Get flag/origin country
        flag = vessel.get("flag", vessel.get("flag_country", None))

        # Correlate with commodities
        correlation = correlate_vessel_with_commodities(vessel_category, flag)
        enriched["commodity_correlation"] = correlation

        # Add market context
        commodities_data = self._get_cached_commodities()
        enriched["market_alerts"] = commodities_data.get("alerts", [])

        # Determine Baltimore relevance score
        relevance_score = 0

        if enriched["in_baltimore_port"]:
            relevance_score += 50
        elif enriched["approaching_baltimore"]:
            relevance_score += 30

        if correlation["risk_assessment"] == "elevated":
            relevance_score += 20
        elif correlation["risk_assessment"] == "watch":
            relevance_score += 10

        # Check if destination mentions Baltimore
        destination = vessel.get("destination", "").upper()
        if "BALTIMORE" in destination or "BALT" in destination:
            relevance_score += 40

        # Check trading partner relevance
        if flag:
            for direction in ["imports", "exports"]:
                if flag in TRADING_PARTNERS[direction]:
                    relevance_score += 15
                    enriched["trading_partner_info"] = TRADING_PARTNERS[direction][flag]

        enriched["baltimore_relevance_score"] = relevance_score

        return enriched

    def get_vessels_in_area(self) -> List[Dict]:
        """
        Fetch vessels from AIS_Tracker that are in Baltimore/Chesapeake area.
        """
        try:
            # Call AIS_Tracker API
            response = requests.get(
                f"{self.ais_tracker_url}/api/area/vessels",
                params={
                    "min_lat": CHESAPEAKE_APPROACH_BOUNDS["south"],
                    "max_lat": CHESAPEAKE_APPROACH_BOUNDS["north"],
                    "min_lon": CHESAPEAKE_APPROACH_BOUNDS["west"],
                    "max_lon": CHESAPEAKE_APPROACH_BOUNDS["east"]
                },
                timeout=10
            )

            if response.status_code != 200:
                return []

            vessels = response.json().get("vessels", [])

            # Enrich each vessel
            return [self.enrich_vessel(v) for v in vessels]

        except Exception as e:
            print(f"Error fetching vessels: {e}")
            return []

    def generate_intel_report(self, vessels: List[Dict] = None) -> Dict:
        """
        Generate a comprehensive intelligence report for Baltimore port area.
        """
        if vessels is None:
            vessels = self.get_vessels_in_area()

        commodities_data = self._get_cached_commodities()

        # Categorize vessels
        in_port = [v for v in vessels if v.get("in_baltimore_port")]
        approaching = [v for v in vessels if v.get("approaching_baltimore") and not v.get("in_baltimore_port")]
        high_relevance = [v for v in vessels if v.get("baltimore_relevance_score", 0) >= 50]

        # Vessel type breakdown
        vessel_types = {}
        for v in vessels:
            vtype = v.get("vessel_category", "unknown")
            vessel_types[vtype] = vessel_types.get(vtype, 0) + 1

        # Country breakdown
        countries = {}
        for v in vessels:
            flag = v.get("flag", "Unknown")
            countries[flag] = countries.get(flag, 0) + 1

        report = {
            "generated_at": datetime.now().isoformat(),
            "port": "Baltimore",
            "summary": {
                "total_vessels": len(vessels),
                "in_port": len(in_port),
                "approaching": len(approaching),
                "high_relevance": len(high_relevance)
            },
            "vessel_types": vessel_types,
            "flag_breakdown": countries,
            "commodity_status": commodities_data["commodities"],
            "market_alerts": commodities_data["alerts"],
            "chokepoints": CHOKEPOINTS,
            "vessels": vessels[:50]  # Limit to 50 for report size
        }

        return report


# Flask API for standalone use or integration
def create_api():
    """Create Flask API for Baltimore Intel service."""
    from flask import Flask, jsonify, request

    app = Flask(__name__)
    integration = BaltimoreAISIntegration()

    @app.route("/api/commodities", methods=["GET"])
    def get_commodities():
        """Get current commodity data."""
        data = integration.commodities.get_all_commodities()
        return jsonify(data)

    @app.route("/api/enrich-vessel", methods=["POST"])
    def enrich_vessel():
        """Enrich a vessel with commodity intelligence."""
        vessel = request.json
        enriched = integration.enrich_vessel(vessel)
        return jsonify(enriched)

    @app.route("/api/correlate", methods=["GET"])
    def correlate():
        """Correlate vessel type with commodities."""
        vessel_type = request.args.get("vessel_type", "cargo")
        origin = request.args.get("origin")
        result = correlate_vessel_with_commodities(vessel_type, origin)
        return jsonify(result)

    @app.route("/api/report", methods=["GET"])
    def intel_report():
        """Generate intelligence report."""
        report = integration.generate_intel_report()
        return jsonify(report)

    @app.route("/api/chokepoints", methods=["GET"])
    def chokepoints():
        """Get Baltimore area chokepoints."""
        return jsonify(CHOKEPOINTS)

    @app.route("/health", methods=["GET"])
    def health():
        """Health check endpoint."""
        return jsonify({"status": "healthy", "port": "Baltimore"})

    return app


if __name__ == "__main__":
    # Run as standalone API
    app = create_api()
    print("Starting Baltimore Port Intelligence API on port 8082...")
    app.run(host="0.0.0.0", port=8082, debug=True)
