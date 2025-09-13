# AGENTS Instructions

## Layout Guidelines

Any new dashboard sections must adhere to the following layout style for consistency with the existing **Line Graph** section:

### Left Panel
- Contains an input table that spans the full height of the page.
- Occupies roughly one-third of the total page width.

### Right Panel
- **Top area:**
  - Graph display on the left.
  - Graph controls on the right.
- **Bottom area:**
  - Display statistics when applicable.

### Separator
- Use a slidable divider between the left and right panels.

## Code Guidelines
- Include debugging code (e.g., `console.debug` or `console.log`) whenever new functionality is implemented to trace key inputs and state.
- Clearly comment any debug output to facilitate removal later.

## Testing
- After making changes, run `npm test` (if available) and ensure the command completes.
