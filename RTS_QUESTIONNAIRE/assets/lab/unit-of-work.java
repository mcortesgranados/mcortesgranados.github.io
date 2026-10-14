package com.acme.sales.application;

import com.acme.sales.domain.Customer;
import com.acme.sales.domain.CustomerId;
import com.acme.sales.domain.PlanCode;
import com.acme.sales.domain.spec.ActiveOnPlan;
import com.acme.sales.infrastructure.persistence.OutboxEntry;
import com.acme.sales.infrastructure.persistence.OutboxRepository;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.event.TransactionalEventListener;
import org.springframework.transaction.event.TransactionPhase;

import java.time.Clock;
import java.time.OffsetDateTime;
import java.util.List;
import java.util.UUID;

/**
 * Q32 — Unit of Work in the Java / Spring stack.
 *
 * Spring expresses the pattern differently from EF Core: there is no explicit
 * SaveChanges. The transactional boundary is the proxied method annotated with
 * {@code @Transactional}, the JPA {@code EntityManager} inside that boundary is the
 * unit of work (its persistence context tracks the dirty entities), and the commit
 * happens when the method returns. What matters is unchanged: one boundary per use
 * case, one commit, and nothing half-written on failure.
 *
 * The second half of the pattern is that the event is not published here. It is
 * staged inside the transaction and dispatched only after the commit, so a rollback
 * cannot leave a published event describing a change that never landed.
 */
@Service
public class UpgradePlanUseCase {

    /**
     * The event name is part of the contract with whoever consumes the outbox, so it
     * is a named constant rather than a literal buried in the staging call.
     */
    private static final String PLAN_CHANGED_EVENT = "customer.plan.changed";

    private final CustomerRepository customers;
    private final PlanUpgradePolicy policy;
    private final OutboxRepository outbox;
    private final Clock clock;

    public UpgradePlanUseCase(
            CustomerRepository customers,
            PlanUpgradePolicy policy,
            OutboxRepository outbox,
            Clock clock) {
        this.customers = customers;
        this.policy = policy;
        this.outbox = outbox;
        this.clock = clock;
    }

    /**
     * One use case, one transaction. {@code rollbackFor = Exception.class} is
     * explicit because the default only rolls back on unchecked exceptions, and a
     * checked exception escaping this method must not leave a committed change.
     */
    @Transactional(rollbackFor = Exception.class)
    public UpgradeResult upgrade(CustomerId customerId, PlanCode target, UUID idempotencyKey) {
        // Idempotency: the same key inside the transaction returns the previous result.
        var previous = outbox.findResult(idempotencyKey);
        if (previous.isPresent()) {
            return previous.get();
        }

        Customer customer = customers.findById(customerId)
                .orElseThrow(() -> new CustomerNotFound(customerId));

        // The rule lives in the domain and it is the only reason this use case exists.
        var change = customer.changePlan(target, OffsetDateTime.now(clock), policy);

        // Dirty tracking persists the aggregate; the outbox row joins the same
        // transaction, which is what makes the write and its event atomic.
        outbox.stage(OutboxEntry.of(PLAN_CHANGED_EVENT, change, idempotencyKey));

        return UpgradeResult.confirmed(change.effectiveOn());
    }

    /**
     * Dispatched after the commit, not before. The listener receives the same event
     * the domain raised, and if the transaction rolls back it is never called.
     */
    @TransactionalEventListener(phase = TransactionPhase.AFTER_COMMIT)
    public void publish(CustomerPlanChanged event) {
        outbox.dispatch(event);
    }

    /**
     * The read side does not go through the aggregate. Reporting screens use a
     * projection query that selects only the columns the screen renders, which keeps
     * the write model free of reporting concerns and the query out of the domain.
     */
    @Transactional(readOnly = true)
    public List<ActiveCustomerRow> activeCustomersOn(PlanCode plan) {
        return customers.project(new ActiveOnPlan(plan, OffsetDateTime.now(clock)))
                .stream()
                .map(ActiveCustomerRow::from)
                .toList();
    }
}
