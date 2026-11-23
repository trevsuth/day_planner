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


@pytest.mark.parametrize(
    ("source", "from_dialect", "to_dialect", "expected"),
    [
        (
            "SELECT DATEADD(day, 1, TO_DATE('2025-01-01'))",
            "snowflake",
            "bigquery",
            "DATE_ADD(CAST('2025-01-01' AS DATE), INTERVAL 1 DAY)",
        ),
        (
            "SELECT SAFE_DIVIDE(8, 2)",
            "bigquery",
            "snowflake",
            "IFF(2 <> 0, 8 / 2, NULL)",
        ),
        ("select 1; select 2", "sqlite", None, "SELECT\n  1;\n\nSELECT\n  2;"),
    ],
)
def test_formats_and_translates_sql(source, from_dialect, to_dialect, expected):
    result = client.post(
        "/api/validation/sql",
        json={
            "source": source,
            "source_dialect": from_dialect,
            "target_dialect": to_dialect,
        },
    ).json()
    assert result["diagnostic"] is None
    assert expected in result["formatted"]


def test_sql_diagnostics_and_compatibility_warnings():
    endpoint = "/api/validation/sql"
    result = client.post(
        endpoint,
        json={
            "source": "SELECT (1",
            "source_dialect": "bigquery",
        },
    ).json()
    assert result["formatted"] is None
    assert result["diagnostic"]["line"] == 1
    assert result["diagnostic"]["column"] == 9
    result = client.post(
        endpoint,
        json={
            "source": "SELECT CUSTOM_FUNCTION(1)",
            "source_dialect": "bigquery",
            "target_dialect": "snowflake",
        },
    ).json()
    assert "CUSTOM_FUNCTION" in result["warnings"][0]
    result = client.post(
        endpoint,
        json={
            "source": "SELECT * FROM a TABLESAMPLE BERNOULLI (10 PERCENT)",
            "source_dialect": "snowflake",
            "target_dialect": "sqlite",
        },
    ).json()
    assert result["formatted"] is None
    assert "TABLESAMPLE unsupported" in result["diagnostic"]["message"]


def test_json_schema_reports_nested_paths_and_supports_inline_refs():
    body = {
        "source": '{"items":[{"dueDate":4}]}',
        "schema_source": '{"$defs":{"date":{"type":"string"}},"properties":'
        '{"items":{"items":{"properties":{"dueDate":{"$ref":"#/$defs/date"}}}}}}',
    }
    result = client.post("/api/validation/schema", json=body).json()
    assert not result["valid"]
    assert result["issues"][0]["document"] == "json"
    assert result["issues"][0]["path"] == "$.items[0].dueDate"
    body["source"] = '{"items":[{"dueDate":"2026-01-01"}]}'
    assert client.post("/api/validation/schema", json=body).json()["valid"]


@pytest.mark.parametrize(
    ("source", "schema", "document", "expected"),
    [
        ('{\n  "x": }', "{}", "json", "Expecting value"),
        ("{}", '{"type":123}', "schema", "not valid"),
        (
            "{}",
            '{"$ref":"https://example.invalid/schema"}',
            "schema",
            "referenced schemas inline",
        ),
    ],
)
def test_json_schema_reports_source_and_schema_issues(
    source, schema, document, expected
):
    result = client.post(
        "/api/validation/schema",
        json={
            "source": source,
            "schema_source": schema,
        },
    ).json()
    assert not result["valid"]
    assert result["issues"][0]["document"] == document
    assert expected in result["issues"][0]["message"]


XSD = (
    '<xs:schema xmlns:xs="http://www.w3.org/2001/XMLSchema">'
    '<xs:element name="count" type="xs:integer"/></xs:schema>'
)


def test_xml_schema_reports_validation_paths_and_syntax_locations():
    endpoint = "/api/validation/xml-schema"
    assert client.post(
        endpoint,
        json={
            "source": "<count>7</count>",
            "schema_source": XSD,
        },
    ).json()["valid"]
    result = client.post(
        endpoint,
        json={
            "source": "\n<count>seven</count>",
            "schema_source": XSD,
        },
    ).json()
    assert not result["valid"]
    issue = result["issues"][0]
    assert (issue["document"], issue["path"], issue["line"]) == ("xml", "/count", 2)
    assert "xs:integer" in issue["message"]

    issue = client.post(
        endpoint,
        json={
            "source": "<count>7</count>",
            "schema_source": "<schema>\n</typo>",
        },
    ).json()["issues"][0]
    assert issue["document"] == "schema"
    assert issue["line"] == 2
    assert issue["column"] > 0


@pytest.mark.parametrize(
    ("source", "schema", "document", "message"),
    [
        (
            '<!DOCTYPE count [<!ENTITY item SYSTEM "file:///etc/passwd">]><count>&item;</count>',
            XSD,
            "xml",
            "DTDs",
        ),
        (
            "<count>7</count>",
            XSD.replace('name="count"', 'name="count" bogus="1"'),
            "schema",
            "bogus",
        ),
        (
            "<count>7</count>",
            XSD.replace(
                "<xs:element",
                '<xs:include schemaLocation="file:///etc/passwd"/><xs:element',
                1,
            ),
            "schema",
            "External schema locations",
        ),
    ],
)
def test_xml_schema_reports_invalid_schemas_and_rejects_external_resources(
    source, schema, document, message
):
    result = client.post(
        "/api/validation/xml-schema",
        json={
            "source": source,
            "schema_source": schema,
        },
    ).json()
    assert not result["valid"]
    issue = result["issues"][0]
    assert issue["document"] == document
    assert message in issue["message"]


def test_config_diff_normalizes_json_and_aligns_yaml_changes():
    endpoint = "/api/validation/config-diff"
    result = client.post(
        endpoint,
        json={
            "format": "json",
            "left": '{"port":80}',
            "right": '{\n  "port" : 80\n}',
        },
    ).json()
    assert result["changed"] == 0
    result = client.post(
        endpoint,
        json={
            "format": "yaml",
            "left": "port: 80\nready: true\n",
            "right": "port: 443\nready: true\n",
        },
    ).json()
    assert result["changed"] == 1
    assert result["rows"][0] == {
        "kind": "replace",
        "left": "port: 80",
        "right": "port: 443",
        "left_line": 1,
        "right_line": 1,
    }


def test_config_diff_locates_invalid_side():
    result = client.post(
        "/api/validation/config-diff",
        json={
            "format": "json",
            "left": "{}",
            "right": '{\n"x": }',
        },
    ).json()
    assert result["side"] == "right"
    assert result["diagnostic"]["line"] == 2
