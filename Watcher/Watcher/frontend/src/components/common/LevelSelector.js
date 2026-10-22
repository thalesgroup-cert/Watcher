import React from "react";
import PropTypes from "prop-types";
import {Form} from "react-bootstrap";

// Same levels and look as the "Alert Level" slider of the Monitored Keywords add / edit modals.
export const LEVEL_VALUES = ["warm", "hot", "super_hot"];

const LEVEL_FLAMES = {warm: "🔥", hot: "🔥🔥", super_hot: "🔥🔥🔥"};

const LEVEL_OPTIONS = [
    {value: "warm", label: "Warm", desc: "Low activity - keyword seen rarely"},
    {value: "hot", label: "Hot", desc: "Moderate activity (≥ 3 hits)"},
    {value: "super_hot", label: "Super Hot", desc: "High activity (≥ 10 hits)"},
];

const LevelSelector = ({value, onChange}) => {
    const idx = LEVEL_VALUES.indexOf(value);
    const safeIdx = idx === -1 ? 0 : idx;
    return (
        <Form.Group className="mb-3">
            <Form.Label><strong>Alert Level</strong></Form.Label>
            <div className="px-1 pt-1">
                <input
                    type="range"
                    className="form-range"
                    min={0}
                    max={2}
                    step={1}
                    value={safeIdx}
                    onChange={e => onChange(LEVEL_VALUES[parseInt(e.target.value)])}
                />
                <div className="d-flex justify-content-between">
                    {LEVEL_OPTIONS.map(o => (
                        <div key={o.value} className="text-center" style={{flex: "1", fontSize: "0.78rem"}}>
                            <div style={{fontSize: "1.2rem"}}>{LEVEL_FLAMES[o.value]}</div>
                            <div className={`fw-semibold ${value === o.value ? "text-primary" : "text-muted"}`}>
                                {o.label}
                            </div>
                            <div className="text-muted" style={{fontSize: "0.72rem"}}>{o.desc}</div>
                        </div>
                    ))}
                </div>
            </div>
        </Form.Group>
    );
};

LevelSelector.propTypes = {
    value: PropTypes.string,
    onChange: PropTypes.func.isRequired,
};

export default LevelSelector;
