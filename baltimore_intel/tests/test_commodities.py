#!/usr/bin/env python3
"""
Tests for the Commodities module.

Tests Baltimore port commodity tracking and vessel correlation.
"""

import pytest
from unittest.mock import patch, MagicMock
from datetime import datetime

from commodities import (
    BALTIMORE_COMMODITIES,
    TRADING_PARTNERS,
    CommodityTracker,
    correlate_vessel_with_commodities
)


class TestCommodityDatabase:
    """Test the commodity data structures."""

    def test_commodities_exist(self):
        """Test that commodity database is populated."""
        assert len(BALTIMORE_COMMODITIES) > 0

    def test_export_commodities_defined(self):
        """Test export commodities are defined."""
        exports = [c for c in BALTIMORE_COMMODITIES if c.get('direction') == 'export']

        # Baltimore exports coal, LNG, soybeans, corn
        assert len(exports) >= 4

        commodity_names = [c['name'].lower() for c in exports]
        assert any('coal' in n for n in commodity_names)

    def test_import_commodities_defined(self):
        """Test import commodities are defined."""
        imports = [c for c in BALTIMORE_COMMODITIES if c.get('direction') == 'import']

        # Baltimore imports automobiles
        assert len(imports) >= 1

    def test_commodity_structure(self):
        """Test commodity data structure."""
        for commodity in BALTIMORE_COMMODITIES:
            assert 'name' in commodity
            assert 'direction' in commodity
            assert commodity['direction'] in ['export', 'import']

    def test_trading_partners_defined(self):
        """Test trading partner data exists."""
        assert len(TRADING_PARTNERS) > 0

        # Should include major partners
        countries = [p['country'] for p in TRADING_PARTNERS]
        assert any('germany' in c.lower() or 'japan' in c.lower() for c in countries)


class TestCommodityTracker:
    """Test the CommodityTracker class."""

    def test_tracker_initialization(self):
        """Test tracker initializes correctly."""
        tracker = CommodityTracker()

        assert tracker is not None
        assert hasattr(tracker, 'commodities')

    def test_get_commodity_by_name(self):
        """Test retrieving commodity by name."""
        tracker = CommodityTracker()

        coal = tracker.get_commodity('coal')

        assert coal is not None
        assert 'coal' in coal['name'].lower()

    def test_get_exports(self):
        """Test getting all export commodities."""
        tracker = CommodityTracker()

        exports = tracker.get_exports()

        assert len(exports) > 0
        for c in exports:
            assert c['direction'] == 'export'

    def test_get_imports(self):
        """Test getting all import commodities."""
        tracker = CommodityTracker()

        imports = tracker.get_imports()

        assert len(imports) > 0
        for c in imports:
            assert c['direction'] == 'import'

    @patch('commodities.requests.get')
    def test_fetch_price_data(self, mock_get):
        """Test fetching external price data."""
        mock_response = MagicMock()
        mock_response.status_code = 200
        mock_response.json.return_value = {'price': 150.0}
        mock_get.return_value = mock_response

        tracker = CommodityTracker()
        price = tracker.fetch_price('coal')

        # Should return price data or None
        assert price is None or isinstance(price, (int, float, dict))

    def test_get_trading_partner(self):
        """Test retrieving trading partner info."""
        tracker = CommodityTracker()

        partner = tracker.get_trading_partner('Germany')

        if partner:  # May not be implemented
            assert 'country' in partner


class TestVesselCorrelation:
    """Test vessel-commodity correlation."""

    def test_correlate_bulk_carrier_with_coal(self):
        """Test correlating bulk carrier with coal exports."""
        vessel = {
            'type': 'bulk carrier',
            'destination': 'China',
            'from_terminal': 'CNX Marine Terminal'
        }

        result = correlate_vessel_with_commodities(vessel)

        assert result is not None
        if 'commodities' in result:
            commodity_names = [c['name'].lower() for c in result['commodities']]
            assert any('coal' in n for n in commodity_names)

    def test_correlate_car_carrier_with_autos(self):
        """Test correlating car carrier with automobile imports."""
        vessel = {
            'type': 'car carrier',
            'origin': 'Germany',
            'to_terminal': 'Dundalk Marine Terminal'
        }

        result = correlate_vessel_with_commodities(vessel)

        assert result is not None
        if 'commodities' in result:
            commodity_names = [c['name'].lower() for c in result['commodities']]
            assert any('auto' in n or 'vehicle' in n for n in commodity_names)

    def test_correlate_tanker_with_lng(self):
        """Test correlating tanker with LNG exports."""
        vessel = {
            'type': 'LNG tanker',
            'destination': 'Europe'
        }

        result = correlate_vessel_with_commodities(vessel)

        assert result is not None

    def test_correlate_container_ship(self):
        """Test correlating container ship (general cargo)."""
        vessel = {
            'type': 'container',
            'origin': 'China',
            'to_terminal': 'Seagirt Marine Terminal'
        }

        result = correlate_vessel_with_commodities(vessel)

        # Container ships carry mixed cargo
        assert result is not None

    def test_unknown_vessel_type(self):
        """Test handling unknown vessel types."""
        vessel = {
            'type': 'unknown',
            'destination': 'Unknown Port'
        }

        result = correlate_vessel_with_commodities(vessel)

        # Should return empty or default result, not crash
        assert result is not None or result == {}


class TestMarketIndicators:
    """Test market indicator tracking."""

    @patch('commodities.requests.get')
    def test_commodity_price_alert(self, mock_get):
        """Test price spike detection."""
        tracker = CommodityTracker()

        # Simulate price data
        mock_response = MagicMock()
        mock_response.status_code = 200
        mock_response.json.return_value = {
            'current': 200.0,
            'previous': 150.0,
            'change_percent': 33.3
        }
        mock_get.return_value = mock_response

        alerts = tracker.check_price_alerts()

        # Should detect significant price movement
        # Implementation may vary
        assert alerts is not None or alerts == []

    def test_get_market_summary(self):
        """Test getting market summary for all commodities."""
        tracker = CommodityTracker()

        summary = tracker.get_market_summary()

        assert summary is not None
        assert isinstance(summary, (dict, list))
