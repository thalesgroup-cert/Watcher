import React, { useEffect, useState } from "react";
import PropTypes from "prop-types";

const StepSlider = ({ options, value, onCommit, disabled, ariaLabel }) => {
    const indexOf = (v) => {
        const idx = options.findIndex(o => o.value === v);
        return idx === -1 ? 0 : idx;
    };
    const [index, setIndex] = useState(indexOf(value));

    useEffect(() => { setIndex(indexOf(value)); }, [value]);

    const commit = () => {
        const newValue = options[index].value;
        if (newValue !== value) onCommit(newValue);
    };

    const n = options.length;
    const alignStyle = {
        width: `calc(${(100 * (n - 1)) / n}% + 1rem)`,
        marginLeft: `calc(${50 / n}% - 0.5rem)`,
    };

    return (
        <div>
            <input
                type="range"
                className="form-range d-block"
                style={alignStyle}
                min={0}
                max={n - 1}
                step={1}
                value={index}
                disabled={disabled}
                aria-label={ariaLabel}
                onChange={e => setIndex(parseInt(e.target.value, 10))}
                onMouseUp={commit}
                onTouchEnd={commit}
                onKeyUp={commit}
            />
            <div className="d-flex small">
                {options.map((o, i) => (
                    <div key={o.value} className="text-center flex-fill" style={{ flexBasis: 0 }}>
                        <div className={`fw-semibold ${i === index ? "text-primary" : "text-muted"}`}>
                            {o.label}
                        </div>
                        {o.desc && <div className="text-muted">{o.desc}</div>}
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