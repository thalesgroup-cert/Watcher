#!/usr/bin/env python3
"""
Tests for the Critical Infrastructure module.

Tests Baltimore port asset monitoring and impact assessment.
"""

import pytest
from unittest.mock import patch, MagicMock
from datetime import datetime

from critical_infrastructure import (
    BALTIMORE_INFRASTRUCTURE,
    InfrastructureAsset,
    InfrastructureMonitor,
    get_infrastructure_geojson
)


class TestBaltimoreInfrastructure:
    """Test the infrastructure database."""

    def test_infrastructure_categories_exist(self):
        """Test that all expected categories are defined."""
        expected_categories = ['port_terminals', 'rail_facilities', 'maritime_chokepoints']

        for category in expected_categories:
            assert category in BALTIMORE_INFRASTRUCTURE
            assert len(BALTIMORE_INFRASTRUCTURE[category]) > 0

    def test_port_terminal_structure(self):
        """Test port terminal asset structure."""
        terminals = BALTIMORE_INFRASTRUCTURE['port_terminals']

        for name, asset in terminals.items():
            assert 'name' in asset
            assert 'type' in asset
            assert 'coordinates' in asset
            assert 'criticality' in asset
            assert asset['criticality'] in ['critical', 'high', 'medium', 'low']
            assert len(asset['coordinates']) == 2  # lat, lon

    def test_critical_assets_identified(self):
        """Test that critical assets are properly marked."""
        critical_count = 0

        for category in BALTIMORE_INFRASTRUCTURE.values():
            for asset in category.values():
                if asset.get('criticality') == 'critical':
                    critical_count += 1

        # Should have multiple critical assets
        assert critical_count >= 3

    def test_seagirt_terminal_data(self):
        """Test specific data for Seagirt container terminal."""
        terminals = BALTIMORE_INFRASTRUCTURE['port_terminals']

        assert 'seagirt' in terminals
        seagirt = terminals['seagirt']

        assert seagirt['type'] == 'container_terminal'
        assert seagirt['criticality'] == 'critical'
        assert 'coordinates' in seagirt


class TestInfrastructureAsset:
    """Test the InfrastructureAsset dataclass."""

    def test_asset_creation(self):
        """Test creating an infrastructure asset."""
        asset = InfrastructureAsset(
            id="test_001",
            name="Test Terminal",
            asset_type="terminal",
            category="port_terminals",
            coordinates=(39.2667, -76.5833),
            criticality="high",
            dependencies=["power_grid", "rail"],
            capacity={"teu_annual": 500000}
        )

        assert asset.name == "Test Terminal"
        assert asset.criticality == "high"
        assert len(asset.dependencies) == 2

    def test_asset_with_minimal_data(self):
        """Test asset with only required fields."""
        asset = InfrastructureAsset(
            id="min_001",
            name="Minimal Asset",
            asset_type="facility",
            category="test",
            coordinates=(0.0, 0.0),
            criticality="low"
        )

        assert asset.dependencies is None
        assert asset.capacity is None


class TestInfrastructureMonitor:
    """Test the InfrastructureMonitor class."""

    def test_monitor_initialization(self):
        """Test monitor creates assets from database."""
        monitor = InfrastructureMonitor()

        assert len(monitor.assets) > 0

    def test_get_asset_by_id(self):
        """Test retrieving specific asset."""
        monitor = InfrastructureMonitor()

        # Should be able to find known assets
        seagirt = monitor.get_asset('seagirt')
        assert seagirt is not None
        assert 'seagirt' in seagirt.name.lower() or seagirt.id == 'seagirt'

    def test_get_assets_by_category(self):
        """Test filtering assets by category."""
        monitor = InfrastructureMonitor()

        terminals = monitor.get_assets_by_category('port_terminals')

        assert len(terminals) > 0
        for asset in terminals:
            assert asset.category == 'port_terminals'

    def test_get_critical_assets(self):
        """Test retrieving only critical assets."""
        monitor = InfrastructureMonitor()

        critical = monitor.get_critical_assets()

        assert len(critical) > 0
        for asset in critical:
            assert asset.criticality == 'critical'

    def test_assess_impact_critical_asset(self):
        """Test impact assessment for critical asset."""
        monitor = InfrastructureMonitor()

        # Create a mock event affecting critical infrastructure
        event = {
            'asset_id': 'seagirt',
            'event_type': 'outage',
            'severity': 'high'
        }

        impact = monitor.assess_impact(event)

        assert impact is not None
        assert 'severity' in impact or 'impact_score' in impact

    def test_assess_impact_cascading(self):
        """Test cascading impact analysis."""
        monitor = InfrastructureMonitor()

        # Event at a chokepoint should cascade
        event = {
            'asset_id': 'ship_channel',
            'event_type': 'blockage',
            'severity': 'critical'
        }

        impact = monitor.assess_impact(event)

        # Blocking the channel should affect multiple assets
        if 'affected_assets' in impact:
            assert len(impact['affected_assets']) > 1

    def test_find_dependencies(self):
        """Test dependency chain identification."""
        monitor = InfrastructureMonitor()

        deps = monitor.find_dependencies('seagirt')

        # Container terminal depends on rail and channel access
        assert deps is not None


class TestGeoJSONExport:
    """Test GeoJSON export functionality."""

    def test_geojson_structure(self):
        """Test GeoJSON output has correct structure."""
        geojson = get_infrastructure_geojson()

        assert geojson['type'] == 'FeatureCollection'
        assert 'features' in geojson
        assert len(geojson['features']) > 0

    def test_geojson_feature_properties(self):
        """Test GeoJSON features have required properties."""
        geojson = get_infrastructure_geojson()

        for feature in geojson['features']:
            assert feature['type'] == 'Feature'
            assert 'geometry' in feature
            assert 'properties' in feature

            props = feature['properties']
            assert 'name' in props
            assert 'category' in props
            assert 'criticality' in props

    def test_geojson_coordinates(self):
        """Test GeoJSON coordinates are valid."""
        geojson = get_infrastructure_geojson()

        for feature in geojson['features']:
            coords = feature['geometry']['coordinates']

            # GeoJSON uses [lon, lat] order
            lon, lat = coords

            # Baltimore area bounds check
            assert -77.5 <= lon <= -76.0
            assert 38.5 <= lat <= 39.5

    def test_geojson_category_filter(self):
        """Test filtering GeoJSON by category."""
        geojson = get_infrastructure_geojson(category='port_terminals')

        for feature in geojson['features']:
            assert feature['properties']['category'] == 'port_terminals'


class TestEventCorrelation:
    """Test correlating events with infrastructure."""

    def test_correlate_vessel_with_terminal(self):
        """Test correlating vessel arrival with terminal."""
        monitor = InfrastructureMonitor()

        vessel_event = {
            'type': 'vessel_arrival',
            'vessel_type': 'container',
            'destination': 'Seagirt Marine Terminal'
        }

        matched = monitor.correlate_event(vessel_event)

        assert matched is not None
        assert any('seagirt' in str(a).lower() for a in matched)

    def test_correlate_rail_event(self):
        """Test correlating rail event with infrastructure."""
        monitor = InfrastructureMonitor()

        rail_event = {
            'type': 'rail_delay',
            'location': 'Howard Street Tunnel',
            'carrier': 'CSX'
        }

        matched = monitor.correlate_event(rail_event)

        assert matched is not None

    def test_no_correlation_found(self):
        """Test handling events with no infrastructure match."""
        monitor = InfrastructureMonitor()

        unrelated_event = {
            'type': 'weather',
            'location': 'Unknown Location XYZ'
        }

        matched = monitor.correlate_event(unrelated_event)

        # Should return empty or None for unmatched events
        assert matched is None or len(matched) == 0
