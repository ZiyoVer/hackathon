from __future__ import annotations

import asyncio
from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Optional
from uuid import uuid4

from backend.schemas import AnalysisResponse, SpeakerLine


@dataclass
class Operator:
    id: str
    name: str
    initial: str


@dataclass
class Session:
    id: str
    operator: Operator
    customer_label: str
    transcript: list[SpeakerLine] = field(default_factory=list)
    last_analysis: Optional[AnalysisResponse] = None
    started_at: datetime = field(default_factory=lambda: datetime.now(timezone.utc))
    updated_at: datetime = field(default_factory=lambda: datetime.now(timezone.utc))
    status: str = "active"  # active | escalated | closed


class SessionStore:
    def __init__(self) -> None:
        self._sessions: dict[str, Session] = {}
        self._operators: dict[str, Operator] = {
            "op1": Operator(id="op1", name="Aziza Rahimova", initial="A"),
            "op2": Operator(id="op2", name="Bobur Kamolov", initial="B"),
            "op3": Operator(id="op3", name="Dilshod Mirzo", initial="D"),
            "op4": Operator(id="op4", name="Madina Usmonova", initial="M"),
        }
        self._lock = asyncio.Lock()

    def operators(self) -> list[Operator]:
        return list(self._operators.values())

    async def create_session(self, operator_id: str, customer_label: str) -> Session:
        op = self._operators.get(operator_id) or self.operators()[0]
        session = Session(id=str(uuid4()), operator=op, customer_label=customer_label or "Mijoz")
        async with self._lock:
            self._sessions[session.id] = session
        return session

    async def append_message(
        self,
        session_id: str,
        line: SpeakerLine,
        analysis: AnalysisResponse,
    ) -> Session:
        async with self._lock:
            session = self._sessions[session_id]
            session.transcript.append(line)
            session.last_analysis = analysis
            session.updated_at = datetime.now(timezone.utc)
            if analysis.priority == "urgent" or analysis.risk_level == "high":
                session.status = "escalated"
        return session

    async def list_sessions(self) -> list[Session]:
        async with self._lock:
            return sorted(self._sessions.values(), key=lambda s: s.updated_at, reverse=True)

    async def get_session(self, session_id: str) -> Optional[Session]:
        async with self._lock:
            return self._sessions.get(session_id)

    async def close_session(self, session_id: str) -> Optional[Session]:
        async with self._lock:
            session = self._sessions.get(session_id)
            if session:
                session.status = "closed"
                session.updated_at = datetime.now(timezone.utc)
            return session


store = SessionStore()
