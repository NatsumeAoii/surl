# Manual UI/UX Test Matrix

## Viewports

| Viewport       | Width | Height | Status  | Notes                                                                                  |
| -------------- | ----: | -----: | ------- | -------------------------------------------------------------------------------------- |
| Mobile narrow  |   360 |    800 | Pending | Confirm tabs, alias prefix, and profile stack do not overflow.                         |
| Mobile wide    |   430 |    932 | Pending | Confirm stacked tool/profile order remains clear.                                      |
| Tablet         |   768 |   1024 | Pending | Confirm profile panels form a two-column row below the tool.                           |
| Desktop        |  1440 |    900 | Pending | Confirm tool/profile deck aligns at the top and footer stays balanced.                 |
| History open   |  1440 |    900 | Pending | Confirm saved links scroll inside the Profile submenu and do not increase page length. |
| History locked |   360 |    800 | Pending | Confirm My Links shows Locked before consent and does not expand into an error panel.  |

## Interaction Checks

| Check          | Expected Result                                          | Status  | Notes                                                                         |
| -------------- | -------------------------------------------------------- | ------- | ----------------------------------------------------------------------------- |
| Tab order      | Focus follows visible workflow order.                    | Pending | Confirm focus starts in the tool workflow and History appears inside Profile. |
| Focus visible  | Every interactive control has a visible focus indicator. | Pending |                                                                               |
| Primary action | Each view has one clear primary action.                  | Pending |                                                                               |
| Touch targets  | Interactive controls are at least 44px.                  | Pending |                                                                               |
| Reduced motion | Motion is disabled or minimized when requested.          | Pending |                                                                               |
| Error recovery | Errors show user-safe messages and a clear next action.  | Pending |                                                                               |

## State Coverage

| State    | Expected Result                                             | Status  | Notes                               |
| -------- | ----------------------------------------------------------- | ------- | ----------------------------------- |
| Loading  | Progress is perceivable without layout jump.                | Pending |                                     |
| Empty    | Empty state explains the next action without filler copy.   | Pending |                                     |
| Error    | Error is actionable and does not expose diagnostics.        | Pending |                                     |
| Success  | Result is clear and copy action is available.               | Pending |                                     |
| Disabled | Disabled controls explain unavailable actions where needed. | Pending | My Links is disabled until consent. |
