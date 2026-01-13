/**
 * 禁止魔法数字
 */
export default {
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
