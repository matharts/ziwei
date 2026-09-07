use ziwei::{Birth, BirthDay, BirthMonth, Branch, Gender, Parameters, Stem};

pub const SUITE_VERSION: u32 = 1;
pub const SUITE_ID: &str = "ziwei-construction-120";
pub const CASE_COUNT: usize = 120;
pub const SAMPLES: usize = 31;
pub const REPEATS: usize = 64;
pub const WARMUP_BATCHES: usize = 5;

pub fn births() -> [Birth; CASE_COUNT] {
    std::array::from_fn(|i| Birth {
        gender: if i.is_multiple_of(2) {
            Gender::Female
        } else {
            Gender::Male
        },
        birth_year: 1984 + (i % 60) as i32,
        birth_month: BirthMonth::try_from(1 + (i % 12) as u8).unwrap(),
        birth_day: BirthDay::try_from(1 + (i % 30) as u8).unwrap(),
        birth_hour: Branch::ALL[(i * 7) % 12],
    })
}

pub fn parameters() -> [Parameters; CASE_COUNT] {
    std::array::from_fn(|i| {
        Parameters::new(
            if i.is_multiple_of(2) {
                Gender::Male
            } else {
                Gender::Female
            },
            Stem::ALL[i / 12],
            Branch::ALL[i / 12],
            BirthMonth::try_from(1 + (i % 12) as u8).unwrap(),
            Branch::ALL[i % 12],
            Branch::ALL[(i * 7) % 12],
        )
        .unwrap()
    })
}
