use crate::{Branch, StarName};

/// 四化的稳定领域身份。
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
pub enum Transformation {
    /// 禄。
    A,
    /// 权。
    B,
    /// 科。
    C,
    /// 忌。
    D,
}

impl Transformation {
    /// 四化全集，顺序固定为 `A / B / C / D`。
    pub const ALL: [Self; 4] = [Self::A, Self::B, Self::C, Self::D];

    /// 四化表下标，与 [`Self::ALL`] 对齐。
    pub(crate) const fn index(self) -> usize {
        match self {
            Self::A => 0,
            Self::B => 1,
            Self::C => 2,
            Self::D => 3,
        }
    }
}

/// 一颗星曜的向心与离心自化。
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct SelfTransformations {
    inward: Option<Transformation>,
    outward: Option<Transformation>,
}

/// 源宫宫干发出的一条四化关系。
///
/// 使用实际地支定位源宫和目标宫，不存储宫位副本或期间宫职。
/// 源、目标相同是有效关系（离心自化），不应过滤掉。
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct PalaceTransformation {
    source_branch: Branch,
    target_branch: Branch,
    transformation: Transformation,
    star: StarName,
}

impl PalaceTransformation {
    pub(crate) const fn new(
        source_branch: Branch,
        target_branch: Branch,
        transformation: Transformation,
        star: StarName,
    ) -> Self {
        Self {
            source_branch,
            target_branch,
            transformation,
            star,
        }
    }

    /// 发出四化的实际宫位地支。
    #[must_use]
    pub const fn source_branch(self) -> Branch {
        self.source_branch
    }

    /// 承接四化星曜所在的实际宫位地支。
    #[must_use]
    pub const fn target_branch(self) -> Branch {
        self.target_branch
    }

    /// 本条关系的化象。
    #[must_use]
    pub const fn transformation(self) -> Transformation {
        self.transformation
    }

    /// 本条关系命中的星曜身份。
    #[must_use]
    pub const fn star(self) -> StarName {
        self.star
    }
}

impl SelfTransformations {
    /// 由 crate 内的宫干四化规则创建自化事实。
    pub(crate) const fn new(
        inward: Option<Transformation>,
        outward: Option<Transformation>,
    ) -> Self {
        Self { inward, outward }
    }

    /// 向心自化；源宫与目标宫相对时为 `Some`。
    pub const fn inward(self) -> Option<Transformation> {
        self.inward
    }

    /// 离心自化；源宫与目标宫相同时为 `Some`。
    pub const fn outward(self) -> Option<Transformation> {
        self.outward
    }
}

#[cfg(test)]
mod tests {
    use super::{SelfTransformations, Transformation};

    #[test]
    fn self_transformations_hold_independent_directions() {
        let transformations = SelfTransformations::new(Some(Transformation::A), None);

        assert_eq!(transformations.inward, Some(Transformation::A));
        assert_eq!(transformations.outward, None);

        let empty = SelfTransformations::new(None, None);
        assert_eq!(empty.inward, None);
        assert_eq!(empty.outward, None);
    }

    #[test]
    fn transformation_has_confirmed_order() {
        let expected = [
            Transformation::A,
            Transformation::B,
            Transformation::C,
            Transformation::D,
        ];

        assert_eq!(Transformation::ALL, expected);

        for (index, transformation) in expected.into_iter().enumerate() {
            assert_eq!(transformation.index(), index);
        }
    }
}
