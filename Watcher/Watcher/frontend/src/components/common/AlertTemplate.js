import React from 'react';

const icons = {
    success: { name: "check_circle", color: "#198754" },
    error:   { name: "cancel",       color: "#dc3545" },
    warning: { name: "warning",      color: "#ffc107" },
    info:    { name: "info",         color: "#0dcaf0" },
    delete:  { name: "delete",       color: "#6c757d" },
};

const borders = {
    success: "#198754",
    error:   "#dc3545",
    warning: "#ffc107",
    info:    "#0dcaf0",
    delete:  "#6c757d"
};

const AlertTemplate = ({ style, options, message, close }) => {
    const type = options.type || "info";
    const icon = icons[type] || icons.info;
    const borderColor = borders[type] || borders.info;

    return (
        <div
            className="d-flex align-items-center bg-secondary"
            style={{
                ...style,
                borderRadius: '8px',
                borderLeft: `6px solid ${borderColor}`,
                boxShadow: '0 2px 8px rgba(0,0,0,0.06)',
                padding: '0.85rem 1.3rem',
                margin: '0.6rem 0',
                minWidth: 260,
                maxWidth: 480,
                fontSize: '1.04rem',
                fontWeight: 500,
            }}
        >
            <span className="material-icons" style={{
                fontSize: 24,
                marginRight: 14,
                color: icon.color,
                verticalAlign: 'middle',
                opacity: 0.98,
            }}>
                {icon.name}
            </span>
            <span style={{flex: 1}}>{message}</span>
            <button
                onClick={close}
                type="button"
                aria-label="Close"
                className="btn btn-link p-0 ms-2"
                style={{
                    color: "#888",
                    fontSize: 22,
                    lineHeight: 1,
                    textDecoration: "none",
                    background: "transparent",
                    border: "none",
                    cursor: "pointer"
                }}
            >
                <span className="material-icons" style={{fontSize: 22, verticalAlign: "middle"}}>close</span>
            </button>
        </div>
    );
};

export default AlertTemplate;