import React from 'react';
import { Button } from 'react-bootstrap';

const SHORTCUTS = [
    { label: '1 month', months: 1 },
    { label: '3 months', months: 3 },
    { label: '6 months', months: 6 },
    { label: '1 year', months: 12 }
];

export const addMonths = (date, months) => {
    const result = new Date(date);
    result.setMonth(result.getMonth() + months);
    return result;
};

const DateShortcuts = ({ onSelect }) => (
    <div className="d-flex flex-wrap gap-2 mt-2">
        {SHORTCUTS.map(({ label, months }) => (
            <Button
                key={label}
                variant="outline-secondary"
                size="sm"
                onClick={() => onSelect(addMonths(new Date(), months))}
            >
                {label}
            </Button>
        ))}
    </div>
);

export default DateShortcuts;
