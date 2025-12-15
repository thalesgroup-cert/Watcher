import React, { Component } from 'react';
import { connect } from 'react-redux';
import { Row, Col } from 'react-bootstrap';
import PropTypes from 'prop-types';
import { getSiteStatistics } from '../../actions/SiteMonitoring';

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

class SiteStats extends Component {
    static propTypes = {
        statistics: PropTypes.object.isRequired,
        getSiteStatistics: PropTypes.func.isRequired
    };

    componentDidMount() {
        this.props.getSiteStatistics();
    }

    render() {
        const { statistics } = this.props;

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
                                        {statistics[card.key] || 0}
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
    }
}

const mapStateToProps = state => ({
    statistics: state.SiteMonitoring.statistics || {
        total: 0,
        malicious: 0,
        takedownRequests: 0,
        legalTeam: 0
    }
});

export default connect(mapStateToProps, { getSiteStatistics })(SiteStats);