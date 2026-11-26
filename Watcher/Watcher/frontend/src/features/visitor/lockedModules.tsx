import type { ReactElement } from 'react';
import DnsOutlined from '@mui/icons-material/DnsOutlined';
import HistoryOutlined from '@mui/icons-material/HistoryOutlined';
import MonitorHeartOutlined from '@mui/icons-material/MonitorHeartOutlined';
import SecurityOutlined from '@mui/icons-material/SecurityOutlined';
import TravelExploreOutlined from '@mui/icons-material/TravelExploreOutlined';

/**
 * The modules that need an account. A visitor sees them in the menu and on the Overview, locked, with what each one does.
 * The text is written here on purpose: these pages call no API and show nothing of the instance.
 */
export interface LockedModule {
    to: string;
    label: string;
    icon: ReactElement;
    tagline: string;
    points: string[];
}

export const LOCKED_MODULES: LockedModule[] = [
    {
        to: '/cyber_watch',
        label: 'Cyber Watch',
        icon: <SecurityOutlined />,
        tagline: 'Vulnerabilities and ransomware, matched against what your organisation cares about.',
        points: [
            'Every new CVE with its score, severity and affected products, searchable and filterable.',
            'The victims and the groups published on ransomware leak sites.',
            'Watch rules that flag the CVEs and victims that concern you.',
        ],
    },
    {
        to: '/data_leak',
        label: 'Data Leak',
        icon: <TravelExploreOutlined />,
        tagline: 'Find out when your names, domains or secrets show up where they should not.',
        points: [
            'Keywords searched on paste sites and code platforms every few minutes.',
            'Each alert kept with its source, so you can review, confirm or dismiss it.',
            'Notifications sent to your team the moment something new is found.',
        ],
    },
    {
        to: '/dns_finder',
        label: 'DNS Threats',
        icon: <DnsOutlined />,
        tagline: 'Look-alike domains, spotted before they are used against you.',
        points: [
            'Typosquatted variants of your domains, generated and checked regularly.',
            'Newly issued certificates that resemble your brand, from the Certificate Transparency stream.',
            'Each domain tracked from first sighting to takedown.',
        ],
    },
    {
        to: '/website_monitoring',
        label: 'Website Monitoring',
        icon: <MonitorHeartOutlined />,
        tagline: 'Keep an eye on suspicious sites and pages, and know when they change.',
        points: [
            'Changes of content, IP address and mail servers, detected on a schedule.',
            'Precise pages followed version by version, with a diff and a screenshot.',
            'Registration dates and takedown cases (UDRP) followed in one place.',
        ],
    },
    {
        to: '/activity',
        label: 'Activity',
        icon: <HistoryOutlined />,
        tagline: 'Who changed what across Watcher, and what the platform did by itself.',
        points: [
            'One feed for every module, filtered by person, action or period.',
            'The history of each object: its creation, edits and decisions.',
            'Your own activity, day by day.',
        ],
    },
];

export const lockedModule = (to: string) => LOCKED_MODULES.find((m) => m.to === to);
