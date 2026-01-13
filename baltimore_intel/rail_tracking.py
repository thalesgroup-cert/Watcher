#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Rail Tracking Integration for Baltimore Port Intelligence

Integrates:
- Amtraker API for passenger rail (Amtrak)
- OpenRailwayMap for infrastructure data
- Scanner feed correlation for freight movements
"""

import requests
import json
from typing import Dict, List, Optional
from datetime import datetime
from dataclasses import dataclass

# API Endpoints
AMTRAKER_API = "https://api.amtraker.com/v3"
OPENRAILWAYMAP_API = "https://api.openrailwaymap.org"
OSM_OVERPASS_API = "https://overpass-api.de/api/interpreter"


@dataclass
class RailStation:
    """Baltimore area rail station."""
    code: str
    name: str
    lat: float
    lon: float
    type: str  # amtrak, commuter, freight_yard
    serves_port: bool = False


# Key Baltimore area rail infrastructure
BALTIMORE_RAIL_STATIONS = {
    # Amtrak/MARC stations
    "BAL": RailStation("BAL", "Baltimore Penn Station", 39.3078, -76.6155, "amtrak"),
    "BWI": RailStation("BWI", "BWI Airport Station", 39.1876, -76.6842, "amtrak"),
    "ABE": RailStation("ABE", "Aberdeen", 39.5095, -76.1641, "amtrak"),
    "WIL": RailStation("WIL", "Wilmington DE", 39.7365, -75.5515, "amtrak"),
    "NCR": RailStation("NCR", "New Carrollton", 38.9479, -76.8719, "amtrak"),

    # Key freight yards serving the port
    "BAYVIEW": RailStation("BAYVIEW", "CSX Bayview Yard", 39.2989, -76.5647, "freight_yard", True),
    "CURTIS_BAY": RailStation("CURTIS_BAY", "Curtis Bay Coal Terminal", 39.2089, -76.5789, "freight_yard", True),
    "SEAGIRT": RailStation("SEAGIRT", "Seagirt Marine Terminal Rail", 39.2667, -76.5483, "freight_yard", True),
    "DUNDALK": RailStation("DUNDALK", "Dundalk Marine Terminal Rail", 39.2522, -76.5269, "freight_yard", True),
}

# Rail lines serving Baltimore port
BALTIMORE_RAIL_LINES = {
    "csx_mainline": {
        "name": "CSX Philadelphia Subdivision",
        "operator": "CSX",
        "type": "freight/passenger",
        "key_points": ["Philadelphia", "Wilmington", "Baltimore", "Washington"],
        "serves_port": True,
        "commodities": ["intermodal", "coal", "grain", "automobiles"]
    },
    "ns_mainline": {
        "name": "Norfolk Southern Harrisburg Line",
        "operator": "Norfolk Southern",
        "type": "freight/passenger",
        "key_points": ["Harrisburg", "York", "Baltimore"],
        "serves_port": True,
        "commodities": ["intermodal", "coal", "steel", "automobiles"]
    },
    "howard_street_tunnel": {
        "name": "Howard Street Tunnel",
        "operator": "CSX",
        "type": "freight",
        "status": "renovated",  # Recently expanded for double-stack
        "clearance": "21ft",  # New clearance allows double-stack containers
        "significance": "Critical for port intermodal traffic"
    },
    "canton_railroad": {
        "name": "Canton Railroad",
        "operator": "Canton Railroad Company",
        "type": "switching",
        "serves_port": True,
        "terminals": ["Seagirt", "Dundalk", "Canton"]
    },
    "patapsco_back_river": {
        "name": "Patapsco and Back Rivers Railroad",
        "operator": "PBR",
        "type": "switching",
        "serves_port": True,
        "terminals": ["Sparrows Point", "Dundalk"]
    }
}


class RailTracker:
    """Track rail movements relevant to Baltimore port."""

    def __init__(self):
        self.session = requests.Session()
        self.session.headers.update({
            "User-Agent": "Baltimore-Port-Intel/1.0"
        })

    def get_amtrak_trains(self) -> List[Dict]:
        """
        Fetch current Amtrak trains from Amtraker API.
        Focus on Northeast Corridor trains passing through Baltimore.
        """
        try:
            response = self.session.get(
                f"{AMTRAKER_API}/trains",
                timeout=10
            )
            if response.status_code != 200:
                return []

            all_trains = response.json()

            # Filter for trains that stop at Baltimore area stations
            baltimore_stations = {"BAL", "BWI", "ABE", "NCR", "WIL"}
            relevant_trains = []

            for train_num, train_data in all_trains.items():
                if isinstance(train_data, list):
                    for train in train_data:
                        stations = train.get("stations", [])
                        station_codes = {s.get("code") for s in stations if s.get("code")}
                        if station_codes & baltimore_stations:
                            relevant_trains.append({
                                "train_number": train_num,
                                "route_name": train.get("routeName", ""),
                                "origin": train.get("origName", ""),
                                "destination": train.get("destName", ""),
                                "current_status": train.get("trainState", ""),
                                "latitude": train.get("lat"),
                                "longitude": train.get("lon"),
                                "speed": train.get("velocity"),
                                "heading": train.get("heading"),
                                "next_station": self._get_next_station(stations),
                                "delay_minutes": self._calculate_delay(stations),
                                "updated": train.get("lastValTS")
                            })

            return relevant_trains

        except Exception as e:
            print(f"Error fetching Amtrak data: {e}")
            return []

    def _get_next_station(self, stations: List[Dict]) -> Optional[str]:
        """Get the next upcoming station."""
        for station in stations:
            status = station.get("status", "")
            if status in ["Enroute", "Predeparture"]:
                return station.get("name", station.get("code"))
        return None

    def _calculate_delay(self, stations: List[Dict]) -> int:
        """Calculate total delay in minutes."""
        for station in stations:
            if station.get("status") == "Enroute":
                arr_cmnt = station.get("arrCmnt", "")
                if "Late" in arr_cmnt:
                    # Parse delay from comment like "12 Minutes Late"
                    try:
                        parts = arr_cmnt.split()
                        return int(parts[0])
                    except (IndexError, ValueError):
                        pass
        return 0

    def get_station_arrivals(self, station_code: str = "BAL") -> List[Dict]:
        """Get upcoming arrivals at a specific station."""
        try:
            response = self.session.get(
                f"{AMTRAKER_API}/stations/{station_code}",
                timeout=10
            )
            if response.status_code != 200:
                return []

            data = response.json()
            arrivals = []

            for train in data:
                arrivals.append({
                    "train_number": train.get("trainNum"),
                    "route": train.get("routeName"),
                    "origin": train.get("origName"),
                    "destination": train.get("destName"),
                    "scheduled_arrival": train.get("schArr"),
                    "estimated_arrival": train.get("arr"),
                    "status": train.get("arrCmnt"),
                    "track": train.get("track")
                })

            return arrivals

        except Exception as e:
            print(f"Error fetching station data: {e}")
            return []

    def get_rail_infrastructure(self, bbox: Dict = None) -> Dict:
        """
        Fetch rail infrastructure from OpenStreetMap/OpenRailwayMap.
        """
        if bbox is None:
            # Default to Baltimore port area
            bbox = {
                "south": 39.15,
                "north": 39.35,
                "west": -76.70,
                "east": -76.45
            }

        # Overpass query for rail infrastructure
        query = f"""
        [out:json][timeout:30];
        (
          way["railway"="rail"]({bbox['south']},{bbox['west']},{bbox['north']},{bbox['east']});
          node["railway"="station"]({bbox['south']},{bbox['west']},{bbox['north']},{bbox['east']});
          node["railway"="yard"]({bbox['south']},{bbox['west']},{bbox['north']},{bbox['east']});
        );
        out body;
        >;
        out skel qt;
        """

        try:
            response = self.session.post(
                OSM_OVERPASS_API,
                data={"data": query},
                timeout=30
            )
            if response.status_code != 200:
                return {"error": "Failed to fetch infrastructure data"}

            data = response.json()

            # Parse elements
            stations = []
            yards = []
            tracks = []

            for element in data.get("elements", []):
                tags = element.get("tags", {})

                if element["type"] == "node":
                    if tags.get("railway") == "station":
                        stations.append({
                            "name": tags.get("name", "Unknown"),
                            "lat": element.get("lat"),
                            "lon": element.get("lon"),
                            "operator": tags.get("operator", "")
                        })
                    elif tags.get("railway") == "yard":
                        yards.append({
                            "name": tags.get("name", "Unknown"),
                            "lat": element.get("lat"),
                            "lon": element.get("lon"),
                            "operator": tags.get("operator", "")
                        })

                elif element["type"] == "way":
                    if tags.get("railway") == "rail":
                        tracks.append({
                            "name": tags.get("name", ""),
                            "operator": tags.get("operator", ""),
                            "usage": tags.get("usage", ""),
                            "electrified": tags.get("electrified", "no"),
                            "maxspeed": tags.get("maxspeed", "")
                        })

            return {
                "stations": stations,
                "yards": yards,
                "tracks": tracks,
                "bbox": bbox
            }

        except Exception as e:
            print(f"Error fetching infrastructure: {e}")
            return {"error": str(e)}


# Freight movement inference from scanner data
class FreightInference:
    """
    Infer freight movements from scanner transcripts since
    freight railroads don't provide public APIs.
    """

    # Patterns that indicate cargo type
    CARGO_PATTERNS = {
        "coal": ["coal train", "unit coal", "empties to", "loads from curtis bay"],
        "intermodal": ["intermodal", "stack train", "double stack", "containers"],
        "automobiles": ["auto rack", "auto train", "vehicle train", "car carrier"],
        "grain": ["grain train", "hopper", "covered hopper", "grain empties"],
        "steel": ["coil car", "steel", "slab", "plate"],
        "general": ["manifest", "mixed freight", "local"]
    }

    # Direction indicators
    DIRECTION_PATTERNS = {
        "inbound_port": ["to seagirt", "to dundalk", "to curtis bay", "to baltimore"],
        "outbound_port": ["from seagirt", "from dundalk", "from curtis bay", "ex baltimore"]
    }

    @classmethod
    def analyze_transcript(cls, text: str) -> Dict:
        """
        Analyze scanner transcript for freight movement intelligence.
        """
        text_lower = text.lower()

        result = {
            "timestamp": datetime.now().isoformat(),
            "raw_text": text,
            "inferred_cargo": [],
            "direction": "unknown",
            "railroad": "unknown",
            "confidence": 0.0,
            "port_relevant": False
        }

        # Detect railroad
        if "csx" in text_lower:
            result["railroad"] = "CSX"
        elif "norfolk southern" in text_lower or " ns " in text_lower:
            result["railroad"] = "Norfolk Southern"
        elif "canton" in text_lower:
            result["railroad"] = "Canton Railroad"
        elif "pbr" in text_lower or "patapsco" in text_lower:
            result["railroad"] = "PBR"

        # Detect cargo type
        for cargo_type, patterns in cls.CARGO_PATTERNS.items():
            if any(p in text_lower for p in patterns):
                result["inferred_cargo"].append(cargo_type)

        # Detect direction
        for direction, patterns in cls.DIRECTION_PATTERNS.items():
            if any(p in text_lower for p in patterns):
                result["direction"] = direction
                result["port_relevant"] = True

        # Calculate confidence
        confidence_factors = 0
        if result["railroad"] != "unknown":
            confidence_factors += 1
        if result["inferred_cargo"]:
            confidence_factors += 1
        if result["direction"] != "unknown":
            confidence_factors += 1

        result["confidence"] = confidence_factors / 3.0

        return result


def get_rail_status() -> Dict:
    """Get comprehensive rail status for Baltimore port area."""
    tracker = RailTracker()

    return {
        "timestamp": datetime.now().isoformat(),
        "amtrak_trains": tracker.get_amtrak_trains(),
        "penn_station_arrivals": tracker.get_station_arrivals("BAL"),
        "bwi_arrivals": tracker.get_station_arrivals("BWI"),
        "infrastructure": {
            "stations": list(BALTIMORE_RAIL_STATIONS.values()),
            "lines": BALTIMORE_RAIL_LINES
        },
        "notes": [
            "Freight train tracking requires scanner monitoring - no public API",
            "Howard Street Tunnel renovation complete - double-stack capable",
            "CSX and NS both serve Port of Baltimore terminals"
        ]
    }


if __name__ == "__main__":
    tracker = RailTracker()

    print("=" * 60)
    print("BALTIMORE RAIL STATUS")
    print("=" * 60)

    print("\n📍 Amtrak Trains in Baltimore Area:")
    trains = tracker.get_amtrak_trains()
    for train in trains[:5]:
        print(f"  Train {train['train_number']}: {train['route_name']}")
        print(f"    Status: {train['current_status']}")
        print(f"    Next: {train['next_station']}")
        if train['delay_minutes'] > 0:
            print(f"    ⚠️ Delay: {train['delay_minutes']} minutes")
        print()

    print("\n🚉 Penn Station Arrivals:")
    arrivals = tracker.get_station_arrivals("BAL")
    for arr in arrivals[:5]:
        print(f"  Train {arr['train_number']} ({arr['route']})")
        print(f"    From: {arr['origin']} → {arr['destination']}")
        print(f"    Status: {arr['status']}")
        print()

    # Test freight inference
    print("\n🚂 Freight Inference Test:")
    test_transcript = "CSX coal train approaching Curtis Bay terminal, 110 cars loads"
    inference = FreightInference.analyze_transcript(test_transcript)
    print(f"  Text: {test_transcript}")
    print(f"  Railroad: {inference['railroad']}")
    print(f"  Cargo: {inference['inferred_cargo']}")
    print(f"  Direction: {inference['direction']}")
    print(f"  Confidence: {inference['confidence']:.0%}")
