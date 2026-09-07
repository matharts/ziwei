mod suite;

use std::{hint::black_box, time::Instant};
use ziwei::{Natal, Ziwei};

fn measure<T: Copy>(name: &str, inputs: &[T], construct: impl Fn(T) -> Natal, smoke: bool) {
    // Typed inputs are prepared outside timing. Include construction, black_box and drop;
    // exclude validation, calendar conversion, formatting and read-only queries.
    let repeats = if smoke { 1 } else { suite::REPEATS };
    let samples = if smoke { 1 } else { suite::SAMPLES };
    for _ in 0..suite::WARMUP_BATCHES {
        for &input in inputs {
            drop(black_box(construct(black_box(input))));
        }
    }
    for sample in 0..samples {
        let start = Instant::now();
        for _ in 0..repeats {
            for &input in inputs {
                drop(black_box(construct(black_box(input))));
            }
        }
        let ns_per_chart = start.elapsed().as_nanos() as f64 / (repeats * inputs.len()) as f64;
        println!("sample,{name},{sample},{ns_per_chart:.6}");
    }
}

fn main() {
    let smoke = std::env::args().any(|arg| arg == "--smoke");
    let births = suite::births();
    let parameters = suite::parameters();
    // Every corpus item is validated outside timing. This is a smoke invariant,
    // not a replacement for the independently specified integration fixtures.
    for natal in births
        .iter()
        .map(|&value| Ziwei::from_birth(value).unwrap())
        .chain(
            parameters
                .iter()
                .map(|&value| Ziwei::from_parameters(value).unwrap()),
        )
    {
        assert_eq!(
            natal
                .palaces()
                .iter()
                .map(|p| p.stars().len())
                .sum::<usize>(),
            18
        );
        assert_eq!(natal.birth_transformations().len(), 4);
    }
    println!(
        "suite,{},{},{}",
        suite::SUITE_ID,
        suite::SUITE_VERSION,
        suite::CASE_COUNT
    );
    measure(
        "from_birth",
        &births,
        |value| Ziwei::from_birth(value).unwrap(),
        smoke,
    );
    measure(
        "from_parameters",
        &parameters,
        |value| Ziwei::from_parameters(value).unwrap(),
        smoke,
    );
}
