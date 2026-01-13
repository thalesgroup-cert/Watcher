#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Baltimore Scanner Feed Configuration for ScannerTranscribe

Configures Broadcastify feeds relevant to Port of Baltimore operations:
- Maritime/Coast Guard communications
- Rail operations (CSX, Norfolk Southern, Amtrak)
- Port terminal operations
"""

from typing import Dict, List
from dataclasses import dataclass
from enum import Enum

class FeedCategory(Enum):
    MARITIME = "maritime"
    RAIL = "rail"
    PORT_OPS = "port_operations"
    EMERGENCY = "emergency"
    COAST_GUARD = "coast_guard"


@dataclass
class ScannerFeed:
    """Configuration for a Broadcastify scanner feed."""
    feed_id: str
    name: str
    category: FeedCategory
    description: str
    keywords: List[str]  # Keywords to highlight in transcripts
    priority: int  # 1 = highest priority
    broadcastify_url: str = ""

    def __post_init__(self):
        self.broadcastify_url = f"https://www.broadcastify.com/listen/feed/{self.feed_id}"


# Baltimore Port-Relevant Scanner Feeds
BALTIMORE_FEEDS: Dict[str, ScannerFeed] = {
    # ===========================================
    # RAIL FEEDS - Critical for freight tracking
    # ===========================================
    "baltimore_terminal_rail": ScannerFeed(
        feed_id="43356",
        name="Baltimore Terminal Rail",
        category=FeedCategory.RAIL,
        description="Port of Baltimore rail terminal operations",
        priority=1,
        keywords=[
            # Locations
            "seagirt", "dundalk", "fairfield", "locust point", "canton",
            "curtis bay", "sparrows point", "port covington",
            # Operations
            "coal train", "unit train", "intermodal", "container",
            "bulk", "grain", "auto rack", "manifest",
            # Railroads
            "csx", "norfolk southern", "ns", "canton railroad", "pbr",
            # Actions
            "arriving", "departing", "switching", "loading", "unloading",
            "derailment", "delay", "blocked", "emergency"
        ]
    ),

    "baltimore_regional_rail": ScannerFeed(
        feed_id="14954",
        name="Baltimore Area CSX/NS/Amtrak Rail",
        category=FeedCategory.RAIL,
        description="Regional rail traffic - CSX, Norfolk Southern, Amtrak, Canton RR, PBR",
        priority=2,
        keywords=[
            # Train types
            "coal", "grain", "intermodal", "auto train", "manifest",
            "unit train", "local", "yard job",
            # Key locations
            "bayview", "howard street tunnel", "baltimore penn",
            "curtis bay", "sparrows point", "dundalk",
            # Operations
            "mainline", "siding", "yard", "terminal",
            "northbound", "southbound", "eastbound", "westbound",
            # Issues
            "delay", "stopped", "derailment", "signal", "crossing"
        ]
    ),

    # ===========================================
    # MARITIME FEEDS - Ship and port operations
    # ===========================================
    "baltimore_marine": ScannerFeed(
        feed_id="42710",  # Baltimore area marine
        name="Baltimore Marine Traffic",
        category=FeedCategory.MARITIME,
        description="VHF marine radio - ship traffic, port operations",
        priority=1,
        keywords=[
            # Vessel types
            "bulk carrier", "container ship", "tanker", "roro",
            "car carrier", "cargo", "tug", "pilot boat", "barge",
            # Locations
            "seagirt", "dundalk", "fairfield", "key bridge",
            "chesapeake bay", "patapsco", "channel",
            # Operations
            "pilot", "docking", "undocking", "anchorage",
            "inbound", "outbound", "draft", "clearance",
            # Safety
            "coast guard", "mayday", "pan pan", "securite",
            "collision", "grounding", "fire", "man overboard"
        ]
    ),

    "coast_guard_sector_baltimore": ScannerFeed(
        feed_id="31547",  # USCG Sector Baltimore
        name="Coast Guard Sector Baltimore",
        category=FeedCategory.COAST_GUARD,
        description="US Coast Guard Sector Baltimore operations",
        priority=1,
        keywords=[
            # Operations
            "sector baltimore", "station curtis bay", "cutter",
            "patrol", "boarding", "inspection", "sar",
            # Alerts
            "broadcast notice", "security zone", "restricted area",
            "hazmat", "pollution", "oil spill",
            # Vessels
            "vessel of interest", "suspicious", "unidentified",
            "dark target", "ais", "transponder"
        ]
    ),

    # ===========================================
    # PORT OPERATIONS
    # ===========================================
    "maryland_port_admin": ScannerFeed(
        feed_id="33891",  # MPA Operations (if available)
        name="Maryland Port Administration",
        category=FeedCategory.PORT_OPS,
        description="Port of Baltimore terminal operations",
        priority=2,
        keywords=[
            # Terminals
            "seagirt", "dundalk", "fairfield", "south locust point",
            # Operations
            "crane", "gantry", "container", "chassis",
            "gate", "truck", "rail", "berth",
            # Cargo
            "coal", "auto", "roro", "breakbulk", "bulk",
            # Issues
            "congestion", "delay", "weather hold", "security"
        ]
    ),

    # ===========================================
    # EMERGENCY SERVICES (Port area)
    # ===========================================
    "baltimore_fire_marine": ScannerFeed(
        feed_id="5765",  # Baltimore Fire
        name="Baltimore Fire - Marine Division",
        category=FeedCategory.EMERGENCY,
        description="Baltimore Fire Department including marine unit",
        priority=3,
        keywords=[
            # Marine specific
            "marine unit", "fireboat", "pier", "terminal",
            "vessel fire", "hazmat", "water rescue",
            # Locations
            "port", "harbor", "dundalk", "seagirt", "canton",
            # General
            "fire", "rescue", "ems", "hazardous materials"
        ]
    ),
}


# Keyword categories for intelligent transcript analysis
KEYWORD_CATEGORIES = {
    "vessel_arrival": [
        "inbound", "arriving", "approaching", "pilot boarding",
        "entering channel", "eta", "estimated arrival"
    ],
    "vessel_departure": [
        "outbound", "departing", "underway", "pilot disembarking",
        "leaving berth", "sailing"
    ],
    "cargo_operations": [
        "loading", "unloading", "discharge", "crane", "gantry",
        "container", "coal", "auto", "roro", "bulk"
    ],
    "rail_operations": [
        "train", "locomotive", "cars", "switching", "yard",
        "mainline", "siding", "intermodal", "unit train"
    ],
    "safety_emergency": [
        "mayday", "pan pan", "securite", "emergency", "fire",
        "collision", "grounding", "man overboard", "hazmat",
        "derailment", "evacuation"
    ],
    "security": [
        "suspicious", "unauthorized", "security zone", "boarding",
        "inspection", "coast guard", "patrol"
    ],
    "weather_delays": [
        "weather hold", "fog", "wind", "storm", "delay",
        "suspended operations", "visibility"
    ],
    "commodities": [
        "coal", "grain", "soybeans", "automobiles", "cars",
        "containers", "steel", "lumber", "fertilizer", "lng"
    ]
}


# VHF Marine Channels relevant to Baltimore
VHF_CHANNELS = {
    "16": {"name": "Distress/Safety/Calling", "priority": 1},
    "13": {"name": "Bridge-to-Bridge Navigation", "priority": 1},
    "12": {"name": "Port Operations (Baltimore VTS)", "priority": 1},
    "14": {"name": "Port Operations", "priority": 2},
    "22A": {"name": "Coast Guard Liaison", "priority": 1},
    "06": {"name": "Ship-to-Ship Safety", "priority": 2},
    "67": {"name": "Commercial Operations", "priority": 3},
    "68": {"name": "Marina/Commercial", "priority": 3},
}


def get_scanner_config() -> Dict:
    """
    Generate ScannerTranscribe configuration for Baltimore port monitoring.
    """
    feeds_config = []

    for feed_id, feed in BALTIMORE_FEEDS.items():
        feeds_config.append({
            "id": feed.feed_id,
            "name": feed.name,
            "category": feed.category.value,
            "description": feed.description,
            "priority": feed.priority,
            "url": feed.broadcastify_url,
            "keywords": feed.keywords,
            "enabled": feed.priority <= 2  # Auto-enable high priority
        })

    return {
        "region": "Baltimore",
        "port": "Port of Baltimore",
        "feeds": feeds_config,
        "keyword_categories": KEYWORD_CATEGORIES,
        "vhf_channels": VHF_CHANNELS,
        "settings": {
            "transcription_engine": "whisper",  # or "deepgram"
            "whisper_model": "whisper-small.en",
            "highlight_keywords": True,
            "audio_alerts": True,
            "auto_export": True,
            "export_format": "json"
        }
    }


def get_all_keywords() -> List[str]:
    """Get flattened list of all keywords for highlighting."""
    all_keywords = set()
    for feed in BALTIMORE_FEEDS.values():
        all_keywords.update(feed.keywords)
    for category_keywords in KEYWORD_CATEGORIES.values():
        all_keywords.update(category_keywords)
    return sorted(list(all_keywords))


def categorize_transcript(text: str) -> Dict[str, List[str]]:
    """
    Analyze transcript text and categorize detected keywords.

    Returns dict of category -> matched keywords
    """
    text_lower = text.lower()
    matches = {}

    for category, keywords in KEYWORD_CATEGORIES.items():
        found = [kw for kw in keywords if kw in text_lower]
        if found:
            matches[category] = found

    return matches


# Feed URLs for direct streaming (requires Broadcastify subscription)
def get_stream_urls() -> Dict[str, str]:
    """
    Get direct stream URLs for feeds.
    Note: Requires Broadcastify premium subscription for direct access.
    """
    return {
        feed_id: f"https://audio.broadcastify.com/{feed.feed_id}.mp3"
        for feed_id, feed in BALTIMORE_FEEDS.items()
    }


if __name__ == "__main__":
    import json

    config = get_scanner_config()
    print(json.dumps(config, indent=2))

    print("\n" + "=" * 50)
    print("Total keywords to monitor:", len(get_all_keywords()))
    print("=" * 50)
