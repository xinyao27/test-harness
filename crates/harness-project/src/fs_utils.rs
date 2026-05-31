use std::fs;
use std::path::{Path, PathBuf};

pub(crate) fn collect_files(directory: &Path, suffix: &str) -> Result<Vec<PathBuf>, String> {
    let mut files = Vec::new();
    if !directory.exists() {
        return Ok(files);
    }
    for entry in fs::read_dir(directory).map_err(|error| error.to_string())? {
        let entry = entry.map_err(|error| error.to_string())?;
        let path = entry.path();
        let file_type = entry.file_type().map_err(|error| error.to_string())?;
        if file_type.is_dir() {
            files.extend(collect_files(&path, suffix)?);
        } else if file_type.is_file() && path.to_string_lossy().ends_with(suffix) {
            files.push(path);
        }
    }
    files.sort();
    Ok(files)
}
