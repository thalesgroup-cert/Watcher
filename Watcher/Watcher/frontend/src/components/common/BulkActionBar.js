import React, {Component} from "react";
import PropTypes from "prop-types";
import {connect} from "react-redux";
import {Button, Form, Modal} from "react-bootstrap";
import {bulkDelete, bulkUpdate} from "../../actions/Bulk";

// Same default as the backend setting BULK_ACTION_MAX_ITEMS
const DEFAULT_MAX_ITEMS = 200;

const capitalize = text => text.charAt(0).toUpperCase() + text.slice(1);

/**
 * Bar shown by TableManager when rows are selected: change one or several fields on all of them, delete them,
 * or run a module-specific action (e.g. exports). Every action goes through the backend bulk endpoints, which
 * apply the same validation and permissions as the single-row action and return a per-row summary. Lists and
 * statistics are reloaded by the bulk actions themselves (actions/Bulk.js).
 *
 * `config` (the `bulkActions` prop of TableManager):
 *   target        bulk descriptor of the module (e.g. SITE_BULK from actions/SiteMonitoring.js)
 *   label         what the rows are, lower case (e.g. "suspicious domains")
 *   refresh       optional () => void for lists that are not reloaded by actions/Bulk.js
 *   canDelete     show the Delete action (default true)
 *   updateFields  [{field, label, help?, type: "select" | "bool", options: [{value, label}]}]
 *                 or a custom control: {field, label, render({value, onChange}), initial}
 *   extraActions  [{key, label, onClick(ids, done)}] - `done()` clears the selection
 */
export class BulkActionBar extends Component {
    // enabled: fields ticked in the "Change" modal, values: the value chosen for each field
    state = {modal: null, enabled: {}, values: {}};

    static propTypes = {
        config: PropTypes.object.isRequired,
        selectedIds: PropTypes.array.isRequired,
        filteredCount: PropTypes.number.isRequired,
        pageAllSelected: PropTypes.bool,
        onSelectAllFiltered: PropTypes.func.isRequired,
        onClear: PropTypes.func.isRequired,
        bulkUpdate: PropTypes.func.isRequired,
        bulkDelete: PropTypes.func.isRequired,
    };

    closeModal = () => this.setState({modal: null, enabled: {}, values: {}});

    done = () => {
        const {config, onClear} = this.props;
        onClear();
        if (config.refresh) config.refresh();
    };

    // Value proposed for a field: the first option, "enabled" for a switch, `initial` for a custom control
    initialValue = def => {
        if (def.type === "bool") return true;
        if (def.render) return def.initial;
        return def.options[0].value;
    };

    openUpdate = () => {
        const fields = this.props.config.updateFields;
        const values = {};
        fields.forEach(def => { values[def.field] = this.initialValue(def); });
        // With a single field there is nothing to tick: it is always applied
        const enabled = fields.length === 1 ? {[fields[0].field]: true} : {};
        this.setState({modal: "update", enabled, values});
    };

    chosenFields = () => this.props.config.updateFields.filter(def => this.state.enabled[def.field]);

    applyUpdate = () => {
        const {config, selectedIds, bulkUpdate} = this.props;
        const fields = this.chosenFields();
        if (fields.length === 0) return;
        const changes = {};
        fields.forEach(def => { changes[def.field] = this.state.values[def.field]; });
        bulkUpdate({
            target: config.target,
            ids: selectedIds,
            changes,
            label: `${capitalize(config.label)} - change ${fields.map(def => def.label).join(", ")}`,
            onDone: this.done,
        });
        this.closeModal();
    };

    applyDelete = () => {
        const {config, selectedIds, bulkDelete} = this.props;
        bulkDelete({
            target: config.target,
            ids: selectedIds,
            label: `${capitalize(config.label)} - delete`,
            onDone: this.done,
        });
        this.closeModal();
    };

    setValue = (field, value) => this.setState(({values}) => ({values: {...values, [field]: value}}));

    // Control used to pick the new value of one field, in the same style as the add / edit modals
    renderValueControl(def) {
        const value = this.state.values[def.field];
        const onChange = v => this.setValue(def.field, v);

        if (def.render) {
            return def.render({value, onChange});
        }
        if (def.type === "bool") {
            return (
                <Form.Group className="mb-3">
                    <Form.Check
                        type="switch"
                        id={`bulk-change-${def.field}`}
                        label={value === true ? "Enabled" : "Disabled"}
                        checked={value === true}
                        onChange={e => onChange(e.target.checked)}
                    />
                    {def.help && <Form.Text className="text-muted">{def.help}</Form.Text>}
                </Form.Group>
            );
        }
        return (
            <Form.Group className="mb-3">
                <Form.Control
                    as="select"
                    value={String(value)}
                    onChange={e => onChange(def.options.find(o => String(o.value) === e.target.value).value)}
                >
                    {def.options.map(o => (
                        <option key={String(o.value)} value={String(o.value)}>{o.label}</option>
                    ))}
                </Form.Control>
                {def.help && <Form.Text className="text-muted">{def.help}</Form.Text>}
            </Form.Group>
        );
    }

    renderUpdateModal() {
        const {config, selectedIds} = this.props;
        const count = selectedIds.length;
        const plural = count === 1 ? "" : "s";
        const several = config.updateFields.length > 1;
        const chosen = this.chosenFields();

        return (
            <Modal show onHide={this.closeModal} centered backdropClassName="modal-backdrop-dark">
                <Modal.Header closeButton>
                    <Modal.Title>Change {count} {config.label}</Modal.Title>
                </Modal.Header>
                <Modal.Body>
                    {several && (
                        <Form.Text className="text-muted d-block mb-3">
                            Tick every field you want to change: they are all applied together.
                        </Form.Text>
                    )}

                    {config.updateFields.map(def => (
                        <div key={def.field} className={several ? "mb-3 pb-2 border-bottom" : ""}>
                            {several ? (
                                <Form.Check
                                    type="checkbox"
                                    id={`bulk-use-${def.field}`}
                                    className="mb-2"
                                    label={<strong>{def.label}</strong>}
                                    checked={!!this.state.enabled[def.field]}
                                    onChange={e => {
                                        const checked = e.target.checked;
                                        this.setState(({enabled}) => ({enabled: {...enabled, [def.field]: checked}}));
                                    }}
                                />
                            ) : null}
                            {(!several || this.state.enabled[def.field]) && this.renderValueControl(def)}
                        </div>
                    ))}

                    <Form.Text className="text-muted d-block">
                        Applied to the {count} selected item{plural}. Items that cannot be changed are reported in the
                        summary and do not block the others.
                    </Form.Text>
                </Modal.Body>
                <Modal.Footer className="justify-content-between">
                    <Button variant="secondary" onClick={this.closeModal}>Cancel</Button>
                    <Button variant="primary" disabled={chosen.length === 0} onClick={this.applyUpdate}>
                        <i className="material-icons me-1 align-middle" style={{ fontSize: 18 }}>done</i>
                        <span className="align-middle">
                            Apply {chosen.length > 1 ? `${chosen.length} changes` : "change"} to {count} item{plural}
                        </span>
                    </Button>
                </Modal.Footer>
            </Modal>
        );
    }

    renderDeleteModal() {
        const {config, selectedIds} = this.props;
        const count = selectedIds.length;
        return (
            <Modal show onHide={this.closeModal} centered backdropClassName="modal-backdrop-dark">
                <Modal.Header closeButton>
                    <Modal.Title>Delete {count} {config.label}</Modal.Title>
                </Modal.Header>
                <Modal.Body>
                    <p className="mb-0">
                        Are you sure you want to delete the <strong>{count}</strong> selected item{count === 1 ? "" : "s"}?
                        This cannot be undone.
                    </p>
                </Modal.Body>
                <Modal.Footer className="justify-content-between">
                    <Button variant="secondary" onClick={this.closeModal}>Cancel</Button>
                    <Button variant="danger" onClick={this.applyDelete}>
                        <i className="material-icons me-1 align-middle" style={{ fontSize: 18 }}>delete</i>
                        <span className="align-middle">Delete {count}</span>
                    </Button>
                </Modal.Footer>
            </Modal>
        );
    }

    render() {
        const {config, selectedIds, filteredCount, pageAllSelected, onSelectAllFiltered, onClear} = this.props;
        const count = selectedIds.length;
        if (count === 0) return null;
        const max = config.maxItems || DEFAULT_MAX_ITEMS;
        const tooMany = count > max;
        const updateFields = config.updateFields || [];

        return (
            <div className="d-flex flex-wrap align-items-center gap-2 p-2 mb-2 border rounded">
                <strong>{count} selected</strong>
                {pageAllSelected && filteredCount > count && (
                    <Button variant="link" size="sm" className="p-0" onClick={onSelectAllFiltered}>
                        Select all {filteredCount} results
                    </Button>
                )}
                <Button variant="link" size="sm" className="p-0" onClick={onClear}>Clear</Button>
                {tooMany && <span className="text-danger small">Maximum {max} items per action.</span>}
                <span className="ms-auto d-flex flex-wrap gap-2">
                    {updateFields.length > 0 && (
                        <Button variant="outline-warning" size="sm" disabled={tooMany} onClick={this.openUpdate}>Change...</Button>
                    )}
                    {(config.extraActions || []).map(action => (
                        <Button key={action.key} variant="outline-primary" size="sm" disabled={tooMany}
                                onClick={() => action.onClick(selectedIds, this.done)}>
                            {action.label}
                        </Button>
                    ))}
                    {config.canDelete !== false && (
                        <Button variant="outline-danger" size="sm" disabled={tooMany} onClick={() => this.setState({modal: "delete"})}>
                            Delete
                        </Button>
                    )}
                </span>
                {this.state.modal === "update" && this.renderUpdateModal()}
                {this.state.modal === "delete" && this.renderDeleteModal()}
            </div>
        );
    }
}

export default connect(null, {bulkUpdate, bulkDelete})(BulkActionBar);
