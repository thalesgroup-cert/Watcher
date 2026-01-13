#!/usr/bin/env python3
"""
Tests for the Historical Analysis module.

Tests the Google-News-Scraper integration and historical trend analysis.
"""

import pytest
from unittest.mock import patch, MagicMock
from datetime import datetime, timedelta
import json

from historical_analysis import (
    NewsScraperAdapter,
    HistoricalAnalyzer,
    WatcherFeedReplacement,
    HistoricalSnapshot,
    TrendPoint,
    GITHUB_RAW_BASE,
    FEED_URL,
    ARCHIVE_INDEX_URL
)


# Sample test data matching Google-News-Scraper format
SAMPLE_FEED = {
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
            "stories": [
                {"title": "China-linked hackers target US infrastructure", "url": "https://example.com/1"},
                {"title": "Critical infrastructure attacks rise", "url": "https://example.com/2"}
            ]
        },
        {
            "size": 2,
            "confidence": 0.45,
            "shared_dimensions": ["ransomware", "healthcare"],
            "stories": [
                {"title": "Hospital hit by ransomware", "url": "https://example.com/3"}
            ]
        },
        {
            "size": 3,
            "confidence": 0.72,
            "shared_dimensions": ["port", "maritime", "baltimore"],
            "stories": [
                {"title": "Baltimore port operations update", "url": "https://example.com/4"}
            ]
        }
    ],
    "connections": {
        "countries": [
            {"name": "China", "count": 15},
            {"name": "Russia", "count": 12},
            {"name": "United States", "count": 8}
        ],
        "sectors": [
            {"name": "Critical Infrastructure", "count": 10},
            {"name": "Healthcare", "count": 7},
            {"name": "Maritime", "count": 5}
        ],
        "threat_actors": [
            {"name": "APT41", "count": 6},
            {"name": "Lazarus Group", "count": 4}
        ]
    },
    "timeline": [
        {
            "title": "Major cyber attack reported",
            "url": "https://example.com/timeline/1",
            "source": "SecurityWeek",
            "date": "2025-01-13T10:00:00Z",
            "entities": ["China", "APT41"]
        }
    ],
    "early_signals": [
        {"signal": "Rising tension", "confidence": 0.6}
    ]
}

SAMPLE_ARCHIVE_INDEX = """20250101_120000
20250108_120000
20250115_120000"""


class TestNewsScraperAdapter:
    """Test the NewsScraperAdapter class."""

    def test_init_without_token(self):
        """Test adapter initialization without GitHub token."""
        adapter = NewsScraperAdapter()
        assert adapter.session is not None
        assert 'Authorization' not in adapter.session.headers
        assert adapter.session.headers['User-Agent'] == 'Baltimore-Intel/1.0'

    def test_init_with_token(self):
        """Test adapter initialization with GitHub token."""
        adapter = NewsScraperAdapter(github_token="test_token")
        assert adapter.session.headers['Authorization'] == 'token test_token'

    @patch('historical_analysis.requests.Session')
    def test_get_current_feed_success(self, mock_session_class):
        """Test successful feed fetch."""
        mock_session = MagicMock()
        mock_response = MagicMock()
        mock_response.status_code = 200
        mock_response.json.return_value = SAMPLE_FEED
        mock_session.get.return_value = mock_response
        mock_session_class.return_value = mock_session

        adapter = NewsScraperAdapter()
        adapter.session = mock_session

        result = adapter.get_current_feed()

        assert result is not None
        assert result['summary']['total_stories'] == 50
        mock_session.get.assert_called_once_with(FEED_URL, timeout=30)

    @patch('historical_analysis.requests.Session')
    def test_get_current_feed_failure(self, mock_session_class):
        """Test feed fetch failure."""
        mock_session = MagicMock()
        mock_response = MagicMock()
        mock_response.status_code = 404
        mock_session.get.return_value = mock_response
        mock_session_class.return_value = mock_session

        adapter = NewsScraperAdapter()
        adapter.session = mock_session

        result = adapter.get_current_feed()

        assert result is None

    @patch('historical_analysis.requests.Session')
    def test_get_archive_list(self, mock_session_class):
        """Test archive list fetching."""
        mock_session = MagicMock()
        mock_response = MagicMock()
        mock_response.status_code = 200
        mock_response.text = SAMPLE_ARCHIVE_INDEX
        mock_session.get.return_value = mock_response
        mock_session_class.return_value = mock_session

        adapter = NewsScraperAdapter()
        adapter.session = mock_session

        result = adapter.get_archive_list()

        assert len(result) == 3
        assert '20250101_120000' in result
        assert '20250108_120000' in result

    def test_parse_archive_timestamp(self):
        """Test timestamp parsing."""
        adapter = NewsScraperAdapter()

        result = adapter.parse_archive_timestamp("20250113_153045")

        assert result.year == 2025
        assert result.month == 1
        assert result.day == 13
        assert result.hour == 15
        assert result.minute == 30
        assert result.second == 45

    @patch('historical_analysis.requests.Session')
    def test_get_archive_snapshot_caching(self, mock_session_class):
        """Test that archive snapshots are cached."""
        mock_session = MagicMock()
        mock_response = MagicMock()
        mock_response.status_code = 200
        mock_response.json.return_value = SAMPLE_FEED
        mock_session.get.return_value = mock_response
        mock_session_class.return_value = mock_session

        adapter = NewsScraperAdapter()
        adapter.session = mock_session

        # First call
        result1 = adapter.get_archive_snapshot("20250101_120000")
        # Second call should use cache
        result2 = adapter.get_archive_snapshot("20250101_120000")

        assert result1 == result2
        # Should only have been called once due to caching
        assert mock_session.get.call_count == 1


class TestHistoricalAnalyzer:
    """Test the HistoricalAnalyzer class."""

    def test_extract_entities_from_snapshot(self):
        """Test entity extraction from snapshot data."""
        analyzer = HistoricalAnalyzer()

        result = analyzer.extract_entities_from_snapshot(SAMPLE_FEED)

        assert 'countries' in result
        assert 'sectors' in result
        assert 'threat_actors' in result
        assert len(result['countries']) == 3

    def test_calculate_trend_direction_rising(self):
        """Test rising trend detection."""
        analyzer = HistoricalAnalyzer()

        values = [1, 2, 3, 5, 8, 12, 15, 20]
        result = analyzer._calculate_trend_direction(values)

        assert result == 'rising'

    def test_calculate_trend_direction_falling(self):
        """Test falling trend detection."""
        analyzer = HistoricalAnalyzer()

        values = [20, 18, 15, 12, 8, 5, 3, 2]
        result = analyzer._calculate_trend_direction(values)

        assert result == 'falling'

    def test_calculate_trend_direction_stable(self):
        """Test stable trend detection."""
        analyzer = HistoricalAnalyzer()

        values = [10, 11, 9, 10, 11, 10, 9, 10]
        result = analyzer._calculate_trend_direction(values)

        assert result == 'stable'

    def test_calculate_trend_direction_insufficient_data(self):
        """Test insufficient data handling."""
        analyzer = HistoricalAnalyzer()

        result = analyzer._calculate_trend_direction([5])

        assert result == 'insufficient_data'

    @patch.object(NewsScraperAdapter, 'get_archives_in_range')
    def test_analyze_entity_trends(self, mock_get_archives):
        """Test entity trend analysis."""
        mock_get_archives.return_value = [
            ("20250101_120000", SAMPLE_FEED),
            ("20250108_120000", SAMPLE_FEED)
        ]

        analyzer = HistoricalAnalyzer()
        result = analyzer.analyze_entity_trends('countries', days=30, top_n=5)

        assert result['entity_type'] == 'countries'
        assert result['period_days'] == 30
        assert 'trends' in result
        assert result['snapshots_analyzed'] == 2

    @patch.object(NewsScraperAdapter, 'get_archives_in_range')
    def test_find_threat_actor_patterns(self, mock_get_archives):
        """Test threat actor pattern detection."""
        mock_get_archives.return_value = [
            ("20250101_120000", SAMPLE_FEED),
            ("20250108_120000", SAMPLE_FEED),
            ("20250115_120000", SAMPLE_FEED)
        ]

        analyzer = HistoricalAnalyzer()
        result = analyzer.find_threat_actor_patterns(days=90)

        assert 'patterns' in result
        assert 'period_days' in result
        assert result['period_days'] == 90

    @patch.object(NewsScraperAdapter, 'get_archives_in_range')
    def test_correlate_with_baltimore(self, mock_get_archives):
        """Test Baltimore correlation detection."""
        mock_get_archives.return_value = [
            ("20250101_120000", SAMPLE_FEED)
        ]

        analyzer = HistoricalAnalyzer()
        result = analyzer.correlate_with_baltimore([], days=30)

        assert 'baltimore_relevant_clusters' in result
        assert result['baltimore_relevant_clusters'] >= 1  # Should find the port/maritime cluster


class TestWatcherFeedReplacement:
    """Test the WatcherFeedReplacement adapter."""

    @patch.object(NewsScraperAdapter, 'get_current_feed')
    def test_get_trendy_words(self, mock_get_feed):
        """Test conversion to Watcher TrendyWord format."""
        mock_get_feed.return_value = SAMPLE_FEED

        replacement = WatcherFeedReplacement()
        result = replacement.get_trendy_words()

        assert len(result) > 0
        # Check structure matches Watcher format
        first = result[0]
        assert 'name' in first
        assert 'occurrences' in first
        assert 'score' in first
        assert 'entity_type' in first
        assert first['source'] == 'google_news_scraper'

    @patch.object(NewsScraperAdapter, 'get_current_feed')
    def test_get_trendy_words_threshold(self, mock_get_feed):
        """Test that low-count entities are filtered."""
        mock_get_feed.return_value = {
            "connections": {
                "countries": [
                    {"name": "LowCount", "count": 1},
                    {"name": "HighCount", "count": 10}
                ]
            }
        }

        replacement = WatcherFeedReplacement()
        result = replacement.get_trendy_words()

        names = [r['name'] for r in result]
        assert 'LowCount' not in names  # Filtered (count < 3)
        assert 'HighCount' in names

    @patch.object(NewsScraperAdapter, 'get_current_feed')
    def test_get_posts(self, mock_get_feed):
        """Test conversion to Watcher PostUrl format."""
        mock_get_feed.return_value = SAMPLE_FEED

        replacement = WatcherFeedReplacement()
        result = replacement.get_posts()

        assert len(result) == 1
        first = result[0]
        assert 'url' in first
        assert 'title' in first
        assert 'source' in first
        assert 'published_at' in first

    @patch.object(NewsScraperAdapter, 'get_current_feed')
    def test_get_high_confidence_clusters(self, mock_get_feed):
        """Test high confidence cluster filtering."""
        mock_get_feed.return_value = SAMPLE_FEED

        replacement = WatcherFeedReplacement()
        result = replacement.get_high_confidence_clusters(min_confidence=0.5)

        # Should only include clusters with confidence >= 0.5
        assert len(result) == 2  # 0.85 and 0.72 clusters
        for cluster in result:
            assert cluster['confidence'] >= 0.5

    @patch.object(NewsScraperAdapter, 'get_current_feed')
    def test_get_high_confidence_clusters_sorted(self, mock_get_feed):
        """Test that clusters are sorted by confidence descending."""
        mock_get_feed.return_value = SAMPLE_FEED

        replacement = WatcherFeedReplacement()
        result = replacement.get_high_confidence_clusters(min_confidence=0.4)

        confidences = [c['confidence'] for c in result]
        assert confidences == sorted(confidences, reverse=True)


class TestDataclasses:
    """Test dataclass definitions."""

    def test_historical_snapshot(self):
        """Test HistoricalSnapshot dataclass."""
        snapshot = HistoricalSnapshot(
            timestamp=datetime.now(),
            total_stories=50,
            clusters=[],
            connections={},
            timeline=[],
            early_signals=[]
        )
        assert snapshot.total_stories == 50

    def test_trend_point(self):
        """Test TrendPoint dataclass."""
        point = TrendPoint(
            date=datetime.now(),
            entity="China",
            entity_type="countries",
            mention_count=15,
            confidence_avg=0.85
        )
        assert point.entity == "China"
        assert point.mention_count == 15


class TestIntegrationWithWatcher:
    """Test integration points with Watcher's threats_watcher module."""

    @patch.object(NewsScraperAdapter, 'get_current_feed')
    def test_trendy_word_score_normalization(self, mock_get_feed):
        """Test that scores are normalized to 0-100 range like Watcher expects."""
        mock_get_feed.return_value = {
            "connections": {
                "countries": [
                    {"name": "HighMentions", "count": 100},
                    {"name": "MedMentions", "count": 5}
                ]
            }
        }

        replacement = WatcherFeedReplacement()
        result = replacement.get_trendy_words()

        for word in result:
            assert 0 <= word['score'] <= 100

    @patch.object(NewsScraperAdapter, 'get_current_feed')
    def test_empty_feed_handling(self, mock_get_feed):
        """Test graceful handling of empty/null feed."""
        mock_get_feed.return_value = None

        replacement = WatcherFeedReplacement()

        assert replacement.get_trendy_words() == []
        assert replacement.get_posts() == []
        assert replacement.get_high_confidence_clusters() == []
