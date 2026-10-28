# =============================================================================
# FairMod — app edge-case tests (master §6 testing checklist)
# =============================================================================
# Checks: empty input, 3000-character input, emoji-only input, wrong-language
# input, and the /health endpoint. Run against the real checkpoint:
#
#   pip install -r requirements.txt httpx gradio
#   MODEL_ID=/path/to/muril_pooled/final python test_app.py
#
# Or, after deploying, point it at the Space itself:
#   SPACE_URL=https://<user>-fairmod.hf.space python test_app.py
# =============================================================================

import os
import sys
import time

try:
    import httpx
    import fastapi, gradio, torch, transformers, captum  # noqa: F401 — fail early, clearly
except ImportError as e:
    sys.exit(f"Missing package ({e.name}). Install the app's dependencies first:\n"
             f"  {sys.executable} -m pip install -r requirements.txt gradio==6.30.0 httpx")

if os.environ.get('SPACE_URL'):
    client = httpx.Client(base_url=os.environ['SPACE_URL'], timeout=120)
else:
    model_id = os.environ.get('MODEL_ID', 'checkpoints/muril_pooled/final')
    if 'MODEL_ID' not in os.environ and not os.path.isdir(model_id):
        sys.exit("No model to test. Set MODEL_ID to the trained checkpoint, e.g.\n"
                 "  MODEL_ID=/path/to/muril_pooled/final   (downloaded from Drive), or\n"
                 "  MODEL_ID=yourname/fairmod-muril        (HF Hub, after 03_explain_eval.py Cell 13)")
    from fastapi.testclient import TestClient
    from app import app
    client = TestClient(app)

def check(name, text, expect_status=200):
    t0 = time.perf_counter()
    r = client.post('/classify', json={'text': text})
    ms = (time.perf_counter() - t0) * 1000
    assert r.status_code == expect_status, f"{name}: HTTP {r.status_code} {r.text[:200]}"
    if r.status_code == 200:
        body = r.json()
        assert body['label'] in ('normal', 'abusive'), body
        assert 0.5 <= body['confidence'] <= 1.0, body
        scores = [w['score'] for w in body['word_scores'] if w['score'] is not None]
        assert all(-1.0 <= s <= 1.0 for s in scores), "scores must be normalised to [-1, 1]"
        print(f"PASS  {name:<28} {body['label']:<8} conf={body['confidence']:.3f} "
              f"words={len(body['word_scores'])} truncated={body['truncated']} ({ms:.0f} ms)")
    else:
        print(f"PASS  {name:<28} HTTP {r.status_code}: {str(r.json()['detail'])[:100]}")

r = client.get('/health')
assert r.status_code == 200 and r.json()['status'] == 'ok', r.text
print(f"PASS  {'health':<28} {r.json()}")

check('empty input', '', expect_status=422)
check('whitespace + URL only', '   https://example.com  @someone ', expect_status=422)
check('3000-character input', ('ಇದು ಒಂದು ಉದ್ದವಾದ ಪರೀಕ್ಷಾ ವಾಕ್ಯ ' * 200)[:3000])
check('over the 5000-char limit', 'a' * 5001, expect_status=422)
check('emoji only', '😡😡🤬👎🔥')
body = client.post('/classify', json={'text': 'ok 😡 हाँ'}).json()
assert body['word_scores'][1]['score'] is not None and not body['truncated'], \
    f"emoji must get an attribution, got {body}"
print(f"PASS  {'emoji word gets a score':<28} {body['word_scores']}")
check('wrong language (English)', 'This is a perfectly normal English sentence.')
check('wrong language (Tamil)', 'இது ஒரு சாதாரண வாக்கியம்')
check('Kannada', 'ನಮಸ್ಕಾರ, ಹೇಗಿದ್ದೀರಾ?')
check('Hindi', 'आज मौसम बहुत अच्छा है')
check('Marathi', 'आज खूप छान दिवस आहे')
check('Bengali', 'আজ আবহাওয়া খুব ভালো')
print("\nAll edge-case checks passed.")
