use std::{fs, io::Cursor};
use tar::{Builder, EntryType, Header};
use ziwei_xtask::package::unpack_archive;

fn archive(path: &str, kind: EntryType) -> Vec<u8> {
    let mut builder = Builder::new(Vec::new());
    let mut header = Header::new_gnu();
    // Raw path bytes allow deliberately invalid parent paths for the reader test.
    header.as_mut_bytes()[..path.len()].copy_from_slice(path.as_bytes());
    header.set_entry_type(kind);
    header.set_mode(0o644);
    if kind.is_file() {
        header.set_size(2);
    } else {
        header.set_size(0);
        header.set_link_name("../outside").unwrap();
    }
    header.set_cksum();
    builder
        .append(&header, if kind.is_file() { &b"ok"[..] } else { &[] })
        .unwrap();
    builder.into_inner().unwrap()
}

#[test]
fn archive_extracts_regular_files_without_overwriting() {
    let directory = tempfile::tempdir().unwrap();
    let bytes = archive("ziwei-0.1.0/src/lib.rs", EntryType::Regular);
    unpack_archive(Cursor::new(&bytes), directory.path(), "ziwei-0.1.0").unwrap();
    let path = directory.path().join("ziwei-0.1.0/src/lib.rs");
    assert_eq!(fs::read(&path).unwrap(), b"ok");
    assert!(unpack_archive(Cursor::new(bytes), directory.path(), "ziwei-0.1.0").is_err());
    assert_eq!(fs::read(path).unwrap(), b"ok");
}

#[test]
fn archive_rejects_escape_links_and_wrong_roots() {
    for (path, kind) in [
        ("../outside", EntryType::Regular),
        ("/absolute", EntryType::Regular),
        ("ziwei-0.1.0/../outside", EntryType::Regular),
        ("different/src/lib.rs", EntryType::Regular),
        ("ziwei-0.1.0/link", EntryType::Symlink),
        ("ziwei-0.1.0/link", EntryType::Link),
    ] {
        let directory = tempfile::tempdir().unwrap();
        assert!(
            unpack_archive(
                Cursor::new(archive(path, kind)),
                directory.path(),
                "ziwei-0.1.0"
            )
            .is_err(),
            "{path}"
        );
        assert_eq!(fs::read_dir(directory.path()).unwrap().count(), 0);
    }
}
