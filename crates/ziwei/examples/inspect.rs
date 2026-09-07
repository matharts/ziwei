use ziwei::{
    Birth, BirthDay, BirthMonth, Branch, DecadeIndex, Gender, StarName, YearlyIndex, Ziwei,
};

fn main() -> Result<(), ziwei::ZiweiError> {
    let natal = Ziwei::from_birth(Birth {
        gender: Gender::Female,
        birth_year: 1992,
        birth_month: BirthMonth::try_from(8)?,
        birth_day: BirthDay::try_from(17)?,
        birth_hour: Branch::Mao,
    })?;
    let ziwei = natal.star(StarName::ZiWei);
    let palace = natal.palace_by_star(StarName::ZiWei);
    println!(
        "{}: {} / {}",
        palace.branch(),
        ziwei.name_hans(),
        ziwei.name_hant()
    );
    let decade = DecadeIndex::try_from(0)?;
    let yearly = natal.yearly(decade, YearlyIndex::try_from(0)?);
    for (palace, role) in natal.palaces().iter().zip(yearly) {
        println!("{} {}", palace.branch(), role.name_hant());
    }
    assert_eq!(natal.decade_years(decade)[0].year(), Some(1993));
    for relation in natal.palace_transformations(Branch::Zi) {
        println!(
            "{} → {} {:?} {:?}",
            relation.source_branch(),
            relation.target_branch(),
            relation.star(),
            relation.transformation()
        );
    }
    Ok(())
}
