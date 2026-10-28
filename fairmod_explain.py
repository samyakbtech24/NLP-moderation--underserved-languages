# =============================================================================
# FairMod — shared classifier + Integrated Gradients explainer (P3)
# =============================================================================
# Imported by BOTH 03_explain_eval.py (benchmark) and app.py (live demo), so the
# latency / faithfulness numbers in the paper measure exactly the code users see.
#
# EXPLAINER (master §2.4, §5.4 — CONFIRMED):
#   Captum LayerIntegratedGradients on the embedding layer, n_steps=32.
#   Baseline = same sequence with every non-special token replaced by [PAD].
#
# SUBWORD → WORD AGGREGATION (master §5.5 — highest-risk detail):
#   A "word" is a maximal run of non-whitespace characters in the input text.
#   Each subword token is assigned to the word that contains its first character
#   (via the tokenizer's offset_mapping), and token scores are SUMMED per word.
#   We deliberately do NOT use regex \w / \W to find words: Python treats Indic
#   vowel signs (matras, e.g. ि ा ು ೆ) as non-word characters, which would cut
#   Devanagari / Kannada / Bengali words in half.
# =============================================================================

import re
import time
from bisect import bisect_right

import numpy as np
import torch
from captum.attr import LayerIntegratedGradients
from transformers import AutoTokenizer, AutoModelForSequenceClassification

MAX_LENGTH = 128     # must match training (master §5.2)
IG_N_STEPS = 32      # master §5.4 — drop to 16 only if Spaces CPU latency > ~3 s

def clean_text(text):
    """
    Same minimal cleaning as Notebook 1 (01_data_preparation.py, Cell 5), so live
    inputs look like training inputs. Removes URLs, @mentions, extra whitespace.
    Emoji are KEPT — they carry signal in this domain.
    """
    text = str(text)
    text = re.sub(r'http\S+|www\.\S+', '', text)
    text = re.sub(r'@\w+', '', text)
    text = re.sub(r'\s+', ' ', text).strip()
    return text

def word_spans(text):
    """(start, end) character spans of whitespace-separated words."""
    return [(m.start(), m.end()) for m in re.finditer(r'\S+', text)]


class FairModExplainer:
    def __init__(self, model_path, device=None, n_steps=IG_N_STEPS):
        self.device = device or ('cuda' if torch.cuda.is_available() else 'cpu')
        self.n_steps = n_steps
        self.tokenizer = AutoTokenizer.from_pretrained(model_path)
        assert self.tokenizer.is_fast, "Need a fast tokenizer for offset_mapping"
        self.model = AutoModelForSequenceClassification.from_pretrained(model_path)
        self.model.to(self.device).eval()
        self.labels = [self.model.config.id2label[i] for i in range(self.model.config.num_labels)]
        self.lig = LayerIntegratedGradients(self._forward, self.model.get_input_embeddings())

    def _forward(self, input_ids, attention_mask):
        logits = self.model(input_ids=input_ids, attention_mask=attention_mask).logits
        return torch.softmax(logits, dim=-1)

    @torch.no_grad()
    def predict_proba(self, texts, batch_size=64):
        """Class probabilities, shape (len(texts), 2). Texts are used as given."""
        out = []
        for i in range(0, len(texts), batch_size):
            enc = self.tokenizer(list(texts[i:i + batch_size]), truncation=True,
                                 max_length=MAX_LENGTH, padding=True, return_tensors='pt')
            enc = {k: v.to(self.device) for k, v in enc.items()}
            out.append(self._forward(enc['input_ids'], enc['attention_mask']).float().cpu().numpy())
        return np.concatenate(out) if out else np.zeros((0, len(self.labels)))

    def explain(self, text, target=None):
        """
        Classify `text` and attribute the decision to its words with IG.

        target : class index to explain. None → the predicted class.
        Returns a dict:
          probs           [p_normal, p_abusive]
          pred            predicted class index
          target          class the scores explain
          words           whitespace words of `text`
          scores          raw IG score per word (+ supports `target`), or None
                          for words cut off by the 128-token truncation
          tokens          the subword tokens that make up each word
          truncated       True if some words were never seen by the model
          latency_ms      wall-clock time for prediction + IG
        """
        t0 = time.perf_counter()
        enc = self.tokenizer(text, truncation=True, max_length=MAX_LENGTH,
                             return_offsets_mapping=True, return_tensors='pt')
        offsets = enc.pop('offset_mapping')[0].tolist()
        input_ids = enc['input_ids'].to(self.device)
        attention_mask = enc['attention_mask'].to(self.device)

        with torch.no_grad():
            probs = self._forward(input_ids, attention_mask)[0].float().cpu().numpy()
        pred = int(probs.argmax())
        target = pred if target is None else int(target)

        # Structural tokens only ([CLS], [SEP], [PAD]). [UNK] is NOT excluded:
        # MuRIL maps every emoji to [UNK], and those must still get a score.
        structural = set(self.tokenizer.all_special_ids) - {self.tokenizer.unk_token_id}
        special = torch.tensor([t in structural for t in input_ids[0].tolist()], dtype=torch.bool)
        baseline = input_ids.clone()
        baseline[0, ~special.to(self.device)] = self.tokenizer.pad_token_id

        attr = self.lig.attribute(input_ids, baselines=baseline,
                                  additional_forward_args=(attention_mask,),
                                  target=target, n_steps=self.n_steps,
                                  internal_batch_size=self.n_steps)
        token_scores = attr.sum(dim=-1)[0].detach().float().cpu().numpy()

        # Subword → word aggregation (see header)
        spans = word_spans(text)
        starts = [s for s, _ in spans]
        scores = [None] * len(spans)
        tokens = [[] for _ in spans]
        all_ids = input_ids[0].tolist()
        for tok_id, score, (a, b), is_special in zip(all_ids, token_scores, offsets, special.tolist()):
            if is_special or a == b:
                continue
            w = bisect_right(starts, a) - 1
            if w < 0 or a >= spans[w][1]:
                continue    # token starts in whitespace — cannot happen with \S+ words
            scores[w] = (scores[w] or 0.0) + float(score)
            tokens[w].append(self.tokenizer.convert_ids_to_tokens(tok_id))

        return {
            'probs': probs.tolist(),
            'pred': pred,
            'target': target,
            'words': [text[a:b] for a, b in spans],
            'scores': scores,
            'tokens': tokens,
            'truncated': any(s is None for s in scores),
            'latency_ms': (time.perf_counter() - t0) * 1000,
        }


def normalise(scores):
    """Scale scores to [-1, 1] by the largest absolute value; None stays None."""
    m = max((abs(s) for s in scores if s is not None), default=0.0)
    return [None if s is None else (s / m if m > 0 else 0.0) for s in scores]
