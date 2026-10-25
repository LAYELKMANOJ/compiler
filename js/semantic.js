import { TT } from "./lexer.js";

/* ==============================================================
   SEMANTIC ANALYZER
   ============================================================== */
function analyze(ast, tokens) {
  const checks=[];
  const variables=new Set();
  function collectVars(n){if(!n)return;if(n.kind==='IDENT')variables.add(n.value);collectVars(n.left);collectVars(n.right);}
  collectVars(ast);

  const real=tokens.filter(t=>t.type!==TT.EOF);

  // 1. Non-empty
  if(real.length===0){
    checks.push({status:'fail',rule:'Non-empty Expression',msg:'Expression is empty. Provide a boolean expression.'});
    return checks;
  }

  // 2. Consecutive binary operators
  let consec=false;
  for(let i=0;i<tokens.length-1;i++){
    const a=tokens[i],b=tokens[i+1];
    const isOp=t=>t.type===TT.RELOP||t.type===TT.LOGOP;
    if(isOp(a)&&isOp(b)){consec=true;break;}
  }
  checks.push(consec
    ?{status:'fail',rule:'No Consecutive Operators',msg:"Consecutive operators found (e.g. '&& &&'). Each operator must separate two operands."}
    :{status:'pass',rule:'No Consecutive Operators',msg:'No consecutive binary operators detected.'});

  // 3. Balanced parentheses
  let depth=0,unbal=false,maxD=0;
  for(const t of tokens){
    if(t.type===TT.LPAREN){depth++;maxD=Math.max(maxD,depth);}
    if(t.type===TT.RPAREN){depth--;if(depth<0){unbal=true;break;}}
  }
  checks.push((depth!==0||unbal)
    ?{status:'fail',rule:'Balanced Parentheses',msg:"Parentheses are unbalanced (net depth: "+depth+"). Every '(' needs a matching ')'."}
    :{status:'pass',rule:'Balanced Parentheses',msg:'Parentheses are balanced. Max nesting depth: '+maxD+'.'});

  // 4. NOT operand validity
  let badNot=false;
  for(let i=0;i<tokens.length-1;i++){
    if(tokens[i].type===TT.NOT){
      const next=tokens[i+1];
      if(![TT.IDENTIFIER,TT.BOOL,TT.LPAREN,TT.NOT,TT.NUMBER].includes(next.type)){badNot=true;break;}
    }
  }
  checks.push(badNot
    ?{status:'fail',rule:'NOT Operator Usage',msg:"'!' must be followed by an identifier, literal, '!', or '('."}
    :{status:'pass',rule:'NOT Operator Usage',msg:"All '!' operators are correctly applied."});

  // 5. Relational operands
  let badRel=false;
  for(let i=0;i<tokens.length;i++){
    if(tokens[i].type===TT.RELOP){
      const prev=tokens[i-1],next=tokens[i+1];
      const valid=t=>t&&[TT.IDENTIFIER,TT.NUMBER,TT.BOOL,TT.RPAREN,TT.LPAREN].includes(t.type);
      if(!valid(prev)||!valid(next)){badRel=true;break;}
    }
  }
  checks.push(badRel
    ?{status:'fail',rule:'Relational Operator Operands',msg:'A relational operator is missing an operand on one side.'}
    :{status:'pass',rule:'Relational Operator Operands',msg:'All relational operators have valid operands on both sides.'});

  // 6. Expression termination
  const last=real[real.length-1];
  checks.push([TT.IDENTIFIER,TT.NUMBER,TT.BOOL,TT.RPAREN].includes(last.type)
    ?{status:'pass',rule:'Expression Termination',msg:"Expression ends correctly with '"+last.value+"'."}
    :{status:'fail',rule:'Expression Termination',msg:"Expression ends with operator '"+last.value+"'. Expected an operand or ')'."}
  );

  // 7. Expression start
  const first=real[0];
  checks.push([TT.IDENTIFIER,TT.NUMBER,TT.BOOL,TT.LPAREN,TT.NOT].includes(first.type)
    ?{status:'pass',rule:'Expression Start',msg:"Expression begins correctly with '"+first.value+"'."}
    :{status:'fail',rule:'Expression Start',msg:"Expression begins with '"+first.value+"'. Expected identifier, literal, '!', or '('."}
  );

  // 8. Variables found
  if(variables.size>0){
    checks.push({status:'info',rule:'Variables Detected',msg:'Found '+variables.size+' variable(s): '+[...variables].join(', ')+'.'});
  }

  // 9. Mixed AND / OR warning
  const hasAnd=tokens.some(t=>t.type===TT.LOGOP&&t.value==='&&');
  const hasOr =tokens.some(t=>t.type===TT.LOGOP&&t.value==='||');
  if(hasAnd&&hasOr){
    checks.push({status:'warn',rule:'Mixed AND/OR Precedence',msg:'Both && and || used. && binds tighter than ||. Use parentheses to clarify intent if needed.'});
  }

  return checks;
}

export { analyze };
