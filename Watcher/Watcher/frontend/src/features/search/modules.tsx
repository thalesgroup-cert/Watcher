import type { ReactElement } from 'react';
import DnsOutlined from '@mui/icons-material/DnsOutlined';
import MonitorHeartOutlined from '@mui/icons-material/MonitorHeartOutlined';
import PowerOutlined from '@mui/icons-material/PowerOutlined';
import SecurityOutlined from '@mui/icons-material/SecurityOutlined';
import TravelExploreOutlined from '@mui/icons-material/TravelExploreOutlined';
import VerifiedUserOutlined from '@mui/icons-material/VerifiedUserOutlined';
import WhatshotOutlined from '@mui/icons-material/WhatshotOutlined';

/** The icon of each module, the same as in the sidebar, keyed like the `module` of the search results. */
export const MODULE_ICONS: Record<string, ReactElement> = {
    threats_watcher: <WhatshotOutlined />,
    cyber_watch: <SecurityOutlined />,
    data_leak: <TravelExploreOutlined />,
    dns_finder: <DnsOutlined />,
    website_monitoring: <MonitorHeartOutlined />,
    legitimate_domains: <VerifiedUserOutlined />,
    connectors: <PowerOutlined />,
};
