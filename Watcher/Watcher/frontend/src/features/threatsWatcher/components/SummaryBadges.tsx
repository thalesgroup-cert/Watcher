import { Box, Chip, Stack, Tooltip } from '@mui/material';
import AutoAwesomeOutlined from '@mui/icons-material/AutoAwesomeOutlined';
import ScheduleOutlined from '@mui/icons-material/ScheduleOutlined';
import { formatDateTime } from '../../timeline/format';
import type { Summary } from '../types';

const LOGO_BASE = '/static/frontend/images/connectors/';
/** The AI connectors that have a logo of their own; the model of any other provider gets the neutral icon. */
const WITH_LOGO = new Set(['openai', 'anthropic', 'gemini', 'ollama']);

/**
 * The model that wrote a summary, as a badge with the logo of its connector: "anthropic/claude-haiku-5-5" is Anthropic and
 * claude-haiku-5-5. A model of another provider, or the local one, has the neutral icon. The whole name is in the tooltip.
 */
export function ModelBadge({ model }: { model: string | null | undefined }) {
    if (!model || model === 'Unknown') return null;
    const slash = model.indexOf('/');
    const provider = slash > 0 ? model.slice(0, slash).toLowerCase() : '';
    const name = slash > 0 ? model.slice(slash + 1) : model;
    const logo = WITH_LOGO.has(provider) ? (
        <Box component="img" src={`${LOGO_BASE}${provider}.png`} alt="" sx={{ width: 16, height: 16, objectFit: 'contain', ml: '6px !important', mr: '-2px !important' }} />
    ) : (
        <AutoAwesomeOutlined />
    );
    return (
        <Tooltip title={model}>
            <Chip size="small" variant="outlined" icon={logo} label={name} data-testid="model-badge" sx={{ maxWidth: 220, minWidth: 0, flexShrink: 1 }} />
        </Tooltip>
    );
}

/** When a summary was written and by which model, as two badges that stand out from the text around them. */
export function GeneratedBadges({ summary }: { summary: Summary }) {
    return (
        <Stack direction="row" sx={{ alignItems: 'center', gap: 0.75, flexWrap: 'nowrap', minWidth: 0, flex: '1 1 0' }}>
            <Chip size="small" variant="outlined" icon={<ScheduleOutlined />} label={`Generated ${formatDateTime(summary.created_at)}`} sx={{ flexShrink: 0 }} />
            <ModelBadge model={summary.ai_model} />
        </Stack>
    );
}
