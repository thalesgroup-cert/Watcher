import React, {forwardRef, useImperativeHandle, useRef, useState} from "react";
import PropTypes from "prop-types";
import {Button, Form} from "react-bootstrap";

// Same rules as the backend (common/bulk.py): trim, ignore empty lines, case-insensitive duplicates.
export const countBulkItems = text => {
    const seen = new Set();
    text.split(/\r?\n/).forEach(line => {
        const value = line.trim().toLowerCase();
        if (value) seen.add(value);
    });
    return seen.size;
};

/**
 * Main value field of a create form with an optional "One item per line" mode.
 *
 * Toggle OFF: a plain single-line input, exactly like before.
 * Toggle ON : a multiline textarea with a live count of the detected items.
 *
 * The parent form reads it through a ref, like a regular input: `ref.current.value` is the text
 * and `ref.current.isBulk()` tells which mode is active. `ref.current.reset()` clears the field.
 */
const BulkTextField = forwardRef(({placeholder, pattern, maxLength, required, label, onChange, onModeChange, isValid, isInvalid, style}, ref) => {
    const [text, setText] = useState("");
    const [bulk, setBulk] = useState(false);
    const previewRequested = useRef(false);

    const handleChange = e => {
        setText(e.target.value);
        if (onChange) onChange(e);
    };

    useImperativeHandle(ref, () => ({
        get value() {
            return bulk ? text : text.split(/\r?\n/)[0];
        },
        set value(newValue) {
            setText(newValue);
        },
        isBulk: () => bulk,
        // true once after the "Preview" button submitted the form (then resets itself)
        consumePreview: () => {
            const requested = previewRequested.current;
            previewRequested.current = false;
            return requested;
        },
        reset: () => {
            setText("");
            setBulk(false);
        },
    }), [text, bulk]);

    const count = bulk ? countBulkItems(text) : 0;

    return (
        <>
            {bulk ? (
                <Form.Control
                    as="textarea"
                    rows={6}
                    required={required}
                    value={text}
                    placeholder={placeholder ? `${placeholder}\n...` : ""}
                    isValid={isValid}
                    isInvalid={isInvalid}
                    style={style}
                    onChange={handleChange}
                />
            ) : (
                <Form.Control
                    type="text"
                    size="md"
                    required={required}
                    pattern={pattern}
                    maxLength={maxLength}
                    value={text.split(/\r?\n/)[0]}
                    placeholder={placeholder}
                    isValid={isValid}
                    isInvalid={isInvalid}
                    style={style}
                    onChange={handleChange}
                />
            )}
            <Form.Check
                type="switch"
                id="bulk-one-item-per-line"
                className="mt-2"
                label={label}
                checked={bulk}
                onChange={e => {
                    setBulk(e.target.checked);
                    if (onModeChange) onModeChange(e.target.checked);
                }}
            />
            {bulk && (
                <div className="d-flex align-items-center justify-content-between mt-1">
                    <Form.Text muted>
                        {count} item{count === 1 ? "" : "s"} detected. Other fields are applied to every item.
                    </Form.Text>
                    <Button
                        variant="outline-secondary"
                        size="sm"
                        disabled={count === 0}
                        onClick={e => {
                            // Submit the form in "preview" mode: the parent reads consumePreview() and nothing is saved
                            const form = e.currentTarget.form;
                            if (!form) return;
                            previewRequested.current = true;
                            form.requestSubmit();
                        }}
                    >
                        Preview
                    </Button>
                </div>
            )}
        </>
    );
});

BulkTextField.displayName = "BulkTextField";

BulkTextField.propTypes = {
    placeholder: PropTypes.string,
    pattern: PropTypes.string,
    maxLength: PropTypes.number,
    required: PropTypes.bool,
    label: PropTypes.string,
    onChange: PropTypes.func,
    onModeChange: PropTypes.func,
    isValid: PropTypes.bool,
    isInvalid: PropTypes.bool,
    style: PropTypes.object,
};

BulkTextField.defaultProps = {
    required: true,
    label: "One item per line",
};

export default BulkTextField;
