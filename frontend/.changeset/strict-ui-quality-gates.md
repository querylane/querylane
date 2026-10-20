---
"@querylane/frontend": patch
---

Harden UI validation and async error handling alongside stricter lint and compiler checks. Invalid saved SQL work now produces a visible warning and a separate recovery copy instead of replacing current drafts with malformed data. Protobuf validation failures no longer pass as valid messages.
