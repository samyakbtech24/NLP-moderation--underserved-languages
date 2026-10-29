# =============================================================================
# FairMod — command-line evaluation tool
# =============================================================================
# Pushes labelled sentences through the running FairMod API (/eval/run) and
# prints how well the model did. Needs `python app.py` running.
#
#   python evaluate.py --sample 25                 # 25 per language × label from the test set (200 items)
#   python evaluate.py --csv my_tests.csv          # columns: text, label (abusive/normal or 1/0), [language]
#   python evaluate.py --csv my_tests.csv --save "Viva demo" --out results.csv
#
# Options: --url (default http://127.0.0.1:7860), --languages hi,kn,mr,bn,
#          --explain (also compute IG word scores; slower), --seed 42
# =============================================================================

import argparse
import csv
import sys

import httpx

LANG = {'hi': 'Hindi', 'kn': 'Kannada', 'mr': 'Marathi', 'bn': 'Bengali', 'other': 'Other'}


def load_csv(path):
    with open(path, encoding='utf-8-sig', newline='') as f:
        rows = list(csv.DictReader(f))
    if not rows:
        sys.exit("CSV is empty.")
    cols = {c.lower().strip(): c for c in rows[0].keys()}
    text_col = cols.get('text') or list(rows[0].keys())[0]
    label_col = cols.get('label') or cols.get('expected') or cols.get('gold')
    lang_col = cols.get('language') or cols.get('lang')
    if not label_col:
        sys.exit("CSV needs a 'label' column (abusive/normal or 1/0).")
    return [{'id': i, 'text': r[text_col], 'label': r[label_col], 'language': (r.get(lang_col) or None) if lang_col else None}
            for i, r in enumerate(rows) if (r.get(text_col) or '').strip()]


def pct(x):
    return f"{x * 100:5.1f}%" if x is not None else "   — "


def main():
    # Windows consoles default to cp1252; Indic text and symbols need UTF-8.
    for stream in (sys.stdout, sys.stderr):
        try:
            stream.reconfigure(encoding='utf-8', errors='replace')
        except AttributeError:
            pass
    ap = argparse.ArgumentParser(description="Bulk-test FairMod against labelled sentences.")
    src = ap.add_mutually_exclusive_group(required=True)
    src.add_argument('--csv', help="CSV with text,label[,language]")
    src.add_argument('--sample', type=int, metavar='N', help="N items per language × label from the frozen test set")
    ap.add_argument('--url', default='http://127.0.0.1:7860')
    ap.add_argument('--languages', default='hi,kn,mr,bn')
    ap.add_argument('--seed', type=int, default=42)
    ap.add_argument('--explain', action='store_true', help="also compute IG word scores (≈0.35 s per item on CPU)")
    ap.add_argument('--save', metavar='NAME', help="save the run so it shows in the web evaluation bench")
    ap.add_argument('--out', metavar='FILE', help="write per-item results to CSV")
    args = ap.parse_args()

    client = httpx.Client(base_url=args.url, timeout=None)
    try:
        client.get('/health').raise_for_status()
    except Exception:
        sys.exit(f"FairMod API not reachable at {args.url}. Start it with: python app.py")

    if args.csv:
        items, source = load_csv(args.csv), f'csv:{args.csv}'
    else:
        r = client.get('/eval/sample', params={'per_cell': args.sample, 'languages': args.languages, 'seed': args.seed})
        r.raise_for_status()
        items, source = r.json()['items'], f'test-set sample {args.sample}/cell seed {args.seed}'

    print(f"Running {len(items)} items through FairMod ({'with' if args.explain else 'without'} explanations)…")
    r = client.post('/eval/run', json={'items': items, 'explain': args.explain})
    if r.status_code != 200:
        sys.exit(f"API error {r.status_code}: {r.text[:300]}")
    data = r.json()
    m, results = data['metrics'], data['results']

    c = m['confusion']
    print(f"\n  Scored items   {m['n']}  (unlabelled: {m['unlabelled']})")
    print(f"  Macro-F1       {pct(m['macro_f1'])}")
    print(f"  Accuracy       {pct(m['accuracy'])}")
    print(f"  Abusive        P {pct(m['abusive']['precision'])}  R {pct(m['abusive']['recall'])}  F1 {pct(m['abusive']['f1'])}")
    print(f"  Normal         P {pct(m['normal']['precision'])}  R {pct(m['normal']['recall'])}  F1 {pct(m['normal']['f1'])}")
    print(f"\n  Confusion      predicted abusive   predicted normal")
    print(f"  true abusive   {c['tp']:>17}   {c['fn']:>16}")
    print(f"  true normal    {c['fp']:>17}   {c['tn']:>16}")
    print(f"\n  {'Language':<10} {'n':>5} {'acc':>7} {'macro-F1':>9} {'FP':>4} {'FN':>4}")
    for lang, b in m['by_language'].items():
        print(f"  {LANG.get(lang, lang):<10} {b['n']:>5} {pct(b['accuracy']):>7} {pct(b['macro_f1']):>9} "
              f"{b['confusion']['fp']:>4} {b['confusion']['fn']:>4}")
    print(f"\n  Mean confidence when right {pct(m['mean_confidence_correct'])} · when wrong {pct(m['mean_confidence_wrong'])}")

    if args.out:
        with open(args.out, 'w', encoding='utf-8-sig', newline='') as f:
            w = csv.writer(f)
            w.writerow(['text', 'language', 'expected', 'predicted', 'p_abusive', 'confidence', 'correct'])
            name = {1: 'abusive', 0: 'normal', None: ''}
            for x in results:
                w.writerow([x['text'], x['language'], name[x['expected']], name[x['predicted']],
                            x['p_abusive'], x['confidence'], x['correct']])
        print(f"\n  Per-item results written to {args.out}")

    if args.save:
        s = client.post('/eval/runs', json={'name': args.save, 'source': source, 'results': results})
        s.raise_for_status()
        print(f"  Saved as run #{s.json()['id']} — open the Evaluate page in the web UI to see it.")


if __name__ == '__main__':
    main()
