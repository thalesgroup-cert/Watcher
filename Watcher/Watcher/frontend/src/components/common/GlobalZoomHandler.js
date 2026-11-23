import { useEffect } from 'react';
import { connect } from 'react-redux';
import { loadProfile } from '../../actions/profile';

function GlobalZoomHandler({ user, zoomLevel, loadProfile }) {
    
    useEffect(() => {
        if (user) {
            loadProfile();
        }
    }, [user, loadProfile]);

    useEffect(() => {
        if (user) {
            const currentZoom = zoomLevel || 1.0;
            document.body.style.zoom = currentZoom;
        } else {
            document.body.style.zoom = 1.0;
        }

        return () => {
            document.body.style.zoom = 1.0;
        };
    }, [zoomLevel, user]);

    return null;
}

const mapStateToProps = (state) => ({
    user: state.auth.user,
    zoomLevel: state.profile?.ui_zoom_level 
});

export default connect(mapStateToProps, { loadProfile })(GlobalZoomHandler);