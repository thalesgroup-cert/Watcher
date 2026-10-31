import { Link as RouterLink } from 'react-router';
import { Button } from '@mui/material';
import ExploreOffOutlined from '@mui/icons-material/ExploreOffOutlined';
import { EmptyState } from './EmptyState';
import { Page } from './Page';

/** Any address the app does not know. */
export default function NotFoundPage() {
    return (
        <Page maxWidth={720}>
            <EmptyState icon={<ExploreOffOutlined />} title="This page does not exist">
                The link may be outdated, or the page has moved.
                <div>
                    <Button component={RouterLink} to="/" variant="contained" sx={{ mt: 2 }}>
                        Go to the dashboard
                    </Button>
                </div>
            </EmptyState>
        </Page>
    );
}
