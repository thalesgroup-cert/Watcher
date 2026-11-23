import { Link as RouterLink } from 'react-router';
import { alpha, Box, ButtonBase, Typography } from '@mui/material';
import LockOutlined from '@mui/icons-material/LockOutlined';
import { LOCKED_MODULES } from './lockedModules';

/** Under the open modules of the Overview: the other modules, locked, each one leading to what it does. */
export function LockedModulesRow() {
    return (
        <Box data-testid="locked-modules-row" component="section" aria-label="More with an account">
            <Typography variant="overline" color="text.secondary" component="h2" sx={{ display: 'block', mb: 1, letterSpacing: '0.08em' }}>
                More with an account
            </Typography>
            <Box sx={{ display: 'grid', gap: 2, gridTemplateColumns: { xs: '1fr', sm: 'repeat(2, 1fr)', lg: 'repeat(3, 1fr)' } }}>
                {LOCKED_MODULES.map((module) => (
                    <ButtonBase
                        key={module.to}
                        component={RouterLink}
                        to={module.to}
                        data-testid={`locked-card-${module.to.slice(1)}`}
                        sx={(theme) => ({
                            display: 'flex',
                            alignItems: 'flex-start',
                            gap: 1.5,
                            textAlign: 'left',
                            p: 2,
                            borderRadius: 3,
                            border: `1px dashed ${theme.palette.divider}`,
                            transition: theme.transitions.create(['background-color', 'border-color'], { duration: 120 }),
                            '&:hover': { bgcolor: alpha(theme.palette.primary.main, 0.06), borderColor: theme.palette.primary.main },
                            '&.Mui-focusVisible': { outline: `2px solid ${alpha(theme.palette.primary.main, 0.7)}`, outlineOffset: 1 },
                        })}
                    >
                        <Box sx={{ color: 'text.secondary', display: 'grid', placeItems: 'center', mt: '2px', '& svg': { fontSize: 24 } }}>{module.icon}</Box>
                        <Box sx={{ minWidth: 0, flexGrow: 1 }}>
                            <Typography sx={{ fontWeight: 600 }}>{module.label}</Typography>
                            <Typography variant="body2" color="text.secondary">
                                {module.tagline}
                            </Typography>
                        </Box>
                        <LockOutlined fontSize="small" sx={{ color: 'text.secondary', mt: '2px' }} />
                    </ButtonBase>
                ))}
            </Box>
        </Box>
    );
}
