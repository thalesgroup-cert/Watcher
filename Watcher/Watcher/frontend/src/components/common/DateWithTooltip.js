import React, { useState, useEffect } from 'react';
import PropTypes from 'prop-types';
import { OverlayTrigger, Tooltip } from 'react-bootstrap';
import { 
    calculateTimeDifference, 
    formatTimeDifference, 
    formatDate,
    getExpiryUrgency 
} from './dateUtils';

/**
 * DateWithTooltip - Component to display a date with a tooltip showing relative time
 * 
 * Features:
 * - Shows formatted date by default
 * - On hover, displays relative time (e.g., "expire dans 2 jours, 3 heures")
 * - Automatically updates every minute for accurate countdowns
 * - Supports both past dates ("créé il y a...") and future dates ("expire dans...")
 * - Optional color coding for expiry urgency
 * 
 * @component
 */
const DateWithTooltip = ({
    date,
    includeTime = true,
    showRelativeInline = false,
    type = 'default', // 'default', 'expiry', 'created'
    updateInterval = 60000, // Update every 60 seconds by default
    includeSeconds = false,
    className = '',
    style = {}
}) => {
    const [timeDiff, setTimeDiff] = useState(null);
    const [formattedDate, setFormattedDate] = useState('');

    // Calculate time difference and update periodically
    useEffect(() => {
        if (!date) return;

        const updateTimeDiff = () => {
            const diff = calculateTimeDifference(date);
            setTimeDiff(diff);
            setFormattedDate(formatDate(date, includeTime));
        };

        // Initial calculation
        updateTimeDiff();

        // Set up interval for updates
        const interval = setInterval(updateTimeDiff, updateInterval);

        return () => clearInterval(interval);
    }, [date, includeTime, updateInterval]);

    if (!date || !timeDiff) {
        return <span className={className} style={style}>-</span>;
    }

    // Build the tooltip content
    const buildTooltipContent = () => {
        const relativeTime = formatTimeDifference(timeDiff, includeSeconds);
        
        let prefix = '';
        if (type === 'expiry') {
            prefix = timeDiff.isPast ? 'Expired' : 'Expires in';
        } else if (type === 'created') {
            prefix = 'Created';
        } else {
            prefix = timeDiff.isPast ? '' : 'In';
        }

        const parts = [
            <strong key="prefix">{prefix}</strong>,
            <br key="br1" />,
            <span key="time" style={{ fontSize: '1.1em' }}>{relativeTime}{timeDiff.isPast && type === 'created' ? ' ago' : ''}</span>
        ];

        return <div style={{ textAlign: 'center', padding: '5px' }}>{parts}</div>;
    };

    // Determine styling based on urgency (for expiry dates)
    const getStyle = () => {
        const baseStyle = { cursor: 'help', ...style };

        if (type === 'expiry') {
            const urgency = getExpiryUrgency(date);
            if (urgency === 'expired') {
                return { ...baseStyle, color: '#dc3545', fontWeight: 'bold' };
            } else if (urgency === 'critical') {
                return { ...baseStyle, color: '#dc3545' };
            } else if (urgency === 'warning') {
                return { ...baseStyle, color: '#fd7e14' };
            }
        }

        return baseStyle;
    };

    // Build the main display content
    const renderDateContent = () => {
        if (showRelativeInline) {
            const relativeTime = formatTimeDifference(timeDiff, includeSeconds);
            const prefix = timeDiff.isPast ? 'ago' : 'in';
            return (
                <span>
                    {formattedDate}
                    <br />
                    <small className="text-muted">({prefix} {relativeTime})</small>
                </span>
            );
        }
        return formattedDate;
    };

    const tooltip = (
        <Tooltip id={`tooltip-${date}`}>
            {buildTooltipContent()}
        </Tooltip>
    );

    return (
        <OverlayTrigger
            placement="top"
            overlay={tooltip}
            delay={{ show: 100, hide: 200 }}
        >
            <span className={className} style={getStyle()}>
                {renderDateContent()}
            </span>
        </OverlayTrigger>
    );
};

DateWithTooltip.propTypes = {
    // The date to display (Date object or ISO string)
    date: PropTypes.oneOfType([
        PropTypes.instanceOf(Date),
        PropTypes.string
    ]),
    
    // Whether to include time in the formatted date display
    includeTime: PropTypes.bool,
    
    // Show relative time inline (below the date) instead of just in tooltip
    showRelativeInline: PropTypes.bool,
    
    // Type of date: 'default', 'expiry', 'created'
    type: PropTypes.oneOf(['default', 'expiry', 'created']),
    
    // Update interval in milliseconds (default: 60000 = 1 minute)
    updateInterval: PropTypes.number,
    
    // Include seconds in relative time display
    includeSeconds: PropTypes.bool,
    
    // Additional CSS class
    className: PropTypes.string,
    
    // Additional inline styles
    style: PropTypes.object
};

export default DateWithTooltip;
