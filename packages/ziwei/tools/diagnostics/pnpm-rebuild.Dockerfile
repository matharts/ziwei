# Experimental build environment only; never used by candidate consumers.
ARG RUST_IMAGE
FROM ${RUST_IMAGE}

RUN apt-get update \
    && apt-get install --yes --no-install-recommends \
        g++-12-powerpc64le-linux-gnu=12.2.0-14cross1 \
        binutils-powerpc64le-linux-gnu=2.40-2 \
        libc6-dev-ppc64el-cross=2.36-8cross1 \
        cmake=3.25.1-1 \
    && rustup target add --toolchain 1.97.0 powerpc64le-unknown-linux-gnu

ENV CARGO_HOME=/output/cargo \
    CARGO_TARGET_DIR=/output/target \
    CARGO_BUILD_JOBS=2 \
    CARGO_TARGET_POWERPC64LE_UNKNOWN_LINUX_GNU_LINKER=powerpc64le-linux-gnu-gcc-12 \
    CC_powerpc64le_unknown_linux_gnu=powerpc64le-linux-gnu-gcc-12 \
    CXX_powerpc64le_unknown_linux_gnu=powerpc64le-linux-gnu-g++-12 \
    AR_powerpc64le_unknown_linux_gnu=powerpc64le-linux-gnu-ar \
    CARGO_PROFILE_RELEASE_STRIP=none

WORKDIR /source
