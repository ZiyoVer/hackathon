# SQB Agent Copilot Product Plan

## Positioning

SQB Agent Copilot is not a generic call-center chatbot. It is a regulated-bank agent assist surface that gives Uzbek call-center agents compliant, grounded, and auditable guidance while they speak with customers.

## Differentiators

1. Compliance Evidence Timeline
   - Tie each compliance warning to transcript context.
   - Show the safer phrase the agent should use.
   - Make the compliance score explainable in the demo.

2. SQB Product Battlecards
   - Show product and policy references next to the agent script.
   - Make the guidance feel bank-specific instead of generic LLM output.
   - Mark references as verified or fallback.

3. Supervisor Escalation Packet
   - Generate an operational handoff for complaints, distrust, competitor objections, and red compliance.
   - Include urgency, owner, reason, transcript excerpt, and handoff note.

4. Minimal Agent Decision Surface
   - The first thing an agent sees should be the next sentence to say.
   - Secondary details should live behind compact tabs: Script, Compliance, CRM, Transcript.

5. Explainable AI Signal
   - Show analysis mode and matched signals.
   - Judges can see whether the result came from OpenAI or local fallback rules.

## Implementation Priority

1. Compliance evidence + product references in backend.
2. Minimal frontend hierarchy centered on next response.
3. Escalation packet and CRM-copy workflow.
4. Editable transcript and agent coaching mode after MVP is stable.

## Demo Narrative

1. Customer asks for credit and objects to high interest.
2. Copilot detects credit intent, interest-rate objection, and attention priority.
3. Agent gets the exact next line to say.
4. Compliance timeline proves which disclosures are missing.
5. Product battlecards show grounded bank references.
6. CRM brief and escalation packet are ready to copy.
