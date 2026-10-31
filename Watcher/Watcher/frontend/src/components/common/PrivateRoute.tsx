import type { ReactNode } from 'react';
import { Navigate, useLocation } from 'react-router';
import { Box, CircularProgress } from '@mui/material';
import { useAuthStore } from '../../features/auth/store';

/** Shows its page to signed-in users; sends the others to the sign-in page, which brings them back afterwards. */
export default function PrivateRoute({ children }: { children: ReactNode }) {
    const status = useAuthStore((s) => s.status);
    const location = useLocation();
    if (status === 'checking') {
        return (
            <Box sx={{ display: 'flex', justifyContent: 'center', py: 6 }}>
                <CircularProgress aria-label="Loading" />
            </Box>
        );
    }
    if (status === 'anonymous') return <Navigate to="/login" replace state={{ from: location.pathname + location.search }} />;
    return children;
}
