import React from 'react';
import { Row, Col } from 'react-bootstrap';
import PropTypes from 'prop-types';

const statCardsConfig = [
    {
        title: 'TOTAL DOMAINS',
        key: 'total',
        icon: 'link',
        variant: 'primary',
        description: 'All legitimate domains tracked',
    },
    {
        title: 'REPURCHASED',
        key: 'repurchased',
        icon: 'check_circle',
        variant: 'success',
        description: 'Domains that have been repurchased',
    },
    {
        title: 'EXPIRED',
        key: 'expired',
        icon: 'error',
        variant: 'danger',
        description: 'Domains with a past expiry date',
    },
    {
        title: 'EXPIRING SOON',
        key: 'expiringSoon',
        icon: 'warning',
        variant: 'warning',
        description: 'Less than 30 days remaining',
    }
];

function getStatistics(domains) {
    const now = new Date();
    const soon = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);

    return {
        total: domains.length,
        repurchased: domains.filter(d => d.repurchased === true).length,
        expired: domains.filter(d => d.expiry && new Date(d.expiry) < now).length,
        expiringSoon: domains.filter(d => {
            if (!d.expiry) return false;
            const exp = new Date(d.expiry);
            return exp >= now && exp <= soon;
        }).length
    };
}

const LegitimateStats = ({ domains }) => {
    const stats = getStatistics(domains);

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

LegitimateStats.propTypes = {
    domains: PropTypes.array.isRequired
};

export default LegitimateStats;