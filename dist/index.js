// lib/configs/recommended.js
var recommended_default = {
  rules: {
    "aegis/no-duplicate-string": [
      "error",
      {
        threshold: 2,
        minLength: 2,
        ignoreStrings: [
          "application/json",
          // 常见 MIME
          "YYYY-MM-DD"
          // 日期格式
        ],
        ignorePatterns: [
          "^/",
          // 路径
          "^http(s)?://",
          // URL
          "^#([0-9A-Fa-f]{3,6})$",
          // HEX 颜色
          "^[0-9]+(px|rem|em|vh|vw|%)$"
          // CSS 单位
        ]
      }
    ],
    "aegis/no-implicit-complex-object": [
      "error",
      {
        propertyThreshold: 2
      }
    ],
    "aegis/no-magic-numbers-strict": [
      "error",
      {
        ignore: [-1, 0, 1, 2],
        ignoreArrayIndexes: true,
        ignoreTypeIndexes: true,
        ignoreEnums: true,
        detectObjects: true,
        enforceConst: true,
        ignorePropertyPatterns: ["^width$|Width$"],
        ignoreCalleePatterns: ["^(Date|setTimeout|setInterval|delay)$"]
      }
    ]
    // 未来在这里添加 aegis/other-rule
  }
};

// lib/rules/no-duplicate-string.js
var no_duplicate_string_default = {
  meta: {
    type: "problem",
    docs: {
      description: "Disallow duplicate strings with granular configuration"
    },
    schema: [
      {
        type: "object",
        properties: {
          threshold: { type: "integer", minimum: 2 },
          minLength: { type: "integer", minimum: 2 },
          ignoreStrings: { type: "array", items: { type: "string" } },
          ignorePatterns: { type: "array", items: { type: "string" } },
          // 接收正则字符串
          ignoreTSLiteralTypes: { type: "boolean" }
          // 是否忽略 TS 的字面量类型
        },
        additionalProperties: false
      }
    ],
    messages: {
      duplicate: "[Aegis] \u5B57\u7B26\u4E32 '{{str}}' \u91CD\u590D\u51FA\u73B0\u4E86 {{count}} \u6B21 (\u9608\u503C: {{threshold}}). \u51FA\u73B0\u884C\u53F7: {{lines}}."
    }
  },
  create(context) {
    const config = context.options[0] || {};
    const threshold = config.threshold || 2;
    const minLength = config.minLength || 5;
    const ignoreTSLiteralTypes = config.ignoreTSLiteralTypes !== false;
    const ignoreSet = new Set(config.ignoreStrings || []);
    const ignorePatterns = (config.ignorePatterns || []).map(
      (p) => new RegExp(p)
    );
    const stringMap = /* @__PURE__ */ new Map();
    function record(node, value) {
      if (value.length < minLength) return;
      if (ignoreSet.has(value)) return;
      if (ignorePatterns.some((regex) => regex.test(value))) return;
      let curr = node.parent;
      let depth = 0;
      while (curr && depth < 4) {
        if (curr.type === "CallExpression") {
          let funcName = "";
          if (curr.callee.type === "Identifier") {
            funcName = curr.callee.name;
          } else if (curr.callee.type === "MemberExpression" && curr.callee.property.type === "Identifier") {
            funcName = curr.callee.property.name;
          }
          if (funcName && ignorePatterns.some((regex) => regex.test(funcName))) {
            return;
          }
        }
        curr = curr.parent;
        depth++;
      }
      if (!stringMap.has(value)) {
        stringMap.set(value, []);
      }
      stringMap.get(value).push(node);
    }
    return {
      // 监听普通字面量: "hello", 'world'
      Literal(node) {
        if (typeof node.value === "string") {
          if (node.parent && (node.parent.type === "ImportDeclaration" || node.parent.type === "ExportNamedDeclaration")) {
            return;
          }
          if (ignoreTSLiteralTypes && node.parent && node.parent.type === "TSLiteralType") {
            return;
          }
          if (node.parent && node.parent.type === "Property" && node.parent.key === node) {
            return;
          }
          record(node, node.value);
        }
      },
      // 监听不带变量的模板字符串: `hello`
      TemplateLiteral(node) {
        if (node.expressions.length === 0 && node.quasis.length === 1) {
          const rawValue = node.quasis[0].value.raw;
          if (rawValue) {
            record(node, rawValue);
          }
        }
      },
      // 程序结束时，统计并报错
      "Program:exit"() {
        for (const [str, nodes] of stringMap) {
          if (nodes.length >= threshold) {
            const lineNumbers = nodes.map((n) => n.loc.start.line).join(", ");
            nodes.forEach((node) => {
              context.report({
                node,
                messageId: "duplicate",
                data: {
                  str: str.length > 20 ? str.slice(0, 20) + "..." : str,
                  // 截断过长的错误提示
                  count: nodes.length,
                  threshold,
                  lines: lineNumbers
                }
              });
            });
          }
        }
      }
    };
  }
};

// lib/rules/no-implicit-complex-object.js
var no_implicit_complex_object_default = {
  meta: {
    type: "suggestion",
    docs: {
      description: "Enforce explicit type annotation for complex object literals",
      recommended: true
    },
    schema: [
      {
        type: "object",
        properties: {
          // 只有属性数量超过这个值，才强制要求写类型
          propertyThreshold: { type: "integer", minimum: 1 },
          // 是否忽略 Vue 3 的 ref/reactive 包装对象
          ignoreVue3Wrappers: { type: "boolean" },
          // 忽略特定命名的变量 (支持正则)
          ignorePatterns: { type: "array", items: { type: "string" } }
        },
        additionalProperties: false
      }
    ],
    messages: {
      missingType: "[Aegis] \u590D\u6742\u5BF9\u8C61 '{{name}}' ({{props}} \u4E2A\u5C5E\u6027) \u7F3A\u5C11\u663E\u5F0F\u7C7B\u578B\u5B9A\u4E49\u3002\u8BF7\u5B9A\u4E49 Interface \u6216 Type \u4EE5\u786E\u4FDD\u6570\u636E\u7ED3\u6784\u5B89\u5168\u3002"
    }
  },
  create(context) {
    const config = context.options[0] || {};
    const threshold = config.propertyThreshold || 2;
    const ignoreVue3Wrappers = config.ignoreVue3Wrappers || false;
    const ignorePatterns = (config.ignorePatterns || []).map(
      (p) => new RegExp(p)
    );
    function checkComplexType(node, name) {
      if (node.typeAnnotation && node.typeAnnotation.typeAnnotation && node.typeAnnotation.typeAnnotation.type === "TSTypeLiteral") {
        const typeLiteral = node.typeAnnotation.typeAnnotation;
        const propertyCount = typeLiteral.members.length;
        if (propertyCount >= threshold) {
          context.report({
            node,
            messageId: "missingType",
            data: {
              name: name || "parameter",
              props: propertyCount
            }
          });
          return true;
        }
      }
      return false;
    }
    return {
      VariableDeclarator(node) {
        const varName = node.id.name;
        if (varName && ignorePatterns.some((regex) => regex.test(varName))) {
          return;
        }
        if (checkComplexType(node.id, varName)) {
          return;
        }
        let init = node.init;
        if (!init) return;
        const isWrapperCall = !ignoreVue3Wrappers && init.type === "CallExpression" && init.callee.type === "Identifier" && (init.callee.name === "ref" || init.callee.name === "reactive");
        let objectExpression = null;
        if (init.type === "ObjectExpression") {
          objectExpression = init;
        } else if (isWrapperCall) {
          if (init.typeArguments || init.typeParameters) {
            return;
          }
          const firstArg = init.arguments[0];
          if (firstArg && firstArg.type === "ObjectExpression") {
            objectExpression = firstArg;
          }
        }
        if (!objectExpression) {
          return;
        }
        if (node.id.typeAnnotation) {
          return;
        }
        const propertyCount = objectExpression.properties.length;
        if (propertyCount >= threshold) {
          context.report({
            node: node.id,
            messageId: "missingType",
            data: {
              name: node.id.name || "variable",
              props: propertyCount
            }
          });
        }
      },
      "FunctionDeclaration, FunctionExpression, ArrowFunctionExpression"(node) {
        node.params.forEach((param) => {
          let paramName = "";
          if (param.type === "Identifier") {
            paramName = param.name;
          } else if (param.type === "AssignmentPattern" && param.left.type === "Identifier") {
            paramName = param.left.name;
          }
          if (paramName && ignorePatterns.some((regex) => regex.test(paramName))) {
            return;
          }
          checkComplexType(param, paramName || "parameter");
        });
      }
    };
  }
};

// lib/rules/no-magic-numbers-strict.js
var no_magic_numbers_strict_default = {
  meta: {
    type: "suggestion",
    docs: {
      description: "Disallow magic numbers with TS support and regex property ignoring",
      recommended: false
    },
    schema: [
      {
        type: "object",
        properties: {
          detectObjects: { type: "boolean", default: false },
          enforceConst: { type: "boolean", default: false },
          ignore: {
            type: "array",
            items: { type: "number" },
            uniqueItems: true
          },
          ignoreArrayIndexes: { type: "boolean", default: false },
          ignoreDefaultValues: { type: "boolean", default: false },
          ignoreClassFieldInitialValues: { type: "boolean", default: false },
          // === TypeScript 特有参数补充 ===
          ignoreEnums: { type: "boolean", default: false },
          ignoreNumericLiteralTypes: { type: "boolean", default: false },
          ignoreReadonlyClassProperties: { type: "boolean", default: false },
          ignoreTypeIndexes: { type: "boolean", default: false },
          // === 自定义正则参数 ===
          ignorePropertyPatterns: {
            type: "array",
            items: { type: "string" },
            description: "Array of regex strings to ignore magic numbers assigned to specific properties"
          },
          ignoreCalleePatterns: {
            type: "array",
            items: { type: "string" },
            description: "Array of regex strings to ignore magic numbers used as arguments for specific functions"
          }
        },
        additionalProperties: false
      }
    ],
    messages: {
      useConst: "[Aegis] Number constants declarations must use 'const'.",
      noMagic: "[Aegis] No magic number: {{raw}}."
    }
  },
  create(context) {
    const config = context.options[0] || {};
    const detectObjects = !!config.detectObjects;
    const enforceConst = !!config.enforceConst;
    const ignore = config.ignore || [];
    const ignoreArrayIndexes = !!config.ignoreArrayIndexes;
    const ignoreDefaultValues = !!config.ignoreDefaultValues;
    const ignoreClassFieldInitialValues = !!config.ignoreClassFieldInitialValues;
    const ignoreEnums = !!config.ignoreEnums;
    const ignoreNumericLiteralTypes = !!config.ignoreNumericLiteralTypes;
    const ignoreReadonlyClassProperties = !!config.ignoreReadonlyClassProperties;
    const ignoreTypeIndexes = !!config.ignoreTypeIndexes;
    const ignorePropertyPatterns = (config.ignorePropertyPatterns || []).map(
      (p) => new RegExp(p)
    );
    const ignoreCalleePatterns = (config.ignoreCalleePatterns || []).map(
      (p) => new RegExp(p)
    );
    function isArrayIndex(node) {
      return node.parent.type === "MemberExpression" && node.parent.property === node;
    }
    function isDefaultValue(node) {
      return node.parent.type === "AssignmentPattern" && node.parent.right === node;
    }
    function isClassFieldInitialValue(node) {
      return node.parent.type === "PropertyDefinition" && node.parent.value === node;
    }
    function isEnumMember(node) {
      return node.parent.type === "TSEnumMember";
    }
    function isNumericLiteralType(node) {
      return node.parent.type === "TSLiteralType" || // 兼容某些解析器结构
      node.parent.type === "TSUnionType" && node.parent.types.includes(node);
    }
    function isReadonlyClassProperty(node) {
      return node.parent.type === "PropertyDefinition" && node.parent.value === node && node.parent.readonly;
    }
    function isTypeIndex(node) {
      return node.parent.type === "TSIndexedAccessType" && node.parent.indexType === node;
    }
    function isIgnoredProperty(node) {
      let current = node;
      if (current.parent.type === "UnaryExpression" && ["+", "-"].includes(current.parent.operator)) {
        current = current.parent;
      }
      if (current.parent.type === "Property" && current.parent.value === current) {
        const keyNode = current.parent.key;
        let keyName = null;
        if (keyNode.type === "Identifier") keyName = keyNode.name;
        else if (keyNode.type === "Literal") keyName = String(keyNode.value);
        if (keyName && ignorePropertyPatterns.some((regex) => regex.test(keyName)))
          return true;
      }
      if (current.parent.type === "JSXExpressionContainer" && current.parent.parent.type === "JSXAttribute") {
        const attrName = current.parent.parent.name.name;
        if (attrName && ignorePropertyPatterns.some((regex) => regex.test(attrName)))
          return true;
      }
      return false;
    }
    function isIgnoredCallee(node) {
      let current = node;
      while (current.parent) {
        if (current.parent.type === "CallExpression" || current.parent.type === "NewExpression") {
          const callee = current.parent.callee;
          let calleeName = null;
          if (callee.type === "Identifier") {
            calleeName = callee.name;
          } else if (callee.type === "MemberExpression") {
            if (callee.property.type === "Identifier") {
              calleeName = callee.property.name;
            }
          }
          if (calleeName && ignoreCalleePatterns.some((regex) => regex.test(calleeName))) {
            return true;
          }
          break;
        }
        if (current.parent.type === "ConditionalExpression" || current.parent.type === "LogicalExpression" || current.parent.type === "ChainExpression") {
          current = current.parent;
        } else {
          break;
        }
      }
      return false;
    }
    function isInsideConstDeclaration(node) {
      let current = node;
      while (current.parent) {
        const parent = current.parent;
        if (parent.type === "VariableDeclarator" && parent.init === current) {
          return parent.parent.kind === "const";
        }
        if (parent.type === "ObjectExpression" || parent.type === "ArrayExpression" || parent.type === "Property" || parent.type === "UnaryExpression" || parent.type === "ConditionalExpression" || parent.type === "LogicalExpression" || parent.type === "ChainExpression") {
          current = parent;
        } else {
          break;
        }
      }
      return false;
    }
    return {
      Literal(node) {
        const raw = node.raw;
        const value = node.value;
        if (typeof value !== "number") return;
        if (ignore.includes(value)) return;
        if (ignoreArrayIndexes && isArrayIndex(node)) return;
        if (ignoreDefaultValues && isDefaultValue(node)) return;
        if (ignoreClassFieldInitialValues && isClassFieldInitialValue(node))
          return;
        if (ignoreEnums && isEnumMember(node)) return;
        if (ignoreNumericLiteralTypes && isNumericLiteralType(node)) return;
        if (ignoreReadonlyClassProperties && isReadonlyClassProperty(node))
          return;
        if (ignoreTypeIndexes && isTypeIndex(node)) return;
        if (!detectObjects && node.parent.type === "Property" && node.parent.value === node)
          return;
        if (isIgnoredProperty(node)) return;
        if (isIgnoredCallee(node)) return;
        if (isInsideConstDeclaration(node)) return;
        let currentForEnforce = node;
        if (currentForEnforce.parent.type === "UnaryExpression" && ["+", "-"].includes(currentForEnforce.parent.operator)) {
          currentForEnforce = currentForEnforce.parent;
        }
        if (enforceConst && currentForEnforce.parent.type === "VariableDeclarator" && currentForEnforce.parent.init === currentForEnforce) {
          if (currentForEnforce.parent.parent.kind !== "const") {
            context.report({ node, messageId: "useConst" });
          }
          return;
        }
        context.report({
          node,
          messageId: "noMagic",
          data: { raw }
        });
      }
    };
  }
};

// package.json
var package_default = {
  name: "eslint-plugin-aegis",
  version: "1.0.2",
  description: "Aegis (\u57C3\u7678\u65AF) \u662F\u5E0C\u814A\u795E\u8BDD\u4E2D\u96C5\u5178\u5A1C\u548C\u5B99\u65AF\u6301\u6709\u7684\u795E\u76FE\u3002\u5B83\u8C61\u5F81\u7740\u4FDD\u62A4\u3001\u6743\u5A01\u4E0E\u667A\u6167\u3002",
  type: "module",
  main: "./dist/index.cjs",
  module: "./dist/index.js",
  types: "./dist/index.d.ts",
  exports: {
    ".": {
      import: "./dist/index.js",
      require: "./dist/index.cjs"
    }
  },
  files: [
    "dist"
  ],
  scripts: {
    build: "tsup index.js --format cjs,esm --dts --clean --splitting"
  },
  repository: {
    type: "git",
    url: "git+https://github.com/LLLaiYoung/eslint-plugin-aegis.git"
  },
  keywords: [
    "eslint",
    "eslint-plugin",
    "eslintplugin",
    "code-quality",
    "aegis"
  ],
  author: "LaiYoung_",
  license: "ISC",
  bugs: {
    url: "https://github.com/LLLaiYoung/eslint-plugin-aegis/issues"
  },
  homepage: "https://github.com/LLLaiYoung/eslint-plugin-aegis#readme",
  peerDependencies: {
    eslint: ">=8.0.0"
  },
  devDependencies: {
    tsup: "^8.5.1",
    typescript: "^5.9.3"
  }
};

// index.js
var plugin = {
  // 元数据
  meta: {
    name: package_default.name,
    // 自动同步 "eslint-plugin-aegis"
    version: package_default.version
    // 自动同步
  },
  // 1. 导出规则定义
  rules: {
    "no-duplicate-string": no_duplicate_string_default,
    "no-implicit-complex-object": no_implicit_complex_object_default,
    "no-magic-numbers-strict": no_magic_numbers_strict_default
    // 'future-rule': futureRule // 以后加规则就在这里加一行
  }
};
plugin.configs = {
  // Flat Config (ESLint 9+ 直接引入方式) - 推荐
  // 使用方法: export default [ aegis.configs.recommended ];
  recommended: {
    plugins: {
      aegis: plugin
    },
    rules: recommended_default.rules
  }
};
var meta = plugin.meta;
var rules = plugin.rules;
var configs = plugin.configs;
var index_default = plugin;
export {
  configs,
  index_default as default,
  meta,
  rules
};
