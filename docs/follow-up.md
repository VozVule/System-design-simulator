# Follow-up backlog

Updated: 2026-10-03

This records future work requested or deferred during the design interview. It is not a commitment to implement every item in the next release. When planning a release, select the items that make sense together and define their behavior then.

## Requested future work

| Item | User intent | Decisions for a future release |
| --- | --- | --- |
| Caching / Cache component | Requested for the next release. | Cache hit/miss configuration, downstream traffic on misses, capacity/drop rules, state, and metrics. |
| Queue component | Requested for the next release discussion. | Queue capacity, admission/drop rules, draining, downstream consumption, and metrics. |
| Fanout | Desired later; release 1 chooses one destination per routing decision. | How requests are duplicated, branch counts, and how capacity/drops affect each branch. |
| Health-aware load balancers | Desired later; release 1 follows configured routes without inspecting destination state. | Simulated probes, what health/capacity signals mean, probe frequency, and destination selection. |
| Retries | Mentioned as future work when selecting one-hop-per-tick propagation. | Retry ownership, maximum attempts, tick-based backoff, destination selection, and attempt metrics. Preserve the architecture's no-loopback rule; retry state need not create graph cycles. |
| Architecture export | Deferred from release 1. | Export format and contents, whether import is included, portability, and copy behavior. |

## Conditional technical work

- **Go simulation engine:** consider only if measured Python calculation performance for complex systems warrants a switch. Define a representative workload and performance target before deciding.

## Deferred model discussion

- **Latency:** removed from release 1 because service/query duration and hosted application behavior are not specified. A future latency model would need an explicit scope and inputs; it is not an approved feature commitment.

## Original overview candidates, not selected for a release

The original overview mentions worker, CDN, object storage, message broker, external service, replication, connection pools, and concurrency. Preserve these as design candidates rather than treating them as requested next-release work. Their distinct behavior and relevance must be decided before adding them. Database is now selected for release 1; caching is requested for the next release above.
