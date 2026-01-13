var recommendedConfig = {
  rules: {
    "aegis/no-duplicate-string": [
      "error",
      {
        threshold: 2,
        minLength: 2,
        ignoreStrings: [
          "application/json", // 常见 MIME
          "YYYY-MM-DD", // 日期格式
        ],
        ignorePatterns: [
          "^/", // 路径
          "^http(s)?://", // URL
          "^#([0-9A-Fa-f]{3,6})$", // HEX 颜色
          "^[0-9]+(px|rem|em|vh|vw|%)$", // CSS 单位
        ],
      },
    ],
    "aegis/no-implicit-complex-object": [
      "error",
      {
        propertyThreshold: 2,
      },
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
        ignoreCalleePatterns: ["^(Date|setTimeout|setInterval|delay)$"],
      },
    ],
    // 未来在这里添加 aegis/other-rule
  },
};

/**
 * 自定义重复字符串检测规则
 */
var noDuplicateString = {
  meta: {
    type: "problem",
    docs: {
      description: "Disallow duplicate strings with granular configuration",
    },
    schema: [
      {
        type: "object",
        properties: {
          threshold: { type: "integer", minimum: 2 },
          minLength: { type: "integer", minimum: 2 },
          ignoreStrings: { type: "array", items: { type: "string" } },
          ignorePatterns: { type: "array", items: { type: "string" } }, // 接收正则字符串
          ignoreTSLiteralTypes: { type: "boolean" }, // 是否忽略 TS 的字面量类型
        },
        additionalProperties: false,
      },
    ],
    messages: {
      duplicate:
        "[Aegis] 字符串 '{{str}}' 重复出现了 {{count}} 次 (阈值: {{threshold}}). 出现行号: {{lines}}.",
    },
  },
  create(context) {
    // 1. 获取配置
    const config = context.options[0] || {};
    const threshold = config.threshold || 2;
    const minLength = config.minLength || 5;
    const ignoreTSLiteralTypes = config.ignoreTSLiteralTypes !== false; // 默认忽略
    const ignoreSet = new Set(config.ignoreStrings || []);
    // 将正则字符串转换为 RegExp 对象
    const ignorePatterns = (config.ignorePatterns || []).map(
      (p) => new RegExp(p)
    );

    // 2. 存储当前文件所有的字符串节点
    // Map<StringValue, Array<ASTNode>>
    const stringMap = new Map();

    /**
     * 辅助函数：记录节点
     */
    function record(node, value) {
      // 1. 基础检查
      if (value.length < minLength) return;
      if (ignoreSet.has(value)) return;

      // 2. 检查字符串本身是否匹配正则
      if (ignorePatterns.some((regex) => regex.test(value))) return;

      // 3. 检查所属函数名是否匹配正则 (向上遍历多层，支持嵌套在属性或表达式中)
      let curr = node.parent;
      let depth = 0;
      while (curr && depth < 4) {
        if (curr.type === "CallExpression") {
          let funcName = "";
          if (curr.callee.type === "Identifier") {
            funcName = curr.callee.name;
          } else if (
            curr.callee.type === "MemberExpression" &&
            curr.callee.property.type === "Identifier"
          ) {
            funcName = curr.callee.property.name;
          }

          if (
            funcName &&
            ignorePatterns.some((regex) => regex.test(funcName))
          ) {
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
          // 忽略 import 语句中的字符串 (例如 import x from '...')
          if (
            node.parent &&
            (node.parent.type === "ImportDeclaration" ||
              node.parent.type === "ExportNamedDeclaration")
          ) {
            return;
          }
          // 是否忽略 TS 的字面量类型 (type T = 'draft')
          if (
            ignoreTSLiteralTypes &&
            node.parent &&
            node.parent.type === "TSLiteralType"
          ) {
            return;
          }
          // 是否忽略对象属性的 Key
          if (
            node.parent &&
            node.parent.type === "Property" &&
            node.parent.key === node
          ) {
            return;
          }

          record(node, node.value);
        }
      },

      // 监听不带变量的模板字符串: `hello`
      TemplateLiteral(node) {
        if (node.expressions.length === 0 && node.quasis.length === 1) {
          const rawValue = node.quasis[0].value.raw;
          // 只有当 raw 和 cooked 一样时才处理，避免处理复杂转义
          if (rawValue) {
            record(node, rawValue);
          }
        }
      },

      // 程序结束时，统计并报错
      "Program:exit"() {
        for (const [str, nodes] of stringMap) {
          if (nodes.length >= threshold) {
            // 对所有重复的节点报错
            const lineNumbers = nodes.map((n) => n.loc.start.line).join(", ");
            nodes.forEach((node) => {
              context.report({
                node,
                messageId: "duplicate",
                data: {
                  str: str.length > 20 ? str.slice(0, 20) + "..." : str, // 截断过长的错误提示
                  count: nodes.length,
                  threshold,
                  lines: lineNumbers,
                },
              });
            });
          }
        }
      },
    };
  },
};

/**
 * 禁止隐式复杂对象
 */
var noImplicitComplexObject = {
  meta: {
    type: "suggestion",
    docs: {
      description:
        "Enforce explicit type annotation for complex object literals",
      recommended: true,
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
          ignorePatterns: { type: "array", items: { type: "string" } },
        },
        additionalProperties: false,
      },
    ],
    messages: {
      missingType:
        "[Aegis] 复杂对象 '{{name}}' ({{props}} 个属性) 缺少显式类型定义。请定义 Interface 或 Type 以确保数据结构安全。",
    },
  },
  create(context) {
    const config = context.options[0] || {};
    const threshold = config.propertyThreshold || 2; // 默认：超过2个属性就必须写类型
    const ignoreVue3Wrappers = config.ignoreVue3Wrappers || false; // 默认不忽略，即开启检测 (Vue 3 特性)
    const ignorePatterns = (config.ignorePatterns || []).map(
      (p) => new RegExp(p)
    );

    return {
      VariableDeclarator(node) {
        const varName = node.id.name;

        // 0. 检查是否匹配忽略正则
        if (varName && ignorePatterns.some((regex) => regex.test(varName))) {
          return;
        }

        let init = node.init;
        if (!init) return;

        // 1. 处理 Vue 3 的 ref({ ... }) 或 reactive({ ... })
        const isWrapperCall =
          !ignoreVue3Wrappers &&
          init.type === "CallExpression" &&
          init.callee.type === "Identifier" &&
          (init.callee.name === "ref" || init.callee.name === "reactive");

        let objectExpression = null;

        if (init.type === "ObjectExpression") {
          objectExpression = init;
        } else if (isWrapperCall) {
          // 如果是 ref<Type>({ ... }) 这种带泛型的，跳过检查
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

        // 2. 如果已经有类型注解了，跳过 (let obj: User = ...)
        if (node.id.typeAnnotation) {
          return;
        }

        // 3. 统计属性数量
        const propertyCount = objectExpression.properties.length;

        // 4. 如果属性数量超过阈值，或者跨越了多行(可选)，则报错
        // 这里我们只用数量阈值，简单直接
        if (propertyCount >= threshold) {
          context.report({
            node: node.id,
            messageId: "missingType",
            data: {
              name: node.id.name || "variable",
              props: propertyCount,
            },
          });
        }
      },
    };
  },
};

/**
 * 禁止魔法数字
 */
var noMagicNumberStrict = {
  meta: {
    type: "suggestion",
    docs: {
      description:
        "Disallow magic numbers with TS support and regex property ignoring",
      recommended: false,
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
            uniqueItems: true,
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
            description:
              "Array of regex strings to ignore magic numbers assigned to specific properties",
          },
          ignoreCalleePatterns: {
            type: "array",
            items: { type: "string" },
            description:
              "Array of regex strings to ignore magic numbers used as arguments for specific functions",
          },
        },
        additionalProperties: false,
      },
    ],
    messages: {
      useConst: "[Aegis] Number constants declarations must use 'const'.",
      noMagic: "[Aegis] No magic number: {{raw}}.",
    },
  },

  create(context) {
    const config = context.options[0] || {};

    // 1. 基础参数
    const detectObjects = !!config.detectObjects;
    const enforceConst = !!config.enforceConst;
    const ignore = config.ignore || [];
    const ignoreArrayIndexes = !!config.ignoreArrayIndexes;
    const ignoreDefaultValues = !!config.ignoreDefaultValues;
    const ignoreClassFieldInitialValues =
      !!config.ignoreClassFieldInitialValues;

    // 2. TS 扩展参数
    const ignoreEnums = !!config.ignoreEnums;
    const ignoreNumericLiteralTypes = !!config.ignoreNumericLiteralTypes;
    const ignoreReadonlyClassProperties =
      !!config.ignoreReadonlyClassProperties;
    const ignoreTypeIndexes = !!config.ignoreTypeIndexes;

    // 3. 自定义正则参数
    const ignorePropertyPatterns = (config.ignorePropertyPatterns || []).map(
      (p) => new RegExp(p)
    );
    const ignoreCalleePatterns = (config.ignoreCalleePatterns || []).map(
      (p) => new RegExp(p)
    );

    /**
     * 判断是否是数组索引
     */
    function isArrayIndex(node) {
      return (
        node.parent.type === "MemberExpression" && node.parent.property === node
      );
    }

    /**
     * 判断是否是默认值
     */
    function isDefaultValue(node) {
      return (
        node.parent.type === "AssignmentPattern" && node.parent.right === node
      );
    }

    /**
     * 判断是否是类字段初始值
     * (对应 ignoreClassFieldInitialValues)
     */
    function isClassFieldInitialValue(node) {
      return (
        node.parent.type === "PropertyDefinition" && node.parent.value === node
      );
    }

    /**
     * === TS 扩展检测逻辑 ===
     */

    // 检测 Enum 成员: enum Status { Active = 1 }
    function isEnumMember(node) {
      return node.parent.type === "TSEnumMember";
    }

    // 检测 TS 字面量类型: type Small = 1 | 2;
    function isNumericLiteralType(node) {
      return (
        node.parent.type === "TSLiteralType" ||
        // 兼容某些解析器结构
        (node.parent.type === "TSUnionType" && node.parent.types.includes(node))
      );
    }

    // 检测 TS Readonly 类属性: class A { readonly ID = 1; }
    function isReadonlyClassProperty(node) {
      // 必须是类属性定义，且 readonly 为 true
      return (
        node.parent.type === "PropertyDefinition" &&
        node.parent.value === node &&
        node.parent.readonly
      );
    }

    // 检测 TS 类型索引: type Item = Data[0];
    function isTypeIndex(node) {
      return (
        node.parent.type === "TSIndexedAccessType" &&
        node.parent.indexType === node
      );
    }

    /**
     * === 自定义正则检测逻辑 ===
     */
    function isIgnoredProperty(node) {
      let current = node;
      if (
        current.parent.type === "UnaryExpression" &&
        ["+", "-"].includes(current.parent.operator)
      ) {
        current = current.parent;
      }

      // 普通对象属性: { width: 55 }
      if (
        current.parent.type === "Property" &&
        current.parent.value === current
      ) {
        const keyNode = current.parent.key;
        let keyName = null;
        if (keyNode.type === "Identifier") keyName = keyNode.name;
        else if (keyNode.type === "Literal") keyName = String(keyNode.value);

        if (
          keyName &&
          ignorePropertyPatterns.some((regex) => regex.test(keyName))
        )
          return true;
      }

      // JSX 属性: <div width={55} />
      if (
        current.parent.type === "JSXExpressionContainer" &&
        current.parent.parent.type === "JSXAttribute"
      ) {
        const attrName = current.parent.parent.name.name;
        if (
          attrName &&
          ignorePropertyPatterns.some((regex) => regex.test(attrName))
        )
          return true;
      }

      return false;
    }

    /**
     * 判断是否是忽略的函数调用参数: setTimeout(..., 100)
     */
    function isIgnoredCallee(node) {
      let current = node;
      // 穿透像控制流一样的表达式，找到 CallExpression 或 NewExpression
      while (current.parent) {
        if (
          current.parent.type === "CallExpression" ||
          current.parent.type === "NewExpression"
        ) {
          const callee = current.parent.callee;
          let calleeName = null;

          if (callee.type === "Identifier") {
            calleeName = callee.name;
          } else if (callee.type === "MemberExpression") {
            // 处理 console.log, Math.floor 等
            if (callee.property.type === "Identifier") {
              calleeName = callee.property.name;
            }
          }

          if (
            calleeName &&
            ignoreCalleePatterns.some((regex) => regex.test(calleeName))
          ) {
            return true;
          }
          break;
        }
        // 如果是逻辑表达式或者条件表达式，继续向上寻找
        if (
          current.parent.type === "ConditionalExpression" ||
          current.parent.type === "LogicalExpression" ||
          current.parent.type === "ChainExpression"
        ) {
          current = current.parent;
        } else {
          break;
        }
      }
      return false;
    }

    /**
     * 判断是否属于常量声明的一部分 (支持深度嵌套)
     * const map = { a: { b: 5 } } -> 5 是常量的一部分
     */
    function isInsideConstDeclaration(node) {
      let current = node;
      while (current.parent) {
        const parent = current.parent;

        if (parent.type === "VariableDeclarator" && parent.init === current) {
          return parent.parent.kind === "const";
        }

        // 允许穿透的嵌套结构
        if (
          parent.type === "ObjectExpression" ||
          parent.type === "ArrayExpression" ||
          parent.type === "Property" ||
          parent.type === "UnaryExpression" ||
          parent.type === "ConditionalExpression" ||
          parent.type === "LogicalExpression" ||
          parent.type === "ChainExpression"
        ) {
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

        // 1. 只检查数字
        if (typeof value !== "number") return;

        // 2. 检查 ignore 列表
        if (ignore.includes(value)) return;

        // 3. 检查原生参数
        if (ignoreArrayIndexes && isArrayIndex(node)) return;
        if (ignoreDefaultValues && isDefaultValue(node)) return;
        if (ignoreClassFieldInitialValues && isClassFieldInitialValue(node))
          return;

        // 4. === 检查 TS 扩展参数 ===
        if (ignoreEnums && isEnumMember(node)) return;
        if (ignoreNumericLiteralTypes && isNumericLiteralType(node)) return;
        if (ignoreReadonlyClassProperties && isReadonlyClassProperty(node))
          return;
        if (ignoreTypeIndexes && isTypeIndex(node)) return;

        // 5. 检查对象属性配置 (detectObjects)
        // 如果没有开启对象检测，且当前是在对象属性中，则忽略
        // 注意：TS Enum 和 Class Property 不属于普通 ObjectExpression，所以上面要先处理
        if (
          !detectObjects &&
          node.parent.type === "Property" &&
          node.parent.value === node
        )
          return;

        // 6. === 检查自定义正则 (New Feature) ===
        if (isIgnoredProperty(node)) return;
        if (isIgnoredCallee(node)) return;

        // 7. 深度常量检查: const X = { y: 100 }
        if (isInsideConstDeclaration(node)) return;

        // 8. 兜底的高阶检测：如果是变量声明且强制要求 const 但不是 const，则报错
        let currentForEnforce = node;
        if (
          currentForEnforce.parent.type === "UnaryExpression" &&
          ["+", "-"].includes(currentForEnforce.parent.operator)
        ) {
          currentForEnforce = currentForEnforce.parent;
        }

        if (
          enforceConst &&
          currentForEnforce.parent.type === "VariableDeclarator" &&
          currentForEnforce.parent.init === currentForEnforce
        ) {
          if (currentForEnforce.parent.parent.kind !== "const") {
            context.report({ node, messageId: "useConst" });
          }
          return;
        }

        // 报错
        context.report({
          node,
          messageId: "noMagic",
          data: { raw },
        });
      },
    };
  },
};

var name = "eslint-plugin-aegis";
var version = "1.0.1";
var pkg = {
	name: name,
	version: version};

const plugin = {
  // 元数据
  meta: {
    name: pkg.name, // 自动同步 "eslint-plugin-aegis"
    version: pkg.version, // 自动同步
  },
  // 1. 导出规则定义
  rules: {
    "no-duplicate-string": noDuplicateString,
    "no-implicit-complex-object": noImplicitComplexObject,
    "no-magic-numbers-strict": noMagicNumberStrict,
    // 'future-rule': futureRule // 以后加规则就在这里加一行
  },
};

// 2. 导出预设配置
plugin.configs = {
  // Flat Config (ESLint 9+ 直接引入方式) - 推荐
  // 使用方法: export default [ aegis.configs.recommended ];
  recommended: {
    plugins: {
      aegis: plugin,
    },
    rules: recommendedConfig.rules,
  },
};

const meta = plugin.meta;
const rules = plugin.rules;
const configs = plugin.configs;

/**
 * ## 本地调试/集成指南
 *
 * 1. 在此目录运行: `yarn build`
 * 2. 在目标项目中安装: `yarn add /Users/laiyoung/Documents/Profession/FE/eslint-plugin-aegis -D`
 * 3. 在 eslint.config.js 中集成使用：
 * ```javascript
 * // eslint.config.js
 * import aegis from 'eslint-plugin-aegis';
 *
 * export default [
 *   aegis.configs.recommended,
 *   // 你的其他配置...
 * ];
 * ```
 */

export { configs, plugin as default, meta, rules };
