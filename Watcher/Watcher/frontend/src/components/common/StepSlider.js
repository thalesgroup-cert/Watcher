import React, { useEffect, useState } from "react";
import PropTypes from "prop-types";

const StepSlider = ({ options, value, onCommit, disabled, ariaLabel }) => {
    const indexOf = (v) => {
        const exact = options.findIndex(o => o.value === v);
        if (exact !== -1) return exact;
        const num = Number(v);
        if (Number.isNaN(num)) return 0;
        return options.reduce((best, o, i) =>
            Math.abs(Number(o.value) - num) < Math.abs(Number(options[best].value) - num) ? i : best, 0);
    };
    const [index, setIndex] = useState(indexOf(value));

    useEffect(() => { setIndex(indexOf(value)); }, [value]);

    const commit = () => {
        const newValue = options[index].value;
        if (newValue !== value) onCommit(newValue);
    };

    return (
        <div className="px-1 pt-1">
            <input
                type="range"
                className="form-range"
                min={0}
                max={options.length - 1}
                step={1}
                value={index}
                disabled={disabled}
                aria-label={ariaLabel}
                onChange={e => setIndex(parseInt(e.target.value, 10))}
                onMouseUp={commit}
                onTouchEnd={commit}
                onKeyUp={commit}
            />
            <div className="d-flex justify-content-between">
                {options.map((o, i) => (
                    <div key={o.value} className="text-center" style={{ flex: "1", fontSize: "0.78rem" }}>
                        <div className={`fw-semibold ${i === index ? "text-primary" : "text-muted"}`}>
                            {o.label}
                        </div>
                        {o.desc && (
                            <div className="text-muted" style={{ fontSize: "0.72rem" }}>{o.desc}</div>
                        )}
                    </div>
                ))}
            </div>
        </div>
    );
};

StepSlider.propTypes = {
    options: PropTypes.arrayOf(PropTypes.shape({
        value: PropTypes.oneOfType([PropTypes.number, PropTypes.string]).isRequired,
        label: PropTypes.string.isRequired,
        desc: PropTypes.string,
    })).isRequired,
    value: PropTypes.oneOfType([PropTypes.number, PropTypes.string]),
    onCommit: PropTypes.func.isRequired,
    disabled: PropTypes.bool,
    ariaLabel: PropTypes.string,
};

export default StepSlider;