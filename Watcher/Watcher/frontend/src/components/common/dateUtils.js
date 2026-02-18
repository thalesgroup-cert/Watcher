/**
 * Date utility functions for calculating relative time differences
 * and formatting dates with detailed tooltips
 */

/**
 * Calculate the time difference between a date and now
 * Returns an object with the breakdown in days, hours, minutes, and seconds
 * 
 * @param {Date|string} date - The date to compare
 * @returns {Object} Object containing { isPast, days, hours, minutes, seconds, totalMs }
 */
export const calculateTimeDifference = (date) => {
    if (!date) return null;
    
    const targetDate = new Date(date);
    const now = new Date();
    
    // Check if date is valid
    if (isNaN(targetDate.getTime())) {
        console.error('Invalid date provided to calculateTimeDifference:', date);
        return null;
    }
    
    const diffMs = targetDate.getTime() - now.getTime();
    const isPast = diffMs < 0;
    const absDiffMs = Math.abs(diffMs);
    
    // Calculate time units
    const seconds = Math.floor(absDiffMs / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);
    const years = Math.floor(days / 365.25); // Account for leap years
    
    // Remaining units
    const remainingDays = Math.floor(days % 365.25);
    const remainingHours = hours % 24;
    const remainingMinutes = minutes % 60;
    const remainingSeconds = seconds % 60;
    
    return {
        isPast,
        years,
        days: remainingDays,
        hours: remainingHours,
        minutes: remainingMinutes,
        seconds: remainingSeconds,
        totalMs: diffMs,
        totalSeconds: seconds,
        totalMinutes: minutes,
        totalHours: hours,
        totalDays: days
    };
};

/**
 * Format time difference into a human-readable string
 * 
 * @param {Object} timeDiff - Object from calculateTimeDifference
 * @param {boolean} includeSeconds - Whether to include seconds in the output (default: false)
 * @returns {string} Formatted string like "2 days, 3 hours, 15 minutes"
 */
export const formatTimeDifference = (timeDiff, includeSeconds = false) => {
    if (!timeDiff) return '';
    
    const { years, days, hours, minutes, seconds } = timeDiff;
    const parts = [];
    
    // Show years if present
    if (years > 0) {
        parts.push(`${years} year${years !== 1 ? 's' : ''}`);
    }
    
    // Show days if present (or if years are present)
    if (days > 0 || years > 0) {
        parts.push(`${days} day${days !== 1 ? 's' : ''}`);
    }
    
    // Only show hours/minutes if less than 1 year
    if (years === 0) {
        if (hours > 0 || days > 0) {
            parts.push(`${hours} hour${hours !== 1 ? 's' : ''}`);
        }
        
        // Only show minutes for recent dates (less than 7 days)
        if ((minutes > 0 || hours > 0 || days > 0) && days < 7) {
            parts.push(`${minutes} minute${minutes !== 1 ? 's' : ''}`);
        }
        
        // Only show seconds if explicitly requested and for times less than 1 hour
        if (includeSeconds && timeDiff.totalHours < 1) {
            parts.push(`${seconds} second${seconds !== 1 ? 's' : ''}`);
        }
    }
    
    return parts.length > 0 ? parts.join(', ') : '0 second';
};

/**
 * Get a relative time string with context
 * 
 * @param {Date|string} date - The date to format
 * @param {boolean} includeSeconds - Whether to include seconds
 * @returns {string} Relative time string like "expires in 2 days" or "created 5 hours ago"
 */
export const getRelativeTimeString = (date, includeSeconds = false) => {
    const timeDiff = calculateTimeDifference(date);
    if (!timeDiff) return '';
    
    const formattedDiff = formatTimeDifference(timeDiff, includeSeconds);
    
    if (timeDiff.isPast) {
        return `${formattedDiff} ago`;
    } else {
        return `in ${formattedDiff}`;
    }
};

/**
 * Get urgency level based on time difference (for expiry dates)
 * 
 * @param {Date|string} expiryDate - The expiry date
 * @returns {string} Urgency level: 'critical', 'warning', 'normal', or 'expired'
 */
export const getExpiryUrgency = (expiryDate) => {
    const timeDiff = calculateTimeDifference(expiryDate);
    if (!timeDiff) return 'normal';
    
    if (timeDiff.isPast) return 'expired';
    if (timeDiff.totalDays <= 7) return 'critical';
    if (timeDiff.totalDays <= 30) return 'warning';
    return 'normal';
};

/**
 * Format a date for display (with locale support)
 * 
 * @param {Date|string} date - The date to format
 * @param {boolean} includeTime - Whether to include time in the output
 * @returns {string} Formatted date string
 */
export const formatDate = (date, includeTime = true) => {
    if (!date) return '-';
    
    const dateObj = new Date(date);
    
    if (isNaN(dateObj.getTime())) {
        return '-';
    }
    
    if (includeTime) {
        return dateObj.toLocaleString('en-US', {
            year: 'numeric',
            month: '2-digit',
            day: '2-digit',
            hour: '2-digit',
            minute: '2-digit'
        });
    } else {
        return dateObj.toLocaleDateString('en-US', {
            year: 'numeric',
            month: '2-digit',
            day: '2-digit'
        });
    }
};
