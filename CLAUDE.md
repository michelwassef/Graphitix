# CLAUDE.md

## General Rules

**Rule 1:** When fixing an issue, never use defensive cleanup. Always aim for root-cause fix.

**Rule 2:** When the root cause has been identified for an issue, always analyze whether it is part of a bigger architectural issue or not. If it is, stop and report the bigger refactor that would be needed to better address the issue.

**Rule 3:** Remove all legacy or redundant code you find after making absolutely sure it is not used, even if it is not directly related to the current task. If you find code that needs to be refactored, or any other inconsistency (e.g. architectural), report it, even if it is not directly related to the current issue. In addition to reporting it, write/append the issue to the `issues.txt` file located in the root directory. Make sure it is not a duplicate of previously reported issues.

**Rule 4:** Ensure that the testing framework is up to date and coherent with code changes.

**Rule 5:** Whenever possible, reduce token consumption by turning to non-verbose mode. However, do NOT reduce the amount of work needed to complete a task.

## Venn / Graphitix Specific Rules

**Rule 6:** True tab isolation is a golden rule that should always be preserved. No information should leak between different tabs of the same component.

**Rule 7:** A reopened file should behave in the exact same way as the initial file. All data, graph size and parameters, statistical tests and results should be restored. As much as possible all data should be cached to speed up switching to and from data-heavy tabs, and this same cache should be saved and used during file reopening. The user should not be able to tell that the file has been closed and reopened.

**Rule 8:** The different components, while each having their specificities, should operate as homogeneously as possible. This means bugs in one component should be fixed by comparing the code of other components and normalizing its code with that of other components. Only if this fails should a component-specific fix be made. This should always be the procedure to follow.

## Important

Disregard all code in `desktop/app` — it gets automatically duplicated from the main code when the desktop app is built.
