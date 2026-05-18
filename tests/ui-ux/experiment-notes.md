# UI/UX Experiment Notes

## Experiment

- Date: 2026-05-13
- Branch: `ui-ux-experiment`
- Goal: Explore UI/UX changes without affecting the main checkout.

## Hypothesis

The previous layout used a large heading area and delayed the profile/sidebar stack with artificial top padding. Starting directly at the aligned tool/profile deck should make the primary shortening workflow easier to scan, while keeping source and platform links in the footer.

## Changes Tried

- Removed the workspace intro and tagline copy so the page starts at the primary tool panel.
- Kept project metadata and source links in the semantic footer.
- Removed sidebar top padding and aligned the profile stack directly with the tool panel.
- Changed mode tabs to auto-fit instead of reserving an empty third tab slot.
- Moved History out of the primary mode tabs into a Profile submenu.
- Kept the Profile History submenu locked until consent is available, instead of opening an error-only panel.
- Removed the separate Privacy/History status card from the profile stack.
- Bounded the Profile History submenu with a stable clamp height so saved links scroll internally instead of lengthening the page.
- Shifted the light palette from beige-heavy surfaces to cooler neutral grays.
- Added static `layout.test.ts` guards for the no-intro workspace, footer metadata, and bounded Profile submenu History placement.

## Evidence

- `npm test -- layout.test.ts` passes after the layout and history placement changes.
- Full test, lint, format, and build verification should run before promoting this experiment.
- Browser viewport review is still needed for final visual approval.

## Decision

Keep for review. The layout keeps the primary action in the first content column, removes dead vertical space and short explainer copy, and makes History feel like supporting Profile data instead of a separate page-lengthening section.
