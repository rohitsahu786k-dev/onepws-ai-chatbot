# Product catalogue PDFs

Place the OnePWS compressed catalogue PDFs in this folder, then import into MongoDB:

```bash
npm run import:catalogues
```

Imports native PDF text plus OCR appendix text from `onepws_master_ai_knowledge_base_updated.md` where available. Image-only PDFs receive a searchable catalogue stub linked to structured Q&A.
