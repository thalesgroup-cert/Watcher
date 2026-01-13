#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Baltimore Critical Infrastructure Monitoring

Monitors and correlates data across:
- Port terminals and facilities
- Rail infrastructure (tunnels, bridges, yards)
- Maritime chokepoints
- Undersea cables and pipelines
- Power and utility infrastructure
- Communication systems

Design pattern borrowed from Watcher's threat intelligence approach.
"""

import json
from typing import Dict, List, Optional
from datetime import datetime
from dataclasses import dataclass, asdict
from enum import Enum

class InfrastructureType(Enum):
    PORT_TERMINAL = "port_terminal"
    RAIL_YARD = "rail_yard"
    RAIL_TUNNEL = "rail_tunnel"
    RAIL_BRIDGE = "rail_bridge"
    MARITIME_CHANNEL = "maritime_channel"
    BRIDGE = "bridge"
    POWER = "power"
    TELECOM = "telecom"
    PIPELINE = "pipeline"
    WATER = "water"


class ThreatLevel(Enum):
    CRITICAL = "critical"
    HIGH = "high"
    MEDIUM = "medium"
    LOW = "low"
    INFO = "info"


@dataclass
class Infrastructure:
    """Critical infrastructure asset."""
    id: str
    name: str
    type: InfrastructureType
    lat: float
    lon: float
    description: str
    operator: str
    criticality: int  # 1-5, 5 being most critical
    dependencies: List[str]  # IDs of dependent infrastructure
    metadata: Dict = None

    def to_dict(self):
        d = asdict(self)
        d['type'] = self.type.value
        return d


@dataclass
class InfrastructureAlert:
    """Alert related to infrastructure."""
    id: str
    infrastructure_id: str
    timestamp: datetime
    threat_level: ThreatLevel
    source: str  # scanner, ais, news, sensor
    title: str
    description: str
    raw_data: Dict = None

    def to_dict(self):
        d = asdict(self)
        d['threat_level'] = self.threat_level.value
        d['timestamp'] = self.timestamp.isoformat()
        return d


# ===========================================
# BALTIMORE CRITICAL INFRASTRUCTURE DATABASE
# ===========================================

BALTIMORE_INFRASTRUCTURE: Dict[str, Infrastructure] = {
    # ===========================================
    # PORT TERMINALS
    # ===========================================
    "seagirt": Infrastructure(
        id="seagirt",
        name="Seagirt Marine Terminal",
        type=InfrastructureType.PORT_TERMINAL,
        lat=39.2667,
        lon=-76.5783,
        description="Primary container terminal - 4 super post-Panamax cranes",
        operator="Ports America Chesapeake",
        criticality=5,
        dependencies=["rail_seagirt", "power_seagirt", "channel_patapsco"],
        metadata={
            "capacity": "1M+ TEU/year",
            "berths": 4,
            "depth": "50ft",
            "commodities": ["containers", "intermodal"]
        }
    ),

    "dundalk": Infrastructure(
        id="dundalk",
        name="Dundalk Marine Terminal",
        type=InfrastructureType.PORT_TERMINAL,
        lat=39.2522,
        lon=-76.5269,
        description="Multi-purpose terminal - RoRo, breakbulk, forest products",
        operator="Maryland Port Administration",
        criticality=5,
        dependencies=["rail_dundalk", "power_dundalk", "channel_patapsco"],
        metadata={
            "area": "570 acres",
            "berths": 12,
            "specialties": ["automobiles", "farm_equipment", "forest_products"]
        }
    ),

    "fairfield": Infrastructure(
        id="fairfield",
        name="Fairfield Auto Terminal",
        type=InfrastructureType.PORT_TERMINAL,
        lat=39.2181,
        lon=-76.5689,
        description="Dedicated automobile processing facility",
        operator="Maryland Port Administration",
        criticality=4,
        dependencies=["rail_fairfield", "channel_patapsco"],
        metadata={
            "capacity": "500K+ vehicles/year",
            "specialties": ["automobiles", "light_trucks"]
        }
    ),

    "south_locust_point": Infrastructure(
        id="south_locust_point",
        name="South Locust Point Marine Terminal",
        type=InfrastructureType.PORT_TERMINAL,
        lat=39.2614,
        lon=-76.5908,
        description="Bulk cargo terminal - salt, gypsum, aggregates",
        operator="Maryland Port Administration",
        criticality=3,
        dependencies=["channel_patapsco"],
        metadata={
            "commodities": ["salt", "gypsum", "aggregates", "bulk"]
        }
    ),

    "cnx_coal": Infrastructure(
        id="cnx_coal",
        name="CNX Marine Terminal (Curtis Bay)",
        type=InfrastructureType.PORT_TERMINAL,
        lat=39.2089,
        lon=-76.5292,
        description="Major coal export terminal - 15M ton capacity",
        operator="CNX Resources",
        criticality=5,
        dependencies=["rail_curtis_bay", "channel_patapsco"],
        metadata={
            "capacity": "15M tons/year",
            "commodities": ["coal"],
            "export_destinations": ["Asia", "Europe"]
        }
    ),

    # ===========================================
    # RAIL INFRASTRUCTURE
    # ===========================================
    "howard_street_tunnel": Infrastructure(
        id="howard_street_tunnel",
        name="Howard Street Tunnel",
        type=InfrastructureType.RAIL_TUNNEL,
        lat=39.2906,
        lon=-76.6177,
        description="Critical CSX tunnel through Baltimore - recently expanded for double-stack",
        operator="CSX",
        criticality=5,
        dependencies=["rail_csx_mainline"],
        metadata={
            "length": "1.4 miles",
            "clearance": "21ft (new)",
            "status": "renovated_2024",
            "significance": "Only double-stack route through Baltimore"
        }
    ),

    "bayview_yard": Infrastructure(
        id="bayview_yard",
        name="CSX Bayview Yard",
        type=InfrastructureType.RAIL_YARD,
        lat=39.2989,
        lon=-76.5647,
        description="Major CSX classification yard",
        operator="CSX",
        criticality=4,
        dependencies=["howard_street_tunnel"],
        metadata={
            "tracks": "multiple",
            "function": "classification_switching"
        }
    ),

    "rail_seagirt": Infrastructure(
        id="rail_seagirt",
        name="Seagirt Rail Facility",
        type=InfrastructureType.RAIL_YARD,
        lat=39.2650,
        lon=-76.5500,
        description="On-dock rail at Seagirt terminal",
        operator="Canton Railroad",
        criticality=4,
        dependencies=["seagirt", "bayview_yard"],
        metadata={
            "function": "intermodal_transfer"
        }
    ),

    "rail_curtis_bay": Infrastructure(
        id="rail_curtis_bay",
        name="Curtis Bay Rail Terminal",
        type=InfrastructureType.RAIL_YARD,
        lat=39.2100,
        lon=-76.5350,
        description="Coal rail terminal serving CNX",
        operator="CSX",
        criticality=4,
        dependencies=["cnx_coal"],
        metadata={
            "commodities": ["coal"],
            "function": "unit_train_loading"
        }
    ),

    # ===========================================
    # MARITIME CHOKEPOINTS
    # ===========================================
    "key_bridge": Infrastructure(
        id="key_bridge",
        name="Francis Scott Key Bridge",
        type=InfrastructureType.BRIDGE,
        lat=39.2167,
        lon=-76.5286,
        description="Main bridge over Patapsco River approach to port (rebuilt)",
        operator="Maryland Transportation Authority",
        criticality=5,
        dependencies=["channel_patapsco"],
        metadata={
            "clearance": "185ft vertical",
            "status": "rebuilt_2025",
            "significance": "Primary navigation clearance point"
        }
    ),

    "channel_patapsco": Infrastructure(
        id="channel_patapsco",
        name="Baltimore Ship Channel",
        type=InfrastructureType.MARITIME_CHANNEL,
        lat=39.20,
        lon=-76.53,
        description="Main deep-water channel to Port of Baltimore",
        operator="US Army Corps of Engineers",
        criticality=5,
        dependencies=[],
        metadata={
            "depth": "50ft",
            "width": "700ft",
            "length": "15 miles",
            "dredging": "ongoing"
        }
    ),

    "chesapeake_bay_bridge": Infrastructure(
        id="chesapeake_bay_bridge",
        name="Chesapeake Bay Bridge",
        type=InfrastructureType.BRIDGE,
        lat=38.9933,
        lon=-76.3808,
        description="Major bridge crossing Chesapeake Bay",
        operator="Maryland Transportation Authority",
        criticality=4,
        dependencies=[],
        metadata={
            "clearance": "186ft vertical",
            "significance": "Secondary navigation point"
        }
    ),

    # ===========================================
    # POWER & UTILITIES
    # ===========================================
    "power_seagirt": Infrastructure(
        id="power_seagirt",
        name="Seagirt Substation",
        type=InfrastructureType.POWER,
        lat=39.2680,
        lon=-76.5750,
        description="Primary power supply for Seagirt terminal cranes",
        operator="BGE",
        criticality=4,
        dependencies=["power_grid_east"],
        metadata={
            "function": "crane_power",
            "backup": "yes"
        }
    ),

    # ===========================================
    # TELECOMMUNICATIONS
    # ===========================================
    "vts_baltimore": Infrastructure(
        id="vts_baltimore",
        name="Vessel Traffic Service Baltimore",
        type=InfrastructureType.TELECOM,
        lat=39.2700,
        lon=-76.5800,
        description="Coast Guard vessel traffic monitoring center",
        operator="US Coast Guard",
        criticality=5,
        dependencies=["telecom_backup"],
        metadata={
            "function": "maritime_traffic_control",
            "vhf_channels": ["12", "14"]
        }
    ),
}


# ===========================================
# INFRASTRUCTURE MONITORING
# ===========================================

class InfrastructureMonitor:
    """
    Monitor critical infrastructure and correlate with
    vessel, rail, scanner, and commodity data.
    """

    def __init__(self):
        self.infrastructure = BALTIMORE_INFRASTRUCTURE
        self.alerts: List[InfrastructureAlert] = []

    def get_all_infrastructure(self) -> List[Dict]:
        """Get all infrastructure as list of dicts."""
        return [inf.to_dict() for inf in self.infrastructure.values()]

    def get_by_type(self, infra_type: InfrastructureType) -> List[Infrastructure]:
        """Get infrastructure by type."""
        return [
            inf for inf in self.infrastructure.values()
            if inf.type == infra_type
        ]

    def get_by_criticality(self, min_criticality: int = 4) -> List[Infrastructure]:
        """Get high criticality infrastructure."""
        return [
            inf for inf in self.infrastructure.values()
            if inf.criticality >= min_criticality
        ]

    def get_dependencies(self, infra_id: str) -> List[Infrastructure]:
        """Get all infrastructure that depends on a given asset."""
        dependents = []
        for inf in self.infrastructure.values():
            if infra_id in inf.dependencies:
                dependents.append(inf)
        return dependents

    def assess_impact(self, infra_id: str) -> Dict:
        """
        Assess cascading impact if infrastructure is compromised.
        """
        if infra_id not in self.infrastructure:
            return {"error": "Infrastructure not found"}

        primary = self.infrastructure[infra_id]
        dependents = self.get_dependencies(infra_id)

        # Calculate impact score
        impact_score = primary.criticality
        for dep in dependents:
            impact_score += dep.criticality * 0.5

        affected_commodities = set()
        affected_operators = {primary.operator}

        for dep in dependents:
            affected_operators.add(dep.operator)
            if dep.metadata and "commodities" in dep.metadata:
                affected_commodities.update(dep.metadata["commodities"])

        return {
            "infrastructure": primary.to_dict(),
            "impact_score": round(impact_score, 1),
            "dependent_assets": [d.to_dict() for d in dependents],
            "affected_commodities": list(affected_commodities),
            "affected_operators": list(affected_operators),
            "assessment": self._get_impact_level(impact_score)
        }

    def _get_impact_level(self, score: float) -> str:
        if score >= 10:
            return "CRITICAL - Major port disruption"
        elif score >= 7:
            return "HIGH - Significant operational impact"
        elif score >= 4:
            return "MEDIUM - Partial operations affected"
        else:
            return "LOW - Limited impact"

    def create_alert(
        self,
        infra_id: str,
        source: str,
        title: str,
        description: str,
        threat_level: ThreatLevel = ThreatLevel.MEDIUM,
        raw_data: Dict = None
    ) -> InfrastructureAlert:
        """Create an infrastructure alert."""
        alert = InfrastructureAlert(
            id=f"alert_{datetime.now().strftime('%Y%m%d%H%M%S')}_{infra_id}",
            infrastructure_id=infra_id,
            timestamp=datetime.now(),
            threat_level=threat_level,
            source=source,
            title=title,
            description=description,
            raw_data=raw_data
        )
        self.alerts.append(alert)
        return alert

    def analyze_scanner_transcript(self, text: str) -> List[Dict]:
        """
        Analyze scanner transcript for infrastructure-related mentions.
        """
        text_lower = text.lower()
        matches = []

        # Keywords for each infrastructure
        infra_keywords = {
            "seagirt": ["seagirt", "container terminal"],
            "dundalk": ["dundalk", "auto terminal"],
            "cnx_coal": ["curtis bay", "coal terminal", "cnx"],
            "howard_street_tunnel": ["howard street", "tunnel"],
            "key_bridge": ["key bridge", "bridge clearance"],
            "channel_patapsco": ["channel", "ship channel", "patapsco"],
            "bayview_yard": ["bayview", "csx yard"],
        }

        # Check for matches
        for infra_id, keywords in infra_keywords.items():
            if any(kw in text_lower for kw in keywords):
                infra = self.infrastructure.get(infra_id)
                if infra:
                    matches.append({
                        "infrastructure_id": infra_id,
                        "infrastructure_name": infra.name,
                        "type": infra.type.value,
                        "criticality": infra.criticality,
                        "matched_text": text
                    })

        # Check for emergency keywords
        emergency_keywords = [
            "emergency", "fire", "collision", "derailment",
            "spill", "explosion", "evacuation", "closure"
        ]

        if any(kw in text_lower for kw in emergency_keywords):
            for match in matches:
                match["emergency_detected"] = True

        return matches

    def correlate_vessel_with_infrastructure(
        self,
        vessel: Dict,
        proximity_nm: float = 1.0
    ) -> List[Dict]:
        """
        Find infrastructure near a vessel's position.
        """
        from math import radians, sin, cos, sqrt, atan2

        def haversine(lat1, lon1, lat2, lon2):
            """Calculate distance in nautical miles."""
            R = 3440.065  # Earth radius in nm
            lat1, lon1, lat2, lon2 = map(radians, [lat1, lon1, lat2, lon2])
            dlat = lat2 - lat1
            dlon = lon2 - lon1
            a = sin(dlat/2)**2 + cos(lat1) * cos(lat2) * sin(dlon/2)**2
            c = 2 * atan2(sqrt(a), sqrt(1-a))
            return R * c

        vessel_lat = vessel.get("lat", vessel.get("latitude", 0))
        vessel_lon = vessel.get("lon", vessel.get("longitude", 0))

        nearby = []
        for infra in self.infrastructure.values():
            distance = haversine(vessel_lat, vessel_lon, infra.lat, infra.lon)
            if distance <= proximity_nm:
                nearby.append({
                    "infrastructure": infra.to_dict(),
                    "distance_nm": round(distance, 2),
                    "vessel_mmsi": vessel.get("mmsi"),
                    "vessel_name": vessel.get("name", "Unknown")
                })

        return sorted(nearby, key=lambda x: x["distance_nm"])

    def get_status_report(self) -> Dict:
        """Generate infrastructure status report."""
        by_type = {}
        for infra_type in InfrastructureType:
            items = self.get_by_type(infra_type)
            by_type[infra_type.value] = len(items)

        critical = self.get_by_criticality(5)

        return {
            "timestamp": datetime.now().isoformat(),
            "total_assets": len(self.infrastructure),
            "by_type": by_type,
            "critical_assets": [inf.name for inf in critical],
            "recent_alerts": [a.to_dict() for a in self.alerts[-10:]],
            "status": "operational"  # Would be dynamic in production
        }


def get_infrastructure_geojson() -> Dict:
    """Export infrastructure as GeoJSON for mapping."""
    features = []

    for infra in BALTIMORE_INFRASTRUCTURE.values():
        feature = {
            "type": "Feature",
            "geometry": {
                "type": "Point",
                "coordinates": [infra.lon, infra.lat]
            },
            "properties": {
                "id": infra.id,
                "name": infra.name,
                "type": infra.type.value,
                "operator": infra.operator,
                "criticality": infra.criticality,
                "description": infra.description
            }
        }
        if infra.metadata:
            feature["properties"].update(infra.metadata)

        features.append(feature)

    return {
        "type": "FeatureCollection",
        "features": features
    }


if __name__ == "__main__":
    monitor = InfrastructureMonitor()

    print("=" * 60)
    print("BALTIMORE CRITICAL INFRASTRUCTURE STATUS")
    print("=" * 60)

    status = monitor.get_status_report()
    print(f"\nTotal Assets: {status['total_assets']}")
    print(f"\nBy Type:")
    for infra_type, count in status['by_type'].items():
        print(f"  {infra_type}: {count}")

    print(f"\nCritical Assets (Criticality 5):")
    for name in status['critical_assets']:
        print(f"  • {name}")

    print("\n" + "=" * 60)
    print("IMPACT ASSESSMENT: Howard Street Tunnel")
    print("=" * 60)

    impact = monitor.assess_impact("howard_street_tunnel")
    print(f"\nImpact Score: {impact['impact_score']}")
    print(f"Assessment: {impact['assessment']}")
    print(f"\nDependent Assets:")
    for dep in impact['dependent_assets']:
        print(f"  • {dep['name']} ({dep['type']})")

    # Test scanner analysis
    print("\n" + "=" * 60)
    print("SCANNER TRANSCRIPT ANALYSIS")
    print("=" * 60)

    test_text = "Emergency response requested at Seagirt terminal, possible fire on container crane"
    matches = monitor.analyze_scanner_transcript(test_text)
    print(f"\nText: {test_text}")
    print(f"Matches: {len(matches)}")
    for match in matches:
        print(f"  • {match['infrastructure_name']} (Criticality: {match['criticality']})")
        if match.get('emergency_detected'):
            print(f"    ⚠️ EMERGENCY DETECTED")

    # Export GeoJSON
    geojson = get_infrastructure_geojson()
    with open("infrastructure.geojson", "w") as f:
        json.dump(geojson, f, indent=2)
    print("\n✓ Exported infrastructure.geojson")
