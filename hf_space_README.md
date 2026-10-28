---
title: FairMod
emoji: 🛡️
colorFrom: red
colorTo: blue
sdk: gradio
sdk_version: 6.30.0
python_version: "3.12"
app_file: app.py
pinned: false
short_description: Explainable abusive-comment detection for 4 Indian languages
---

<!-- Upload this file to the Space as README.md (the header above configures the Space). -->

# FairMod

Explainable abusive-comment detection for Hindi, Kannada, Marathi and Bengali.
A fine-tuned [MuRIL](https://huggingface.co/google/muril-base-cased) classifier
with word-level Integrated Gradients highlights.

- **UI:** this page
- **API:** `POST /classify` with `{"text": "..."}`; docs at `/docs`
- **Code and paper:** https://github.com/samyakbtech24/NLP-moderation--underserved-languages

Research prototype. It makes mistakes; keep a human in the loop.
