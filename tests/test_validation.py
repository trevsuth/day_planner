import pytest
from fastapi.testclient import TestClient

from app_planner.api import app


client = TestClient(app)


@pytest.mark.parametrize(
    ("kind", "source", "expected"),
    [
        (
            "json",
            '{"value":1.000000000000000001,"value":{}}',
            '  "value": 1.000000000000000001',
        ),
        (
            "xml",
            '<root><p xml:space="preserve"> x <b>bold</b> y </p></root>',
            '\n  <p xml:space="preserve"> x <b>bold</b> y </p>',
        ),
        ("yaml", 'a:   "yes" # keep\n---\nb:  3\n', "# keep\n---\nb: 3"),
        (
            "toml",
            'port=123 # keep\n[net]\nname="test"\n',
            'port = 123 # keep\n[net]\nname = "test"',
        ),
    ],
)
def test_document_formatting(kind, source, expected):
    result = client.post(
        "/api/validation/document",
        json={
            "format": kind,
            "source": source,
            "pretty": True,
        },
    ).json()
    assert result["valid"]
    assert expected in result["formatted"]
    assert client.post(
        "/api/validation/document",
        json={
            "format": kind,
            "source": result["formatted"],
        },
    ).json()["valid"]


@pytest.mark.parametrize(
    ("kind", "source"),
    [
        ("json", '{\n"value":\n}'),
        ("xml", "<root>\n</bad>"),
        ("yaml", "a: 1\nb: [2, : ]"),
        ("toml", "a = true\nb = ]"),
    ],
)
def test_syntax_error_has_location(kind, source):
    response = client.post(
        "/api/validation/document", json={"format": kind, "source": source}
    )
    assert response.status_code == 200
    error = response.json()["diagnostic"]
    assert error["line"] >= 2 and error["column"] >= 1


def test_rejects_xml_dtd():
    response = client.post(
        "/api/validation/document",
        json={
            "format": "xml",
            "source": '<!DOCTYPE root SYSTEM "file:///etc/passwd"><root/>',
        },
    )
    assert not response.json()["valid"]


def test_character_offsets_and_selective_removal():
    response = client.post(
        "/api/validation/characters",
        json={
            "source": "🙂\u200b\r\n\ta\u00a0\x00",
            "remove_offsets": [1, 2, 3, 7],
        },
    ).json()
    assert [
        (char["offset"], char["line"], char["column"], char["code_point"])
        for char in response["characters"]
    ] == [
        (1, 1, 2, "U+200B"),
        (6, 2, 3, "U+00A0"),
        (7, 2, 4, "U+0000"),
    ]
    assert response["cleaned"] == "🙂\r\n\ta\u00a0"


def test_python_regex_returns_code_point_spans_and_named_captures(
    tmp_path, monkeypatch
):
    monkeypatch.chdir(tmp_path)
    result = client.post(
        "/api/validation/regex",
        json={
            "pattern": "(?P<letters>[a-z]+)([0-9])?",
            "source": "🙂AB3 cd",
            "flags": "i",
        },
    ).json()
    assert result["diagnostic"] is None
    assert result["group_names"] == {"letters": 1}
    assert result["matches"] == [
        {
            "start": 1,
            "end": 4,
            "groups": [{"start": 1, "end": 3}, {"start": 3, "end": 4}],
        },
        {"start": 5, "end": 7, "groups": [{"start": 5, "end": 7}, None]},
    ]


def test_pathological_regex_times_out():
    result = client.post(
        "/api/validation/regex",
        json={
            "pattern": "(a+)+$",
            "source": "a" * 50 + "!",
        },
    ).json()
    assert "one-second limit" in result["diagnostic"]["message"]
