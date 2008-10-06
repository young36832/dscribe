function() { with(Parsing.Operators) {
	var g = XPath.Grammar;
	var s = XPath.Semantics;
	
	g.slash = token('/');  g.slash2 = token('//');
	g.lparen = token('(');  g.rparen = token(')');
	g.lbracket = token('[');  g.rbracket = token(']');
	g.lbrace = token('{');  g.rbrace = token('}');
	g.dollar = token('$');  g.star = token('*');  g.comma = token(',');
	g.comp = token('is', '<<', '>>', '=', '!=', '<=', '<', '>=', '>', 'eq', 'ne', 'lt', 'le', 'gt', 'ge');
	g.StringLiteral = process(dfsatoken(false, {
			start: {'"': "dquotebody", "'": "squotebody"},
			dquotebody: {'"': "dquoteend", "": "dquotebody"},
			dquoteend: {'"' : "dquotebody"},
			squotebody: {"'": "squoteend", "": "squotebody"},
			squoteend: {"'": "squotebody"}
		}, {dquotebody: "dquotebody", squotebody: "squotebody"}, {dquoteend: true, squoteend: true}),
		function(r) {return r.slice(1, -1);});
	g.NumberLiteral = process(dfsatoken(false, {
			start: {".": "dot", "0123456789": "whole"},
			dot: {"0123456789": "afterdot"},
			whole: {"0123456789": "whole", ".": "afterdot", "eE": "exponent"},
			afterdot: {"0123456789": "afterdot", "eE": "exponent"},
			exponent: {"+-": "expsign", "0123456789": "expvalue"},
			expsign: {"0123456789": "expvalue"},
			expvalue: {"0123456789": "expvalue"}
		}, {}, {whole: true, afterdot: true, expvalue: true}), function(r) {return Number(r);});
	g.QName = process(dfsatoken(false, {
			start: {"_abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ": "first"},
			first: {"_abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789-.": "first", ":": "sep"},
			sep: {"_abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ": "second"},
			second: {"_abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789-.": "second"}
		}, {}, {first: true, second:true}), function(r) {return new s.QName(r);});
	
	g.ValueExpr = forward(g, 'PathExpr');
	g.UnaryExpr = process(each(many(token('-', '+')), g.ValueExpr), function(r) {
		var a = r[0];
		if (a) {
			var count = 0;
			for (var i = 0; i < a.length; i++) if (a[i] == '-') count++;
			if (count % 2 == 1) return new s.Negate(r[1]);
		}
		return r[1];
	});
	
	var processBinaryList = function(fn) {
		return function(r) {
			if (r[1].length == 0) return r[0];
			var exp = r[0];
			for (var i = 0; i < r[1].length; i++) exp = new fn(exp, r[1][i][0], r[1][i][1]);
			return exp;
		};
	};
	
	g.IntersectExceptExpr = process(
			each(g.UnaryExpr, many(each(token('intersect', 'except'), g.UnaryExpr))),
			processBinaryList(s.SequenceOp));
	g.UnionExpr = process(
			each(g.IntersectExceptExpr, many(each(token('|', 'union'), g.IntersectExceptExpr))),
			processBinaryList(s.SequenceOp));
	g.MultiplicativeExpr = process(
			each(g.UnionExpr, many(each(token('*', 'div', 'idiv', 'mod'), g.UnionExpr))),
			processBinaryList(s.BinaryOp));
	g.AdditiveExpr = process(
			each(g.MultiplicativeExpr, many(each(token('-', '+'), g.MultiplicativeExpr))),
			processBinaryList(s.BinaryOp));
	g.RangeExpr = process(
			each(g.AdditiveExpr, optional(each(token('to'), g.AdditiveExpr))),
			function(r) {return r[1] == null ? r[0] : new s.Range(r[0], r[1][1]);});
	g.ComparisonExpr = process(
			each(g.RangeExpr, optional(each(g.comp, g.RangeExpr))),
			function(r) {return r[1] == null ? r[0] : s.newComparison(r[0], r[1][0], r[1][1]);});
	g.AndExpr = process(
			list(g.ComparisonExpr, token('and')),
			function(r) {return r.length == 1 ? r[0] : new s.And(r);});
	g.OrExpr = process(
			list(g.AndExpr, token('or')),
			function(r) {return r.length == 1 ? r[0] : new s.Or(r);});
	g.IfExpr = process(
			each(token('if'), between(g.lparen, forward(g, 'Expr'), g.rparen),
					token('then'), forward(g, 'ExprSingle'), token('else'), forward(g, 'ExprSingle')),
			function(r) {return new s.If(r[1], r[3], r[5]);});
	g.ExprSingle = any(g.IfExpr, g.OrExpr);	// or ForExpr, QuantifiedExpr
	g.Expr = process(
			list(g.ExprSingle, g.comma),
			function(r) {return r.length == 1 ? r[0] : new s.Sequence(r);});
	g.Literal = any(g.StringLiteral, g.NumberLiteral);
	g.VarRef = process(each(g.dollar, g.QName), function(r) {return new s.Var(r[1]);});
	g.ParenthesizedExpr = between(g.lparen, optional(g.Expr), g.rparen);
	g.ContextItemExpr = replace(token('.'), new s.ContextItem());
	g.FunctionCall = process(
			each(g.QName, between(g.lparen, optional(list(g.ExprSingle, g.comma)), g.rparen)),
			function(r) {return new s.FunctionCall(r[0], r[1] == null ? [] : r[1]);});
	g.ComputedElemOrAttrTail = each(
			any(g.QName, between(g.lbrace, g.Expr, g.rbrace)), between(g.lbrace, optional(g.Expr), g.rbrace));
	g.CompElemConstructor = process(
			each(token('element'), g.ComputedElemOrAttrTail),
			function(r) {return new s.ElementConstructor(r[1][0], r[1][1]);});
	g.CompAttrConstructor = process(
			each(token('attribute'), g.ComputedElemOrAttrTail),
			function(r) {return new s.AttributeConstructor(r[1][0], r[1][1]);});
	g.CompTextConstructor = process(
			each(token('text'), between(g.lbrace, g.Expr, g.rbrace)),
			function(r) {return new s.TextConstructor(r[1]);});
	g.ComputedConstructor = any(g.CompElemConstructor, g.CompAttrConstructor, g.CompTextConstructor);
	g.PrimaryExpr = any(g.Literal, g.VarRef, g.ParenthesizedExpr, g.ContextItemExpr, g.FunctionCall, g.ComputedConstructor);
	g.Predicate = between(g.lbracket, g.Expr, g.rbracket);
	g.NameTest = any(g.star, g.QName);
	g.NodeTest = g.NameTest;  // or g.KindTest
	g.Axis = process(each(token(
					'child', 'descendant-or-self', 'descendant', 'attribute', 'self', 'following-sibling',
					'following', 'parent', 'ancestor-or-self', 'ancestor', 'preceding-sibling', 'preceding'), token('::')),
					function(r) {return r[0];});
	g.AbbrevStep = process(each(optional(token('@')), g.NodeTest), function(r) {
		return new s.AxisStep(r[0] ? 'attribute' : 'child', r[1]);
	});
	g.ParentStep = process(token('..'), function(r) {return new s.AxisStep('parent', '*');}) 
	g.AxisStep = process(each(g.Axis, g.NodeTest), function(r) {return new s.AxisStep(r[0], r[1]);});
	g.StepExpr = process(each(any(g.AxisStep, g.ParentStep, g.PrimaryExpr, g.AbbrevStep), many(g.Predicate)), function(r) {
		if (r[1].length) {
			if (!(r[0] instanceof s.AxisStep)) r[0] = new s.Filter(r[0]);
			r[0].predicates = r[1];
		}
		return r[0];
	});
	g.PathExpr = any(
			process(each(
					optional(any(replace(g.slash2, new s.AxisStep("descendant-or-self", "*")), g.slash)),
					g.StepExpr,
					many(each(
							any(replace(g.slash2, new s.AxisStep("descendant-or-self", "*")), ignore(g.slash)),
							g.StepExpr))), function(r) {
				var fromRoot = r[0] != null;
				var steps = [];
				if (r[0] instanceof s.AxisStep) steps.push(r[0]);
				steps.push(r[1]);
				for (var i = 0; i < r[2].length; i++) {
					if (r[2][i][0]) steps.push(r[2][i][0]);
					steps.push(r[2][i][1]);
				}
				return (fromRoot || steps.length > 1) ? new s.Path(fromRoot, steps) : steps[0];
			}),
			replace(g.slash, new s.Path(true, [])));
}} ();
