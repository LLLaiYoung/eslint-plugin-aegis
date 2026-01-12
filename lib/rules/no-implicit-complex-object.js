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
