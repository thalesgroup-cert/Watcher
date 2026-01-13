#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Baltimore Port Intelligence Hub

Unified intelligence platform that correlates:
- AIS vessel tracking
- Commodity market signals
- Scanner feed transcripts
- Rail movements
- Critical infrastructure status

Design pattern: Event-driven correlation engine inspired by Watcher's
threat intelligence approach.
"""

import json
from typing import Dict, List, Optional, Callable
from datetime import datetime, timedelta
from dataclasses import dataclass, asdict
from enum import Enum
import threading
import queue

# Import all modules
from commodities import (
    BaltimorePortCommodities,
    correlate_vessel_with_commodities,
    TRADING_PARTNERS
)
from scanner_feeds import (
    BALTIMORE_FEEDS,
    KEYWORD_CATEGORIES,
    categorize_transcript
)
from rail_tracking import (
    RailTracker,
    FreightInference,
    BALTIMORE_RAIL_STATIONS,
    BALTIMORE_RAIL_LINES
)
from critical_infrastructure import (
    InfrastructureMonitor,
    BALTIMORE_INFRASTRUCTURE,
    ThreatLevel,
    get_infrastructure_geojson
)


class EventType(Enum):
    VESSEL_ARRIVAL = "vessel_arrival"
    VESSEL_DEPARTURE = "vessel_departure"
    VESSEL_ANOMALY = "vessel_anomaly"
    COMMODITY_ALERT = "commodity_alert"
    SCANNER_ALERT = "scanner_alert"
    RAIL_MOVEMENT = "rail_movement"
    INFRASTRUCTURE_ALERT = "infrastructure_alert"
    CORRELATION = "correlation"


@dataclass
class IntelEvent:
    """Intelligence event from any source."""
    id: str
    timestamp: datetime
    event_type: EventType
    source: str
    title: str
    description: str
    severity: str  # critical, high, medium, low, info
    location: Optional[Dict] = None  # lat, lon
    entities: Optional[List[str]] = None  # Related entities
    raw_data: Optional[Dict] = None
    correlations: Optional[List[str]] = None  # IDs of correlated events

    def to_dict(self):
        d = asdict(self)
        d['event_type'] = self.event_type.value
        d['timestamp'] = self.timestamp.isoformat()
        return d


class CorrelationRule:
    """Rule for correlating events."""

    def __init__(
        self,
        name: str,
        event_types: List[EventType],
        time_window_minutes: int,
        condition: Callable[[List[IntelEvent]], bool],
        severity: str = "medium"
    ):
        self.name = name
        self.event_types = event_types
        self.time_window = timedelta(minutes=time_window_minutes)
        self.condition = condition
        self.severity = severity


class IntelligenceHub:
    """
    Central intelligence correlation engine.

    Collects events from all sources and applies correlation rules
    to detect patterns and generate alerts.
    """

    def __init__(self):
        self.events: List[IntelEvent] = []
        self.event_queue = queue.Queue()
        self.subscribers: List[Callable[[IntelEvent], None]] = []
        self.correlation_rules: List[CorrelationRule] = []
        self._event_counter = 0

        # Initialize sub-monitors
        self.commodities = BaltimorePortCommodities()
        self.infrastructure = InfrastructureMonitor()
        self.rail = RailTracker()

        # Register default correlation rules
        self._register_default_rules()

    def _generate_event_id(self) -> str:
        self._event_counter += 1
        return f"evt_{datetime.now().strftime('%Y%m%d')}_{self._event_counter:06d}"

    def _register_default_rules(self):
        """Register default correlation rules."""

        # Rule 1: Vessel + Infrastructure proximity
        self.add_correlation_rule(CorrelationRule(
            name="vessel_near_critical_infrastructure",
            event_types=[EventType.VESSEL_ARRIVAL, EventType.INFRASTRUCTURE_ALERT],
            time_window_minutes=30,
            condition=lambda events: self._check_vessel_infra_correlation(events),
            severity="high"
        ))

        # Rule 2: Commodity spike + Vessel activity
        self.add_correlation_rule(CorrelationRule(
            name="commodity_vessel_correlation",
            event_types=[EventType.COMMODITY_ALERT, EventType.VESSEL_ARRIVAL],
            time_window_minutes=60,
            condition=lambda events: self._check_commodity_vessel_correlation(events),
            severity="medium"
        ))

        # Rule 3: Scanner emergency + Infrastructure
        self.add_correlation_rule(CorrelationRule(
            name="scanner_infrastructure_emergency",
            event_types=[EventType.SCANNER_ALERT, EventType.INFRASTRUCTURE_ALERT],
            time_window_minutes=15,
            condition=lambda events: self._check_scanner_infra_correlation(events),
            severity="critical"
        ))

        # Rule 4: Rail + Vessel correlation (cargo movement)
        self.add_correlation_rule(CorrelationRule(
            name="rail_vessel_cargo_movement",
            event_types=[EventType.RAIL_MOVEMENT, EventType.VESSEL_ARRIVAL],
            time_window_minutes=120,
            condition=lambda events: self._check_rail_vessel_correlation(events),
            severity="medium"
        ))

    def _check_vessel_infra_correlation(self, events: List[IntelEvent]) -> bool:
        """Check if vessel events correlate with infrastructure events."""
        vessel_events = [e for e in events if e.event_type == EventType.VESSEL_ARRIVAL]
        infra_events = [e for e in events if e.event_type == EventType.INFRASTRUCTURE_ALERT]
        return len(vessel_events) > 0 and len(infra_events) > 0

    def _check_commodity_vessel_correlation(self, events: List[IntelEvent]) -> bool:
        """Check if commodity alerts correlate with vessel movements."""
        commodity_events = [e for e in events if e.event_type == EventType.COMMODITY_ALERT]
        vessel_events = [e for e in events if e.event_type == EventType.VESSEL_ARRIVAL]

        for ce in commodity_events:
            for ve in vessel_events:
                # Check if vessel cargo matches commodity
                if ce.raw_data and ve.raw_data:
                    commodity = ce.raw_data.get("commodity", "")
                    vessel_type = ve.raw_data.get("vessel_type", "")
                    if self._cargo_matches(commodity, vessel_type):
                        return True
        return False

    def _check_scanner_infra_correlation(self, events: List[IntelEvent]) -> bool:
        """Check scanner alerts against infrastructure events."""
        scanner_events = [e for e in events if e.event_type == EventType.SCANNER_ALERT]
        return any(e.severity in ["critical", "high"] for e in scanner_events)

    def _check_rail_vessel_correlation(self, events: List[IntelEvent]) -> bool:
        """Check rail movements against vessel arrivals."""
        rail_events = [e for e in events if e.event_type == EventType.RAIL_MOVEMENT]
        vessel_events = [e for e in events if e.event_type == EventType.VESSEL_ARRIVAL]
        return len(rail_events) > 0 and len(vessel_events) > 0

    def _cargo_matches(self, commodity: str, vessel_type: str) -> bool:
        """Check if commodity matches vessel type."""
        cargo_map = {
            "coal": ["bulk_carrier"],
            "soybeans": ["bulk_carrier"],
            "natural_gas": ["lng_carrier", "tanker"],
            "automobiles": ["roro", "car_carrier"],
        }
        expected_vessels = cargo_map.get(commodity.lower(), [])
        return vessel_type.lower() in expected_vessels

    def add_correlation_rule(self, rule: CorrelationRule):
        """Add a correlation rule."""
        self.correlation_rules.append(rule)

    def subscribe(self, callback: Callable[[IntelEvent], None]):
        """Subscribe to intelligence events."""
        self.subscribers.append(callback)

    def _notify_subscribers(self, event: IntelEvent):
        """Notify all subscribers of an event."""
        for callback in self.subscribers:
            try:
                callback(event)
            except Exception as e:
                print(f"Subscriber callback error: {e}")

    def ingest_event(self, event: IntelEvent):
        """Ingest an event and check correlations."""
        self.events.append(event)
        self._notify_subscribers(event)

        # Check correlation rules
        self._check_correlations(event)

    def _check_correlations(self, new_event: IntelEvent):
        """Check new event against correlation rules."""
        for rule in self.correlation_rules:
            if new_event.event_type not in rule.event_types:
                continue

            # Get events within time window
            cutoff = datetime.now() - rule.time_window
            window_events = [
                e for e in self.events
                if e.timestamp >= cutoff and e.event_type in rule.event_types
            ]

            if rule.condition(window_events):
                # Generate correlation event
                corr_event = IntelEvent(
                    id=self._generate_event_id(),
                    timestamp=datetime.now(),
                    event_type=EventType.CORRELATION,
                    source="correlation_engine",
                    title=f"Correlation: {rule.name}",
                    description=f"Correlated {len(window_events)} events matching rule '{rule.name}'",
                    severity=rule.severity,
                    correlations=[e.id for e in window_events]
                )
                self.events.append(corr_event)
                self._notify_subscribers(corr_event)

    # ===========================================
    # EVENT CREATION METHODS
    # ===========================================

    def create_vessel_event(
        self,
        vessel: Dict,
        event_type: EventType = EventType.VESSEL_ARRIVAL
    ) -> IntelEvent:
        """Create event from vessel data."""
        # Enrich with commodity correlation
        vessel_type = vessel.get("ship_type_text", "cargo")
        flag = vessel.get("flag", "")
        correlation = correlate_vessel_with_commodities(vessel_type, flag)

        event = IntelEvent(
            id=self._generate_event_id(),
            timestamp=datetime.now(),
            event_type=event_type,
            source="ais_tracker",
            title=f"Vessel {event_type.value}: {vessel.get('name', 'Unknown')}",
            description=f"MMSI: {vessel.get('mmsi')} | Type: {vessel_type} | Flag: {flag}",
            severity="info" if correlation["risk_assessment"] == "normal" else "medium",
            location={
                "lat": vessel.get("lat", vessel.get("latitude")),
                "lon": vessel.get("lon", vessel.get("longitude"))
            },
            entities=[vessel.get("mmsi", ""), vessel.get("name", "")],
            raw_data={
                "vessel": vessel,
                "commodity_correlation": correlation
            }
        )
        self.ingest_event(event)
        return event

    def create_commodity_event(self, commodity: Dict) -> IntelEvent:
        """Create event from commodity alert."""
        event = IntelEvent(
            id=self._generate_event_id(),
            timestamp=datetime.now(),
            event_type=EventType.COMMODITY_ALERT,
            source="commodities_tracker",
            title=f"Commodity Alert: {commodity.get('name', 'Unknown')}",
            description=f"Price: {commodity.get('price')} | Change: {commodity.get('change_pct', 0):+.2f}%",
            severity="high" if abs(commodity.get("change_pct", 0)) >= 5 else "medium",
            raw_data=commodity
        )
        self.ingest_event(event)
        return event

    def create_scanner_event(self, transcript: str, feed_name: str) -> IntelEvent:
        """Create event from scanner transcript."""
        # Categorize transcript
        categories = categorize_transcript(transcript)

        # Check infrastructure matches
        infra_matches = self.infrastructure.analyze_scanner_transcript(transcript)

        severity = "info"
        if any("emergency" in cat for cat in categories.keys()):
            severity = "critical"
        elif infra_matches:
            severity = "high" if any(m.get("emergency_detected") for m in infra_matches) else "medium"

        event = IntelEvent(
            id=self._generate_event_id(),
            timestamp=datetime.now(),
            event_type=EventType.SCANNER_ALERT,
            source=f"scanner_{feed_name}",
            title=f"Scanner: {feed_name}",
            description=transcript[:200],
            severity=severity,
            entities=list(categories.keys()),
            raw_data={
                "transcript": transcript,
                "categories": categories,
                "infrastructure_matches": infra_matches
            }
        )
        self.ingest_event(event)
        return event

    def create_rail_event(self, inference: Dict) -> IntelEvent:
        """Create event from rail scanner inference."""
        event = IntelEvent(
            id=self._generate_event_id(),
            timestamp=datetime.now(),
            event_type=EventType.RAIL_MOVEMENT,
            source="rail_scanner",
            title=f"Rail: {inference.get('railroad', 'Unknown')} movement",
            description=f"Cargo: {', '.join(inference.get('inferred_cargo', []))} | Direction: {inference.get('direction')}",
            severity="medium" if inference.get("port_relevant") else "info",
            raw_data=inference
        )
        self.ingest_event(event)
        return event

    def create_infrastructure_event(
        self,
        infra_id: str,
        alert_type: str,
        description: str,
        severity: str = "medium"
    ) -> IntelEvent:
        """Create infrastructure alert event."""
        infra = BALTIMORE_INFRASTRUCTURE.get(infra_id)
        if not infra:
            return None

        event = IntelEvent(
            id=self._generate_event_id(),
            timestamp=datetime.now(),
            event_type=EventType.INFRASTRUCTURE_ALERT,
            source="infrastructure_monitor",
            title=f"Infrastructure: {infra.name} - {alert_type}",
            description=description,
            severity=severity,
            location={"lat": infra.lat, "lon": infra.lon},
            entities=[infra_id, infra.name, infra.operator],
            raw_data={"infrastructure": infra.to_dict()}
        )
        self.ingest_event(event)
        return event

    # ===========================================
    # REPORTING
    # ===========================================

    def get_situation_report(self, hours: int = 24) -> Dict:
        """Generate situation report."""
        cutoff = datetime.now() - timedelta(hours=hours)
        recent_events = [e for e in self.events if e.timestamp >= cutoff]

        by_type = {}
        by_severity = {"critical": 0, "high": 0, "medium": 0, "low": 0, "info": 0}

        for event in recent_events:
            type_key = event.event_type.value
            by_type[type_key] = by_type.get(type_key, 0) + 1
            by_severity[event.severity] = by_severity.get(event.severity, 0) + 1

        # Get current commodity status
        commodity_data = self.commodities.get_all_commodities()

        # Get rail status
        rail_trains = self.rail.get_amtrak_trains()

        # Get infrastructure status
        infra_status = self.infrastructure.get_status_report()

        return {
            "generated_at": datetime.now().isoformat(),
            "period_hours": hours,
            "summary": {
                "total_events": len(recent_events),
                "by_type": by_type,
                "by_severity": by_severity
            },
            "critical_events": [
                e.to_dict() for e in recent_events
                if e.severity in ["critical", "high"]
            ][:10],
            "correlations": [
                e.to_dict() for e in recent_events
                if e.event_type == EventType.CORRELATION
            ],
            "commodity_status": commodity_data.get("commodities", {}),
            "commodity_alerts": commodity_data.get("alerts", []),
            "rail_status": {
                "amtrak_trains_in_area": len(rail_trains),
                "trains": rail_trains[:5]
            },
            "infrastructure_status": infra_status
        }

    def export_events_geojson(self, hours: int = 24) -> Dict:
        """Export recent events as GeoJSON."""
        cutoff = datetime.now() - timedelta(hours=hours)
        recent_events = [
            e for e in self.events
            if e.timestamp >= cutoff and e.location
        ]

        features = []
        for event in recent_events:
            if event.location:
                features.append({
                    "type": "Feature",
                    "geometry": {
                        "type": "Point",
                        "coordinates": [
                            event.location.get("lon", 0),
                            event.location.get("lat", 0)
                        ]
                    },
                    "properties": {
                        "id": event.id,
                        "title": event.title,
                        "type": event.event_type.value,
                        "severity": event.severity,
                        "timestamp": event.timestamp.isoformat(),
                        "source": event.source
                    }
                })

        return {
            "type": "FeatureCollection",
            "features": features
        }


# ===========================================
# FLASK API
# ===========================================

def create_intelligence_api():
    """Create Flask API for intelligence hub."""
    from flask import Flask, jsonify, request

    app = Flask(__name__)
    hub = IntelligenceHub()

    @app.route("/api/status", methods=["GET"])
    def status():
        """Get current situation status."""
        hours = request.args.get("hours", 24, type=int)
        return jsonify(hub.get_situation_report(hours))

    @app.route("/api/events", methods=["GET"])
    def events():
        """Get recent events."""
        hours = request.args.get("hours", 24, type=int)
        cutoff = datetime.now() - timedelta(hours=hours)
        recent = [e.to_dict() for e in hub.events if e.timestamp >= cutoff]
        return jsonify({"events": recent})

    @app.route("/api/events/geojson", methods=["GET"])
    def events_geojson():
        """Get events as GeoJSON."""
        hours = request.args.get("hours", 24, type=int)
        return jsonify(hub.export_events_geojson(hours))

    @app.route("/api/infrastructure", methods=["GET"])
    def infrastructure():
        """Get infrastructure data."""
        return jsonify(get_infrastructure_geojson())

    @app.route("/api/infrastructure/<infra_id>/impact", methods=["GET"])
    def infrastructure_impact(infra_id):
        """Get impact assessment for infrastructure."""
        return jsonify(hub.infrastructure.assess_impact(infra_id))

    @app.route("/api/commodities", methods=["GET"])
    def commodities():
        """Get commodity data."""
        return jsonify(hub.commodities.get_all_commodities())

    @app.route("/api/rail", methods=["GET"])
    def rail():
        """Get rail status."""
        return jsonify({
            "trains": hub.rail.get_amtrak_trains(),
            "stations": {k: asdict(v) for k, v in BALTIMORE_RAIL_STATIONS.items()},
            "lines": BALTIMORE_RAIL_LINES
        })

    @app.route("/api/ingest/scanner", methods=["POST"])
    def ingest_scanner():
        """Ingest scanner transcript."""
        data = request.json
        transcript = data.get("transcript", "")
        feed = data.get("feed", "unknown")
        event = hub.create_scanner_event(transcript, feed)
        return jsonify(event.to_dict())

    @app.route("/api/ingest/vessel", methods=["POST"])
    def ingest_vessel():
        """Ingest vessel data."""
        vessel = request.json
        event = hub.create_vessel_event(vessel)
        return jsonify(event.to_dict())

    @app.route("/health", methods=["GET"])
    def health():
        """Health check."""
        return jsonify({
            "status": "healthy",
            "events_count": len(hub.events),
            "correlation_rules": len(hub.correlation_rules)
        })

    return app


if __name__ == "__main__":
    # Demo mode
    hub = IntelligenceHub()

    print("=" * 70)
    print("BALTIMORE PORT INTELLIGENCE HUB")
    print("=" * 70)

    # Simulate some events
    hub.create_vessel_event({
        "mmsi": "123456789",
        "name": "ATLANTIC TRADER",
        "ship_type_text": "bulk_carrier",
        "flag": "Australia",
        "lat": 39.25,
        "lon": -76.55
    })

    hub.create_scanner_event(
        "CSX coal train approaching Curtis Bay terminal, 110 cars loads",
        "baltimore_terminal_rail"
    )

    hub.create_infrastructure_event(
        "cnx_coal",
        "High Volume",
        "Increased coal export activity detected",
        "medium"
    )

    # Generate report
    report = hub.get_situation_report(24)

    print(f"\nTotal Events: {report['summary']['total_events']}")
    print(f"\nBy Type:")
    for t, c in report['summary']['by_type'].items():
        print(f"  {t}: {c}")

    print(f"\nBy Severity:")
    for s, c in report['summary']['by_severity'].items():
        if c > 0:
            print(f"  {s}: {c}")

    print(f"\nCorrelations Detected: {len(report['correlations'])}")
    for corr in report['correlations']:
        print(f"  • {corr['title']}")

    print("\n" + "=" * 70)
    print("Starting Intelligence API on port 8083...")
    print("=" * 70)

    app = create_intelligence_api()
    app.run(host="0.0.0.0", port=8083, debug=True)
