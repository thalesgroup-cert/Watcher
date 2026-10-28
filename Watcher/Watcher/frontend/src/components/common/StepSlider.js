import React, { useEffect, useState } from "react";
import PropTypes from "prop-types";

const SLIDER_CSS = `
.step-slider { height: 1.5rem; }
.step-slider::-webkit-slider-runnable-track {
    height: 0.4rem; border-radius: 1rem;
    background: linear-gradient(to right, var(--bs-primary) var(--fill), var(--bs-border-color) var(--fill));
}
.step-slider::-webkit-slider-thumb { margin-top: -0.3rem; }
.step-slider::-moz-range-track { height: 0.4rem; border-radius: 1rem; background: var(--bs-border-color); }
.step-slider::-moz-range-progress { height: 0.4rem; border-radius: 1rem; background: var(--bs-primary); }
`;


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
    const trackStyle = {
        width: `calc(${(100 * (n - 1)) / n}% + 1rem)`,
        marginLeft: `calc(${50 / n}% - 0.5rem)`,
        "--fill": `${(index / (n - 1)) * 100}%`,
    };

    return (
        <div className="pt-1">
            <style>{SLIDER_CSS}</style>
            <input
                type="range"
                className="form-range step-slider d-block"
                style={trackStyle}
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
            <div className="d-flex">
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