#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Historical Analysis Module for Baltimore Port Intelligence

Leverages Google-News-Scraper archives for:
- 6 months of historical threat intelligence
- Trend analysis over time
- Entity correlation across time periods
- Pattern detection for emerging threats

Data Source: https://github.com/arandomguyhere/Google-News-Scraper/tree/main/archives
"""

import json
import requests
from datetime import datetime, timedelta
from typing import Dict, List, Optional, Tuple
from collections import defaultdict
from dataclasses import dataclass
import logging

logger = logging.getLogger('watcher.baltimore_intel.historical')

# GitHub raw content URLs
GITHUB_RAW_BASE = "https://raw.githubusercontent.com/arandomguyhere/Google-News-Scraper/main"
FEED_URL = f"{GITHUB_RAW_BASE}/docs/feed.json"
ARCHIVE_INDEX_URL = f"{GITHUB_RAW_BASE}/archives/archive_index.txt"


@dataclass
class HistoricalSnapshot:
    """A single point-in-time news snapshot."""
    timestamp: datetime
    total_stories: int
    clusters: List[Dict]
    connections: Dict[str, List[Dict]]
    timeline: List[Dict]
    early_signals: List[Dict]


@dataclass
class TrendPoint:
    """A data point for trend analysis."""
    date: datetime
    entity: str
    entity_type: str
    mention_count: int
    confidence_avg: float


class NewsScraperAdapter:
    """
    Adapter to use Google-News-Scraper as Watcher's intelligence source.

    This replaces Watcher's RSS feed approach with the richer
    clustered, entity-extracted data from the scraper.
    """

    def __init__(self, github_token: Optional[str] = None):
        self.session = requests.Session()
        if github_token:
            self.session.headers['Authorization'] = f'token {github_token}'
        self.session.headers['User-Agent'] = 'Baltimore-Intel/1.0'

        self._cache = {}
        self._cache_time = {}

    def get_current_feed(self) -> Optional[Dict]:
        """Fetch the current feed.json with clustering and entities."""
        try:
            response = self.session.get(FEED_URL, timeout=30)
            if response.status_code == 200:
                return response.json()
            else:
                logger.error(f"Failed to fetch feed: {response.status_code}")
                return None
        except Exception as e:
            logger.error(f"Error fetching feed: {e}")
            return None

    def get_archive_list(self) -> List[str]:
        """Get list of available archive timestamps."""
        try:
            response = self.session.get(ARCHIVE_INDEX_URL, timeout=30)
            if response.status_code == 200:
                return [line.strip() for line in response.text.split('\n') if line.strip()]
            return []
        except Exception as e:
            logger.error(f"Error fetching archive index: {e}")
            return []

    def get_archive_snapshot(self, timestamp: str) -> Optional[Dict]:
        """
        Fetch a specific archive snapshot.

        Args:
            timestamp: Archive timestamp in YYYYMMDD_HHMMSS format
        """
        cache_key = f"archive_{timestamp}"

        # Check cache (1 hour TTL for archives since they don't change)
        if cache_key in self._cache:
            return self._cache[cache_key]

        try:
            url = f"{GITHUB_RAW_BASE}/archives/{timestamp}/feed.json"
            response = self.session.get(url, timeout=30)

            if response.status_code == 200:
                data = response.json()
                self._cache[cache_key] = data
                return data
            else:
                logger.warning(f"Archive {timestamp} not found: {response.status_code}")
                return None

        except Exception as e:
            logger.error(f"Error fetching archive {timestamp}: {e}")
            return None

    def parse_archive_timestamp(self, ts: str) -> datetime:
        """Parse archive timestamp to datetime."""
        return datetime.strptime(ts, "%Y%m%d_%H%M%S")

    def get_archives_in_range(
        self,
        start_date: datetime,
        end_date: datetime
    ) -> List[Tuple[str, Dict]]:
        """Get all archives within a date range."""
        archives = self.get_archive_list()
        results = []

        for ts in archives:
            try:
                archive_dt = self.parse_archive_timestamp(ts)
                if start_date <= archive_dt <= end_date:
                    data = self.get_archive_snapshot(ts)
                    if data:
                        results.append((ts, data))
            except ValueError:
                continue

        return sorted(results, key=lambda x: x[0])


class HistoricalAnalyzer:
    """
    Analyze historical data from Google-News-Scraper archives.

    Provides:
    - Entity trending over time
    - Threat actor activity patterns
    - Sector-specific threat evolution
    - Geographic threat distribution changes
    - Correlation with Baltimore port events
    """

    def __init__(self):
        self.adapter = NewsScraperAdapter()

    def extract_entities_from_snapshot(self, data: Dict) -> Dict[str, List[Dict]]:
        """Extract all entities from a snapshot."""
        return data.get('connections', {})

    def analyze_entity_trends(
        self,
        entity_type: str,
        days: int = 30,
        top_n: int = 10
    ) -> Dict:
        """
        Analyze trending entities over time.

        Args:
            entity_type: Type of entity (countries, sectors, threat_actors, etc.)
            days: Number of days to analyze
            top_n: Number of top entities to track
        """
        end_date = datetime.now()
        start_date = end_date - timedelta(days=days)

        archives = self.adapter.get_archives_in_range(start_date, end_date)

        # Aggregate entity mentions by date
        daily_counts = defaultdict(lambda: defaultdict(int))

        for ts, data in archives:
            date = self.adapter.parse_archive_timestamp(ts).date()
            connections = self.extract_entities_from_snapshot(data)

            if entity_type in connections:
                for entity_data in connections[entity_type]:
                    entity_name = entity_data.get('name', entity_data.get('entity', 'unknown'))
                    count = entity_data.get('count', entity_data.get('mentions', 1))
                    daily_counts[date][entity_name] += count

        # Calculate trends
        all_entities = set()
        for date_counts in daily_counts.values():
            all_entities.update(date_counts.keys())

        # Get top entities by total mentions
        total_mentions = defaultdict(int)
        for date_counts in daily_counts.values():
            for entity, count in date_counts.items():
                total_mentions[entity] += count

        top_entities = sorted(
            total_mentions.items(),
            key=lambda x: x[1],
            reverse=True
        )[:top_n]

        # Build trend data
        trends = {}
        dates = sorted(daily_counts.keys())

        for entity, total in top_entities:
            trends[entity] = {
                'total_mentions': total,
                'daily_data': [
                    {
                        'date': str(date),
                        'count': daily_counts[date].get(entity, 0)
                    }
                    for date in dates
                ],
                'trend_direction': self._calculate_trend_direction(
                    [daily_counts[date].get(entity, 0) for date in dates]
                )
            }

        return {
            'entity_type': entity_type,
            'period_days': days,
            'start_date': str(start_date.date()),
            'end_date': str(end_date.date()),
            'snapshots_analyzed': len(archives),
            'trends': trends
        }

    def _calculate_trend_direction(self, values: List[int]) -> str:
        """Calculate if trend is rising, falling, or stable."""
        if len(values) < 2:
            return 'insufficient_data'

        # Compare first half to second half
        mid = len(values) // 2
        first_half_avg = sum(values[:mid]) / max(mid, 1)
        second_half_avg = sum(values[mid:]) / max(len(values) - mid, 1)

        if second_half_avg > first_half_avg * 1.2:
            return 'rising'
        elif second_half_avg < first_half_avg * 0.8:
            return 'falling'
        else:
            return 'stable'

    def find_threat_actor_patterns(self, days: int = 90) -> Dict:
        """
        Analyze threat actor activity patterns.

        Identifies:
        - Most active threat actors
        - Activity spikes
        - Targeted sectors
        """
        end_date = datetime.now()
        start_date = end_date - timedelta(days=days)

        archives = self.adapter.get_archives_in_range(start_date, end_date)

        actor_data = defaultdict(lambda: {
            'mentions': [],
            'dates': [],
            'related_sectors': set(),
            'related_countries': set()
        })

        for ts, data in archives:
            date = self.adapter.parse_archive_timestamp(ts)
            connections = self.extract_entities_from_snapshot(data)

            # Get threat actors from this snapshot
            threat_actors = connections.get('threat_actors', [])
            sectors = {s.get('name', '') for s in connections.get('sectors', [])}
            countries = {c.get('name', '') for c in connections.get('countries', [])}

            for actor in threat_actors:
                name = actor.get('name', actor.get('entity', 'unknown'))
                count = actor.get('count', actor.get('mentions', 1))

                actor_data[name]['mentions'].append(count)
                actor_data[name]['dates'].append(date)
                actor_data[name]['related_sectors'].update(sectors)
                actor_data[name]['related_countries'].update(countries)

        # Analyze patterns
        patterns = {}
        for actor, data in actor_data.items():
            total_mentions = sum(data['mentions'])
            if total_mentions < 3:  # Filter noise
                continue

            patterns[actor] = {
                'total_mentions': total_mentions,
                'first_seen': min(data['dates']).isoformat() if data['dates'] else None,
                'last_seen': max(data['dates']).isoformat() if data['dates'] else None,
                'activity_trend': self._calculate_trend_direction(data['mentions']),
                'related_sectors': list(data['related_sectors'])[:5],
                'related_countries': list(data['related_countries'])[:5],
                'spike_detected': max(data['mentions']) > sum(data['mentions']) / len(data['mentions']) * 2
            }

        return {
            'period_days': days,
            'actors_analyzed': len(patterns),
            'patterns': dict(sorted(
                patterns.items(),
                key=lambda x: x[1]['total_mentions'],
                reverse=True
            )[:20])
        }

    def correlate_with_baltimore(
        self,
        baltimore_events: List[Dict],
        days: int = 30
    ) -> Dict:
        """
        Correlate global threat intelligence with Baltimore port events.

        Args:
            baltimore_events: List of Baltimore Intel events
            days: Lookback period
        """
        end_date = datetime.now()
        start_date = end_date - timedelta(days=days)

        archives = self.adapter.get_archives_in_range(start_date, end_date)

        # Baltimore-relevant keywords
        baltimore_keywords = {
            'port', 'maritime', 'shipping', 'vessel', 'cargo',
            'baltimore', 'chesapeake', 'maryland',
            'rail', 'freight', 'coal', 'lng', 'automobile',
            'infrastructure', 'scada', 'ics', 'critical'
        }

        correlations = []

        for ts, data in archives:
            snapshot_date = self.adapter.parse_archive_timestamp(ts)

            # Check clusters for Baltimore-relevant content
            for cluster in data.get('clusters', []):
                cluster_text = json.dumps(cluster).lower()

                matches = [kw for kw in baltimore_keywords if kw in cluster_text]

                if matches:
                    correlations.append({
                        'date': snapshot_date.isoformat(),
                        'cluster_size': cluster.get('size', 1),
                        'confidence': cluster.get('confidence', 0),
                        'keywords_matched': matches,
                        'shared_dimensions': cluster.get('shared_dimensions', []),
                        'stories': cluster.get('stories', [])[:3]  # First 3 stories
                    })

        return {
            'period_days': days,
            'baltimore_relevant_clusters': len(correlations),
            'correlations': sorted(
                correlations,
                key=lambda x: x['confidence'],
                reverse=True
            )[:20]
        }

    def generate_historical_report(self, days: int = 30) -> Dict:
        """Generate comprehensive historical analysis report."""
        return {
            'generated_at': datetime.now().isoformat(),
            'period_days': days,
            'country_trends': self.analyze_entity_trends('countries', days, 10),
            'sector_trends': self.analyze_entity_trends('sectors', days, 10),
            'threat_actor_patterns': self.find_threat_actor_patterns(days),
            'baltimore_correlations': self.correlate_with_baltimore([], days)
        }


class WatcherFeedReplacement:
    """
    Drop-in replacement for Watcher's RSS feed system.

    This adapter makes Google-News-Scraper data compatible with
    Watcher's threats_watcher module.
    """

    def __init__(self):
        self.adapter = NewsScraperAdapter()

    def get_trendy_words(self) -> List[Dict]:
        """
        Convert scraper entities to Watcher's TrendyWord format.

        Maps:
        - scraper connections → TrendyWord.name
        - scraper confidence → TrendyWord.score
        - scraper stories → TrendyWord.posturls
        """
        feed = self.adapter.get_current_feed()
        if not feed:
            return []

        trendy_words = []

        # Extract from connections (entities)
        connections = feed.get('connections', {})

        for entity_type, entities in connections.items():
            for entity in entities:
                name = entity.get('name', entity.get('entity', ''))
                count = entity.get('count', entity.get('mentions', 1))

                if count >= 3:  # Minimum threshold
                    trendy_words.append({
                        'name': name,
                        'occurrences': count,
                        'score': min(count / 10 * 100, 100),  # Normalize to 0-100
                        'entity_type': entity_type,
                        'source': 'google_news_scraper'
                    })

        # Sort by occurrences
        return sorted(trendy_words, key=lambda x: x['occurrences'], reverse=True)

    def get_posts(self) -> List[Dict]:
        """
        Convert scraper timeline to Watcher's PostUrl format.
        """
        feed = self.adapter.get_current_feed()
        if not feed:
            return []

        posts = []

        for item in feed.get('timeline', []):
            posts.append({
                'url': item.get('url', ''),
                'title': item.get('title', ''),
                'source': item.get('source', ''),
                'published_at': item.get('date', item.get('published', '')),
                'entities': item.get('entities', [])
            })

        return posts

    def get_high_confidence_clusters(self, min_confidence: float = 0.4) -> List[Dict]:
        """
        Get high-confidence story clusters for breaking news detection.

        This replaces Watcher's occurrence threshold with
        confidence-based cluster detection.
        """
        feed = self.adapter.get_current_feed()
        if not feed:
            return []

        clusters = feed.get('clusters', [])

        high_confidence = [
            c for c in clusters
            if c.get('confidence', 0) >= min_confidence
        ]

        return sorted(
            high_confidence,
            key=lambda x: x.get('confidence', 0),
            reverse=True
        )


# Convenience function for Watcher integration
def get_scraper_as_watcher_source() -> WatcherFeedReplacement:
    """Get the scraper adapter configured for Watcher."""
    return WatcherFeedReplacement()


if __name__ == "__main__":
    # Demo historical analysis
    analyzer = HistoricalAnalyzer()

    print("=" * 70)
    print("HISTORICAL THREAT INTELLIGENCE ANALYSIS")
    print("=" * 70)

    print("\n📊 Fetching current feed...")
    adapter = NewsScraperAdapter()
    feed = adapter.get_current_feed()

    if feed:
        summary = feed.get('summary', {})
        print(f"  Total stories: {summary.get('total_stories', 'N/A')}")
        print(f"  Clusters: {summary.get('clusters', 'N/A')}")
        print(f"  High confidence: {summary.get('high_confidence_clusters', 'N/A')}")

        connections = feed.get('connections', {})
        print(f"\n  Entity types: {list(connections.keys())}")

        # Show top countries
        countries = connections.get('countries', [])
        print(f"\n  Top countries:")
        for c in countries[:5]:
            print(f"    • {c.get('name', 'Unknown')}: {c.get('count', 0)} mentions")

    print("\n" + "=" * 70)
    print("Testing Watcher replacement adapter...")
    print("=" * 70)

    replacement = WatcherFeedReplacement()
    trendy = replacement.get_trendy_words()

    print(f"\nTrendy words (top 10):")
    for word in trendy[:10]:
        print(f"  • {word['name']}: {word['occurrences']} ({word['entity_type']})")

    print(f"\nHigh confidence clusters:")
    clusters = replacement.get_high_confidence_clusters(0.4)
    for cluster in clusters[:5]:
        print(f"  • Confidence {cluster.get('confidence', 0):.2f}: {cluster.get('shared_dimensions', [])}")
