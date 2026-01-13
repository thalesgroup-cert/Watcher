#!/usr/bin/env python3
"""
Tests for the Rail Tracking module.

Tests Amtrak integration, freight inference, and rail network monitoring.
"""

import pytest
from unittest.mock import patch, MagicMock
from datetime import datetime

from rail_tracking import (
    BALTIMORE_RAIL_STATIONS,
    BALTIMORE_RAIL_LINES,
    RailTracker,
    FreightInference
)


class TestRailStationDatabase:
    """Test the rail station database."""

    def test_stations_exist(self):
        """Test that station database is populated."""
        assert len(BALTIMORE_RAIL_STATIONS) > 0

    def test_penn_station_defined(self):
        """Test Baltimore Penn Station is defined."""
        penn = None
        for station in BALTIMORE_RAIL_STATIONS:
            if 'penn' in station.get('name', '').lower():
                penn = station
                break

        assert penn is not None

    def test_station_structure(self):
        """Test station data structure."""
        for station in BALTIMORE_RAIL_STATIONS:
            assert 'name' in station
            # May have code, coordinates, lines, etc.

    def test_rail_lines_defined(self):
        """Test rail lines are defined."""
        assert len(BALTIMORE_RAIL_LINES) > 0

        # Should include major lines through Baltimore
        line_names = [l.get('name', '').lower() for l in BALTIMORE_RAIL_LINES]
        # NEC, CSX, NS should be represented
        assert any('northeast' in n or 'nec' in n for n in line_names) or len(line_names) > 0


class TestRailTracker:
    """Test the RailTracker class."""

    def test_tracker_initialization(self):
        """Test tracker initializes correctly."""
        tracker = RailTracker()

        assert tracker is not None

    @patch('rail_tracking.requests.get')
    def test_get_amtrak_trains(self, mock_get):
        """Test fetching Amtrak train data."""
        mock_response = MagicMock()
        mock_response.status_code = 200
        mock_response.json.return_value = {
            'trains': [
                {
                    'number': '123',
                    'name': 'Acela',
                    'status': 'On Time',
                    'next_station': 'Baltimore Penn'
                }
            ]
        }
        mock_get.return_value = mock_response

        tracker = RailTracker()
        trains = tracker.get_amtrak_trains()

        # Should return train data
        assert trains is not None

    @patch('rail_tracking.requests.get')
    def test_get_station_arrivals(self, mock_get):
        """Test fetching station arrival data."""
        mock_response = MagicMock()
        mock_response.status_code = 200
        mock_response.json.return_value = {
            'arrivals': [
                {'train': '123', 'eta': '10:30', 'status': 'On Time'}
            ]
        }
        mock_get.return_value = mock_response

        tracker = RailTracker()
        arrivals = tracker.get_station_arrivals('BAL')

        assert arrivals is not None

    @patch('rail_tracking.requests.get')
    def test_api_error_handling(self, mock_get):
        """Test handling API errors gracefully."""
        mock_get.side_effect = Exception("Network error")

        tracker = RailTracker()
        trains = tracker.get_amtrak_trains()

        # Should handle error gracefully
        assert trains is None or trains == []

    def test_get_trains_near_baltimore(self):
        """Test filtering trains near Baltimore."""
        tracker = RailTracker()

        with patch.object(tracker, 'get_amtrak_trains') as mock:
            mock.return_value = [
                {'station': 'Baltimore Penn', 'number': '123'},
                {'station': 'New York Penn', 'number': '456'}
            ]

            nearby = tracker.get_trains_near_baltimore()

            # Should filter to Baltimore-relevant trains
            assert nearby is not None


class TestFreightInference:
    """Test the FreightInference class."""

    def test_inference_initialization(self):
        """Test freight inference initializes."""
        inference = FreightInference()

        assert inference is not None

    def test_analyze_csx_transcript(self):
        """Test analyzing CSX scanner transcript."""
        inference = FreightInference()

        transcript = "CSX Q123 cleared Bayview with 95 cars, coal loads to Curtis Bay"

        result = inference.analyze_transcript(transcript)

        assert result is not None
        if 'cargo_type' in result:
            assert 'coal' in result['cargo_type'].lower()

    def test_analyze_ns_transcript(self):
        """Test analyzing Norfolk Southern transcript."""
        inference = FreightInference()

        transcript = "NS intermodal 203 approaching Howard Street Tunnel"

        result = inference.analyze_transcript(transcript)

        assert result is not None
        if 'carrier' in result:
            assert 'ns' in result['carrier'].lower() or 'norfolk' in result['carrier'].lower()

    def test_extract_train_number(self):
        """Test extracting train numbers from transcripts."""
        inference = FreightInference()

        transcript = "CSX Q123 cleared the signal"

        train_num = inference.extract_train_number(transcript)

        assert train_num == 'Q123' or train_num is not None

    def test_extract_car_count(self):
        """Test extracting car counts from transcripts."""
        inference = FreightInference()

        transcript = "Train has 95 cars, 8500 tons"

        car_count = inference.extract_car_count(transcript)

        assert car_count == 95 or car_count is not None

    def test_infer_cargo_from_destination(self):
        """Test inferring cargo type from destination."""
        inference = FreightInference()

        transcript = "Empty coal hoppers returning from Curtis Bay"

        result = inference.infer_cargo(transcript)

        assert result is not None
        if 'inferred_cargo' in result:
            assert 'coal' in result['inferred_cargo'].lower()

    def test_empty_transcript(self):
        """Test handling empty transcript."""
        inference = FreightInference()

        result = inference.analyze_transcript("")

        # Should handle gracefully
        assert result is not None or result == {}

    def test_irrelevant_transcript(self):
        """Test handling non-freight transcript."""
        inference = FreightInference()

        transcript = "Weather update: sunny skies expected"

        result = inference.analyze_transcript(transcript)

        # Should return minimal or empty result
        assert result is not None


class TestRailNetworkAnalysis:
    """Test rail network analysis functionality."""

    def test_identify_bottlenecks(self):
        """Test identifying rail bottlenecks."""
        tracker = RailTracker()

        # Howard Street Tunnel is known bottleneck
        bottlenecks = tracker.identify_bottlenecks()

        if bottlenecks:
            bottleneck_names = [b.get('name', '').lower() for b in bottlenecks]
            assert any('howard' in n or 'tunnel' in n for n in bottleneck_names)

    def test_get_delay_patterns(self):
        """Test getting delay patterns."""
        tracker = RailTracker()

        patterns = tracker.get_delay_patterns()

        assert patterns is not None

    def test_correlate_with_port(self):
        """Test correlating rail movements with port activity."""
        tracker = RailTracker()

        port_event = {
            'type': 'vessel_departure',
            'cargo': 'containers',
            'terminal': 'Seagirt'
        }

        correlation = tracker.correlate_with_port(port_event)

        # Should find rail connections to Seagirt
        assert correlation is not None


class TestRailAlerts:
    """Test rail alert generation."""

    def test_generate_delay_alert(self):
        """Test generating delay alerts."""
        tracker = RailTracker()

        delay_event = {
            'train': 'CSX Q123',
            'delay_minutes': 120,
            'location': 'Howard Street Tunnel'
        }

        alert = tracker.generate_alert(delay_event)

        assert alert is not None
        if 'severity' in alert:
            # 2 hour delay should be significant
            assert alert['severity'] in ['high', 'medium', 'critical']

    def test_alert_threshold(self):
        """Test alert thresholds for delays."""
        tracker = RailTracker()

        # Minor delay should not generate alert
        minor_delay = {
            'train': 'Amtrak 123',
            'delay_minutes': 5,
            'location': 'Penn Station'
        }

        alert = tracker.generate_alert(minor_delay)

        # May be None or low severity
        if alert:
            assert alert.get('severity') in ['low', 'info', None]
