def test_add_pool_word(client):
    res = client.post("/api/admin/pool", json={"surface": "დედამიწა", "theme": "გეო"})
    assert res.status_code == 201
    body = res.json()
    assert body["surface"] == "დედამიწა"
    assert body["status"] == "accepted"


def test_add_pool_word_rejects_non_georgian(client):
    res = client.post("/api/admin/pool", json={"surface": "hello", "theme": "გეო"})
    assert res.status_code == 422
