#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Watcher Integration for Baltimore Port Intelligence

This module integrates baltimore_intel with Watcher's notification hub,
following the exact patterns used by threats_watcher, data_leak, dns_finder, etc.

Key Integration Points:
1. APP_CONFIG entries for Slack/Citadel/TheHive/Email
2. collect_observables() for TheHive IOC extraction
3. Subscriber model pattern
4. APScheduler background jobs
5. NER pipeline reuse from threats_watcher
"""

import logging
from typing import Dict, List, Optional
from datetime import datetime
from django.conf import settings

logger = logging.getLogger('watcher.baltimore_intel')

# ===========================================
# NOTIFICATION CONFIGURATION
# Following Watcher's common/core.py pattern
# ===========================================

SLACK_CHANNEL = getattr(settings, 'SLACK_CHANNEL', '')
CITADEL_ROOM_ID = getattr(settings, 'CITADEL_ROOM_ID', '')

# Slack Configuration for Baltimore Intel
BALTIMORE_CONFIG_SLACK = {
    'baltimore_vessel': {
        'content_template': (
            "*[BALTIMORE INTEL - VESSEL] 🚢 Vessel Activity Detected 🚢*\n\n"
            "Dear team,\n\n"
            "New vessel activity in Baltimore port area:\n\n"
            "*• Vessel:* {vessel_name}\n"
            "*• MMSI:* {mmsi}\n"
            "*• Type:* {vessel_type}\n"
            "*• Flag:* {flag}\n"
            "*• Position:* {lat}, {lon}\n"
            "*• Risk Assessment:* {risk_assessment}\n\n"
            "Please, find more details <{details_url}|here>."
        ),
        'channel': SLACK_CHANNEL,
        'url_suffix': '#/baltimore_intel/',
    },
    'baltimore_commodity': {
        'content_template': (
            "*[BALTIMORE INTEL - COMMODITY] 📊 Market Alert 📊*\n\n"
            "Dear team,\n\n"
            "Significant commodity price movement detected:\n\n"
            "*• Commodity:* {commodity_name}\n"
            "*• Price:* {price} {currency}\n"
            "*• Change:* {change_pct:+.2f}%\n"
            "*• Baltimore Relevance:* {relevance}\n\n"
            "Please, find more details <{details_url}|here>."
        ),
        'channel': SLACK_CHANNEL,
        'url_suffix': '#/baltimore_intel/',
    },
    'baltimore_infrastructure': {
        'content_template': (
            "*[BALTIMORE INTEL - INFRASTRUCTURE] ⚠️ Critical Infrastructure Alert ⚠️*\n\n"
            "Dear team,\n\n"
            "Alert detected for critical infrastructure:\n\n"
            "*• Asset:* {infrastructure_name}\n"
            "*• Type:* {infrastructure_type}\n"
            "*• Alert:* {alert_title}\n"
            "*• Severity:* {severity}\n"
            "*• Description:* {description}\n\n"
            "Please, find more details <{details_url}|here>."
        ),
        'channel': SLACK_CHANNEL,
        'url_suffix': '#/baltimore_intel/',
    },
    'baltimore_scanner': {
        'content_template': (
            "*[BALTIMORE INTEL - SCANNER] 📻 Radio Traffic Alert 📻*\n\n"
            "Dear team,\n\n"
            "Significant radio traffic detected:\n\n"
            "*• Feed:* {feed_name}\n"
            "*• Categories:* {categories}\n"
            "*• Transcript:* {transcript}\n"
            "*• Infrastructure Match:* {infrastructure_match}\n\n"
            "Please, find more details <{details_url}|here>."
        ),
        'channel': SLACK_CHANNEL,
        'url_suffix': '#/baltimore_intel/',
    },
    'baltimore_rail': {
        'content_template': (
            "*[BALTIMORE INTEL - RAIL] 🚂 Rail Movement Detected 🚂*\n\n"
            "Dear team,\n\n"
            "Rail activity relevant to port operations:\n\n"
            "*• Railroad:* {railroad}\n"
            "*• Cargo Type:* {cargo_type}\n"
            "*• Direction:* {direction}\n"
            "*• Port Relevant:* {port_relevant}\n\n"
            "Please, find more details <{details_url}|here>."
        ),
        'channel': SLACK_CHANNEL,
        'url_suffix': '#/baltimore_intel/',
    },
    'baltimore_correlation': {
        'content_template': (
            "*[BALTIMORE INTEL - CORRELATION] 🔗 Intelligence Correlation 🔗*\n\n"
            "Dear team,\n\n"
            "Multiple intelligence signals have been correlated:\n\n"
            "*• Correlation Type:* {correlation_type}\n"
            "*• Events Correlated:* {event_count}\n"
            "*• Severity:* {severity}\n"
            "*• Summary:* {summary}\n\n"
            "Please, find more details <{details_url}|here>."
        ),
        'channel': SLACK_CHANNEL,
        'url_suffix': '#/baltimore_intel/',
    },
}

# Citadel Configuration
BALTIMORE_CONFIG_CITADEL = {
    'baltimore_vessel': {
        'content_template': (
            "<p><strong><h4>[BALTIMORE INTEL - VESSEL] 🚢 Vessel Activity Detected 🚢</h4></strong></p>"
            "<p>Dear team,</p>"
            "<p>New vessel activity in Baltimore port area:</p>"
            "<ul>"
            "<li><strong>Vessel:</strong> {vessel_name}</li>"
            "<li><strong>MMSI:</strong> {mmsi}</li>"
            "<li><strong>Type:</strong> {vessel_type}</li>"
            "<li><strong>Flag:</strong> {flag}</li>"
            "<li><strong>Position:</strong> {lat}, {lon}</li>"
            "<li><strong>Risk Assessment:</strong> {risk_assessment}</li>"
            "</ul>"
            "<p>Please, find more details <a href='{details_url}'>here</a>.</p>"
        ),
        'citadel_room_id': CITADEL_ROOM_ID,
        'url_suffix': '#/baltimore_intel/',
    },
    'baltimore_infrastructure': {
        'content_template': (
            "<p><strong><h4>[BALTIMORE INTEL - INFRASTRUCTURE] ⚠️ Critical Infrastructure Alert ⚠️</h4></strong></p>"
            "<p>Dear team,</p>"
            "<p>Alert detected for critical infrastructure:</p>"
            "<ul>"
            "<li><strong>Asset:</strong> {infrastructure_name}</li>"
            "<li><strong>Type:</strong> {infrastructure_type}</li>"
            "<li><strong>Alert:</strong> {alert_title}</li>"
            "<li><strong>Severity:</strong> {severity}</li>"
            "</ul>"
            "<p>Please, find more details <a href='{details_url}'>here</a>.</p>"
        ),
        'citadel_room_id': CITADEL_ROOM_ID,
        'url_suffix': '#/baltimore_intel/',
    },
    # Add other types as needed...
}

# TheHive Configuration
BALTIMORE_CONFIG_THEHIVE = {
    'baltimore_vessel': {
        'title': "Baltimore Intel - Vessel Activity: {vessel_name}",
        'description_template': (
            "**Baltimore Port Intelligence Alert:**\n\n"
            "**Vessel Activity Detected:**\n"
            "*Vessel:* {vessel_name}\n"
            "*MMSI:* {mmsi}\n"
            "*Type:* {vessel_type}\n"
            "*Flag:* {flag}\n"
            "*Position:* {lat}, {lon}\n"
            "*Risk Assessment:* {risk_assessment}\n"
        ),
        'severity': 2,
        'tlp': 2,
        'pap': 2,
        'tags': ['baltimore-intel', 'maritime', 'vessel-tracking']
    },
    'baltimore_infrastructure': {
        'title': "Baltimore Intel - Infrastructure Alert: {infrastructure_name}",
        'description_template': (
            "**Baltimore Port Intelligence Alert:**\n\n"
            "**Critical Infrastructure Alert:**\n"
            "*Asset:* {infrastructure_name}\n"
            "*Type:* {infrastructure_type}\n"
            "*Alert:* {alert_title}\n"
            "*Severity:* {severity}\n"
            "*Description:* {description}\n"
        ),
        'severity': 3,
        'tlp': 2,
        'pap': 2,
        'tags': ['baltimore-intel', 'critical-infrastructure']
    },
    'baltimore_correlation': {
        'title': "Baltimore Intel - Correlation: {correlation_type}",
        'description_template': (
            "**Baltimore Port Intelligence - Correlation Alert:**\n\n"
            "**Multiple Signals Correlated:**\n"
            "*Correlation Type:* {correlation_type}\n"
            "*Events:* {event_count}\n"
            "*Severity:* {severity}\n"
            "*Summary:* {summary}\n"
        ),
        'severity': 3,
        'tlp': 2,
        'pap': 2,
        'tags': ['baltimore-intel', 'correlation', 'multi-source']
    },
}


# ===========================================
# OBSERVABLE COLLECTION
# Following Watcher's collect_observables pattern
# ===========================================

def collect_baltimore_observables(alert_type: str, context_data: Dict) -> List[Dict]:
    """
    Collect observables for TheHive integration.
    Maps Baltimore Intel data to TheHive observable types.
    """
    observables = []

    if alert_type == 'baltimore_vessel':
        vessel = context_data.get('vessel', {})

        # MMSI as identifier
        if vessel.get('mmsi'):
            observables.append({
                "dataType": "other",
                "data": f"MMSI:{vessel['mmsi']}",
                "tags": ["maritime", "vessel-id", "mmsi"]
            })

        # IMO number
        if vessel.get('imo'):
            observables.append({
                "dataType": "other",
                "data": f"IMO:{vessel['imo']}",
                "tags": ["maritime", "vessel-id", "imo"]
            })

        # Vessel name
        if vessel.get('name'):
            observables.append({
                "dataType": "other",
                "data": vessel['name'],
                "tags": ["maritime", "vessel-name"]
            })

        # Flag state
        if vessel.get('flag'):
            observables.append({
                "dataType": "other",
                "data": f"Flag:{vessel['flag']}",
                "tags": ["maritime", "flag-state"]
            })

    elif alert_type == 'baltimore_infrastructure':
        infra = context_data.get('infrastructure', {})

        # Infrastructure ID
        if infra.get('id'):
            observables.append({
                "dataType": "other",
                "data": f"INFRA:{infra['id']}",
                "tags": ["critical-infrastructure", infra.get('type', 'unknown')]
            })

        # Coordinates
        if infra.get('lat') and infra.get('lon'):
            observables.append({
                "dataType": "other",
                "data": f"GEO:{infra['lat']},{infra['lon']}",
                "tags": ["geolocation", "baltimore-port"]
            })

    elif alert_type == 'baltimore_scanner':
        transcript = context_data.get('transcript', '')
        categories = context_data.get('categories', {})

        # Extract entities from transcript
        # TODO: Use Watcher's NER pipeline here
        for category, keywords in categories.items():
            for kw in keywords:
                observables.append({
                    "dataType": "other",
                    "data": kw,
                    "tags": ["scanner", category]
                })

    elif alert_type == 'baltimore_commodity':
        commodity = context_data.get('commodity', {})

        if commodity.get('symbol'):
            observables.append({
                "dataType": "other",
                "data": f"COMMODITY:{commodity['symbol']}",
                "tags": ["financial", "commodity", commodity.get('category', 'unknown')]
            })

    elif alert_type == 'baltimore_correlation':
        events = context_data.get('events', [])

        for event in events:
            observables.append({
                "dataType": "other",
                "data": f"EVENT:{event.get('id', 'unknown')}",
                "tags": ["correlation", event.get('type', 'unknown')]
            })

    # Filter out None values
    observables = [obs for obs in observables if obs['data'] is not None]

    return observables


# ===========================================
# NER INTEGRATION
# Reuse Watcher's NER pipeline
# ===========================================

def extract_entities_from_transcript(text: str) -> Dict:
    """
    Extract entities from scanner transcript using Watcher's NER pipeline.
    """
    try:
        from threats_watcher.model_manager import get_ner_pipeline
        from threats_watcher.core import extract_entities_and_threats

        ner_pipe = get_ner_pipeline()
        if not ner_pipe:
            logger.warning("NER pipeline not available")
            return {}

        # Use Watcher's entity extraction
        entities = extract_entities_and_threats(text)

        # Add maritime-specific patterns
        import re

        # MMSI patterns (9 digits)
        mmsi_pattern = r'\b\d{9}\b'
        entities['mmsi'] = re.findall(mmsi_pattern, text)

        # Call signs (letter-number patterns)
        callsign_pattern = r'\b[A-Z]{2,4}\d{2,4}\b'
        entities['callsigns'] = re.findall(callsign_pattern, text.upper())

        # Railroad codes
        railroad_pattern = r'\b(CSX|NS|BNSF|UP|CN|CP|AMTRAK)\b'
        entities['railroads'] = re.findall(railroad_pattern, text.upper())

        # Train numbers
        train_pattern = r'\b(?:train|locomotive|engine)\s*#?\s*(\d+)\b'
        entities['train_numbers'] = re.findall(train_pattern, text.lower())

        return entities

    except ImportError:
        logger.warning("Could not import Watcher NER pipeline")
        return {}


# ===========================================
# NOTIFICATION SENDER
# Following Watcher's send_app_specific_notifications pattern
# ===========================================

def send_baltimore_notifications(alert_type: str, context_data: Dict, subscribers):
    """
    Send Baltimore Intel notifications using Watcher's notification hub.

    This function follows the exact pattern of common/core.py:send_app_specific_notifications
    """
    try:
        from common.core import (
            send_slack_message,
            send_citadel_message,
            send_thehive_alert,
            send_email_notifications
        )
    except ImportError:
        logger.error("Could not import Watcher notification functions")
        return

    slack_config = BALTIMORE_CONFIG_SLACK.get(alert_type)
    citadel_config = BALTIMORE_CONFIG_CITADEL.get(alert_type)
    thehive_config = BALTIMORE_CONFIG_THEHIVE.get(alert_type)

    if not slack_config:
        logger.warning(f"No configuration found for alert type: {alert_type}")
        return

    if not subscribers.exists():
        logger.warning(f"No subscribers for {alert_type}")
        return

    # Collect observables for TheHive
    observables = collect_baltimore_observables(alert_type, context_data)

    # Build common data for template formatting
    common_data = {
        'details_url': getattr(settings, 'WATCHER_URL', 'http://localhost:9002') + slack_config['url_suffix'],
        **context_data
    }

    # Send Slack notification
    if subscribers.filter(slack=True).exists() and slack_config:
        try:
            content = slack_config['content_template'].format(**common_data)
            send_slack_message(content, slack_config['channel'], alert_type)
            logger.info(f"Sent Slack notification for {alert_type}")
        except Exception as e:
            logger.error(f"Error sending Slack notification: {e}")

    # Send Citadel notification
    if subscribers.filter(citadel=True).exists() and citadel_config:
        try:
            content = citadel_config['content_template'].format(**common_data)
            send_citadel_message(
                content={
                    "msgtype": "m.text",
                    "format": "org.matrix.custom.html",
                    "body": f"[{alert_type.upper()}] Alert",
                    "formatted_body": content.replace('\n', '<br>')
                },
                room_id=citadel_config['citadel_room_id'],
                app_name=alert_type
            )
            logger.info(f"Sent Citadel notification for {alert_type}")
        except Exception as e:
            logger.error(f"Error sending Citadel notification: {e}")

    # Send TheHive alert
    if subscribers.filter(thehive=True).exists() and thehive_config:
        try:
            title = thehive_config['title'].format(**common_data)
            description = thehive_config['description_template'].format(**common_data)

            send_thehive_alert(
                title=title,
                description=description,
                severity=thehive_config['severity'],
                tlp=thehive_config['tlp'],
                pap=thehive_config['pap'],
                tags=thehive_config['tags'],
                app_name=alert_type,
                domain_name=None,
                observables=observables
            )
            logger.info(f"Sent TheHive alert for {alert_type}")
        except Exception as e:
            logger.error(f"Error sending TheHive alert: {e}")

    # Send Email notification
    if subscribers.filter(email=True).exists():
        try:
            email_list = [s.user_rec.email for s in subscribers.filter(email=True)]
            subject = f"[BALTIMORE INTEL] {alert_type.replace('baltimore_', '').title()} Alert"

            # Generate email body (simplified - would use template in production)
            body = f"""
            <html>
            <body>
            <h2>Baltimore Port Intelligence Alert</h2>
            <p><strong>Type:</strong> {alert_type}</p>
            <p><strong>Time:</strong> {datetime.now().isoformat()}</p>
            <hr>
            <p>{context_data.get('description', 'See details in Watcher dashboard.')}</p>
            </body>
            </html>
            """

            send_email_notifications(subject, body, email_list, alert_type)
            logger.info(f"Sent email notification for {alert_type}")
        except Exception as e:
            logger.error(f"Error sending email notification: {e}")


# ===========================================
# SCHEDULER PATTERN
# Following Watcher's APScheduler pattern
# ===========================================

def start_baltimore_scheduler():
    """
    Launch Baltimore Intel background tasks.
    Following Watcher's scheduler pattern from common/core.py
    """
    from apscheduler.schedulers.background import BackgroundScheduler
    import tzlocal
    from django.db import close_old_connections

    scheduler = BackgroundScheduler(timezone=str(tzlocal.get_localzone()))

    # Commodity price check - every 30 minutes
    scheduler.add_job(
        check_commodity_alerts,
        'cron',
        day_of_week='mon-sun',
        minute='*/30',
        id='baltimore_commodity_check',
        max_instances=1,
        replace_existing=True
    )

    # Infrastructure status check - every 15 minutes
    scheduler.add_job(
        check_infrastructure_status,
        'cron',
        day_of_week='mon-sun',
        minute='*/15',
        id='baltimore_infrastructure_check',
        max_instances=1,
        replace_existing=True
    )

    # Rail status check - every hour
    scheduler.add_job(
        check_rail_status,
        'cron',
        day_of_week='mon-sun',
        minute=0,
        id='baltimore_rail_check',
        max_instances=1,
        replace_existing=True
    )

    scheduler.start()
    logger.info("Baltimore Intel scheduler started")


def check_commodity_alerts():
    """Check commodity prices and generate alerts if thresholds exceeded."""
    from django.db import close_old_connections
    close_old_connections()

    logger.info("CRON TASK: Baltimore Commodity Check")

    try:
        from .commodities import BaltimorePortCommodities

        tracker = BaltimorePortCommodities()
        data = tracker.get_all_commodities()

        for alert in data.get('alerts', []):
            logger.info(f"Commodity alert: {alert['message']}")
            # Would trigger send_baltimore_notifications here

    except Exception as e:
        logger.error(f"Error in commodity check: {e}")


def check_infrastructure_status():
    """Check infrastructure status and generate alerts."""
    from django.db import close_old_connections
    close_old_connections()

    logger.info("CRON TASK: Baltimore Infrastructure Check")

    try:
        from .critical_infrastructure import InfrastructureMonitor

        monitor = InfrastructureMonitor()
        status = monitor.get_status_report()

        for alert in status.get('recent_alerts', []):
            logger.info(f"Infrastructure alert: {alert}")
            # Would trigger send_baltimore_notifications here

    except Exception as e:
        logger.error(f"Error in infrastructure check: {e}")


def check_rail_status():
    """Check rail status for port-relevant movements."""
    from django.db import close_old_connections
    close_old_connections()

    logger.info("CRON TASK: Baltimore Rail Check")

    try:
        from .rail_tracking import RailTracker

        tracker = RailTracker()
        trains = tracker.get_amtrak_trains()

        for train in trains:
            if train.get('delay_minutes', 0) > 30:
                logger.info(f"Rail delay alert: Train {train['train_number']} delayed {train['delay_minutes']} min")
                # Would trigger send_baltimore_notifications here

    except Exception as e:
        logger.error(f"Error in rail check: {e}")


# ===========================================
# UTILITY FUNCTIONS
# ===========================================

def register_with_watcher():
    """
    Register Baltimore Intel configurations with Watcher's common/core.py

    This should be called during Django app initialization to extend
    Watcher's APP_CONFIG dictionaries.
    """
    try:
        from common import core as watcher_core

        # Extend Watcher's configurations
        watcher_core.APP_CONFIG_SLACK.update(BALTIMORE_CONFIG_SLACK)
        watcher_core.APP_CONFIG_CITADEL.update(BALTIMORE_CONFIG_CITADEL)
        watcher_core.APP_CONFIG_THEHIVE.update(BALTIMORE_CONFIG_THEHIVE)

        logger.info("Baltimore Intel registered with Watcher notification hub")

    except ImportError:
        logger.warning("Could not register with Watcher - running standalone")


if __name__ == "__main__":
    # Test observable collection
    test_vessel = {
        'vessel': {
            'mmsi': '123456789',
            'imo': 'IMO1234567',
            'name': 'TEST VESSEL',
            'flag': 'US',
        }
    }

    observables = collect_baltimore_observables('baltimore_vessel', test_vessel)
    print("Test observables:", observables)
