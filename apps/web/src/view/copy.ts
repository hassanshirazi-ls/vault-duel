// UI copy that mentions a rule number. These are templates for renderText(template, globals) (D-172): the numbers
// come from the globals, never from this file. Plain words without numbers live next to the component that uses them.
export const UNSTABLE_WARNING = 'Unstable: +{UNSTABLE_BONUS} Power now, but it is destroyed at the end of your next turn.';
/** Card inspect, on a crowned monster of the Monarch's (D-349): the number is CROWN_POWER, rendered by renderText. */
export const CROWN_LINE = 'Crowned: +{CROWN_POWER} Power while it serves the Monarch';
export const ASCEND_ADD = 'Add a third for Ascend:';
export const ASCEND_SKIP = 'Graft without Ascend';
