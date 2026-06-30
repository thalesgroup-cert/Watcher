import React, { Component } from 'react';
import { connect } from 'react-redux';
import PropTypes from 'prop-types';
import { Spinner, Badge, OverlayTrigger, Tooltip } from 'react-bootstrap';
import MuiTimeline from '@mui/lab/Timeline';
import TimelineItem from '@mui/lab/TimelineItem';
import TimelineSeparator from '@mui/lab/TimelineSeparator';
import TimelineConnector from '@mui/lab/TimelineConnector';
import TimelineContent from '@mui/lab/TimelineContent';
import TimelineOppositeContent from '@mui/lab/TimelineOppositeContent';
import TimelineDot from '@mui/lab/TimelineDot';
import { getTimelineEvents, clearTimelineEvents } from '../../actions/Timeline';
import UserAvatar, { displayName } from '../common/UserAvatar';


const ACTION_META = {
    created:     { badge: 'success',   dotBg: 'var(--bs-success)',   icon: 'add'        },
    updated:     { badge: 'primary',   dotBg: 'var(--bs-primary)',   icon: 'edit'       },
    deleted:     { badge: 'danger',    dotBg: 'var(--bs-danger)',    icon: 'delete'     },
    transferred: { badge: 'info',      dotBg: 'var(--bs-info)',      icon: 'swap_horiz' },
    cancelled:   { badge: 'warning',   dotBg: 'var(--bs-warning)',   icon: 'block'      },
};

function getActionDescription(action, diff) {
    switch (action) {
        case 'created':
            return 'Entry added to Watcher.';
        case 'deleted':
            return 'Entry removed from Watcher.';
        case 'transferred':
            return 'Domain transferred to Legitimate Domains.';
        case 'cancelled':
            return 'UDRP transfer rejected, domain remains in Website Monitoring.';
        case 'updated': {
            const keys = diff ? Object.keys(diff) : [];
            if (keys.length === 0) return 'Record was modified.';
            const labels = keys.map(k => FIELD_LABELS[k] || k);
            if (labels.length <= 3) return `Updated: ${labels.join(', ')}.`;
            return `Updated: ${labels.slice(0, 3).join(', ')} and ${labels.length - 3} more.`;
        }
        default:
            return '';
    }
}

const WATCHER_AUTO_COLOR = '#546e7a';

const FIELD_LABELS = {
    // LegitimateDomain
    domain_name:       'Domain Name',
    ticket_id:         'Ticket ID',
    contact:           'Contact',
    expiry:            'Expiry',
    ssl_expiry:        'SSL Expiry',
    domain_created_at: 'Domain Created',
    repurchased:       'Repurchased',
    comments:          'Comments',
    misp_event_uuid:   'MISP UUID',
    // Source
    url:               'URL',
    confident:         'Confidence',
    country:           'Country',
    country_code:      'Country Code',
    // MonitoredKeyword
    name:              'Name',
    level:             'Level',
    threshold:         'Threshold',
    // WatchRule
    keywords:          'Keywords',
    exceptions:        'Exceptions',
    scope:             'Scope',
    is_active:         'Active',
    // DataLeak Keyword
    is_regex:          'Use RegEx',
    // Site Monitoring
    legitimacy:        'Legitimacy',
    takedown_request:  'Takedown Request',
    legal_team:        'Legal Team',
    blocking_request:  'Blocking Request',
    ip_monitoring:     'IP Monitoring',
    mail_monitoring:   'Email Monitoring',
    content_monitoring:'Content Monitoring',
    monitored:         'Monitored',
    udrp_status:       'UDRP Status',
    domain_expiry:     'Domain Expiry',
};

const ISO_RE = /^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2}:\d{2})?/;

function formatValue(val) {
    if (val === null || val === undefined) return '-';
    if (typeof val === 'boolean') return val ? 'Yes' : 'No';
    if (Array.isArray(val)) return val.length ? val.join(', ') : '-';
    const str = String(val);
    if (ISO_RE.test(str)) {
        const d = new Date(str);
        if (!isNaN(d)) return d.toLocaleDateString('fr-FR');
    }
    return str || '-';
}

// DiffEntry
function DiffEntry({ field, oldVal, newVal }) {
    const label = FIELD_LABELS[field] || field;
    return (
        <div className="d-flex align-items-center flex-wrap gap-2 mb-1">
            <span className="fw-semibold text-muted" style={{ minWidth: 120, fontSize: '0.8rem' }}>{label}</span>
            <span className="text-danger" style={{ textDecoration: 'line-through', fontSize: '0.8rem', maxWidth: 160, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {formatValue(oldVal)}
            </span>
            <i className="material-icons text-muted" style={{ fontSize: 13 }}>arrow_forward</i>
            <span className="text-success" style={{ fontSize: '0.8rem', maxWidth: 160, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {formatValue(newVal)}
            </span>
        </div>
    );
}

// TimelineEventCard
function TimelineEventCard({ event, isLast }) {
    const hasDiff = event.diff && Object.keys(event.diff).length > 0;
    const isAuto = !event.username || event.username === 'system';
    const name = isAuto ? 'Watcher Auto' : displayName(event.first_name, event.last_name, event.username);
    const avatarUsername = isAuto ? 'W' : event.username;
    const avatarFirstName = isAuto ? 'Watcher' : event.first_name;
    const avatarLastName = isAuto ? 'Auto' : event.last_name;
    const avatarColor = isAuto ? WATCHER_AUTO_COLOR : event.avatar_color;
    const meta = ACTION_META[event.action] || { badge: 'secondary', dotBg: 'var(--bs-secondary)', icon: 'circle' };
    const d = new Date(event.timestamp);
    const description = getActionDescription(event.action, event.diff);

    return (
        <TimelineItem>
            <TimelineOppositeContent
                sx={{ m: 'auto 0', flex: '0 0 76px', minWidth: 0, px: 1 }}
                align="right"
            >
                <div style={{ fontSize: '0.72rem', color: 'var(--bs-secondary-color, #6c757d)', lineHeight: 1.5, textAlign: 'right' }}>
                    <div style={{ fontWeight: 600, whiteSpace: 'nowrap' }}>
                        {d.toLocaleDateString('fr-FR')}
                    </div>
                    <div style={{ whiteSpace: 'nowrap' }}>
                        {d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}
                    </div>
                </div>
            </TimelineOppositeContent>

            <TimelineSeparator>
                <TimelineConnector sx={{ bgcolor: 'var(--bs-border-color)' }} />
                <TimelineDot
                    sx={{ m: 0, p: '5px', boxShadow: 'none', bgcolor: meta.dotBg, border: 'none' }}
                >
                    <i className="material-icons" style={{ fontSize: 14, lineHeight: 1, color: '#fff' }}>
                        {meta.icon}
                    </i>
                </TimelineDot>
                {!isLast && <TimelineConnector sx={{ bgcolor: 'var(--bs-border-color)' }} />}
            </TimelineSeparator>

            <TimelineContent sx={{ py: '8px', pl: 2, pr: 0 }}>
                <div className="card shadow-sm">
                    <div className="card-body py-2 px-3">
                        {/* Badge + user row */}
                        <div className="d-flex align-items-center justify-content-between gap-2 flex-wrap">
                            <Badge
                                bg={meta.badge}
                                style={{ fontSize: '0.72rem', textTransform: 'capitalize', padding: '4px 9px', letterSpacing: 0.3 }}
                            >
                                {event.action_label}
                            </Badge>

                            <div className="d-flex align-items-center gap-2">
                                <span style={{ fontSize: '0.82rem' }}>
                                    <strong>{name}</strong>
                                </span>
                                <UserAvatar
                                    username={avatarUsername}
                                    firstName={avatarFirstName}
                                    lastName={avatarLastName}
                                    avatarColor={avatarColor}
                                    size={28}
                                    tooltip={false}
                                />
                            </div>
                        </div>

                        {/* Description */}
                        {description && (
                            <div style={{ fontSize: '0.78rem', color: 'var(--bs-secondary-color, #6c757d)', marginTop: 4 }}>
                                {description}
                            </div>
                        )}

                        {/* Diff */}
                        {hasDiff && (
                            <div className="mt-2 pt-2 border-top">
                                {Object.entries(event.diff).map(([field, { old: o, new: n }]) => (
                                    <DiffEntry key={field} field={field} oldVal={o} newVal={n} />
                                ))}
                            </div>
                        )}
                    </div>
                </div>
            </TimelineContent>
        </TimelineItem>
    );
}

// TimelinePanel
class TimelinePanel extends Component {
    static propTypes = {
        contentType: PropTypes.string.isRequired,
        objectId:    PropTypes.number.isRequired,
        events:      PropTypes.array.isRequired,
        loading:     PropTypes.bool.isRequired,
        getTimelineEvents:   PropTypes.func.isRequired,
        clearTimelineEvents: PropTypes.func.isRequired,
    };

    state = { sortDesc: true };

    componentDidMount() {
        this.props.getTimelineEvents(this.props.contentType, this.props.objectId);
    }

    componentDidUpdate(prevProps) {
        if (prevProps.objectId !== this.props.objectId) {
            this.props.getTimelineEvents(this.props.contentType, this.props.objectId);
        }
    }

    componentWillUnmount() {
        this.props.clearTimelineEvents();
    }

    render() {
        const { events, loading } = this.props;
        const { sortDesc } = this.state;

        if (loading) {
            return (
                <div className="d-flex justify-content-center align-items-center py-5">
                    <Spinner animation="border" size="sm" variant="primary" className="me-2" />
                    <span className="text-muted">Loading history…</span>
                </div>
            );
        }

        if (events.length === 0) {
            return (
                <div className="text-center py-5">
                    <i className="material-icons text-muted d-block mb-2" style={{ fontSize: 40 }}>history</i>
                    <span className="text-muted">No history yet</span>
                </div>
            );
        }

        const sorted = [...events].sort((a, b) => {
            const diff = new Date(b.timestamp) - new Date(a.timestamp);
            return sortDesc ? diff : -diff;
        });

        return (
            <div>
                {/* Toolbar */}
                <div className="d-flex align-items-center justify-content-between mb-2 px-1">
                    <span className="text-muted" style={{ fontSize: '0.82rem' }}>
                        {events.length} event{events.length !== 1 ? 's' : ''}
                    </span>
                    <OverlayTrigger placement="left" overlay={
                        <Tooltip>{sortDesc ? 'Newest first' : 'Oldest first'}</Tooltip>
                    }>
                        <button
                            className="btn btn-sm btn-outline-secondary d-flex align-items-center gap-1"
                            onClick={() => this.setState({ sortDesc: !sortDesc })}
                            style={{ fontSize: '0.78rem' }}
                        >
                            <i className="material-icons" style={{ fontSize: 15 }}>
                                {sortDesc ? 'arrow_downward' : 'arrow_upward'}
                            </i>
                            {sortDesc ? 'Newest' : 'Oldest'}
                        </button>
                    </OverlayTrigger>
                </div>

                <MuiTimeline position="right" sx={{ p: 0, m: 0 }}>
                    {sorted.map((event, i) => (
                        <TimelineEventCard
                            key={event.id}
                            event={event}
                            isLast={i === sorted.length - 1}
                        />
                    ))}
                </MuiTimeline>
            </div>
        );
    }
}

const mapStateToProps = state => ({
    events:  state.timeline.events,
    loading: state.timeline.loading,
});

export default connect(mapStateToProps, { getTimelineEvents, clearTimelineEvents })(TimelinePanel);
