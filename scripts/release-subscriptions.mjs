import { parseSync } from "@swc/core";

function resolveValue(node, bindings, seen = new Set()) {
  if (!node) return undefined;
  if (node.type === "StringLiteral") return node.value;
  if (node.type === "Identifier") {
    if (seen.has(node.value)) return undefined;
    const binding = bindings.get(node.value);
    if (typeof binding === "string") return binding;
    return resolveValue(binding, bindings, new Set([...seen, node.value]));
  }
  if (node.type === "TemplateLiteral") {
    let value = node.quasis[0].cooked;
    for (let i = 0; i < node.expressions.length; i++) {
      const part = resolveValue(node.expressions[i], bindings, seen);
      if (part === undefined) return undefined;
      value += part + node.quasis[i + 1].cooked;
    }
    return value;
  }
  if (node.type === "CallExpression" && node.callee.type === "Identifier") {
    const fn = bindings.get(node.callee.value);
    if (
      fn?.type !== "FunctionDeclaration" ||
      fn.params.length !== node.arguments.length ||
      fn.body?.stmts.length !== 1 ||
      fn.body.stmts[0].type !== "ReturnStatement"
    )
      return undefined;
    const local = new Map(bindings);
    for (let i = 0; i < fn.params.length; i++) {
      const param = fn.params[i].pat;
      const argument = resolveValue(
        node.arguments[i].expression,
        bindings,
        seen,
      );
      if (param.type !== "Identifier" || argument === undefined)
        return undefined;
      local.set(param.value, argument);
    }
    return resolveValue(fn.body.stmts[0].argument, local, seen);
  }
  return undefined;
}

function walk(node, visit) {
  if (!node || typeof node !== "object") return;
  if (node.type) visit(node);
  for (const value of Object.values(node)) {
    if (Array.isArray(value)) for (const child of value) walk(child, visit);
    else if (typeof value === "object") walk(value, visit);
  }
}

function propertyName(member) {
  const property = member.property;
  return property.type === "Computed"
    ? property.expression.value
    : property.value;
}

export function checkReleaseSubscriptions(source) {
  const file = parseSync(source, { syntax: "ecmascript" });
  const bindings = new Map();
  for (const statement of file.body) {
    if (statement.type === "VariableDeclaration") {
      for (const declaration of statement.declarations) {
        if (declaration.id.type === "Identifier")
          bindings.set(declaration.id.value, declaration.init);
      }
    } else if (statement.type === "FunctionDeclaration")
      bindings.set(statement.identifier.value, statement);
  }
  const subscriptions = [];
  walk(file, (node) => {
    if (
      node.type === "CallExpression" &&
      node.callee.type === "MemberExpression" &&
      propertyName(node.callee) === "subscribe" &&
      node.callee.object.type === "MemberExpression" &&
      propertyName(node.callee.object) === "scriptEventReceive"
    )
      subscriptions.push(node);
  });
  function describe(call) {
    let found;
    walk(call.arguments[0]?.expression, (node) => {
      if (
        node.type === "BinaryExpression" &&
        node.left.type === "MemberExpression" &&
        node.left.property.value === "id"
      )
        found ??= resolveValue(node.right, bindings) ?? node.right.value;
    });
    return `${found ?? "unknown id"} (byte ${call.span.start})`;
  }
  if (subscriptions.length !== 1)
    throw new Error(
      `Expected exactly one scriptEventReceive subscription; found ${subscriptions.length}: ${subscriptions.map(describe).join(", ")}`,
    );
  const call = subscriptions[0];
  const callback = call.arguments[0]?.expression;
  const parameter = callback?.params?.[0];
  const first = callback?.body?.stmts?.[0];
  function rejectsOtherIds(node) {
    if (node?.type === "ParenthesisExpression")
      return rejectsOtherIds(node.expression);
    if (node?.type !== "BinaryExpression") return false;
    if (node.operator === "||")
      return rejectsOtherIds(node.left) || rejectsOtherIds(node.right);
    return (
      node.operator === "!==" &&
      node.left.type === "MemberExpression" &&
      node.left.object.type === "Identifier" &&
      node.left.object.value === parameter?.value &&
      node.left.property.value === "id" &&
      resolveValue(node.right, bindings) === "yasu_ride:test_input"
    );
  }
  const consequent = first?.consequent;
  const returns =
    consequent?.type === "ReturnStatement" ||
    (consequent?.type === "BlockStatement" &&
      consequent.stmts.length === 1 &&
      consequent.stmts[0].type === "ReturnStatement");
  if (first?.type !== "IfStatement" || !returns || !rejectsOtherIds(first.test))
    throw new Error(
      `Invalid scriptEventReceive subscription: ${describe(call)}; expected yasu_ride:test_input guard`,
    );
}
