#!/usr/bin/env python3
"""
Tests for the Intelligence Hub module.

Tests the unified correlation engine and event processing.
"""

import pytest
from unittest.mock import patch, MagicMock
from datetime import datetime

from intelligence_hub import (
    IntelligenceHub,
    IntelEvent,
    CorrelationRule,
    EventType
)


class TestEventTypes:
    """Test event type definitions."""

    def test_event_types_defined(self):
        """Test that all event types are defined."""
        expected_types = [
            'VESSEL_ARRIVAL',
            'COMMODITY_ALERT',
            'SCANNER_ALERT',
            'RAIL_MOVEMENT',
            'INFRASTRUCTURE_ALERT',
            'CORRELATION'
        ]

        for event_type in expected_types:
            assert hasattr(EventType, event_type)


class TestIntelEvent:
    """Test the IntelEvent dataclass."""

    def test_event_creation(self):
        """Test creating an intel event."""
        event = IntelEvent(
            id="evt_001",
            event_type=EventType.VESSEL_ARRIVAL,
            timestamp=datetime.now(),
            source="ais_tracker",
            data={"vessel": "MSC Diana", "terminal": "Seagirt"},
            confidence=0.95
        )

        assert event.id == "evt_001"
        assert event.event_type == EventType.VESSEL_ARRIVAL
        assert event.confidence == 0.95

    def test_event_with_correlations(self):
        """Test event with correlation links."""
        event = IntelEvent(
            id="evt_002",
            event_type=EventType.CORRELATION,
            timestamp=datetime.now(),
            source="correlation_engine",
            data={},
            confidence=0.8,
            related_events=["evt_001", "evt_003"]
        )

        assert len(event.related_events) == 2


class TestCorrelationRule:
    """Test correlation rule definitions."""

    def test_rule_creation(self):
        """Test creating a correlation rule."""
        rule = CorrelationRule(
            name="vessel_commodity_link",
            event_types=[EventType.VESSEL_ARRIVAL, EventType.COMMODITY_ALERT],
            time_window_minutes=60,
            match_fields=["terminal", "cargo_type"]
        )

        assert rule.name == "vessel_commodity_link"
        assert len(rule.event_types) == 2

    def test_rule_matching(self):
        """Test rule matching logic."""
        rule = CorrelationRule(
            name="test_rule",
            event_types=[EventType.VESSEL_ARRIVAL, EventType.RAIL_MOVEMENT],
            time_window_minutes=120,
            match_fields=["terminal"]
        )

        event1 = IntelEvent(
            id="e1",
            event_type=EventType.VESSEL_ARRIVAL,
            timestamp=datetime.now(),
            source="ais",
            data={"terminal": "Seagirt"},
            confidence=0.9
        )

        event2 = IntelEvent(
            id="e2",
            event_type=EventType.RAIL_MOVEMENT,
            timestamp=datetime.now(),
            source="rail",
            data={"terminal": "Seagirt"},
            confidence=0.8
        )

        # Should match since terminal matches
        assert rule.matches(event1, event2)


class TestIntelligenceHub:
    """Test the IntelligenceHub class."""

    def test_hub_initialization(self):
        """Test hub initializes correctly."""
        hub = IntelligenceHub()

        assert hub is not None
        assert hasattr(hub, 'events')
        assert hasattr(hub, 'rules')

    def test_register_event(self):
        """Test registering new events."""
        hub = IntelligenceHub()

        event = IntelEvent(
            id="test_001",
            event_type=EventType.VESSEL_ARRIVAL,
            timestamp=datetime.now(),
            source="test",
            data={"vessel": "Test Ship"},
            confidence=0.9
        )

        hub.register_event(event)

        assert event.id in [e.id for e in hub.events]

    def test_add_correlation_rule(self):
        """Test adding correlation rules."""
        hub = IntelligenceHub()

        rule = CorrelationRule(
            name="test_rule",
            event_types=[EventType.VESSEL_ARRIVAL],
            time_window_minutes=60,
            match_fields=[]
        )

        hub.add_rule(rule)

        assert rule.name in [r.name for r in hub.rules]

    def test_find_correlations(self):
        """Test finding correlations between events."""
        hub = IntelligenceHub()

        # Add a rule
        hub.add_rule(CorrelationRule(
            name="vessel_rail",
            event_types=[EventType.VESSEL_ARRIVAL, EventType.RAIL_MOVEMENT],
            time_window_minutes=240,
            match_fields=["terminal"]
        ))

        # Add matching events
        hub.register_event(IntelEvent(
            id="v1",
            event_type=EventType.VESSEL_ARRIVAL,
            timestamp=datetime.now(),
            source="ais",
            data={"terminal": "Seagirt", "vessel": "Container Ship"},
            confidence=0.9
        ))

        hub.register_event(IntelEvent(
            id="r1",
            event_type=EventType.RAIL_MOVEMENT,
            timestamp=datetime.now(),
            source="rail",
            data={"terminal": "Seagirt", "train": "CSX-123"},
            confidence=0.85
        ))

        correlations = hub.find_correlations()

        # Should find the vessel-rail correlation
        assert len(correlations) >= 1

    def test_get_events_by_type(self):
        """Test filtering events by type."""
        hub = IntelligenceHub()

        hub.register_event(IntelEvent(
            id="v1",
            event_type=EventType.VESSEL_ARRIVAL,
            timestamp=datetime.now(),
            source="ais",
            data={},
            confidence=0.9
        ))

        hub.register_event(IntelEvent(
            id="s1",
            event_type=EventType.SCANNER_ALERT,
            timestamp=datetime.now(),
            source="scanner",
            data={},
            confidence=0.7
        ))

        vessel_events = hub.get_events_by_type(EventType.VESSEL_ARRIVAL)

        assert len(vessel_events) == 1
        assert vessel_events[0].id == "v1"

    def test_get_high_confidence_events(self):
        """Test filtering by confidence threshold."""
        hub = IntelligenceHub()

        hub.register_event(IntelEvent(
            id="high",
            event_type=EventType.VESSEL_ARRIVAL,
            timestamp=datetime.now(),
            source="test",
            data={},
            confidence=0.95
        ))

        hub.register_event(IntelEvent(
            id="low",
            event_type=EventType.SCANNER_ALERT,
            timestamp=datetime.now(),
            source="test",
            data={},
            confidence=0.3
        ))

        high_conf = hub.get_high_confidence_events(threshold=0.8)

        assert len(high_conf) == 1
        assert high_conf[0].id == "high"

    def test_event_pruning(self):
        """Test automatic pruning of old events."""
        hub = IntelligenceHub(max_events=10)

        # Add more than max events
        for i in range(15):
            hub.register_event(IntelEvent(
                id=f"evt_{i}",
                event_type=EventType.SCANNER_ALERT,
                timestamp=datetime.now(),
                source="test",
                data={},
                confidence=0.5
            ))

        # Should have pruned to max_events
        assert len(hub.events) <= 10


class TestFlaskAPI:
    """Test the Flask API endpoints."""

    @pytest.fixture
    def client(self):
        """Create test client."""
        from intelligence_hub import create_app

        app = create_app()
        app.config['TESTING'] = True

        with app.test_client() as client:
            yield client

    def test_health_endpoint(self, client):
        """Test health check endpoint."""
        response = client.get('/health')

        assert response.status_code == 200
        data = response.get_json()
        assert data['status'] == 'healthy'

    def test_events_endpoint(self, client):
        """Test events listing endpoint."""
        response = client.get('/api/events')

        assert response.status_code == 200
        data = response.get_json()
        assert 'events' in data

    def test_post_event(self, client):
        """Test posting new event."""
        event_data = {
            'event_type': 'VESSEL_ARRIVAL',
            'source': 'test',
            'data': {'vessel': 'Test Ship'},
            'confidence': 0.9
        }

        response = client.post('/api/events', json=event_data)

        assert response.status_code in [200, 201]

    def test_correlations_endpoint(self, client):
        """Test correlations endpoint."""
        response = client.get('/api/correlations')

        assert response.status_code == 200
        data = response.get_json()
        assert 'correlations' in data


class TestNotificationIntegration:
    """Test integration with Watcher's notification system."""

    def test_format_for_slack(self):
        """Test formatting events for Slack notification."""
        hub = IntelligenceHub()

        event = IntelEvent(
            id="test_001",
            event_type=EventType.INFRASTRUCTURE_ALERT,
            timestamp=datetime.now(),
            source="monitor",
            data={"asset": "Howard Street Tunnel", "status": "blocked"},
            confidence=0.95
        )

        slack_msg = hub.format_for_slack(event)

        assert slack_msg is not None
        assert 'Howard Street Tunnel' in str(slack_msg)

    def test_format_for_thehive(self):
        """Test formatting events for TheHive case."""
        hub = IntelligenceHub()

        event = IntelEvent(
            id="threat_001",
            event_type=EventType.SCANNER_ALERT,
            timestamp=datetime.now(),
            source="scanner",
            data={"threat": "Suspicious activity", "location": "Port"},
            confidence=0.8
        )

        thehive_case = hub.format_for_thehive(event)

        assert thehive_case is not None
        if 'title' in thehive_case:
            assert len(thehive_case['title']) > 0

    def test_collect_observables(self):
        """Test collecting IOCs from events."""
        hub = IntelligenceHub()

        hub.register_event(IntelEvent(
            id="obs_001",
            event_type=EventType.SCANNER_ALERT,
            timestamp=datetime.now(),
            source="scanner",
            data={
                "ip_addresses": ["192.168.1.1"],
                "domains": ["malicious.example.com"],
                "mmsi": "123456789"
            },
            confidence=0.9
        ))

        observables = hub.collect_observables()

        assert observables is not None
        # Should extract IP, domain, MMSI as observables
