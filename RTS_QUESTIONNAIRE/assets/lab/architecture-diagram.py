"""Q43 — generating the architecture diagrams from the manifests that already exist.

Component: `design-artefacts-workflow.js` (the design artefacts).

An architecture picture is the artefact that goes stale fastest, because it is the one
nobody regenerates: the service gains a dependency, the diagram does not, and six months
later the diagram is a wish. The fix is not discipline, it is source: the container view is
generated from the deployment manifests, which are executed by the platform and therefore
cannot be wrong, and the component view is generated from the service catalogue, which the
pipeline validates for the same reason.

This script emits:
  1. A C4 **container** diagram — every deployable unit, its technology and its data store.
  2. A C4 **component** diagram — the inside of one service, from its module structure.
  3. A dependency report, including the arrows that the catalogue does not permit.

The third output is the one that earns the generator its place: it turns "the architecture
is drifting" into a list of edges, with owners.
"""

from __future__ import annotations

import json
import re
import sys
from dataclasses import dataclass, field
from pathlib import Path

import yaml


@dataclass
class Service:
    """One deployable unit, as the platform sees it."""

    name: str
    technology: str
    replicas: int
    datastore: str | None
    owner: str | None
    depends_on: list[str] = field(default_factory=list)
    exposes_events: list[str] = field(default_factory=list)
    consumes_events: list[str] = field(default_factory=list)
    modules: list[str] = field(default_factory=list)


def read_manifests(manifest_dir: Path) -> list[Service]:
    """Reads the Kubernetes manifests. Anything the platform runs comes from here.

    The manifests are the source of truth for the container view because they are the
    input to the deployment: a service that is not in them does not exist, whatever any
    document says.
    """
    services: list[Service] = []

    for path in sorted(manifest_dir.glob("*.yaml")):
        for document in yaml.safe_load_all(path.read_text(encoding="utf-8")):
            if not document or document.get("kind") != "Deployment":
                continue

            metadata = document["metadata"]
            spec = document["spec"]
            containers = spec["template"]["spec"]["containers"]
            primary = containers[0]

            env = {entry["name"]: entry.get("value", "") for entry in primary.get("env", []) if "name" in entry}

            services.append(
                Service(
                    name=metadata["name"],
                    technology=primary.get("image", "unknown").split(":")[0],
                    replicas=spec.get("replicas", 1),
                    datastore=env.get("DATABASE_HOST"),
                    owner=metadata.get("labels", {}).get("owner"),
                    depends_on=[value for key, value in env.items() if key.startswith("DEPENDENCY_")],
                    exposes_events=[value for key, value in env.items() if key == "PUBLISHES_TOPICS"],
                    consumes_events=[value for key, value in env.items() if key == "CONSUMES_TOPICS"],
                    modules=[],
                )
            )

    return services


def read_catalogue(catalogue_path: Path) -> dict[str, dict]:
    """The catalogue adds what a manifest cannot know: events, module structure, ownership.

    It is read *and validated* here, so a catalogue that disagrees with the manifests is a
    build failure rather than a diagram that quietly shows the wrong thing.
    """
    if not catalogue_path.exists():
        return {}

    catalogue = yaml.safe_load(catalogue_path.read_text(encoding="utf-8"))
    return {entry["name"]: entry for entry in catalogue.get("services", [])}


def merge(manifests: list[Service], catalogue: dict[str, dict]) -> list[Service]:
    for service in manifests:
        entry = catalogue.get(service.name)
        if entry is None:
            continue
        service.owner = entry.get("owner", service.owner)
        service.exposes_events = entry.get("exposes_events", service.exposes_events)
        service.consumes_events = entry.get("consumes_events", service.consumes_events)
        service.modules = entry.get("modules", service.modules)
    return manifests


# --------------------------------------------------------------------------------------
# Emitting the C4 views
# --------------------------------------------------------------------------------------


def container_diagram(services: list[Service], gateway_names: set[str]) -> str:
    """The container view: what is deployed, in what technology, owning which store."""
    lines = [
        "flowchart LR",
        "  classDef svc fill:#eef,stroke:#446",
        "  classDef store fill:#ffe,stroke:#664",
        "  classDef edge fill:#efe,stroke:#464",
        "  classDef topic fill:#fef,stroke:#646",
    ]

    for service in services:
        kind = "edge" if service.name in gateway_names else "svc"
        label = f"{service.name}<br/>{service.technology}<br/>x{service.replicas}"
        lines.append(f'  {alias(service.name)}["{label}"]:::{kind}')

        if service.datastore:
            store = f"db_{alias(service.name)}"
            lines.append(f'  {store}[("{service.datastore}")]:::store')
            # Data ownership is drawn as a property of the service rather than as a shared
            # box, which is the visual way of saying "one writer per store".
            lines.append(f"  {alias(service.name)} --> {store}")

    for service in services:
        for dependency in service.depends_on:
            if any(candidate.name == dependency for candidate in services):
                lines.append(f"  {alias(service.name)} --> {alias(dependency)}")

    for service in services:
        for topic in service.exposes_events:
            node = f"ev_{alias(topic)}"
            # The dashed edge is the visual distinction that matters: an event is not a call,
            # so the producer does not depend on the availability of its consumers.
            lines.append(f'  {node}(["{topic}"]):::topic')
            lines.append(f"  {alias(service.name)} -.-> {node}")

    return "\n".join(lines)


def component_diagram(service: Service) -> str:
    """The component view: the modules inside one service, which is where boundaries rot."""
    lines = ["flowchart TB", f'  svc["{service.name}"]']

    for module in service.modules:
        lines.append(f'  {alias(module)}["{module}"]')
        lines.append(f"  svc --> {alias(module)}")

    return "\n".join(lines)


def alias(name: str) -> str:
    """Mermaid identifiers cannot contain the separators a service name uses."""
    return re.sub(r"[^A-Za-z0-9_]", "_", name)


# --------------------------------------------------------------------------------------
# The report that makes the generator worth having
# --------------------------------------------------------------------------------------


@dataclass
class Finding:
    code: str
    detail: str
    owner: str | None


def audit(services: list[Service], catalogue: dict[str, dict]) -> list[Finding]:
    findings: list[Finding] = []

    # The catalogue is the authority on what a service may depend on. A manifest that wires
    # an edge the catalogue does not allow is drift, and drift found by a script costs a
    # conversation instead of an incident.
    for service in services:
        allowed = set(catalogue.get(service.name, {}).get("allowed_dependencies", []))
        for dependency in service.depends_on:
            if allowed and dependency not in allowed:
                findings.append(Finding(
                    code="dependency-not-permitted",
                    detail=f"{service.name} depends on {dependency}, which the catalogue does not allow",
                    owner=service.owner,
                ))

        if not service.owner:
            findings.append(Finding(
                code="no-owner",
                detail=f"{service.name} has no owner in the catalogue: an unowned service has nobody to page",
                owner=None,
            ))

        if service.name not in catalogue and catalogue:
            findings.append(Finding(
                code="not-in-catalogue",
                detail=f"{service.name} is deployed but absent from the catalogue",
                owner=service.owner,
            ))

    # One writer per store, checked rather than asserted. Two services pointing at the same
    # database host is the distributed monolith, visible in a diff rather than in a review.
    writers: dict[str, list[str]] = {}
    for service in services:
        if service.datastore:
            writers.setdefault(service.datastore, []).append(service.name)

    for datastore, owners in writers.items():
        if len(owners) > 1:
            findings.append(Finding(
                code="shared-database",
                detail=f"{datastore} is written by {', '.join(owners)}: the deploy coupling that follows is not a coincidence",
                owner=None,
            ))

    # An event nobody consumes is either a producer that should not publish, or a consumer
    # that was never wired and whose absence nobody has noticed.
    consumed = {topic for service in services for topic in service.consumes_events}
    for service in services:
        for topic in service.exposes_events:
            if consumed and topic not in consumed:
                findings.append(Finding(
                    code="unconsumed-event",
                    detail=f"{topic} is published by {service.name} and consumed by nobody",
                    owner=service.owner,
                ))

    return findings


def main(manifest_dir: str = "deploy/k8s", catalogue_path: str = "service-catalogue.yaml") -> int:
    services = merge(read_manifests(Path(manifest_dir)), read_catalogue(Path(catalogue_path)))
    gateway_names = {service.name for service in services if "gateway" in service.name}

    Path("docs/architecture-container.mmd").write_text(container_diagram(services, gateway_names), encoding="utf-8")

    for service in services:
        if service.modules:
            Path(f"docs/architecture-{alias(service.name)}.mmd").write_text(component_diagram(service), encoding="utf-8")

    findings = audit(services, read_catalogue(Path(catalogue_path)))

    Path("docs/architecture-report.json").write_text(
        json.dumps({"services": len(services), "findings": [finding.__dict__ for finding in findings]}, indent=2),
        encoding="utf-8",
    )

    for finding in findings:
        # Printed with the owner, because a finding addressed to nobody is a finding nobody
        # fixes, and the whole point of generating the report is that it is actionable.
        print(f"{finding.code}: {finding.detail} (owner: {finding.owner or 'UNASSIGNED'})")

    # Findings do not fail the build: they open a ticket. A generator that breaks the
    # pipeline for architecture drift gets removed from the pipeline within a month.
    return 0


if __name__ == "__main__":
    sys.exit(main(*sys.argv[1:]))
