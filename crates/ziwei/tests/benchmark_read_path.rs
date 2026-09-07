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
