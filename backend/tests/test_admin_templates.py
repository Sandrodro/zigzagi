def test_list_templates(client):
    res = client.get("/api/admin/templates")
    assert res.status_code == 200
    data = res.json()
    assert len(data) >= 1
    t = data[0]
    assert {"id", "rows", "cols", "blocks", "slots"} <= t.keys()
    assert t["rows"] == 11 and t["cols"] == 11
    slot = t["slots"][0]
    assert {"number", "direction", "row", "col", "length"} <= slot.keys()
    assert slot["direction"] in ("across", "down")
