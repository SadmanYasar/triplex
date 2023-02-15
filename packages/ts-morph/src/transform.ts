import { join } from "path";
import {
  createWrappedNode,
  JsxElement,
  JsxSelfClosingElement,
  SourceFile,
  ts,
  VariableDeclarationKind,
} from "ts-morph";
import { getJsxElementPropTypes, getJsxTagName, serializeProps } from "./jsx";

function getNodeTransforms(
  sourceFile: SourceFile,
  element: JsxSelfClosingElement | JsxElement
) {
  const elementName = getJsxTagName(element);
  if (/[a-z]/.exec(elementName[0])) {
    return {
      translate: true,
      scale: true,
      rotate: true,
    };
  }

  const meta = getJsxElementPropTypes(sourceFile, element);

  return {
    filePath: meta.filePath,
    translate: !!meta.propTypes.position,
    scale: !!meta.propTypes.scale,
    rotate: !!meta.propTypes.rotation,
  };
}

const exclude = ["Material", "Geometry"];
function isSceneObject(
  node: ts.Node
): node is ts.JsxSelfClosingElement | ts.JsxElement {
  if (
    ts.isJsxSelfClosingElement(node) &&
    !exclude.find((n) => node.tagName.getText().includes(n))
  ) {
    return true;
  }

  if (
    ts.isJsxElement(node) &&
    !exclude.find((n) => node.openingElement.tagName.getText().includes(n))
  ) {
    return true;
  }

  return false;
}

export function cloneAndWrapSourceJsx(sourceFile: SourceFile, tempDir: string) {
  // This will be the final destination persisted to the file system picked up by the Editor.
  const destination = join(tempDir, sourceFile.getFilePath());

  // This is a temporary destination so we can copy the source file and keep
  // node positions the same while transforming them.
  const tempDestination = join(tempDir, "/temp.tsx");
  const transformedSource = sourceFile.copy(tempDestination, {
    overwrite: true,
  });

  let customLighting = false;

  transformedSource.transform((traversal) => {
    const node = traversal.visitChildren();
    const lineColumn = transformedSource.getLineAndColumnAtPos(node.pos);
    const line = lineColumn.line - 1;
    const column = lineColumn.column - 1;

    if (!isSceneObject(node)) {
      return node;
    }

    if (ts.isJsxSelfClosingElement(node)) {
      const tagName = getJsxTagName(
        createWrappedNode(node, {
          sourceFile: sourceFile.compilerNode.getSourceFile(),
        })
      );
      if (tagName.includes("Light")) {
        customLighting = true;
      }

      const transform = getNodeTransforms(
        transformedSource,
        createWrappedNode(node, {
          sourceFile: sourceFile.compilerNode.getSourceFile(),
        })
      );

      return traversal.factory.createJsxElement(
        traversal.factory.createJsxOpeningElement(
          traversal.factory.createIdentifier("group"),
          [],
          traversal.factory.createJsxAttributes(
            [
              node.attributes.properties.find(
                (x) => x.name?.getText() === "key"
              ),
              traversal.factory.createJsxAttribute(
                traversal.factory.createIdentifier("userData"),
                traversal.factory.createJsxExpression(
                  undefined,
                  traversal.factory.createObjectLiteralExpression([
                    traversal.factory.createPropertyAssignment(
                      "__r3fEditor",
                      traversal.factory.createObjectLiteralExpression([
                        traversal.factory.createPropertyAssignment(
                          "name",
                          traversal.factory.createStringLiteral(tagName)
                        ),
                        traversal.factory.createPropertyAssignment(
                          "path",
                          traversal.factory.createStringLiteral(
                            transform.filePath || ""
                          )
                        ),
                        traversal.factory.createPropertyAssignment(
                          "line",
                          traversal.factory.createNumericLiteral(line)
                        ),
                        traversal.factory.createPropertyAssignment(
                          "column",
                          traversal.factory.createNumericLiteral(column)
                        ),
                        traversal.factory.createPropertyAssignment(
                          "props",
                          serializeProps(traversal, node.attributes)
                        ),
                        traversal.factory.createPropertyAssignment(
                          "translate",
                          transform.translate
                            ? traversal.factory.createTrue()
                            : traversal.factory.createFalse()
                        ),
                        traversal.factory.createPropertyAssignment(
                          "rotate",
                          transform.rotate
                            ? traversal.factory.createTrue()
                            : traversal.factory.createFalse()
                        ),
                        traversal.factory.createPropertyAssignment(
                          "scale",
                          transform.scale
                            ? traversal.factory.createTrue()
                            : traversal.factory.createFalse()
                        ),
                      ])
                    ),
                  ])
                )
              ),
            ].filter(Boolean) as ts.JsxAttributeLike[]
          )
        ),
        [node],
        traversal.factory.createJsxClosingElement(
          traversal.factory.createIdentifier("group")
        )
      );
    }

    if (ts.isJsxElement(node)) {
      const tagName = getJsxTagName(
        createWrappedNode(node, {
          sourceFile: sourceFile.compilerNode.getSourceFile(),
        })
      );
      if (tagName.includes("Light")) {
        customLighting = true;
      }

      const transform = getNodeTransforms(
        transformedSource,
        createWrappedNode(node, {
          sourceFile: sourceFile.compilerNode.getSourceFile(),
        })
      );

      return traversal.factory.updateJsxElement(
        node,
        traversal.factory.createJsxOpeningElement(
          traversal.factory.createIdentifier("group"),
          [],
          traversal.factory.createJsxAttributes([
            traversal.factory.createJsxAttribute(
              traversal.factory.createIdentifier("userData"),
              traversal.factory.createJsxExpression(
                undefined,
                traversal.factory.createObjectLiteralExpression([
                  traversal.factory.createPropertyAssignment(
                    "__r3fEditor",
                    traversal.factory.createObjectLiteralExpression([
                      traversal.factory.createPropertyAssignment(
                        "name",
                        traversal.factory.createStringLiteral(tagName)
                      ),
                      traversal.factory.createPropertyAssignment(
                        "path",
                        traversal.factory.createStringLiteral(
                          transform.filePath || ""
                        )
                      ),
                      traversal.factory.createPropertyAssignment(
                        "line",
                        traversal.factory.createNumericLiteral(line)
                      ),
                      traversal.factory.createPropertyAssignment(
                        "column",
                        traversal.factory.createNumericLiteral(column)
                      ),
                      traversal.factory.createPropertyAssignment(
                        "props",
                        serializeProps(
                          traversal,
                          node.openingElement.attributes
                        )
                      ),
                      traversal.factory.createPropertyAssignment(
                        "translate",
                        transform.translate
                          ? traversal.factory.createTrue()
                          : traversal.factory.createFalse()
                      ),
                      traversal.factory.createPropertyAssignment(
                        "rotate",
                        transform.rotate
                          ? traversal.factory.createTrue()
                          : traversal.factory.createFalse()
                      ),
                      traversal.factory.createPropertyAssignment(
                        "scale",
                        transform.scale
                          ? traversal.factory.createTrue()
                          : traversal.factory.createFalse()
                      ),
                    ])
                  ),
                ])
              )
            ),
          ])
        ),
        [node],
        traversal.factory.createJsxClosingElement(
          traversal.factory.createIdentifier("group")
        )
      );
    }

    return node;
  });

  transformedSource.move(destination, { overwrite: true });

  transformedSource.addVariableStatement({
    isExported: true,
    declarationKind: VariableDeclarationKind.Const,
    declarations: [
      {
        name: "triplexMeta",
        initializer: JSON.stringify({ customLighting }),
      },
    ],
  });

  transformedSource.saveSync();

  return { transformedPath: destination, customLighting };
}