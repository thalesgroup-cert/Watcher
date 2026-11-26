import { Badge, GlobalStyles, IconButton, Tooltip, useTheme } from '@mui/material';
import HelpOutlineOutlined from '@mui/icons-material/HelpOutlineOutlined';
import { driver, type Driver } from 'driver.js';
import 'driver.js/dist/driver.css';
import { useOnboarding } from './hooks';
import { TOURS, type TourId, type TourStep } from './tours';

/** The popover follows the active theme instead of driver.js's white. */
function TourStyles() {
    const { palette } = useTheme();
    const paper = palette.background.paper;
    return (
        <GlobalStyles
            styles={{
                '.driver-popover.watcher-tour': { backgroundColor: paper, color: palette.text.primary, borderRadius: 8, maxWidth: 340 },
                '.driver-popover.watcher-tour .driver-popover-title': { fontSize: 16, fontWeight: 600 },
                '.driver-popover.watcher-tour .driver-popover-description, .driver-popover.watcher-tour .driver-popover-progress-text': { color: palette.text.secondary },
                '.driver-popover.watcher-tour button': { backgroundColor: palette.action.hover, color: palette.text.primary, border: `1px solid ${palette.divider}`, textShadow: 'none' },
                '.driver-popover.watcher-tour .driver-popover-next-btn': { backgroundColor: palette.primary.main, color: palette.primary.contrastText, borderColor: palette.primary.main },
                '.driver-popover.watcher-tour .driver-popover-close-btn': { backgroundColor: 'transparent', border: 'none', color: palette.text.secondary },
                '.driver-popover.watcher-tour .driver-popover-arrow-side-left.driver-popover-arrow': { borderLeftColor: paper },
                '.driver-popover.watcher-tour .driver-popover-arrow-side-right.driver-popover-arrow': { borderRightColor: paper },
                '.driver-popover.watcher-tour .driver-popover-arrow-side-top.driver-popover-arrow': { borderTopColor: paper },
                '.driver-popover.watcher-tour .driver-popover-arrow-side-bottom.driver-popover-arrow': { borderBottomColor: paper },
            }}
        />
    );
}

const TABS = '[data-tour="page-tabs"] [role="tab"]';
const sleep = (ms: number) => new Promise((resolve) => window.setTimeout(resolve, ms));

const tabButtons = () => [...document.querySelectorAll<HTMLElement>(TABS)];
const findTab = (label: string) => tabButtons().find((t) => t.textContent?.trim().startsWith(label));
const selectedTab = () => tabButtons().find((t) => t.getAttribute('aria-selected') === 'true');

const locate = (step: TourStep): Element | null => {
    if (step.tabButton) return findTab(step.tabButton) ?? null;
    return step.target ? document.querySelector(step.target) : null;
};

/** Opens the tab of a step and waits for its target to be on the page. False when the target never shows up. */
async function prepare(step: TourStep): Promise<boolean> {
    if (step.tab) {
        const tab = findTab(step.tab);
        if (tab && tab.getAttribute('aria-selected') !== 'true') tab.click();
    }
    if (!step.target && !step.tabButton) return true;
    for (let i = 0; i < 25; i++) {
        if (locate(step)) return true;
        await sleep(100);
    }
    return false;
}

/** Starts a tour from anywhere (the "?" of a page, or a button of a page about the tours). */
export function useTourStarter(tour: TourId) {
    const { ready, toursSeen, markTourSeen } = useOnboarding();
    const { steps } = TOURS[tour];

    const start = async () => {
        const opened = selectedTab()?.textContent?.trim();
        // Steps are reached one by one so each can open its tab first; a step with nothing to show is passed over.
        const reach = async (from: number, direction: 1 | -1, tourDriver: Driver) => {
            for (let i = from; i >= 0 && i < steps.length; i += direction) {
                if (await prepare(steps[i])) {
                    tourDriver.moveTo(i);
                    return;
                }
            }
            if (direction === 1) tourDriver.destroy();
        };
        const tourDriver: Driver = driver({
            popoverClass: 'watcher-tour',
            showProgress: true,
            smoothScroll: true,
            progressText: '{{current}} / {{total}}',
            nextBtnText: 'Next',
            prevBtnText: 'Back',
            doneBtnText: 'Done',
            steps: steps.map((step, index) => ({
                ...(step.target || step.tabButton ? { element: () => locate(step) ?? document.body } : {}),
                popover: {
                    title: step.title,
                    description: step.text,
                    onNextClick: () => {
                        if (index === steps.length - 1) tourDriver.destroy();
                        else void reach(index + 1, 1, tourDriver);
                    },
                    onPrevClick: () => void reach(index - 1, -1, tourDriver),
                },
            })),
            onDestroyed: () => {
                markTourSeen(tour);
                // Back to the tab the visitor was on before the tour moved around.
                if (opened) findTab(opened)?.click();
            },
        });
        for (let i = 0; i < steps.length; i++) {
            if (await prepare(steps[i])) {
                tourDriver.drive(i);
                return;
            }
        }
    };

    return { start, seen: !ready || toursSeen.includes(tour) };
}

/** The "?" of a page header: starts the tour of that page. A dot shows until the tour has been taken once. */
export function TourButton({ tour }: { tour: TourId }) {
    const { start, seen } = useTourStarter(tour);
    const { title } = TOURS[tour];

    return (
        <>
            <TourStyles />
            <Tooltip title={`Take a tour of ${title}`}>
                <IconButton size="small" onClick={() => void start()} aria-label={`Take a tour of ${title}`} sx={{ color: 'text.secondary' }}>
                    <Badge color="primary" variant="dot" invisible={seen}>
                        <HelpOutlineOutlined />
                    </Badge>
                </IconButton>
            </Tooltip>
        </>
    );
}
