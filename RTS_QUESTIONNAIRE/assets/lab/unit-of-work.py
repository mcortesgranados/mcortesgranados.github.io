"""Q32 — Unit of Work in the Python / SQLAlchemy stack.

The same pattern with different mechanics again. SQLAlchemy's Session is the unit
of work: it tracks the objects it loaded, flushes them in dependency order and
commits once. Wrapping it in an explicit `UnitOfWork` context manager is what makes
the boundary visible in the application code — the use case never calls `commit()`
itself, so it cannot commit halfway through its work, and the outbox row is written
in the same session for the same reason it is in the other stacks.
"""

from __future__ import annotations

from contextlib import AbstractContextManager
from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Protocol, Sequence
from uuid import UUID

from sqlalchemy.orm import Session, sessionmaker

from app.domain.customer import Customer, CustomerId
from app.domain.events import DomainEvent
from app.domain.specification import Specification
from app.infrastructure.messaging import publish
from app.infrastructure.persistence import active_customers_projection, outbox_row


class CustomerRepository(Protocol):
    """The repository port, owned by the application layer.

    An intent-named method plus a specification, exactly as in the .NET and Java
    implementations. `flush()` is exposed only so the unit of work can order the
    writes; `commit()` deliberately is not.
    """

    def find(self, customer_id: CustomerId) -> Customer | None: ...
    def matching(self, specification: Specification[Customer]) -> Sequence[Customer]: ...
    def project_active_on(self, plan_code: str) -> Sequence[dict]: ...
    def add(self, customer: Customer) -> None: ...


class SqlAlchemyCustomerRepository:
    """Infrastructure implementation: the only place in the project that imports an ORM."""

    def __init__(self, session: Session) -> None:
        self._session = session

    def find(self, customer_id: CustomerId) -> Customer | None:
        return self._session.get(Customer, customer_id)

    def matching(self, specification: Specification[Customer]) -> Sequence[Customer]:
        return self._session.scalars(specification.to_select()).all()

    def project_active_on(self, plan_code: str) -> Sequence[dict]:
        # A read path that never materialises the aggregate: it selects the four
        # columns the reporting screen renders.
        return self._session.execute(
            active_customers_projection(plan_code)
        ).mappings().all()

    def add(self, customer: Customer) -> None:
        self._session.add(customer)


@dataclass(frozen=True)
class OutboxEntry:
    id: UUID
    name: str
    payload: dict
    occurred_at: datetime

    @staticmethod
    def from_event(event: DomainEvent) -> "OutboxEntry":
        return OutboxEntry(id=event.id, name=event.name, payload=event.payload, occurred_at=event.occurred_at)


class UnitOfWork(AbstractContextManager["UnitOfWork"]):
    """One transactional boundary per use case.

    Enter the block, do the work, and either the whole thing commits or nothing
    does. The repository is handed to the caller on an already-open transaction so
    that no code outside this class has to know how a session is started.
    """

    def __init__(self, session_factory: sessionmaker[Session]) -> None:
        self._session_factory = session_factory
        self._session: Session | None = None
        self._events: list[DomainEvent] = []

    def __enter__(self) -> "UnitOfWork":
        self._session = self._session_factory()
        return self

    @property
    def customers(self) -> CustomerRepository:
        if self._session is None:
            raise RuntimeError("The unit of work must be entered before it is used.")
        return SqlAlchemyCustomerRepository(self._session)

    def stage(self, events: Sequence[DomainEvent]) -> None:
        """Events raised by the aggregate are held, not published."""
        self._events.extend(events)

    def __exit__(self, exc_type, exc, traceback) -> bool:
        if self._session is None:
            return False

        try:
            if exc_type is not None:
                # Anything thrown in the block takes the whole transaction with it.
                self._session.rollback()
                return False

            # The outbox row joins the same transaction as the state change, so the
            # event can never describe a change that was not committed.
            for event in self._events:
                self._session.add(outbox_row(OutboxEntry.from_event(event)))

            self._session.flush()
            self._session.commit()
        except Exception:
            self._session.rollback()
            raise
        finally:
            # Publishing happens after the commit returns, never inside the boundary.
            for event in self._events if exc_type is None else []:
                publish(event)
            self._session.close()
            self._session = None

        return False


def upgrade_plan(session_factory: sessionmaker[Session], customer_id: CustomerId, target: str, now: datetime | None = None) -> datetime:
    """The use case: no commit anywhere, because the boundary is not its business."""
    with UnitOfWork(session_factory) as uow:
        customer = uow.customers.find(customer_id)
        if customer is None:
            raise LookupError(f"customer {customer_id} does not exist")

        change = customer.change_plan(target, now or datetime.now(timezone.utc))
        uow.stage(customer.pull_events())          # raised in the domain, held here

        return change.effective_on
