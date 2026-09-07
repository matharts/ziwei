#[path = "../benches/read_path.rs"]
mod read_path;
read_path::define_workload!(current, ziwei);

#[test]
fn read_path_corpus_is_valid_and_every_operation_is_exercised() {
    let workload = current::Workload::new();
    workload.validate();
    let expected = [
        8192, 8192, 8192, 8192, 36864, 36864, 49152, 32768, 32768, 49152, 49152, 49152, 49152,
        147456, 147456, 2048, 2048, 49152,
    ];
    for (entry, expected_count) in expected.into_iter().enumerate() {
        assert_eq!(
            workload.execute(entry),
            expected_count,
            "{}",
            current::ENTRIES[entry]
        );
    }
}

#[test]
fn read_path_corpus_and_query_facts_are_reproducible() {
    assert_eq!(
        current::Workload::new().facts(),
        current::Workload::new().facts()
    );
}

#[test]
fn read_path_samples_record_counts_and_elapsed_time_without_expanding_smoke() {
    let workload = current::Workload::new();
    // Fixed protocol expectations, independent of the workload's batch selector.
    for (entry, smoke, batches, operations) in [
        (6, false, 16, 786_432),
        (8, false, 16, 524_288),
        (7, false, 1, 32_768),
        (6, true, 1, 49_152),
        (8, true, 1, 32_768),
    ] {
        let sample = workload.measure(entry, smoke);
        assert_eq!(sample.batches, batches);
        assert_eq!(sample.operations, operations);
        assert!(sample.elapsed_ns > 0);
    }
}
