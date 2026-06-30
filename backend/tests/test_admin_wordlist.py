def test_add_then_list(client):
    resp = client.post("/api/admin/wordlist", json={"word": "თბილისი"})
    assert resp.status_code == 201
    assert resp.json()["length"] == 7

    listed = client.get("/api/admin/wordlist").json()
    assert [w["word"] for w in listed] == ["თბილისი"]


def test_add_invalid_returns_422(client):
    resp = client.post("/api/admin/wordlist", json={"word": "abc"})
    assert resp.status_code == 422


def test_block_via_patch_then_filter(client):
    wid = client.post("/api/admin/wordlist", json={"word": "ბათუმი"}).json()["id"]
    patched = client.patch(f"/api/admin/wordlist/{wid}", json={"status": "blocked"})
    assert patched.status_code == 200 and patched.json()["status"] == "blocked"
    assert client.get("/api/admin/wordlist?status=active").json() == []


def test_patch_unknown_returns_404(client):
    import uuid
    resp = client.patch(f"/api/admin/wordlist/{uuid.uuid4()}", json={"status": "blocked"})
    assert resp.status_code == 404


def test_bulk_import_reports_added_and_rejected(client):
    resp = client.post("/api/admin/wordlist/bulk", json={"words": ["თბილისი", "ბათუმი", "ab"]})
    assert resp.status_code == 200
    body = resp.json()
    assert body["added"] == 2
    assert body["rejected"] == [{"word": "ab", "reason": "length<3"}]


def test_stats_endpoint_shape(client):
    client.post("/api/admin/wordlist", json={"word": "აბგ"})
    body = client.get("/api/admin/wordlist/stats").json()
    assert body["active"] == 1
    assert body["by_length"]["3"] == 1  # JSON object keys are strings
    assert body["by_length"]["4"] == 0
