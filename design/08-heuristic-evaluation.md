## Heuristic Evaluation: SQB Manager Console

**Evaluated**: 2026-04-25
**Framework**: Nielsen's 10 Usability Heuristics
**Scope**: Manager session drawer and live monitoring dashboard

### Summary
- Critical issues: 1
- Major issues: 3
- Minor issues: 1

### Critical Issues

#### Issue 1: Raw transcript JSON blocks supervisor review
- **Heuristic violated**: #2 Match real world, #6 Recognition over recall
- **Location**: Manager drawer transcript area
- **Problem**: Full uploaded transcript appeared as raw JSON with `id`, `speaker`, `start`, `end` fields.
- **Impact**: Supervisor cannot quickly understand customer complaint, timing, or escalation context.
- **Recommendation**: Parse JSON transcript into a human-readable speaker timeline with time ranges.
- **Severity**: 4

### Major Issues

#### Issue 2: Operational mode is unclear
- **Heuristic violated**: #1 Visibility of system status
- **Location**: Manager dashboard header
- **Problem**: Demo transcript mode and future VoIP real-time expectation were not visible.
- **Impact**: Judges may confuse current batch transcript demo with the intended live VoIP architecture.
- **Recommendation**: Show compact operational status chips for demo transcript, real-time latency target, and offline model fallback.
- **Severity**: 3

#### Issue 3: Drawer hierarchy puts transcript before action
- **Heuristic violated**: #8 Aesthetic and minimalist design
- **Location**: Manager drawer
- **Problem**: Summary, escalation, suggested response, and transcript competed visually.
- **Impact**: Manager has to scan too much before deciding whether to intervene.
- **Recommendation**: Put session metrics, risk summary, next action, escalation, and operator response before transcript timeline.
- **Severity**: 3

#### Issue 4: Cards use raw sentiment values
- **Heuristic violated**: #2 Match real world
- **Location**: Session cards
- **Problem**: English values like `negative` appeared in the Uzbek UI.
- **Impact**: UI feels prototype-like and less polished.
- **Recommendation**: Localize sentiment labels.
- **Severity**: 3

### Minor Issues

#### Issue 5: Drawer width is too narrow for review work
- **Heuristic violated**: #7 Flexibility and efficiency
- **Location**: Manager drawer
- **Problem**: Long complaint context wraps aggressively.
- **Impact**: Slower review on desktop.
- **Recommendation**: Increase drawer width and use sectioned cards.
- **Severity**: 2

### Strengths Observed
- Risk sorting exists.
- Escalation state is visually prominent.
- Session polling already supports near-real-time manager monitoring.

### Next Steps
1. Add backend-side transcript normalization so cards also show segment counts.
2. Add real streaming ingestion once VoIP/WebSocket integration is available.
3. Benchmark online model vs Gemma 4 offline fallback for latency and Uzbek quality.
