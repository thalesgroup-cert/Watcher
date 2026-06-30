import React from 'react';
import PropTypes from 'prop-types';
import { Modal, OverlayTrigger, Tooltip } from 'react-bootstrap';
import TimelinePanel from './TimelinePanel';
import UserAvatar, { displayName } from '../common/UserAvatar';

const WATCHER_AUTO_COLOR = '#546e7a';


export function TimelineModal({ show, onHide, contentType, objectId, label }) {
    return (
        <Modal show={show} onHide={onHide} centered size="lg" scrollable>
            <Modal.Header closeButton>
                <Modal.Title>
                    History for <strong>{label}</strong>
                </Modal.Title>
            </Modal.Header>
            <Modal.Body>
                {objectId != null && (
                    <TimelinePanel contentType={contentType} objectId={objectId} />
                )}
            </Modal.Body>
        </Modal>
    );
}

TimelineModal.propTypes = {
    show:        PropTypes.bool.isRequired,
    onHide:      PropTypes.func.isRequired,
    contentType: PropTypes.string.isRequired,
    objectId:    PropTypes.number,
    label:       PropTypes.string,
};


export function LastEventCell({ event }) {
    if (!event) return <td style={{ width: 48 }} />;

    const isAuto = !event.username || event.username === 'system';
    const d = new Date(event.timestamp);
    const name = isAuto ? 'Watcher Auto' : displayName(event.first_name, event.last_name, event.username);
    const tip = `${name} · ${event.action}\n${d.toLocaleDateString('fr-FR')} ${d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}`;

    return (
        <td style={{ width: 48, textAlign: 'center', verticalAlign: 'middle' }}>
            <OverlayTrigger placement="left" overlay={<Tooltip style={{ whiteSpace: 'pre-line' }}>{tip}</Tooltip>}>
                <span style={{ cursor: 'default' }}>
                    <UserAvatar
                        username={isAuto ? 'W' : event.username}
                        firstName={isAuto ? 'Watcher' : event.first_name}
                        lastName={isAuto ? 'Auto' : event.last_name}
                        avatarColor={isAuto ? WATCHER_AUTO_COLOR : event.avatar_color}
                        size={28}
                        tooltip={false}
                    />
                </span>
            </OverlayTrigger>
        </td>
    );
}

LastEventCell.propTypes = {
    event: PropTypes.shape({
        username:     PropTypes.string,
        first_name:   PropTypes.string,
        last_name:    PropTypes.string,
        avatar_color: PropTypes.string,
        action:       PropTypes.string,
        timestamp:    PropTypes.string,
    }),
};


export function LastEventHeader() {
    return (
        <th style={{ textAlign: 'center', width: 48 }} title="Last action by">
            <i className="material-icons" style={{ fontSize: 17, verticalAlign: 'middle', color: 'inherit' }}>account_circle</i>
        </th>
    );
}
