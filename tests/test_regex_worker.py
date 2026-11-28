from app_validation.regex_worker import MAX_GROUPS, MAX_MATCHES, match_pattern


def test_worker_reports_capture_offsets_and_missing_optional_groups():
    result = match_pattern(r"(?P<letter>a)(b)?", "AB A", "i")
    assert result == {
        "group_names": {"letter": 1},
        "matches": [
            {
                "start": 0,
                "end": 2,
                "groups": [{"start": 0, "end": 1}, {"start": 1, "end": 2}],
            },
            {"start": 3, "end": 4, "groups": [{"start": 3, "end": 4}, None]},
        ],
    }


def test_worker_reports_invalid_patterns_and_caps_large_results():
    assert match_pattern("(", "", "")["diagnostic"]["column"] == 1
    limit = match_pattern("(a)" * (MAX_GROUPS + 1), "", "")
    assert str(MAX_GROUPS) in limit["diagnostic"]["message"]
    result = match_pattern("a", "a" * (MAX_MATCHES + 1), "")
    assert result["truncated"]
    assert len(result["matches"]) == MAX_MATCHES
    assert result["matches"][-1]["end"] == MAX_MATCHES
