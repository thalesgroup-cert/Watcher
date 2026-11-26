import { useTheme } from '@mui/material';
import BlockOutlined from '@mui/icons-material/BlockOutlined';
import Cancel from '@mui/icons-material/Cancel';
import CheckCircle from '@mui/icons-material/CheckCircle';
import HelpOutlined from '@mui/icons-material/HelpOutlined';
import WarningAmber from '@mui/icons-material/WarningAmber';
import type { Connector } from '../types';
import { since } from '../../../lib/dates';

/**
 * The state of a connector in five words, each with its own icon and colour: working (green tick), problem (red cross),
 * to finish (orange triangle), not tested (grey question mark) and not set up (grey bar). The same word and the same
 * sentence are used on the cards, in the tooltips and on the board at the top of the page.
 */
export type Light = 'ok' | 'problem' | 'unfinished' | 'untested' | 'off';

export interface LightInfo {
    light: Light;
    /** One word. */
    label: string;
    /** One sentence, for people who see a light for the first time. */
    meaning: string;
}

export const LIGHTS: Record<Light, { label: string; meaning: string }> = {
    ok: { label: 'Working', meaning: 'The last test passed.' },
    problem: { label: 'Problem', meaning: 'The last test failed: open the connector to see why.' },
    unfinished: { label: 'To finish', meaning: 'Some settings are missing, so it cannot run yet.' },
    untested: { label: 'Not tested', meaning: 'Set up, but never tested: press Test.' },
    off: { label: 'Not set up', meaning: 'Nothing is configured: it does not run.' },
};

export const LIGHT_ORDER: Light[] = ['ok', 'problem', 'unfinished', 'untested', 'off'];

export function connectorLight(connector: Connector): LightInfo {
    let light: Light;
    if (connector.status === 'disabled') light = 'off';
    else if (connector.status === 'partial') light = 'unfinished';
    else if (connector.health?.status === 'unhealthy') light = 'problem';
    else if (connector.health?.status === 'healthy') light = 'ok';
    else light = 'untested';
    return { light, ...LIGHTS[light] };
}

/** "Checked 3 minutes ago", or what to do when it never was. */
export function checkedText(connector: Connector): string {
    const at = connector.health?.checked_at;
    return at ? `Checked ${since(at)}` : 'Never tested';
}

function useLightColor(light: Light): string {
    const { palette } = useTheme();
    return { ok: palette.success.main, problem: palette.error.main, unfinished: palette.warning.main, untested: palette.text.secondary, off: palette.text.disabled }[light];
}

/** The colour of a state, for the word next to its icon. */
export const useLight = useLightColor;

const ICONS = { ok: CheckCircle, problem: Cancel, unfinished: WarningAmber, untested: HelpOutlined, off: BlockOutlined };

/** The icon of a state. */
export function StateIcon({ light, size = 20 }: { light: Light; size?: number }) {
    const color = useLightColor(light);
    const Icon = ICONS[light];
    return <Icon aria-hidden data-light={light} sx={{ fontSize: size, color, flexShrink: 0 }} />;
}
