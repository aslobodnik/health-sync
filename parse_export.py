#!/usr/bin/env python3
import argparse
import hashlib
import json
import os
import sys
import time
from collections import Counter
from pathlib import Path
import xml.etree.ElementTree as ET

try:
    import psycopg2
    from psycopg2.extras import execute_values
except ImportError:  # pragma: no cover - runtime dependency check
    psycopg2 = None
    execute_values = None

RECORD_COLUMNS = (
    "record_type",
    "source_name",
    "source_version",
    "source_bundle_id",
    "device",
    "unit",
    "value_numeric",
    "value_text",
    "start_time",
    "end_time",
    "creation_time",
    "metadata",
    "record_hash",
    "raw",
)

WORKOUT_COLUMNS = (
    "workout_type",
    "source_name",
    "source_version",
    "source_bundle_id",
    "device",
    "start_time",
    "end_time",
    "duration_seconds",
    "duration_unit",
    "total_energy_burned",
    "total_energy_unit",
    "total_distance",
    "total_distance_unit",
    "avg_heart_rate",
    "min_heart_rate",
    "max_heart_rate",
    "route_file",
    "metadata",
    "workout_hash",
    "raw",
)

RECORD_INSERT_SQL = (
    f"INSERT INTO health_raw ({', '.join(RECORD_COLUMNS)}) VALUES %s "
    "ON CONFLICT (record_hash) DO NOTHING"
)
WORKOUT_INSERT_SQL = (
    f"INSERT INTO workouts ({', '.join(WORKOUT_COLUMNS)}) VALUES %s "
    "ON CONFLICT (workout_hash) DO NOTHING"
)

DURATION_MULTIPLIERS = {
    "s": 1,
    "sec": 1,
    "min": 60,
    "hr": 3600,
    "hour": 3600,
}


def find_default_export():
    candidates = sorted(Path(".").glob("export-*/apple_health_export/export.xml"))
    return candidates[-1] if candidates else None


def to_float(value):
    if value is None:
        return None
    try:
        return float(value)
    except (TypeError, ValueError):
        return None


def add_metadata(metadata, key, value):
    if key is None:
        return
    if key in metadata:
        existing = metadata[key]
        if isinstance(existing, list):
            existing.append(value)
        else:
            metadata[key] = [existing, value]
    else:
        metadata[key] = value


def serialize_elem(elem):
    data = {"tag": elem.tag, "attributes": dict(elem.attrib)}
    if len(elem):
        data["children"] = [serialize_elem(child) for child in elem]
    return data


def hash_json(raw_json):
    return hashlib.sha256(raw_json.encode("utf-8")).hexdigest()


def build_record_row(elem):
    attrib = dict(elem.attrib)
    metadata = {}
    extra_children = []

    for child in elem:
        if child.tag == "MetadataEntry":
            add_metadata(metadata, child.attrib.get("key"), child.attrib.get("value"))
        else:
            extra_children.append(serialize_elem(child))

    value_raw = attrib.get("value")
    value_numeric = to_float(value_raw)
    value_text = None
    if value_raw is not None and value_numeric is None:
        value_text = value_raw

    raw = {"attributes": attrib}
    if metadata:
        raw["metadata"] = metadata
    if extra_children:
        raw["children"] = extra_children

    metadata_json = json.dumps(metadata, separators=(",", ":"), sort_keys=True) if metadata else None
    raw_json = json.dumps(raw, separators=(",", ":"), sort_keys=True)
    record_hash = hash_json(raw_json)

    return (
        attrib.get("type"),
        attrib.get("sourceName"),
        attrib.get("sourceVersion"),
        attrib.get("sourceBundleIdentifier"),
        attrib.get("device"),
        attrib.get("unit"),
        value_numeric,
        value_text,
        attrib.get("startDate"),
        attrib.get("endDate"),
        attrib.get("creationDate"),
        metadata_json,
        record_hash,
        raw_json,
    )


def build_workout_row(elem):
    attrib = dict(elem.attrib)
    metadata = {}
    stats = []
    routes = []
    extra_children = []

    avg_hr = None
    min_hr = None
    max_hr = None
    total_energy = None
    total_energy_unit = None
    total_distance = None
    total_distance_unit = None
    route_file = None

    for child in elem:
        if child.tag == "MetadataEntry":
            add_metadata(metadata, child.attrib.get("key"), child.attrib.get("value"))
            continue

        if child.tag == "WorkoutStatistics":
            stat = dict(child.attrib)
            stats.append(stat)
            stat_type = stat.get("type")
            if stat_type == "HKQuantityTypeIdentifierHeartRate":
                avg_hr = to_float(stat.get("average"))
                min_hr = to_float(stat.get("minimum"))
                max_hr = to_float(stat.get("maximum"))
            elif stat_type == "HKQuantityTypeIdentifierActiveEnergyBurned":
                total_energy = to_float(stat.get("sum"))
                total_energy_unit = stat.get("unit")
            elif stat_type and stat_type.startswith("HKQuantityTypeIdentifierDistance"):
                if total_distance is None:
                    total_distance = to_float(stat.get("sum"))
                    total_distance_unit = stat.get("unit")
            continue

        if child.tag == "WorkoutRoute":
            route_data = {"attributes": dict(child.attrib)}
            for route_child in child:
                if route_child.tag == "FileReference":
                    route_path = route_child.attrib.get("path")
                    if route_path:
                        route_data.setdefault("files", []).append(route_path)
                        if route_file is None:
                            route_file = route_path
                else:
                    route_data.setdefault("children", []).append(serialize_elem(route_child))
            routes.append(route_data)
            continue

        extra_children.append(serialize_elem(child))

    duration_seconds = None
    duration_raw = attrib.get("duration")
    duration_unit = attrib.get("durationUnit")
    duration_value = to_float(duration_raw)
    if duration_value is not None:
        multiplier = DURATION_MULTIPLIERS.get(duration_unit)
        duration_seconds = duration_value * multiplier if multiplier else duration_value

    raw = {"attributes": attrib}
    if metadata:
        raw["metadata"] = metadata
    if stats:
        raw["statistics"] = stats
    if routes:
        raw["routes"] = routes
    if extra_children:
        raw["children"] = extra_children

    metadata_json = json.dumps(metadata, separators=(",", ":"), sort_keys=True) if metadata else None
    raw_json = json.dumps(raw, separators=(",", ":"), sort_keys=True)
    workout_hash = hash_json(raw_json)

    return (
        attrib.get("workoutActivityType"),
        attrib.get("sourceName"),
        attrib.get("sourceVersion"),
        attrib.get("sourceBundleIdentifier"),
        attrib.get("device"),
        attrib.get("startDate"),
        attrib.get("endDate"),
        duration_seconds,
        duration_unit,
        total_energy,
        total_energy_unit,
        total_distance,
        total_distance_unit,
        avg_hr,
        min_hr,
        max_hr,
        route_file,
        metadata_json,
        workout_hash,
        raw_json,
    )


def insert_rows(conn, sql, rows, page_size):
    if not rows:
        return 0
    with conn.cursor() as cur:
        execute_values(cur, sql, rows, page_size=page_size)
    conn.commit()
    return len(rows)


def main():
    parser = argparse.ArgumentParser(description="Load Apple Health export.xml into Postgres.")
    parser.add_argument(
        "--export-xml",
        help="Path to export.xml (defaults to latest export-* folder if present).",
    )
    parser.add_argument(
        "--db-url",
        default=os.environ.get("DATABASE_URL"),
        help="Postgres connection URL (or set DATABASE_URL).",
    )
    parser.add_argument("--batch-size", type=int, default=5000, help="Record batch size.")
    parser.add_argument(
        "--workout-batch-size",
        type=int,
        default=500,
        help="Workout batch size.",
    )
    parser.add_argument(
        "--progress-every",
        type=int,
        default=100000,
        help="Log progress every N records.",
    )
    parser.add_argument("--limit", type=int, help="Stop after N records (for testing).")
    parser.add_argument(
        "--truncate",
        action="store_true",
        help="Truncate target tables before loading.",
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Parse and count without writing to the database.",
    )

    args = parser.parse_args()

    if args.export_xml is None:
        default_export = find_default_export()
        if default_export:
            args.export_xml = str(default_export)
        else:
            parser.error("export.xml not found; pass --export-xml")

    export_path = Path(args.export_xml)
    if not export_path.exists():
        parser.error(f"export.xml not found at {export_path}")

    conn = None
    if not args.dry_run:
        if psycopg2 is None:
            print("Missing dependency: psycopg2. Install from requirements.txt.", file=sys.stderr)
            return 1
        if not args.db_url:
            parser.error("DATABASE_URL or --db-url is required.")
        conn = psycopg2.connect(args.db_url)
        conn.autocommit = False
        if args.truncate:
            with conn.cursor() as cur:
                cur.execute("TRUNCATE health_raw, workouts;")
            conn.commit()

    record_rows = []
    workout_rows = []
    record_counts = Counter()
    records_processed = 0
    workouts_processed = 0
    start_time = time.time()

    # Track tags that should NOT be cleared (children of Record/Workout)
    preserve_tags = {
        "MetadataEntry", "WorkoutStatistics", "WorkoutEvent", "WorkoutRoute",
        "FileReference", "HeartRateVariabilityMetadataList", "InstantaneousBeatsPerMinute"
    }

    try:
        for event, elem in ET.iterparse(export_path, events=("end",)):
            if elem.tag == "Record":
                row = build_record_row(elem)
                record_rows.append(row)
                records_processed += 1
                record_counts[row[0]] += 1

                if not args.dry_run and len(record_rows) >= args.batch_size:
                    insert_rows(conn, RECORD_INSERT_SQL, record_rows, args.batch_size)
                    record_rows.clear()

                if args.progress_every and records_processed % args.progress_every == 0:
                    elapsed = max(time.time() - start_time, 0.001)
                    rate = records_processed / elapsed
                    print(
                        f"Records: {records_processed:,} | Workouts: {workouts_processed:,} | "
                        f"{rate:,.0f} rec/s"
                    )

                if args.limit and records_processed >= args.limit:
                    break

                elem.clear()
            elif elem.tag == "Workout":
                row = build_workout_row(elem)
                workout_rows.append(row)
                workouts_processed += 1

                if not args.dry_run and len(workout_rows) >= args.workout_batch_size:
                    insert_rows(conn, WORKOUT_INSERT_SQL, workout_rows, args.workout_batch_size)
                    workout_rows.clear()

                elem.clear()
            elif elem.tag not in preserve_tags:
                elem.clear()
    finally:
        if not args.dry_run:
            insert_rows(conn, RECORD_INSERT_SQL, record_rows, args.batch_size)
            insert_rows(conn, WORKOUT_INSERT_SQL, workout_rows, args.workout_batch_size)
            conn.close()

    elapsed = max(time.time() - start_time, 0.001)
    rate = records_processed / elapsed
    print(
        f"Done. Records: {records_processed:,} | Workouts: {workouts_processed:,} | "
        f"{rate:,.0f} rec/s"
    )

    if record_counts:
        print("Top record types:")
        for record_type, count in record_counts.most_common(10):
            print(f"  {record_type}: {count:,}")

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
