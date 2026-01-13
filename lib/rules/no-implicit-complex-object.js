/**
 * 禁止隐式复杂对象
 */
export default {
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

    /**
     * 检查是否有复杂的内联类型定义 (TSTypeLiteral)
     */
    function checkComplexType(node, name) {
      if (
        node.typeAnnotation &&
        node.typeAnnotation.typeAnnotation &&
        node.typeAnnotation.typeAnnotation.type === "TSTypeLiteral"
      ) {
        const typeLiteral = node.typeAnnotation.typeAnnotation;
        const propertyCount = typeLiteral.members.length;

        if (propertyCount >= threshold) {
          context.report({
            node: node,
            messageId: "missingType",
            data: {
              name: name || "parameter",
              props: propertyCount,
            },
          });
          return true;
        }
      }
      return false;
    }

    return {
      VariableDeclarator(node) {
        const varName = node.id.name;

        // 0. 检查是否匹配忽略正则
        if (varName && ignorePatterns.some((regex) => regex.test(varName))) {
          return;
        }

        // 1. 检查是否有复杂的内联类型定义 (let obj: { a: 1, b: 2 } = ...)
        if (checkComplexType(node.id, varName)) {
          return;
        }

        let init = node.init;
        if (!init) return;

        // 2. 处理 Vue 3 的 ref({ ... }) 或 reactive({ ... })
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

        // 3. 如果已经有类型注解了，跳过 (let obj: User = ...)
        if (node.id.typeAnnotation) {
          return;
        }

        // 4. 统计属性数量
        const propertyCount = objectExpression.properties.length;

        // 5. 如果属性数量超过阈值，则报错
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
      "FunctionDeclaration, FunctionExpression, ArrowFunctionExpression"(node) {
        node.params.forEach((param) => {
          let paramName = "";
          if (param.type === "Identifier") {
            paramName = param.name;
          } else if (
            param.type === "AssignmentPattern" &&
            param.left.type === "Identifier"
          ) {
            paramName = param.left.name;
          }

          if (
            paramName &&
            ignorePatterns.some((regex) => regex.test(paramName))
          ) {
            return;
          }

          checkComplexType(param, paramName || "parameter");
        });
      },
    };
  },
};
