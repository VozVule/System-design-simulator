# System Design Simulator

## Release 1 scope agreed during the design interview

- A general architecture simulator and visualizer; personal learning is a usage context rather than a required educational objective.
- Local usage, with release 1 targeted for October 3–4, 2026.
- Traffic routing and per-component request counts over virtual time.
- Client nodes represent caller groups. Configured RPS is the total for the group, shared across its callers, with evenly spaced arrivals.
- Latency modeling is deferred. The simulator will not infer query duration or application behavior from the software hosted on a server.
- A tick is one virtual second. Processing components use configurable maximum RPS through a shared component abstraction. Capacity allowance resets each tick; excess requests are dropped. Caller-group capacity is unused in release 1; its configured test RPS directly defines generated traffic.
- Per processing component, show received, handled, and dropped counts. Capacity used is handled/configured capacity, with yellow from 80% to below 100% and red at 100%.
- Routing supports round-robin and deterministic weighted splits. Routers follow configured routes without checking destination health or redistributing traffic away from full servers. Each routing decision selects one destination.
- The component catalog is Caller Group, Load Balancer, Gateway, Server, and Database. No cycles or loopbacks are allowed. The consolidated release draft allows servers to terminate a path or forward handled traffic through one connection, and models databases as terminal components with per-tick capacity and drop accounting.
- The 2026-10-06 amendment covers synchronous replies. Database or terminal Server handling starts a reply along the actual traversed path; successful completion occurs on caller receipt. The saved DAG describes request dependencies, while replies use existing connections in reverse. Replies do not consume capacity or route again. Excess requests are discarded without a response; caller timeouts are outside this milestone.
- Weighted allocations use a fixed destination order for integer remainders: at 3 requests with a 50/50 split, the first destination receives 2 and the second 1 every tick. Weighted remainders do not rotate between ticks.
- Runs have a configurable total length, defaulting to 60 ticks, with per-tick counts and whole-run totals. Requests still in transit at the final tick are reported as in flight.
- SQLite persistence for a library of architectures, retaining the latest saved version of each architecture.
- Save is explicit, with an unsaved-changes prompt when leaving. Save the architecture and component configuration, with test RPS also retained. Simulation results and playback state are not persisted.
- Simulate calculates a fixed snapshot and returns aggregate frames, one per tick, with node and connection counts plus run totals. The frontend replays frames with play/pause and fast-forward controls. Configuration changes require a new simulation for updated results. Individual request traces are outside release 1.
- Propagation is one hop per tick in both directions. All nodes read current-tick input; output reaches its next hop next tick. This boundary applies to caller generation and newly created replies. The interface displays steps without elapsed-time labels. See [simulation-flow.md](simulation-flow.md).
- Python backend. A Go migration is conditional on measured computation performance for complex systems. Frontend technologies are flexible.

The current release contract is in [release-1.md](release-1.md), including the implementation defaults accepted on 2026-10-03 and the synchronous-response amendment on 2026-10-06. The detailed simulation specifications were accepted and implemented on 2026-10-06. Backend checks, frontend checks, browser acceptance tests, production build, and representative-diagram visual review pass.

Future work, including caching, queues, fanout, health-aware balancing, retries, and export, is tracked in [follow-up.md](follow-up.md). Caching is planned for the next release; Queue is also requested for that release's discussion. Define their behavior when planning that release.

The sections below contain the original broader proposal. Features involving latency, queueing, concurrency, replication, or additional component types are not commitments for release 1. The interview and ADRs track which details have been agreed.

## 1. Use Case

The application is a visual system-design simulator for building, testing, and understanding distributed system architectures.

The user should be able to create a system by dragging components onto a canvas, connecting them, configuring their properties, and defining an expected workload such as requests per second.

The application then simulates how traffic moves through the system and highlights bottlenecks, overloaded components, latency issues, queue buildup, capacity limits, and other relevant behavior.

The initial use case is personal learning and system-design interview preparation, but the application should not be designed specifically as an interview tool. The longer-term goal is to make it useful for experimenting with architectures, comparing design choices, and understanding how systems behave under different workloads.

---

## 2. Architecture

The system should be split clearly between the frontend and the simulation backend.

### Frontend

The frontend is responsible primarily for interaction and visualization.

It should allow the user to:

- Drag system components onto a canvas.
- Connect components to define request and data flow.
- Configure component parameters.
- Configure workload parameters.
- Start simulations.
- Visualize simulation results directly on the architecture.
- Inspect individual components and their metrics.

The frontend should contain minimal simulation or domain logic.

### Backend

The backend contains the domain model and simulation engine.

It should understand:

- Available system components.
- Relationships between components.
- Component capabilities and limitations.
- Routing and traffic behavior.
- Capacity and throughput.
- Latency.
- Queues and concurrency.
- Failure conditions.
- Optional component-specific algorithms.

The frontend sends a system graph and workload definition to the backend.

`System Graph + Workload → Simulation Engine → Simulation Results`

The simulation engine should remain independent from the API layer so that it can later be rewritten or extended without affecting the frontend.

### Component Model

System components should share a common abstraction while allowing component-specific behavior.

Example:

`Client → Load Balancer → Service → Cache → Database`

Components can include:

- Client
- Load Balancer
- API / Service
- Cache
- Database
- Queue
- Worker
- CDN
- Object Storage
- Message Broker
- External Service

Each component can expose configurable properties relevant to its behavior, such as:

- Throughput
- Latency
- Maximum concurrency
- Number of instances
- Queue capacity
- Connection pool size
- Cache hit rate
- Replication strategy

Not every property needs to apply to every component.

---

## 3. Features

- [x] Visual drag-and-drop architecture editor
- [x] Connect components using directional edges
- [x] Component configuration panel
- [x] Workload configuration
- [x] Requests-per-second simulation
- [x] Request and response flow through connected components
- [x] Component utilization
- [ ] Bottleneck detection
- [ ] Latency calculation
- [ ] Throughput calculation
- [x] Visual indication of overloaded components
- [x] Simulation results panel

---

## 4. Tech Stack

### Frontend

**Svelte + TypeScript**

Used for the application UI and state management.

**Svelte Flow**

Used for the visual system-design canvas, including nodes, edges, dragging, connecting, zooming, and custom components.

**Tailwind CSS**

Used for lightweight styling while keeping the UI custom rather than relying heavily on generic component libraries.

### Backend — Initial PoC

**Python**

Used to implement the first version of the simulation engine quickly and allow easy experimentation with simulation models.

**FastAPI**

Used as the API layer between the frontend and simulation engine.

The simulation engine itself should remain separate from FastAPI.

`API → Simulation Engine → Component Models`

### Backend — Future

The simulation engine can later be migrated from Python to **Go**.

The frontend/backend contract should remain stable so the frontend does not need significant changes during this migration.

---

## 5. Core Design Principle

The system should prioritize **understandability over perfect real-world accuracy**.

The simulator should make it clear why a particular architecture behaves the way it does.

A user should be able to change one part of the design, rerun the workload, and immediately understand how that change affected throughput, latency, utilization, and bottlenecks.
