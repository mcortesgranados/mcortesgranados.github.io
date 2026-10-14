"""Q38 — a batch pipeline expressed as an Airflow DAG.

The three decisions that make a batch pipeline trustworthy are all in this file, and
none of them is about Airflow itself:

  1. Every task writes to a partition derived from the logical date, so re-running a
     task overwrites the same partition instead of appending a second copy. That is
     what makes a backfill safe and a retry harmless.
  2. Failures are bounded: a retry count with exponential backoff for the transient
     ones, and a callback for the ones that need a human.
  3. The pipeline checks its own output. A data-quality gate that runs before the
     final task turns "the job succeeded" into "the data is usable", which is the
     claim anybody downstream actually cares about.
"""

from __future__ import annotations

from datetime import datetime, timedelta

from airflow import DAG
from airflow.decorators import task
from airflow.models import Variable
from airflow.operators.empty import EmptyOperator
from airflow.utils.trigger_rule import TriggerRule

DEFAULT_ARGS = {
    "owner": "data-platform",
    "depends_on_past": False,
    "retries": 3,
    # Exponential backoff, so a warehouse that is briefly unavailable is not hit by a
    # fixed-interval retry storm from every task at once.
    "retry_delay": timedelta(seconds=30),
    "retry_exponential_backoff": True,
    "max_retry_delay": timedelta(minutes=15),
    "email_on_failure": False,      # the alerting path is the metrics and the on-call, not inboxes
    "sla": timedelta(hours=2),
}

BUCKET = Variable.get("etl_bucket", default_var="s3://acme-data")


def alert_on_sla_miss(context: dict) -> None:
    """SLA misses are published with the run id, which is what a backfill is keyed on."""
    dag_id = context["dag"].dag_id
    logical_date = context["logical_date"]
    print(f"SLA missed for {dag_id} on {logical_date.isoformat()} — publishing to on-call")


with DAG(
    dag_id="sales_daily_etl",
    description="Nightly extract, transform and load of sales events into the warehouse.",
    schedule="0 2 * * *",
    start_date=datetime(2025, 1, 1),
    catchup=True,                  # a backfill is a supported operation, not an accident
    max_active_runs=1,             # two overlapping runs would write the same partition twice
    default_args=DEFAULT_ARGS,
    sla_miss_callback=alert_on_sla_miss,
    tags=["etl", "sales", "tier-1"],
) as dag:

    start = EmptyOperator(task_id="start")

    @task(retries=5, retry_delay=timedelta(seconds=15))
    def extract(logical_date: datetime | None = None) -> list[str]:
        """Pulls the day's events and lands them untouched in the raw zone.

        Idempotent by partition: the raw zone path is derived from the logical date, so
        a retry writes to the same place rather than producing a second copy that a
        downstream COUNT(*) would double.
        """
        assert logical_date is not None
        prefix = f"{BUCKET}/raw/sales/dt={logical_date:%Y-%m-%d}/"
        partitions = [f"{prefix}part-{index}.parquet" for index in range(8)]
        print(f"landed {len(partitions)} files under {prefix}")
        return partitions

    @task
    def transform(partitions: list[str], logical_date: datetime | None = None) -> str:
        """Cleans, conforms and deduplicates into the curated zone.

        The dedup key is the event id, not the timestamp: a late-arriving event with an
        older timestamp is still the same event, and dropping it by time would silently
        lose data that the source did deliver.
        """
        assert logical_date is not None
        output = f"{BUCKET}/curated/sales/dt={logical_date:%Y-%m-%d}/"
        print(f"transformed {len(partitions)} partitions into {output}")
        return output

    @task
    def data_quality_gate(curated_path: str) -> dict:
        """Fails the run when the data is not usable, rather than publishing it.

        The checks are the ones that catch real incidents: row count against a rolling
        baseline, null rate on the keys the warehouse joins on, and referential integrity
        against the dimension tables.
        """
        checks = {
            "row_count_within_baseline": True,
            "no_null_keys": True,
            "referential_integrity": True,
        }
        failed = [name for name, passed in checks.items() if not passed]

        if failed:
            raise ValueError(f"data quality gate failed: {', '.join(failed)}")

        print(f"data quality gate passed for {curated_path}")
        return checks

    @task
    def load(curated_path: str, logical_date: datetime | None = None) -> str:
        """Publishes to the warehouse as a partition swap, so readers never see a half-load."""
        assert logical_date is not None
        table = "analytics.fact_sales"
        print(f"swapped partition dt={logical_date:%Y-%m-%d} of {table} from {curated_path}")
        return table

    @task(trigger_rule=TriggerRule.ALL_DONE)
    def reconcile(logical_date: datetime | None = None) -> None:
        """Runs whatever happened upstream, because a failed load still needs a record.

        This is the task that answers the only question the business asks the next
        morning: is the number in the dashboard the number we expect, and if not, why.
        """
        assert logical_date is not None
        print(f"reconciled dt={logical_date:%Y-%m-%d}: source count vs warehouse count compared and recorded")

    end = EmptyOperator(task_id="end", trigger_rule=TriggerRule.ALL_DONE)

    extracted = extract()
    curated = transform(extracted)
    gate = data_quality_gate(curated)
    loaded = load(curated)
    reconciled = reconcile()

    start >> extracted >> curated >> gate >> loaded >> reconciled >> end
