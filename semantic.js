/* Phase 3: Semantic analysis.
   Types: 'number' and 'bool'.   &&  ||  !  -> bool operands;  < > <= >= -> number operands;  == != -> both sides same type.
   Variables: either declared in the Variables box ("x:number, active:bool"; strict mode: undeclared = error) or, when that
   box is empty, inferred from first use. Unresolved ==/!= operands default to number.
   analyze(tokens, ast, {declarations, syntaxErrors}) -> { checks, errors, type, types, origin, identifiers, mode } */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.Semantic = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  const REL = new Set(['<', '>', '<=', '>=']), LOGIC = new Set(['&&', '||']);
  const ALIAS = { int: 'number', integer: 'number', number: 'number', num: 'number', float: 'number', bool: 'bool', boolean: 'bool' };

  function show(n) {
    const w = c => (c.kind === 'bin' ? `(${show(c)})` : show(c));
    if (n.kind === 'not') return '!' + w(n.children[0]);
    if (n.kind === 'bin') return `${w(n.children[0])} ${n.label} ${w(n.children[1])}`;
    return n.label;
  }

  function parseDeclarations(text) {
    const symbols = {}, errors = [];
    for (let part of (text || '').split(/[,\n;]+/)) {
      part = part.trim();
      if (!part) continue;
      const m = part.match(/^([A-Za-z_]\w*)\s*:\s*([A-Za-z]+)$/);
      const type = m && ALIAS[m[2].toLowerCase()];
      if (!m || !type || m[1] === 'true' || m[1] === 'false')
        errors.push({ phase: 'declaration', col: null, message: `Bad declaration '${part}'. Use name:number or name:bool.` });
      else if (m[1] in symbols)
        errors.push({ phase: 'declaration', col: null, message: `Variable '${m[1]}' is declared more than once.` });
      else symbols[m[1]] = type;
    }
    return { symbols, errors };
  }

  function collectIds(n, counts = {}) {
    if (n.kind === 'id') counts[n.label] = (counts[n.label] || 0) + 1;
    n.children.forEach(c => collectIds(c, counts));
    return counts;
  }

  function analyze(tokens, ast, opts = {}) {
    const checks = [], errors = [];
    const add = (name, passed, detail) => checks.push({ name, passed, detail });

    // 1. balanced parentheses (token based, independent of the parser)
    let depth = 0, badClose = null, lastOpen = [];
    for (const t of tokens) {
      if (t.type === 'LPAREN') { depth++; lastOpen.push(t); }
      if (t.type === 'RPAREN') { if (depth === 0 && !badClose) badClose = t; else { depth = Math.max(0, depth - 1); lastOpen.pop(); } }
    }
    if (badClose) add('Balanced parentheses', false, `Unmatched ')' at column ${badClose.col + 1}.`);
    else if (depth > 0) add('Balanced parentheses', false, `'(' at column ${lastOpen[lastOpen.length - 1].col + 1} is never closed.`);
    else add('Balanced parentheses', true, 'Every ( has a matching ) and grouping is well nested.');

    // 2. structure: operands and operators
    const synErrs = opts.syntaxErrors || [];
    if (!ast) {
      add('Operand and operator structure', false, synErrs.length ? synErrs[0].message : 'Expression could not be parsed.');
      ['Identifiers', 'Declarations', 'Type checking'].forEach(n => add(n, null, 'Skipped: the expression did not parse.'));
      return { checks, errors, type: null, types: {}, origin: {}, identifiers: {}, mode: null };
    }
    add('Operand and operator structure', true, 'Every operator has its operands; no consecutive or misplaced operators; no empty parentheses.');

    // 3. identifiers
    const ids = collectIds(ast);
    const names = Object.keys(ids);
    add('Identifiers', true, names.length
      ? names.map(k => `${k} (${ids[k]}x)`).join(', ') + (names.some(k => ids[k] > 1) ? '. Repeated identifiers refer to the same variable.' : '.')
      : 'No variables used (constants only).');

    // 4. declarations
    const { symbols, errors: declErrors } = parseDeclarations(opts.declarations);
    errors.push(...declErrors);
    const strict = (opts.declarations || '').trim() !== '';
    const types = Object.assign({}, symbols), origin = {};
    if (declErrors.length) add('Declarations', false, declErrors.map(e => e.message).join(' '));
    else add('Declarations', true, strict ? `Strict mode: ${Object.keys(symbols).map(k => k + ':' + symbols[k]).join(', ')}. Undeclared variables are errors.`
                                         : 'No declarations given: variable types are inferred from how they are used.');

    // 5. inference (only when no declarations were given)
    let changed = false, defaulting = false;
    const typeOf = n => (n.kind === 'num' ? 'number' : n.kind === 'id' ? types[n.label] || null : 'bool');
    function hint(n, exp, why) {
      if (n.kind === 'id') {
        if (exp && !strict && !types[n.label]) { types[n.label] = exp; origin[n.label] = why; changed = true; }
      } else if (n.kind === 'not') hint(n.children[0], 'bool', "operand of '!'");
      else if (n.kind === 'bin') {
        const op = n.label, [l, r] = n.children, w = `operand of '${op}'`;
        if (LOGIC.has(op)) { hint(l, 'bool', w); hint(r, 'bool', w); }
        else if (REL.has(op)) { hint(l, 'number', w); hint(r, 'number', w); }
        else {
          const t = typeOf(l) || typeOf(r) || (defaulting ? 'number' : null);
          if (t) { const why = typeOf(l) && typeOf(r) ? w : `${w} compared with a ${t}`; hint(l, t, defaulting && !typeOf(l) && !typeOf(r) ? `${w} (default)` : why); hint(r, t, why); }
        }
      }
    }
    do { changed = false; hint(ast, 'bool', 'whole expression'); } while (changed);
    defaulting = true;
    do { changed = false; hint(ast, 'bool', 'whole expression'); } while (changed);

    // 6. type checking (bottom up)
    const seen = new Set();
    const err = (n, msg) => { errors.push({ phase: 'semantic', col: n.col, message: msg }); add('Type check: ' + show(n), false, msg); n.type = 'error'; return 'error'; };
    const how = n => (n.kind === 'id' && origin[n.label] ? ` (inferred as ${n.type} from its use as ${origin[n.label]})` : '');
    function visit(n) {
      if (n.kind === 'num') n.type = 'number';
      else if (n.kind === 'bool') n.type = 'bool';
      else if (n.kind === 'id') {
        if (!types[n.label]) return err(n, `Undeclared variable '${n.label}'. Declare it, e.g. ${n.label}:number or ${n.label}:bool.`);
        n.type = types[n.label];
        if (!seen.has(n.label)) { seen.add(n.label); add(`Variable '${n.label}'`, true, `${n.type}, ${origin[n.label] ? 'inferred from its use as ' + origin[n.label] : 'declared'}.`); }
      } else if (n.kind === 'not') {
        const t = visit(n.children[0]);
        if (t === 'error') return (n.type = 'error');
        if (t !== 'bool') return err(n, `'!' needs a bool operand but '${show(n.children[0])}' is ${t}${how(n.children[0])}.`);
        n.type = 'bool'; add('Type check: ' + show(n), true, "'!' applied to a bool operand gives bool.");
      } else {
        const [l, r] = n.children, lt = visit(l), rt = visit(r), op = n.label;
        if (lt === 'error' || rt === 'error') return (n.type = 'error');
        const bad = (need) => `'${op}' needs ${need} but got ${lt}${how(l)} and ${rt}${how(r)}.`;
        if (LOGIC.has(op) && (lt !== 'bool' || rt !== 'bool')) return err(n, bad('bool operands'));
        if (REL.has(op) && (lt !== 'number' || rt !== 'number')) return err(n, bad('number operands'));
        if (!LOGIC.has(op) && !REL.has(op) && lt !== rt) return err(n, bad('both sides to have the same type'));
        n.type = 'bool'; add('Type check: ' + show(n), true, `'${op}' on (${lt}, ${rt}) gives bool.`);
      }
      return n.type;
    }
    const type = visit(ast);
    if (type === 'number') {
      errors.push({ phase: 'semantic', col: ast.col, message: "The whole expression has type number, not bool. Add a comparison such as '> 0'." });
      add('Result type is bool', false, 'The expression evaluates to a number, so it is not a Boolean expression.');
    } else if (type === 'bool') add('Result type is bool', true, 'The whole expression is a valid Boolean expression.');
    return { checks, errors, type, types, origin, identifiers: ids, mode: strict ? 'strict' : 'inferred' };
  }
  return { analyze, parseDeclarations, show };
});
