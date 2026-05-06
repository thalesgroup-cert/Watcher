import React, { Component } from 'react';
import { connect } from 'react-redux';
import PropTypes from 'prop-types';


const buildStats = (monitoredKeywords, sources, bannedWords, watchRules, watchRuleHits) => [
    {
        title:       'MONITORED KEYWORDS',
        value:       monitoredKeywords.length,
        icon:        'track_changes',
        variant:     'primary',
        description: 'Keywords tracked across feeds',
    },
    {
        title:       'RSS SOURCES',
        value:       sources.length,
        icon:        'rss_feed',
        variant:     'info',
        description: 'Active feed sources',
    },
    {
        title:       'BANNED WORDS',
        value:       bannedWords.length,
        icon:        'block',
        variant:     'danger',
        description: 'Words excluded from detection',
    },
    {
        title:       'ACTIVE RULES',
        value:       watchRules.filter(r => r.is_active).length,
        icon:        'visibility',
        variant:     'warning',
        description: `${watchRules.length} total watch rules`,
    },
    {
        title:       'RULE HITS',
        value:       watchRuleHits.length,
        icon:        'notifications_active',
        variant:     'success',
        description: 'Rule matches detected',
    },
];


class CyberWatchStats extends Component {
    static propTypes = {
        monitoredKeywords: PropTypes.array.isRequired,
        sources:           PropTypes.array.isRequired,
        bannedWords:       PropTypes.array.isRequired,
        watchRules:        PropTypes.array.isRequired,
        watchRuleHits:     PropTypes.array.isRequired,
    };

    render() {
        const { monitoredKeywords, sources, bannedWords, watchRules, watchRuleHits } = this.props;
        const stats = buildStats(monitoredKeywords, sources, bannedWords, watchRules, watchRuleHits);

        return (
            <div className="row g-2 mb-3">
                {stats.map((card, i) => (
                    <div key={i} className="col-6 col-xl mb-3">
                        <div className={`card border-0 shadow-sm h-100 bg-${card.variant}`}>
                            <div className="card-body d-flex align-items-center p-3">
                                <div
                                    className="d-flex align-items-center justify-content-center bg-white rounded-circle me-3 flex-shrink-0"
                                    style={{ width: 50, height: 50, minWidth: 50, minHeight: 50 }}
                                >
                                    <i
                                        className={`material-icons text-${card.variant}`}
                                        style={{ fontSize: 28 }}
                                    >
                                        {card.icon}
                                    </i>
                                </div>
                                <div className="flex-fill" style={{ minWidth: 0 }}>
                                    <div
                                        className="text-white-50 text-uppercase fw-bold small mb-1"
                                        style={{ fontSize: '0.75rem', letterSpacing: '0.05em' }}
                                    >
                                        {card.title}
                                    </div>
                                    <div
                                        className="text-white fw-bold mb-1"
                                        style={{ fontSize: 'clamp(1.1rem, 2.5vw, 1.8rem)', lineHeight: 1.1, wordBreak: 'break-all' }}
                                    >
                                        {card.value}
                                    </div>
                                    <div className="text-white-50 small" style={{ fontSize: '0.8rem' }}>
                                        {card.description}
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                ))}
            </div>
        );
    }
}

const mapStateToProps = state => ({
    monitoredKeywords: state.leads.monitoredKeywords     || [],
    sources:           state.leads.sources               || [],
    bannedWords:       state.leads.bannedWords           || [],
    watchRules:        state.CyberWatch.watchRules       || [],
    watchRuleHits:     state.CyberWatch.watchRuleHits    || [],
});

export default connect(mapStateToProps)(CyberWatchStats);

