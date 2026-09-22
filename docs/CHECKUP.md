# Environment checkup list

_A living checklist the doctor runs before/while the team works. Each row is a cheap check with a concrete
fix. The doctor APPENDS a new row whenever it solves a new blocker, so the next run catches it automatically._

| symptom | check | fix (no host privileges) |
|---|---|---|
| dependencies missing | `pip check`, or `python -c "import <top-level package>"` | `pip install -r requirements.txt` (or install the project's declared deps) |
| test runner missing | `pytest --version` (or the project's runner) | install the project's declared dev dependencies |
| project won't import | `python -c "import <package>"` from the repo root | fix the environment (path/deps); if the code itself is broken, report it -- the coder fixes code |
| port left occupied by a prior run | check the project's own port is free | stop only THIS project's leftover process/container; bind an ephemeral port for tests |
| stale virtualenv / wrong interpreter | the interpreter runs and imports the project | recreate/repair the project venv (no system Python changes) |

_Report-only (do not fix): missing API keys, git branch state._
