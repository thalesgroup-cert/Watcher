import { isoToFlag } from '../../lib/countries';
import type { HitType, Period, Reference, Scope, Severity, SeverityFilter } from './types';

type ChipColor = 'error' | 'warning' | 'info' | 'default';

/** CVSS severities, worst first. "NONE" is a CVE cve.circl.lu has not scored yet. */
export const SEVERITIES: { value: SeverityFilter; label: string; color: ChipColor; range: string }[] = [
    { value: 'CRITICAL', label: 'Critical', color: 'error', range: 'CVSS 9.0-10' },
    { value: 'HIGH', label: 'High', color: 'warning', range: 'CVSS 7.0-8.9' },
    { value: 'MEDIUM', label: 'Medium', color: 'info', range: 'CVSS 4.0-6.9' },
    { value: 'LOW', label: 'Low', color: 'default', range: 'CVSS 0.1-3.9' },
    { value: 'NONE', label: 'Not scored yet', color: 'default', range: 'No CVSS score published yet' },
];
export const severityMeta = (value: Severity | SeverityFilter) => SEVERITIES.find((s) => s.value === (value || 'NONE')) ?? SEVERITIES[4];

export const SCOPES: { value: Scope; label: string; description: string }[] = [
    { value: 'both', label: 'CVEs and victims', description: 'Watch the vulnerabilities and the ransomware victims' },
    { value: 'cve', label: 'CVEs', description: 'Match the id and description of new vulnerabilities' },
    { value: 'ransomware', label: 'Ransomware victims', description: 'Match the victim, group, sector and country' },
];
export const scopeMeta = (value: Scope) => SCOPES.find((s) => s.value === value) ?? SCOPES[0];

export const HIT_TYPES: { value: HitType; label: string; plural: string }[] = [
    { value: 'cve', label: 'CVE', plural: 'CVEs' },
    { value: 'ransomware_victim', label: 'Ransomware victim', plural: 'Ransomware victims' },
];
export const hitTypeMeta = (value: HitType) => HIT_TYPES.find((t) => t.value === value) ?? HIT_TYPES[0];

export const PERIODS: { value: Period; label: string }[] = [
    { value: '', label: 'Any time' },
    { value: 'today', label: 'Today' },
    { value: '7d', label: 'Last 7 days' },
    { value: '30d', label: 'Last 30 days' },
];

export const ARCHIVE_STATES = [
    { value: 'active', label: 'Active' },
    { value: 'archived', label: 'Archived' },
    { value: 'all', label: 'All' },
] as const;

const regionNames = typeof Intl.DisplayNames === 'function' ? new Intl.DisplayNames(['en'], { type: 'region' }) : null;

/** "🇫🇷 France" from an ISO code; the raw value when it is not a code. */
export function countryLabel(code: string): string {
    if (!code) return '';
    if (!/^[A-Za-z]{2}$/.test(code)) return code;
    let name = code.toUpperCase();
    try {
        name = regionNames?.of(name) ?? name;
    } catch {
        // Not a region code.
    }
    return `${isoToFlag(code)} ${name}`;
}

/** Victim sectors that say nothing (ransomware.live fills them when it does not know). */
export const isKnownSector = (sector: string) => !!sector && !['Not Found', 'Other', 'Unknown'].includes(sector);

/** "group::victim" (WatchRuleHit.object_id of a victim) as shown to people. */
export const matchLabel = (objectId: string) => objectId.split('::').reverse().join(' - ');

/** Keywords typed in a field, one per line or separated by commas. */
export const splitKeywords = (text: string) => [...new Set(text.split(/[\n,]/).map((k) => k.trim()).filter(Boolean))];

/** URLs of the references of a CVE, whatever their shape, without duplicates. */
export const referenceUrls = (refs: Reference[]) => [...new Set(refs.map((r) => (typeof r === 'string' ? r : r?.url)).filter((u): u is string => !!u))];
