/**
 * pattern-glossary-workflow.js — live definition browser for RTS questionnaire Q46.
 *
 * Same pattern as pattern-inventory-workflow.js and the other proof pages: the Angular
 * reference component used `signal` + `computed` + `[class.active]` + `(click)`,
 * and this is the plain-DOM port, so the definitions run from a static page with no
 * build step.
 *
 * Angular                              -> this static proof
 *   signal<string>('named')              -> the active group stored in GROUPS
 *   computed(() => GROUPS[selected()])   -> selectGroup() looks the definitions up
 *   (click)="selectGroup('messaging')"   -> button click listener
 *   [class.active]="..."                 -> classList.toggle('active', ...)
 *   @for (term of group().terms)         -> renderTerms() builds the board
 *
 * The data is the same catalogue as assets/lab/pattern-catalogue.yaml: seven definitions
 * for the patterns the question names, and 75 more covering the wider distributed-systems vocabulary, each with a
 * relation that says where it sits in this work — including the entries that sit nowhere
 * in it.
 */
(function (global) {
  'use strict';

  var RELATION_LABELS = {
    prod: 'in production',
    inside: 'inside a named pattern',
    platform: 'platform-provided',
    rejected: 'deliberately not used',
    outside: 'outside these systems'
  };

  var RELATION_ORDER = ['prod', 'inside', 'platform', 'rejected', 'outside'];

  var GROUPS = {
    named: {
      label: "Named in the question",
      summary: "the seven patterns the question names · definition, the condition it is applied under, and the duration claimed for it",
      why: "The seven the question names, each with the definition this work is built on rather than the acronym, the condition under which it is applied, and the duration counted from the same basis as Q44. Depth is stated separately from duration, because a year count says nothing about whether the pattern is used everywhere or only where it earned its place.",
      terms: [
      {
        name: "CQRS — Command Query Responsibility Segregation",
        definition: "Writing through one model and reading through others: commands go through a transactional, validated aggregate and commit one use case at a time, while queries are served by denormalised projections or materialised views shaped for whatever the screen actually needs. The separation exists so that the write model is never designed around a report — and so that the read side can be thrown away and rebuilt.",
        relation: "prod",
        where: "in production 6+ years — wherever the read shape and the write shape genuinely differ"
      },
      {
        name: "Event Sourcing",
        definition: "Persisting state as the ordered sequence of events that produced it instead of as the current row: the append-only log is the source of truth and the present state is a fold over that log. Running it safely needs three things — an append that declares its expected version so two writers on one stream collide visibly, snapshots so a long-lived aggregate does not replay thousands of events, and upcasters applied on read, because the log is never rewritten.",
        relation: "prod",
        where: "in production 6 years — selectively, where the history itself is a business requirement"
      },
      {
        name: "Transactional Outbox",
        definition: "Writing the state change and the outgoing message inside the same local transaction — the message lands in an outbox table, not on the broker — and letting a relay publish from that table afterwards, marking rows as it goes. Publication is then at-least-once and can be neither lost nor emitted for a rollback, with no distributed transaction anywhere; the consumer side pairs it with an inbox and a dedup key, because at-least-once is durable all the way to the effect.",
        relation: "prod",
        where: "in production 6 years (2020 → present) — every state change that publishes an event"
      },
      {
        name: "Saga",
        definition: "A long-running business transaction that spans services and is executed as a series of local transactions, each one carrying a compensating action that semantically undoes it. Orchestrated where a business owner needs to read the process or the flow is long, choreographed where the participants are already event-driven and the flow is short; a timeout treats a silent participant as failed, and a compensation that cannot complete escalates to a queue a human can drain rather than being swallowed.",
        relation: "prod",
        where: "in production 6 years (2020 → present) — order, payment and provisioning flows"
      },
      {
        name: "Event-driven architecture",
        definition: "Producers publish events to a broker and consumers subscribe to them, with the producer neither knowing nor waiting for its consumers. Running it in production means schemas published and versioned as contracts, a named owning team per topic, replayable consumers, and the backlog plus the age of its oldest message as first-class metrics. It is a decision per boundary rather than a default: a system in which every interaction is an event is a system in which nothing has a clear owner.",
        relation: "prod",
        where: "in production 6+ years — MQ systems before 2020, then Kafka, RabbitMQ, Service Bus and EventBridge"
      },
      {
        name: "Idempotency",
        definition: "The property that applying the same operation twice has the same effect as applying it once — a property of the effect, not of the delivery, which is why it cannot be delegated to the broker. Applied three times over on the paths that matter: a client-supplied key, a unique constraint so that the database is the arbiter rather than the application’s timing, and a conditional write against the current state.",
        relation: "prod",
        where: "in production 6+ years — every consumer, every retried write, every payment path"
      },
      {
        name: "Retry / Circuit Breaker",
        definition: "Retry re-attempts a transient failure a bounded number of times with exponential backoff and jitter, and only where the operation is idempotent and still inside its deadline. A circuit breaker is a state machine — closed, open, half-open — that stops calling a dependency which is failing, so callers fail fast or take a fallback instead of queueing behind a dead service. Neither works on its own: they are composed with a timeout and a bulkhead around them, in an order that has been reasoned about and tested.",
        relation: "prod",
        where: "in production 6+ years — every outbound call, in both the earlier and the current stacks"
      }
      ]
    },
    messaging: {
      label: "Messaging and delivery",
      summary: "broker semantics, consumption and the contract between a producer and its consumers",
      why: "Every entry here exists because a message can arrive twice, arrive late, arrive after the world has moved on, or never arrive at all. The patterns decide which of those four outcomes is acceptable for a given flow, and what the code does about it when it happens at three in the morning.",
      terms: [
      {
        name: "Publish–Subscribe (topic fan-out)",
        definition: "One published message reaches every interested subscriber, so the producer does not know who consumes it; the broker owns the fan-out, and each subscription keeps its own offset and its own backlog.",
        relation: "prod",
        where: "in production — the default integration style between bounded contexts (Q34, Q45)"
      },
      {
        name: "Competing Consumers",
        definition: "Several instances of the same consumer pull from one queue or share a topic’s partitions, which is how a consumer scales out — and the reason the effect has to be idempotent, since one delivery can land on two instances.",
        relation: "prod",
        where: "in production — every consumer runs as competing instances; the dedup key is what makes that safe"
      },
      {
        name: "Queue-Based Load Leveling",
        definition: "A queue sits between a bursty producer and a slower consumer, absorbing the burst so it can be drained at a sustainable rate: latency is traded for stability instead of work being dropped.",
        relation: "prod",
        where: "in production — background processing and bulk jobs (Q38)"
      },
      {
        name: "Queue versus Retained Log",
        definition: "A queue removes a message once it is acknowledged; a log retains it and lets each consumer hold its own offset, which is what makes replay and a rebuildable read model possible at all.",
        relation: "prod",
        where: "in production — both, chosen by whether the consumer needs to be able to replay"
      },
      {
        name: "Dead-Letter Channel",
        definition: "A message that cannot be processed after its retries is moved to a separate channel with the failure attached, so that one poison message does not block the partition behind it and a human can inspect, fix and replay it.",
        relation: "prod",
        where: "in production — every consumer has one, with depth and age alarmed (Q34, Q45)"
      },
      {
        name: "Poison-Message Classification",
        definition: "A deterministic failure — a message that will never succeed — has to be told apart from a transient one; retrying the first forever is how a queue quietly becomes a black hole.",
        relation: "prod",
        where: "in production — the classification decides retry-then-DLQ or immediate DLQ"
      },
      {
        name: "Idempotent Receiver (inbox)",
        definition: "The receiving end recognises a message it has already processed — a dedup table keyed by message or business id, written in the same transaction as the effect — and returns the previous result instead of repeating the work.",
        relation: "inside",
        where: "in production — the inbox half of the outbox (Q35)"
      },
      {
        name: "Claim Check",
        definition: "The message carries a reference to a payload held in a store rather than the payload itself, which keeps a large document inside the broker’s message-size limit and out of its memory.",
        relation: "outside",
        where: "used only where payloads exceed the broker limit; not a general design choice here"
      },
      {
        name: "Correlation Identifier",
        definition: "A business identifier carried in the message headers and threaded through every hop, so that one logical flow can be reconstructed across services in logs and traces instead of being guessed at.",
        relation: "prod",
        where: "in production — required on every event that participates in a multi-step flow (Q45)"
      },
      {
        name: "Message Sequencing and Resequencing",
        definition: "Messages carry a sequence number and a resequencer buffers and releases them in order at the point where order matters, rather than assuming that a brokered topic preserves global ordering, which it does not.",
        relation: "prod",
        where: "in production in its bounded form — a per-aggregate version check rather than a full resequencer"
      },
      {
        name: "Request–Reply over Messaging",
        definition: "A caller that must not block sends a request with a reply address and a correlation id and treats the reply as another asynchronous message, with a deadline enforced on its own side.",
        relation: "prod",
        where: "used where a synchronous call would hold a thread across a slow participant"
      },
      {
        name: "Backpressure",
        definition: "The consumer signals that it is falling behind — by withholding acknowledgement, by a bounded internal queue, or by an explicit credit — so the producer slows down instead of the backlog growing without limit.",
        relation: "prod",
        where: "in production — bounded channels and prefetch limits (Q38)"
      },
      {
        name: "Event Notification versus Event-Carried State Transfer",
        definition: "Two different things wearing the same word: a thin “something changed, come and look” ping that keeps the consumer calling back, and an event that carries the state the consumer needs so that it never has to. Choosing the wrong one is how systems end up either chatty or stale.",
        relation: "prod",
        where: "in production — thin notifications for reactive flows, state transfer where a consumer needs no call-back"
      },
      {
        name: "Change Data Capture (log tailing)",
        definition: "Deriving events from the database’s own replication log instead of from application code, so that no writer can forget to emit one — at the price of publishing the table rather than the domain, and of a schema that is now an API.",
        relation: "outside",
        where: "applied only where a legacy writer could not be changed; the outbox is preferred everywhere else"
      },
      {
        name: "Message Routing and Aggregation (EIP)",
        definition: "The routing vocabulary: content-based router, splitter, aggregator, scatter–gather and wire tap — decide the destination from the content, split one message into many, recombine related messages into one, broadcast and gather the responses, and copy a message to a side channel for inspection.",
        relation: "prod",
        where: "used individually where each one pays for itself; scatter–gather for parallel quotes"
      },
      {
        name: "Priority Channel",
        definition: "Two or more channels for the same kind of work, drained in priority order, so that an interactive request is never queued behind a nightly batch.",
        relation: "prod",
        where: "used where a batch and an interactive flow share a worker pool (Q38)"
      },
      {
        name: "Broker Delivery Guarantees",
        definition: "Idempotent producers and transactional writes give exactly-once delivery inside the broker’s own boundary — not across the consumer’s database, which is precisely why the dedup key lives with the effect.",
        relation: "platform",
        where: "enabled where the broker offers it, and never relied on as the only defence"
      }
      ]
    },
    transactions: {
      label: "Transactions and consistency",
      summary: "how state stays correct when more than one participant is involved",
      why: "The question of what to do when a unit of work spans two databases is answered here in the negative first: a distributed transaction is rejected, and everything else in this group exists to make that rejection survivable — a compensation, an expected version, a dedup key, a quorum, and a written-down answer for what happens when two writers meet.",
      terms: [
      {
        name: "Two-Phase Commit",
        definition: "A coordinator asks every participant to prepare, then to commit: atomic across services, but blocking, slow, and fragile when the coordinator dies between the two phases — which turns a business flow into an operational incident.",
        relation: "rejected",
        where: "deliberately not used across a service boundary — 0 distributed transactions (Q35)"
      },
      {
        name: "Three-Phase Commit",
        definition: "A non-blocking variant of two-phase commit that adds a pre-commit phase to close the coordinator’s blocking window; it still requires every participant to be alive and synchronous.",
        relation: "rejected",
        where: "known and rejected along with 2PC"
      },
      {
        name: "Compensating Transaction",
        definition: "An action that semantically undoes a completed step — a refund, a release, a cancellation — rather than rolling back a transaction, which is why the undo is business logic and has to be designed at the same time as the step it undoes.",
        relation: "inside",
        where: "in production — one per saga step, designed alongside it (Q35)"
      },
      {
        name: "Try–Confirm–Cancel (TCC)",
        definition: "Three explicit phases: reserve the resource, confirm it, or cancel the reservation — for the cases where a resource can genuinely be held, such as stock or credit, and the split is acceptable to the business.",
        relation: "prod",
        where: "the shape of reservation-style steps where inventory has to be held rather than compensated"
      },
      {
        name: "Delivery Guarantees (at-most-once, at-least-once)",
        definition: "At-most-once may lose a message and at-least-once may duplicate it; neither is a business guarantee, which is why the guarantee is manufactured at the effect with a dedup key rather than negotiated with the transport.",
        relation: "prod",
        where: "in production — at-least-once transport with idempotent effects, stated as the default (Q34)"
      },
      {
        name: "Exactly-Once Effects",
        definition: "Not a delivery guarantee but a property of the effect: an operation that is applied exactly once because the duplicates are recognised, with the database as the arbiter rather than the application’s timing.",
        relation: "prod",
        where: "the target everywhere; implemented with a unique constraint and a conditional write"
      },
      {
        name: "Optimistic Concurrency Control",
        definition: "A writer declares the version it read and the store rejects the write if anything changed in the meantime, so that a conflict becomes a visible result instead of a silently lost update.",
        relation: "prod",
        where: "in production — aggregate version on every append, row version or ETag on editable records"
      },
      {
        name: "Pessimistic Locking",
        definition: "Holding a lock or a database row for the duration of the work: simple and correct, and it does not survive a slow participant, a lost connection or a process that never comes back.",
        relation: "prod",
        where: "used inside a single transaction only — the lock is never held across a network call"
      },
      {
        name: "Distributed Lock and Lease",
        definition: "A lock in a shared store with a lease or expiry so that a crashed holder eventually releases it — and a fencing token, because a holder that has been paused can come back and write after it has lost the right to.",
        relation: "outside",
        where: "used in its bounded form: a short lease on scheduled jobs so only one instance runs the batch"
      },
      {
        name: "Leader Election",
        definition: "Participants agree on one active owner of a responsibility, which is how a scheduled job, a relay or a partition ends up with a single writer instead of several.",
        relation: "platform",
        where: "reached through the platform — broker partition assignment and the orchestration layer elect, not the application"
      },
      {
        name: "Consensus (Paxos, Raft)",
        definition: "A cluster agreeing on a single order of operations even while members fail, which is what makes a replicated log and a stable leader possible in the first place.",
        relation: "platform",
        where: "relied on, not implemented — Raft inside the coordination layer and the broker’s controller"
      },
      {
        name: "Quorum Reads and Writes (R + W > N)",
        definition: "Reading and writing overlapping majorities so that a read always sees the latest write, at the cost of extra latency and of availability when the network partitions.",
        relation: "platform",
        where: "a property of the replicated stores in use, not a per-query choice made here"
      },
      {
        name: "CAP and PACELC",
        definition: "Under a partition you choose consistency or availability; PACELC adds that even without one you are still trading latency against consistency. It is useful as a way to state a decision in writing rather than as a design in itself.",
        relation: "prod",
        where: "used as the framing written into the ADR that rejects 2PC (Q35)"
      },
      {
        name: "Eventual Consistency",
        definition: "Replicas and projections converge once the writes stop, which is the normal state of a read model; the engineering is in bounding how long that window is and being honest about it in the interface.",
        relation: "prod",
        where: "in production — every projection, with lag measured rather than assumed (Q36)"
      },
      {
        name: "Read-Your-Writes and Monotonic Reads",
        definition: "The two consistency guarantees a user actually notices: after your own write you must see it, and time must not appear to run backwards on your next read. Implemented by routing the writer’s reads to the primary, or by carrying a version token.",
        relation: "prod",
        where: "in production — the write path returns the version that the read path hands back"
      },
      {
        name: "Logical Clocks (Lamport, vector, hybrid)",
        definition: "Ordering without a shared clock: Lamport timestamps give a total order consistent with causality, vector clocks detect writes that were concurrent, and hybrid logical clocks keep physical and logical time together across services.",
        relation: "inside",
        where: "the reason every event carries a version and a correlation id; a full vector clock has not been needed"
      },
      {
        name: "Conflict-Free Replicated Data Type (CRDT)",
        definition: "Data structures whose merge is commutative, so replicas converge with no coordination at all — at the price of giving up any invariant that needs a global view of the data.",
        relation: "rejected",
        where: "not applied — the invariants in these domains need one arbiter, which is what the unique constraint is for"
      },
      {
        name: "Conflict Resolution Policy",
        definition: "A written rule for the same record written twice: version check and retry, last-write-wins with a clock, or a merge function. The wrong answer is “whichever arrives last”, which is a race with no owner and no record.",
        relation: "prod",
        where: "in production — version check plus reject-and-retry; never last-write-wins"
      },
      {
        name: "Write-Ahead Log and Durability",
        definition: "Durability as a design element rather than an assumption: the log, the flush policy, and exactly what a commit does and does not guarantee — the ground that both the outbox and the event log stand on.",
        relation: "prod",
        where: "in production — commit durability and replication settings chosen deliberately"
      },
      {
        name: "MVCC and Isolation Levels",
        definition: "How the store actually isolates concurrent work: snapshot isolation lets readers proceed without blocking writers, while locking serialises them — and a long transaction turns either one into a production incident.",
        relation: "prod",
        where: "in production — the isolation level is chosen per use case (Q36)"
      }
      ]
    },
    data: {
      label: "Data distribution and scaling",
      summary: "where the data lives, how it is spread, and what it costs to read it back",
      why: "Distribution is a data question before it is a services question: who owns which rows, what happens when one node can no longer hold them, and how a read is served without asking every participant. The caching entries are here because a cache is a replica with an expiry, and it fails in the same ways.",
      terms: [
      {
        name: "Database per Service",
        definition: "Each service owns its schema and is its only writer; everyone else goes through its API or its events. Ownership is what makes independent deployability real rather than aspirational.",
        relation: "prod",
        where: "in production — shared database between services: 0 (Q34, Q44)"
      },
      {
        name: "Sharding / Partitioning",
        definition: "Splitting data across instances by a key — range or hash — so that one node does not have to hold everything; the price is that cross-shard queries and transactions become the application’s problem.",
        relation: "prod",
        where: "in production — horizontal partitioning and sharding are on Q47 and Q48"
      },
      {
        name: "Consistent Hashing",
        definition: "A ring-based mapping from key to node, so that adding or removing a node moves only its share of the keys instead of rehashing the world and invalidating every cache behind it.",
        relation: "platform",
        where: "the model behind partition assignment where the number of nodes changes"
      },
      {
        name: "Read Replica",
        definition: "A follower database serving read-only traffic, offloading the primary at the price of a replication lag that the read path has to tolerate knowingly rather than discover in production.",
        relation: "prod",
        where: "in production — heavy read and reporting paths (Q47, Q48)"
      },
      {
        name: "Materialised View",
        definition: "A persisted, precomputed result of a query, refreshed incrementally or rebuilt from source: the cheapest way to serve a dashboard shape without recomputing the join on every request.",
        relation: "prod",
        where: "in production — the read side of CQRS (Q36, Q48)"
      },
      {
        name: "Projection Rebuild by Replay",
        definition: "Throwing a read model away and rebuilding it from the event log, which is only possible when the log really is the source of truth — and is the test of whether it is.",
        relation: "prod",
        where: "in production — every projection is rebuildable from zero (Q36)"
      },
      {
        name: "Leader–Follower Replication",
        definition: "One node accepts writes and the followers replicate them, giving a single writer and horizontal read scale, with replication lag as the number to watch.",
        relation: "prod",
        where: "the default topology for the relational stores in use (Q47)"
      },
      {
        name: "Multi-Leader and Leaderless Replication",
        definition: "Several nodes accept writes and the conflicts are reconciled, or quorums are used instead of a leader; it buys availability and locality and costs a conflict story that has to be written down.",
        relation: "outside",
        where: "no hand-rolled multi-leader writes; used only where the platform provides it"
      },
      {
        name: "Index Table",
        definition: "A secondary index kept as its own table, so that a lookup by a key that is not the shard key does not have to fan out across every shard.",
        relation: "outside",
        where: "no production claim — recorded as the answer for when the lookup key differs from the shard key"
      },
      {
        name: "Cache-Aside",
        definition: "Read the cache, fall back to the store on a miss, and let the application populate the cache itself: simple, predictable, and the default read strategy for a reason.",
        relation: "prod",
        where: "in production — the default read cache (Q48)"
      },
      {
        name: "Read-Through, Write-Through, Write-Behind",
        definition: "Read-through moves the population into the cache layer; write-through writes the cache and the store together; write-behind defers the store write and accepts that a lost cache is lost data.",
        relation: "prod",
        where: "write-through where a warm cache matters; write-behind never for anything that must not be lost"
      },
      {
        name: "Cache Stampede and Thundering Herd",
        definition: "When a hot key expires, single-flight or a lock around the reload stops a thousand concurrent requests hitting the database at once, and TTL jitter stops the expiries happening together in the first place.",
        relation: "prod",
        where: "in production — single-flight on hot keys plus TTL jitter (Q48)"
      },
      {
        name: "Negative Caching",
        definition: "Caching the absence of a record for a short time, so that a lookup for something that does not exist does not reach the database on every single request.",
        relation: "prod",
        where: "used with a short TTL on high-volume lookup endpoints"
      },
      {
        name: "Event-Driven Cache Invalidation",
        definition: "Invalidating or updating the cache from the same event that changes the data rather than from a timer, which is what stops a cache from silently serving a lie.",
        relation: "prod",
        where: "in production — the write side publishes, the cache listens"
      }
      ]
    },
    resilience: {
      label: "Resilience and failure handling",
      summary: "bounding the blast radius of a dependency that slows down, fails or disappears",
      why: "A dependency does not usually fail; it slows down, and the caller runs out of threads. Everything here is about turning that into a bounded, visible, degraded event rather than a cascade — and about proving it with a test instead of trusting the library defaults.",
      terms: [
      {
        name: "Timeout and Deadline Propagation",
        definition: "Every remote call carries a deadline, and the remaining budget travels with the request so that downstream calls cannot outlive the caller’s patience; a call without one is the classic beginning of a thread-pool death spiral.",
        relation: "prod",
        where: "in production — the outermost policy in the pipeline (Q34)"
      },
      {
        name: "Bulkhead",
        definition: "Isolating a dependency’s resource pool so that one slow dependency exhausts only its own threads and connections instead of those of every caller in the process.",
        relation: "prod",
        where: "in production — a separate pool per outbound dependency (Q34)"
      },
      {
        name: "Retry with Exponential Backoff and Jitter",
        definition: "Waiting longer after each failure and randomising the wait, so that a recovering dependency is not immediately re-flooded by every client at the same instant — with a bounded attempt count and a budget per call.",
        relation: "prod",
        where: "in production — jittered, bounded, and only on operations that are idempotent (Q34)"
      },
      {
        name: "Fallback and Graceful Degradation",
        definition: "A designed degraded answer — cached, partial, or queued for later — instead of an error, so that a dependency outage is felt by the user as reduced functionality rather than as a failed request.",
        relation: "prod",
        where: "in production — a degraded feature, never an empty response (Q34)"
      },
      {
        name: "Rate Limiting and Throttling",
        definition: "Bounding how much work a caller may send inside a window — token bucket, leaky bucket, sliding window — to protect the service and to keep one consumer from owning it.",
        relation: "prod",
        where: "in production — per-consumer limits at the gateway (Q45)"
      },
      {
        name: "Load Shedding",
        definition: "Deliberately rejecting or dropping low-priority work when the system is saturated, because serving everybody badly is worse than serving the requests that matter well.",
        relation: "prod",
        where: "used at the entry points where a queue would otherwise grow without limit"
      },
      {
        name: "Health Endpoint Monitoring, Heartbeat, Watchdog",
        definition: "A cheap endpoint reporting whether an instance can serve, used by the load balancer, the orchestrator and the alarm — plus the out-of-band watchdog for the case where the instance cannot answer at all.",
        relation: "prod",
        where: "in production — liveness and readiness gates (Q45)"
      },
      {
        name: "Scheduler–Agent–Supervisor",
        definition: "A supervisor distributes work to agents and monitors them, re-dispatching when an agent dies: the topology underneath background processing, and the reason a job does not disappear with its worker.",
        relation: "prod",
        where: "in production — the shape of the background-job infrastructure (Q38)"
      },
      {
        name: "Chaos Engineering and Fault Injection",
        definition: "Breaking a dependency on purpose — kill the broker, add latency, duplicate a delivery, kill a process mid-message — so that the failure paths are proved instead of assumed.",
        relation: "prod",
        where: "practised — the failure-path tests inject exactly these cases"
      },
      {
        name: "Static Stability",
        definition: "The data path keeps working when the control plane does not, so a failed deployment system, autoscaler or DNS update cannot take the running system down with it.",
        relation: "outside",
        where: "designed for in the way services depend on the platform, rather than claimed as a named adoption"
      }
      ]
    },
    topology: {
      label: "Service and API topology",
      summary: "how the services are put together, reached and changed without a rewrite",
      why: "These are the patterns that decide whether the rest can be operated: where identity and traffic shaping live, how a caller finds an instance, how a legacy interface is reached without its model leaking into the domain, and how a running system is migrated rather than replaced.",
      terms: [
      {
        name: "API Gateway",
        definition: "One entry point in front of the services, owning what every service would otherwise repeat: TLS, routing, token validation at the edge, per-consumer rate limits, request size limits and correlation-id injection.",
        relation: "prod",
        where: "in production — the edge in the current stack; retries only on idempotent methods (Q45)"
      },
      {
        name: "Backend for Frontend",
        definition: "A gateway per client type that composes and trims the APIs for that client, so that one client’s needs do not bloat an API shared with all of them.",
        relation: "prod",
        where: "used where the client shapes diverged (Q45)"
      },
      {
        name: "API Composition / Aggregator",
        definition: "A read served by calling several services and joining the results in memory, for the queries that span boundaries and have no single owner — kept thin so that it does not become a distributed monolith.",
        relation: "prod",
        where: "in production — read composition behind the gateway (Q45)"
      },
      {
        name: "Service Registry and Discovery",
        definition: "Instances register and callers resolve them by name, so that scaling and redeployment do not require configuration edits; server-side discovery puts the lookup behind the load balancer instead.",
        relation: "platform",
        where: "reached through the platform — Kubernetes Services and readiness gates, not a hand-rolled registry (Q45)"
      },
      {
        name: "Client-Side versus Server-Side Load Balancing",
        definition: "Whether the caller picks the instance — one hop fewer, and a library in every client — or a proxy does it: simpler clients, one more hop, and one place to change the policy.",
        relation: "platform",
        where: "server-side by default; client-side only where the platform provides nothing (Q45)"
      },
      {
        name: "Sidecar, Ambassador, Adapter",
        definition: "Moving a cross-cutting concern into a process beside the service: the sidecar for proxy, mTLS and telemetry, the ambassador as an outbound proxy for a remote service, and the adapter to translate a legacy protocol.",
        relation: "prod",
        where: "in production as the fabric, with the adapter shape used to reach legacy interfaces (Q45)"
      },
      {
        name: "Service Mesh",
        definition: "The sidecar fleet plus a control plane, pushing mTLS, retries, timeouts, traffic splitting and telemetry into the infrastructure instead of into every service’s code.",
        relation: "platform",
        where: "used for transport concerns; the application still owns its business-level policies"
      },
      {
        name: "Strangler Fig",
        definition: "Migrating by putting the new implementation in front of the old one and routing a growing share of traffic to it, until the old one can be deleted — the opposite of a rewrite, which is how migrations usually fail.",
        relation: "prod",
        where: "how the legacy-to-current transition was sequenced (Q44)"
      },
      {
        name: "Anti-Corruption Layer",
        definition: "A translation layer that keeps a legacy or third-party model out of the domain, so that their concepts do not leak in and their next change does not become your change.",
        relation: "prod",
        where: "in production — one per legacy integration"
      },
      {
        name: "Ports and Adapters (hexagonal)",
        definition: "The domain at the centre, ports as interfaces and adapters as technology at the edges, which is what keeps the persistence and broker choices swappable and the core testable.",
        relation: "prod",
        where: "the structural style of the services in this inventory (Q44)"
      },
      {
        name: "External Configuration Store and Feature Flags",
        definition: "Configuration and toggles held outside the artefact so that behaviour changes without a deployment — with the discipline of removing the flag once the decision it guarded has become permanent.",
        relation: "prod",
        where: "in production — configuration externalised; flags carry an expiry"
      },
      {
        name: "Contract-First APIs and Schema Registry",
        definition: "Contracts and versions before code: an OpenAPI document or an event schema published, reviewed and validated in CI, so that a breaking change is a build failure instead of an incident.",
        relation: "prod",
        where: "in production — clients are generated from the contract (Q37, Q49)"
      },
      {
        name: "Distributed Tracing and Correlation",
        definition: "One trace id across every hop, with spans and baggage, so that the path of a saga can be read instead of guessed — the pattern that makes every other pattern on this page debuggable.",
        relation: "prod",
        where: "in production — traces plus a correlation id on every event and call (Q37, Q45)"
      },
      {
        name: "Durable Execution / Process Manager",
        definition: "State kept by an engine so that a long-running orchestration survives a restart and resumes at the step it had reached, instead of being reconstructed or repeated from the beginning.",
        relation: "prod",
        where: "used — Step Functions-style orchestration for the long-running flows (Q45)"
      }
      ]
    }
  };

  var DEFAULT_GROUP = 'named';

  function escapeHtml(value) {
    return String(value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
  }

  function relationChip(relation) {
    return '<span class="rel rel-' + relation + '">' + RELATION_LABELS[relation] + '</span>';
  }

  /**
   * Drops the leading phrase that the relation chip already states, so a card reads
   * "in production" / "6 years (2020 → present) — every state change that publishes an
   * event" rather than repeating itself. Same data as the static cards on the page.
   */
  function relationText(where) {
    var prefixes = [
      'in production — ',
      'in production ',
      'reached through the platform — ',
      'reached through the platform ',
      'deliberately not used ',
      'deliberately not used — ',
      'not applied — ',
      'no production claim — '
    ];
    var lower = where.toLowerCase();
    for (var i = 0; i < prefixes.length; i++) {
      if (lower.indexOf(prefixes[i]) === 0) return where.slice(prefixes[i].length);
    }
    return where;
  }

  /** The definition cards for one group — the same markup the page renders statically. */
  function renderTerms(group) {
    return group.terms
      .map(function (term) {
        return [
          '<article class="glossary-term">',
          '<h4>' + escapeHtml(term.name) + '</h4>',
          '<p>' + escapeHtml(term.definition) + '</p>',
          '<p class="glossary-where">' + relationChip(term.relation) +
            '<span>' + escapeHtml(relationText(term.where)) + '</span></p>',
          '</article>'
        ].join('');
      })
      .join('');
  }

  /** The counter block, so the group's composition is visible rather than asserted. */
  function renderCounts(group) {
    var lines = ['definitions in this group: ' + group.terms.length];
    RELATION_ORDER.forEach(function (relation) {
      var count = group.terms.filter(function (term) { return term.relation === relation; }).length;
      lines.push(RELATION_LABELS[relation] + ': ' + count);
    });
    return lines.join('\n');
  }

  /**
   * Applies one group to the DOM subtree of the workflow component.
   * Returns the group object, or null when the group is unknown.
   */
  function selectGroup(root, name) {
    var group = GROUPS[name];
    if (!root || !group) return null;

    Array.prototype.forEach.call(root.querySelectorAll('.task-buttons button'), function (button) {
      var isActive = button.getAttribute('data-group') === name;
      button.classList.toggle('active', isActive);
      button.setAttribute('aria-pressed', isActive ? 'true' : 'false');
    });

    root.querySelector('[data-testid="glossary-command"]').textContent = '$ ' + group.summary;
    root.querySelector('[data-testid="glossary-effect"]').textContent = group.why;
    root.querySelector('[data-testid="glossary-output"]').textContent = renderCounts(group);
    root.querySelector('[data-testid="glossary-board"]').innerHTML = renderTerms(group);
    root.setAttribute('data-group', name);

    return group;
  }

  function init() {
    var root = document.getElementById('pattern-glossary-workflow');
    if (!root) return;

    Array.prototype.forEach.call(root.querySelectorAll('.task-buttons button'), function (button) {
      button.addEventListener('click', function () {
        selectGroup(root, button.getAttribute('data-group'));
      });
    });

    selectGroup(root, root.getAttribute('data-group') || DEFAULT_GROUP);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  global.PatternGlossaryWorkflow = {
    GROUPS: GROUPS,
    RELATION_LABELS: RELATION_LABELS,
    selectGroup: selectGroup,
    init: init
  };
})(window);
