import React, { Component } from 'react';
import { connect } from 'react-redux';
import { Row, Col } from 'react-bootstrap';
import PropTypes from 'prop-types';
import { getLegitimateDomainStatistics } from '../../actions/LegitimateDomain';

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

class LegitimateStats extends Component {
    static propTypes = {
        statistics: PropTypes.object.isRequired,
        getLegitimateDomainStatistics: PropTypes.func.isRequired
    };

    componentDidMount() {
        this.props.getLegitimateDomainStatistics();
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
    statistics: state.LegitimateDomain.statistics || {
        total: 0,
        repurchased: 0,
        expired: 0,
        expiringSoon: 0
    }
});

export default connect(mapStateToProps, { getLegitimateDomainStatistics })(LegitimateStats);