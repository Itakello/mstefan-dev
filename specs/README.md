# Playwright test plans

The Playwright planner drafts Markdown plans in this directory. The pull request is the human review surface: a plan is approved only when its matching generated test is reviewed and merged.

The supported flow is planner → reviewed Markdown plan → generator → deterministic Playwright CI. CI never asks an LLM to decide whether a test passes.

Only the Playwright planner and generator agents are installed. The stock healer is intentionally excluded because automated remediation must never weaken assertions, add meaningful skips, or hide a product failure. A failing test remains failing until a reviewed code or test change fixes its root cause.
