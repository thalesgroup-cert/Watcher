import React from 'react';
import { Row, Col } from 'react-bootstrap';
import PropTypes from 'prop-types';


const statCardsConfig = [
    {
        title: 'TOTAL SITES',
        key: 'total',
        icon: 'link',
        variant: 'primary',
        description: 'All monitored suspicious sites',
    },
    {
        title: 'MALICIOUS',
        key: 'malicious',
        icon: 'dangerous',
        variant: 'danger',
        description: 'Sites marked as malicious',
    },
    {
        title: 'TAKEDOWN REQUESTS',
        key: 'takedownRequests',
        icon: 'block',
        variant: 'warning',
        description: 'Sites with takedown requests',
    },
    {
        title: 'LEGAL TEAM',
        key: 'legalTeam',
        icon: 'gavel',
        variant: 'success',
        description: 'Sites involving legal team',
    }
];

function getStatistics(sites) {
    const now = new Date();
    const thirtyDaysFromNow = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);

    return {
        total: sites.length,
        malicious: sites.filter(s => String(s.legitimacy) === '5' || String(s.legitimacy) === '6').length,
        takedownRequests: sites.filter(s => s.takedown_request === true).length,
        legalTeam: sites.filter(s => s.legal_team === true).length,
        activelyMonitored: sites.filter(s => s.monitored === true).length,
        blockingRequests: sites.filter(s => s.blocking_request === true).length,
        monitoringExpiringSoon: sites.filter(s => {
            if (!s.expiry) return false;
            const expDate = new Date(s.expiry);
            return expDate >= now && expDate <= thirtyDaysFromNow;
        }).length,
        domainExpiringSoon: sites.filter(s => {
            if (!s.domain_expiry) return false;
            const expDate = new Date(s.domain_expiry);
            return expDate >= now && expDate <= thirtyDaysFromNow;
        }).length,
        offlineSites: sites.filter(s => !s.web_status || s.web_status !== 200).length
    };
}

const SiteStats = ({ sites }) => {
    const stats = getStatistics(sites);

    return (
        <Row className="mb-4">
            {statCardsConfig.map((card, index) => (
                <Col key={index} lg={3} md={6} xs={12} className="mb-3">
                    <div className={`card border-0 shadow-sm h-100 bg-${card.variant}`}>
                        <div className="card-body d-flex align-items-center p-4">
                            <div 
                                className="d-flex align-items-center justify-content-center bg-white rounded-circle me-3 flex-shrink-0"
                                style={{ 
                                    width: '50px', 
                                    height: '50px',
                                    minWidth: '50px',
                                    minHeight: '50px'
                                }}
                            >
                                <i 
                                    className={`material-icons text-${card.variant}`}
                                    style={{ fontSize: '28px' }}
                                >
                                    {card.icon}
                                </i>
                            </div>
                            
                            <div className="flex-fill">
                                <div className="text-white-50 text-uppercase fw-bold small mb-1" 
                                     style={{ fontSize: '0.75rem', letterSpacing: '0.05em' }}>
                                    {card.title}
                                </div>
                                <div className="text-white fw-bold h2 mb-1" 
                                     style={{ fontSize: '2rem', lineHeight: '1' }}>
                                    {stats[card.key]}
                                </div>
                                <div className="text-white-50 small" 
                                     style={{ fontSize: '0.8rem' }}>
                                    {card.description}
                                </div>
                            </div>
                        </div>
                    </div>
                </Col>
            ))}
        </Row>
    );
};

SiteStats.propTypes = {
    sites: PropTypes.array.isRequired
};

export default SiteStats;