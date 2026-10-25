/* ==============================================================
   LEXER
   ============================================================== */
const TT = {
  NUMBER:'NUMBER', IDENTIFIER:'IDENTIFIER', BOOL:'BOOL',
  RELOP:'RELOP', LOGOP:'LOGOP', NOT:'NOT',
  LPAREN:'LPAREN', RPAREN:'RPAREN', EOF:'EOF', UNKNOWN:'UNKNOWN'
};

class Token {
  constructor(type, value, pos) { this.type=type; this.value=value; this.pos=pos; }
}
class LexError {
  constructor(msg, pos) { this.msg=msg; this.pos=pos; }
}

function lex(src) {
  const tokens=[], errors=[];
  let i=0;
  while (i < src.length) {
    if (/\s/.test(src[i])) { i++; continue; }
    const two = src.slice(i,i+2);
    if (two==='&&') { tokens.push(new Token(TT.LOGOP,'&&',i)); i+=2; continue; }
    if (two==='||') { tokens.push(new Token(TT.LOGOP,'||',i)); i+=2; continue; }
    if (two==='==') { tokens.push(new Token(TT.RELOP,'==',i)); i+=2; continue; }
    if (two==='!=') { tokens.push(new Token(TT.RELOP,'!=',i)); i+=2; continue; }
    if (two==='>=') { tokens.push(new Token(TT.RELOP,'>=',i)); i+=2; continue; }
    if (two==='<=') { tokens.push(new Token(TT.RELOP,'<=',i)); i+=2; continue; }
    const ch=src[i];
    if (ch==='!') { tokens.push(new Token(TT.NOT,'!',i)); i++; continue; }
    if (ch==='>') { tokens.push(new Token(TT.RELOP,'>',i)); i++; continue; }
    if (ch==='<') { tokens.push(new Token(TT.RELOP,'<',i)); i++; continue; }
    if (ch==='(') { tokens.push(new Token(TT.LPAREN,'(',i)); i++; continue; }
    if (ch===')') { tokens.push(new Token(TT.RPAREN,')',i)); i++; continue; }
    if (/\d/.test(ch)) {
      let s=i,num='';
      while (i<src.length && /[\d.]/.test(src[i])) num+=src[i++];
      tokens.push(new Token(TT.NUMBER,num,s)); continue;
    }
    if (/[a-zA-Z_]/.test(ch)) {
      let s=i,id='';
      while (i<src.length && /\w/.test(src[i])) id+=src[i++];
      tokens.push(new Token(id==='true'||id==='false'?TT.BOOL:TT.IDENTIFIER,id,s)); continue;
    }
    errors.push(new LexError("Unexpected character '"+ch+"'",i));
    i++;
  }
  tokens.push(new Token(TT.EOF,'EOF',src.length));
  return {tokens,errors};
}

export { TT, Token, LexError, lex };
