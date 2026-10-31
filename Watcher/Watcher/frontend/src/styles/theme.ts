import { alpha, createTheme, darken, getContrastRatio, lighten, type Theme } from '@mui/material/styles';
import { THEMES, type ThemeName } from './themes';

// Visual language borrowed from thalesgroup-cert/suspicious; the palettes are in ./themes.

export const fonts = {
    sans: '"Inter Variable", Inter, system-ui, -apple-system, "Segoe UI", Roboto, Arial, sans-serif',
    mono: '"IBM Plex Mono", ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Courier New", monospace',
};

export function createWatcherTheme(name: ThemeName): Theme {
    const { palette: p, dark } = THEMES[name];
    const mode = dark ? 'dark' : 'light';
    const ink = dark ? '#FFFFFF' : '#0B1220';
    const line = (a: number) => alpha(p.text, a);
    // A dark brand blue (Darkly #375a7f) fills a button well but is too dim as text, an icon or a focus ring on the dark
    // surface: the theme's primary is a lighter tint of it, and only the filled buttons keep the brand blue itself.
    const accent = dark && getContrastRatio(p.primary, p.bgPaper) < 3 ? lighten(p.primary, 0.5) : p.primary;
    const brandFill = accent !== p.primary;

    return createTheme({
        palette: {
            mode,
            primary: { main: accent },
            secondary: { main: p.secondary },
            info: { main: p.info },
            success: { main: p.success },
            warning: { main: p.warning },
            error: { main: p.error },
            background: { default: p.bgDefault, paper: p.bgPaper },
            text: { primary: p.text, secondary: alpha(p.text, dark ? 0.72 : 0.7) },
            divider: line(0.1),
        },
        shape: { borderRadius: 4 },
        typography: {
            fontFamily: fonts.sans,
            fontSize: 13,
            h1: { fontSize: 28, fontWeight: 750, letterSpacing: -0.6 },
            h2: { fontSize: 22, fontWeight: 750, letterSpacing: -0.4 },
            h3: { fontSize: 18, fontWeight: 750, letterSpacing: -0.2 },
            h4: { fontSize: 16, fontWeight: 750 },
            h5: { fontSize: 14, fontWeight: 750 },
            h6: { fontSize: 13, fontWeight: 750 },
            body1: { fontSize: 13, lineHeight: 1.55 },
            body2: { fontSize: 12.5, lineHeight: 1.5 },
            caption: { fontSize: 12, lineHeight: 1.35 },
            button: { textTransform: 'none', fontWeight: 650 },
        },
        components: {
            MuiCssBaseline: {
                styleOverrides: {
                    body: { fontFeatureSettings: '"cv02", "cv03", "cv04", "cv11"' },
                    'code, kbd, samp, pre': { fontFamily: fonts.mono },
                },
            },
            MuiContainer: { defaultProps: { maxWidth: false } },
            // The library writes "1–25" with an en dash and no separator for the thousands.
            MuiTablePagination: {
                defaultProps: {
                    labelDisplayedRows: ({ from, to, count }) => `${from}-${to} of ${count !== -1 ? count.toLocaleString('en-GB') : `more than ${to}`}`,
                },
            },
            MuiButton: {
                defaultProps: { disableElevation: true },
                styleOverrides: {
                    root: { borderRadius: 10, paddingInline: 12, height: 34 },
                    sizeSmall: { height: 30, paddingInline: 10 },
                    sizeLarge: { height: 40, paddingInline: 14 },
                    ...(brandFill && {
                        containedPrimary: { backgroundColor: p.primary, color: '#FFFFFF', '&:hover': { backgroundColor: darken(p.primary, 0.12) } },
                    }),
                },
            },
            MuiIconButton: { styleOverrides: { root: { borderRadius: 10 } } },
            MuiTextField: { defaultProps: { variant: 'outlined', size: 'small' } },
            MuiSelect: { defaultProps: { size: 'small' } },
            MuiInputLabel: { styleOverrides: { root: { fontSize: 12.5 } } },
            MuiOutlinedInput: {
                styleOverrides: {
                    root: {
                        borderRadius: 10,
                        backgroundColor: alpha(ink, dark ? 0.04 : 0.03),
                        transition: 'background-color 120ms ease, border-color 120ms ease',
                        '&:hover': { backgroundColor: alpha(ink, dark ? 0.06 : 0.045) },
                        '&.Mui-focused': { backgroundColor: alpha(ink, dark ? 0.05 : 0.035) },
                    },
                    notchedOutline: { borderColor: line(0.14) },
                },
            },
            MuiPaper: {
                styleOverrides: {
                    root: { backgroundImage: 'none', borderRadius: 14, border: `1px solid ${line(dark ? 0.1 : 0.08)}` },
                },
            },
            MuiAppBar: {
                defaultProps: { elevation: 0, color: 'default' },
                styleOverrides: {
                    root: {
                        borderRadius: 0,
                        border: 'none',
                        borderBottom: `1px solid ${line(dark ? 0.1 : 0.08)}`,
                        backgroundColor: p.bgPaper,
                        color: p.text,
                    },
                },
            },
            MuiCard: {
                styleOverrides: {
                    root: { borderRadius: 16, boxShadow: 'none', border: `1px solid ${line(dark ? 0.12 : 0.08)}` },
                },
            },
            MuiDialog: { styleOverrides: { paper: { borderRadius: 16 } } },
            MuiDivider: { styleOverrides: { root: { borderColor: line(0.1) } } },
            MuiChip: {
                defaultProps: { size: 'small' },
                styleOverrides: {
                    root: {
                        borderRadius: 10,
                        fontWeight: 600,
                        height: 24,
                    },
                    outlined: { borderColor: line(dark ? 0.12 : 0.1) },
                },
            },
            MuiTooltip: {
                // A tooltip never catches the mouse: it would cover the button below it (Next / Archive in the drawers).
                defaultProps: { disableInteractive: true },
                styleOverrides: {
                    tooltip: {
                        fontSize: 12,
                        padding: '8px 10px',
                        borderRadius: 10,
                        backgroundColor: alpha('#0B1220', dark ? 0.92 : 0.9),
                        border: `1px solid ${alpha('#FFFFFF', 0.12)}`,
                    },
                },
            },
            MuiAlert: {
                defaultProps: { variant: 'outlined' },
                styleOverrides: {
                    root: { borderRadius: 14, alignItems: 'center', backgroundColor: alpha(ink, dark ? 0.03 : 0.02) },
                    message: { fontSize: 12.5 },
                },
            },
            MuiTableCell: {
                styleOverrides: {
                    root: { paddingTop: 8, paddingBottom: 8, borderBottomStyle: 'solid', borderColor: line(0.1) },
                    head: { fontSize: 12, fontWeight: 750, color: alpha(p.text, 0.7), backgroundColor: line(dark ? 0.03 : 0.025) },
                },
            },
            MuiTableRow: { styleOverrides: { root: { '&:hover': { backgroundColor: line(dark ? 0.04 : 0.03) } } } },
            MuiLink: {
                defaultProps: { underline: 'hover' },
                styleOverrides: { root: { fontWeight: 600 } },
            },
        },
    });
}
