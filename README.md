# Boolean Expression Compiler

A browser-based compiler front-end for Boolean expressions.

## Files
- `cd.html` / `index.html`: user interface (CSS remains inline for now).
- `js/lexer.js`: tokenization.
- `js/parser.js`: recursive-descent parser and AST.
- `js/semantic.js`: semantic/checking rules.
- `js/main.js`: connects compiler modules to the interface and renders results.
- `grammar/cfg.md`: current grammar.
- `tests/test_cases.txt`: starter test cases.

## Run locally
Because JavaScript ES modules are used, serve the folder over HTTP rather than opening the HTML as a `file://` URL. From this folder run:

```bash
python -m http.server 8000
```

Then open `http://localhost:8000/index.html`. Python is only being used here to serve static files; the compiler logic is JavaScript.

## Team note
Review and test the separated modules before submission. The semantic checks are a starter implementation and should not be described as full declaration/type checking unless those features are implemented.
