#!/usr/bin/env python3
"""
Pytest configuration and fixtures for baltimore_intel tests.
"""

import pytest
import sys
import os
from unittest.mock import MagicMock

# Add parent directory to path for imports
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))


@pytest.fixture
def sample_feed_data():
    """Sample Google-News-Scraper feed data."""
    return {
        "summary": {
            "total_stories": 50,
            "clusters": 12,
            "high_confidence_clusters": 5
        },
        "clusters": [
            {
                "size": 4,
                "confidence": 0.85,
                "shared_dimensions": ["China", "cyber", "infrastructure"],
                "stories": []
            }
        ],
        "connections": {
            "countries": [
                {"name": "China", "count": 15},
                {"name": "Russia", "count": 12}
            ],
            "sectors": [
                {"name": "Critical Infrastructure", "count": 10}
            ],
            "threat_actors": [
                {"name": "APT41", "count": 6}
            ]
        },
        "timeline": [],
        "early_signals": []
    }


@pytest.fixture
def sample_vessel():
    """Sample AIS vessel data."""
    return {
        "mmsi": "123456789",
        "name": "MSC DIANA",
        "type": "container",
        "destination": "BALTIMORE",
        "lat": 39.2667,
        "lon": -76.5833,
        "speed": 12.5,
        "heading": 270
    }


@pytest.fixture
def sample_scanner_transcript():
    """Sample scanner transcript."""
    return "CSX Q123 cleared Bayview with 95 cars, coal loads to Curtis Bay"


@pytest.fixture
def mock_requests():
    """Mock requests library."""
    with pytest.mock.patch('requests.get') as mock_get:
        mock_response = MagicMock()
        mock_response.status_code = 200
        mock_response.json.return_value = {}
        mock_get.return_value = mock_response
        yield mock_get


@pytest.fixture
def intelligence_hub():
    """Create a fresh IntelligenceHub instance."""
    from intelligence_hub import IntelligenceHub
    return IntelligenceHub()


@pytest.fixture
def infrastructure_monitor():
    """Create a fresh InfrastructureMonitor instance."""
    from critical_infrastructure import InfrastructureMonitor
    return InfrastructureMonitor()


@pytest.fixture
def commodity_tracker():
    """Create a fresh CommodityTracker instance."""
    from commodities import CommodityTracker
    return CommodityTracker()


@pytest.fixture
def rail_tracker():
    """Create a fresh RailTracker instance."""
    from rail_tracking import RailTracker
    return RailTracker()


# Test markers
def pytest_configure(config):
    """Configure custom pytest markers."""
    config.addinivalue_line(
        "markers", "integration: mark test as integration test"
    )
    config.addinivalue_line(
        "markers", "slow: mark test as slow running"
    )
    config.addinivalue_line(
        "markers", "network: mark test as requiring network access"
    )
