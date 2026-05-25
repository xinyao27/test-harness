use harness_protocol::LocalizedText;

pub const DEFAULT_LANGUAGE: &str = "en";

pub fn resolve_localized_text(text: &LocalizedText, language: Option<&str>) -> String {
    match text {
        LocalizedText::Text(value) => value.clone(),
        LocalizedText::Localized(map) => {
            for candidate in language_fallbacks(language.unwrap_or(DEFAULT_LANGUAGE)) {
                if let Some(value) = map.get(&candidate) {
                    if !value.trim().is_empty() {
                        return value.clone();
                    }
                }
            }
            map.values()
                .find(|value| !value.trim().is_empty())
                .cloned()
                .unwrap_or_default()
        }
    }
}

fn language_fallbacks(language: &str) -> Vec<String> {
    let mut candidates = vec![language.to_string()];
    if let Some((base, _)) = language.split_once('-') {
        if base != language {
            candidates.push(base.to_string());
        }
    }
    if !candidates
        .iter()
        .any(|candidate| candidate == DEFAULT_LANGUAGE)
    {
        candidates.push(DEFAULT_LANGUAGE.to_string());
    }
    candidates
}

pub(crate) fn is_blank(value: &str) -> bool {
    value.trim().is_empty()
}

pub(crate) fn is_localized_text_blank(text: &LocalizedText) -> bool {
    resolve_localized_text(text, None).trim().is_empty()
}

pub(crate) fn has_default_language_text(text: &LocalizedText) -> bool {
    match text {
        LocalizedText::Text(value) => !is_blank(value),
        LocalizedText::Localized(map) => map
            .get(DEFAULT_LANGUAGE)
            .is_some_and(|value| !value.trim().is_empty()),
    }
}
