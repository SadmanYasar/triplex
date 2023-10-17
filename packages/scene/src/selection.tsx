/**
 * Copyright (c) Michael Dougall. All rights reserved.
 *
 * This source code is licensed under the GPL-3.0 license found in the LICENSE
 * file in the root directory of this source tree.
 */
import { ThreeEvent, useFrame, useThree } from "@react-three/fiber";
import { compose, listen, send } from "@triplex/bridge/client";
import type { JsxElementPositions } from "@triplex/server";
import { preloadSubscription, useSubscriptionEffect } from "@triplex/ws-client";
import {
  createContext,
  ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  Box3,
  Object3D,
  PerspectiveCamera,
  Vector3,
  Vector3Tuple,
} from "three";
import { useCamera } from "./components/camera";
import { TransformControls } from "./components/transform-controls";
import { SceneObjectProps } from "./scene-object";

export type EditorNodeData = SceneObjectProps["__meta"] & {
  parentPath: string;
  // Unaltered props currently set on the component.
  props: Record<string, unknown>;
  sceneObject: Object3D;
  space: "local" | "world";
};

function encodeProps(selected: EditorNodeData): string {
  const props = { ...selected.props };

  for (const key in props) {
    const prop = props[key];
    if (prop && typeof prop === "object" && "$$typeof" in prop) {
      // We remove any jsx elements from props as they can't be serialized.
      delete props[key];
    }
  }

  if ("position" in props) {
    // If position exists we want to make sure we pass in the world position
    // So if any parent groups have their position set when we transition
    // It won't jump around unexpectedly.
    const worldPosition = selected.sceneObject.getWorldPosition(V1).toArray();

    return JSON.stringify({
      ...props,
      position: worldPosition,
    });
  }

  return JSON.stringify(props);
}

const findTransformedSceneObject = (
  sceneObject: Object3D,
  transform: "translate" | "scale" | "rotate"
): Object3D => {
  let foundExactSceneObject: Object3D | undefined = undefined;
  let foundTranslatedSceneObject: Object3D | undefined;

  sceneObject.traverse((child: Object3D) => {
    const meta: SceneObjectProps["__meta"] | undefined =
      child.userData.triplexSceneMeta;

    // We need to find out if one of the jsx elements between sceneObject
    // and the next triplex boundary has the transform prop applied - if it
    // does we've found the scene object we're interested in!
    // This data is set by the @triplex/client babel plugin.
    if (!foundExactSceneObject && meta && meta[transform]) {
      // The direct child will be the one we're interested in as it is a child
      // of the intermediately placed group in the SceneObject component.
      foundExactSceneObject = child.children[0];
    }

    // As a backup we mark a the first found translated scene object if present.
    // We use this if scale and rotate are not found when traversing children.
    // This means the transform gizmo stays on the scene object instead of moving to [0,0,0].
    if (!foundTranslatedSceneObject && meta && meta.translate) {
      // The direct child will be the one we're interested in as it is a child
      // of the intermediately placed group in the SceneObject component.
      foundTranslatedSceneObject = child.children[0];
    }
  });

  return foundExactSceneObject || foundTranslatedSceneObject || sceneObject;
};

function flatten(
  positions: JsxElementPositions[]
): Exclude<JsxElementPositions, "children">[] {
  const result: Exclude<JsxElementPositions, "children">[] = [];

  for (let i = 0; i < positions.length; i++) {
    const item = positions[i];
    if (item.children) {
      result.push(...flatten(item.children));
    }

    result.push(item);
  }

  return result;
}

function isInScene(
  path: string,
  node: EditorNodeData,
  positions: JsxElementPositions[]
): boolean {
  if (path === node.path) {
    for (let i = 0; i < positions.length; i++) {
      const position = positions[i];
      if (node.line === position.line && node.column === position.column) {
        return true;
      }
    }
  }

  return false;
}

const findEditorData = (
  path: string,
  object: Object3D,
  transform: "translate" | "scale" | "rotate",
  positions: JsxElementPositions[]
): EditorNodeData | null => {
  let parent: Object3D | null = object;
  let data: EditorNodeData | null = null;

  while (parent) {
    if (
      "triplexSceneMeta" in parent.userData &&
      !data &&
      isInScene(path, parent.userData.triplexSceneMeta, positions)
    ) {
      const isHostElement = !!/^[a-z]/.exec(
        parent.userData.triplexSceneMeta.name
      );

      // Keep traversing up the tree to find the top most wrapped scene object.
      data = {
        ...parent.userData.triplexSceneMeta,
        sceneObject: isHostElement
          ? parent.children[0]
          : findTransformedSceneObject(parent.children[0], transform),
        space: "world",
      } as EditorNodeData;
    }

    parent = parent.parent;

    if (
      data &&
      parent &&
      (parent.position.lengthSq() > 0 || parent.scale.lengthSq() > 0)
    ) {
      // There is a parent that has set position/scale so this must be local space.
      // This affects the resulting position calculated later on after a transform.
      data.space = "local";
    }
  }

  if (data) {
    return { ...data, parentPath: path };
  }

  return null;
};

const findSceneObjectFromSource = (
  path: string,
  scene: Object3D,
  line: number,
  column: number,
  transform: "translate" | "scale" | "rotate",
  positions: JsxElementPositions[]
): EditorNodeData | null => {
  let nodeData: EditorNodeData | null = null;

  scene.traverse((obj) => {
    if ("triplexSceneMeta" in obj.userData) {
      const node: EditorNodeData = obj.userData.triplexSceneMeta;

      if (
        node.path === path &&
        node.column === column &&
        node.line === line &&
        obj.children[0]
      ) {
        // We've found our scene object that _also_ has a direct child in the
        // Three.js scene.
        nodeData = findEditorData(path, obj, transform, positions);
      }
    }
  });

  return nodeData;
};

const V1 = new Vector3();
const box = new Box3();
const SelectionContext = createContext<(select: Object3D) => void>(() => {
  throw new Error("invariant");
});

export const useSelectSceneObject = () => {
  const select = useContext(SelectionContext);
  return select;
};

export function Selection({
  children,
  exportName,
  onBlur,
  onFocus,
  onJumpTo,
  onNavigate,
  path: rootPath,
}: {
  children?: ReactNode;
  exportName: string;
  onBlur: () => void;
  onFocus: (node: {
    column: number;
    line: number;
    parentPath: string;
    path: string;
  }) => void;
  onJumpTo: (v: Vector3Tuple, bb: Box3, obj: Object3D) => void;
  onNavigate: (node: {
    encodedProps: string;
    exportName: string;
    path: string;
  }) => void;
  path: string;
}) {
  const [selected, setSelected] = useState<{
    column: number;
    line: number;
    parentPath: string;
    path: string;
  }>();
  const [transform, setTransform] = useState<"translate" | "rotate" | "scale">(
    "translate"
  );
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const transformControls = useRef<any>(null);
  const dragging = useRef(false);
  const scene = useThree((store) => store.scene);
  const { setCamera } = useCamera();
  const sceneData = useSubscriptionEffect("/scene/:path/:exportName", {
    disabled: !rootPath || !exportName,
    exportName,
    path: rootPath,
  });
  const sceneObjects = useMemo(
    () => flatten(sceneData?.sceneObjects || []),
    [sceneData]
  );
  const selectedSceneObject = useSubscriptionEffect(
    "/scene/:path/object/:line/:column",
    {
      column: selected?.column,
      disabled: !selected || (selected?.line === -1 && selected?.column === -1),
      line: selected?.line,
      path: selected?.parentPath,
    }
  );
  const selectedObject = selected
    ? findSceneObjectFromSource(
        selected.parentPath,
        scene,
        selected.line,
        selected.column,
        transform,
        sceneObjects
      )
    : null;

  useEffect(() => {
    send("trplx:onTransformChange", { mode: transform });
  }, [transform]);

  useEffect(() => {
    return listen("trplx:requestTransformChange", ({ mode }) => {
      setTransform(mode);
    });
  }, []);

  useEffect(() => {
    return listen("trplx:requestNavigateToScene", (sceneObject) => {
      if (!sceneObject && (!selectedObject || !selectedSceneObject)) {
        return;
      }

      if (sceneObject && sceneObject.path) {
        onNavigate(sceneObject);
        setSelected(undefined);
        onBlur();
      } else if (
        selectedObject &&
        selectedSceneObject &&
        selectedSceneObject.type === "custom"
      ) {
        onNavigate({
          encodedProps: encodeProps(selectedObject),
          exportName: selectedSceneObject.exportName,
          path: selectedSceneObject.path,
        });
        setSelected(undefined);
        onBlur();
      }
    });
  }, [onBlur, onNavigate, selectedObject, selectedSceneObject]);

  useEffect(() => {
    return listen("trplx:requestBlurSceneObject", () => {
      setSelected(undefined);
      send("trplx:onSceneObjectBlur", undefined);
    });
  }, []);

  useEffect(() => {
    if (!selectedObject) {
      return;
    }

    return listen("trplx:requestJumpToSceneObject", () => {
      box.setFromObject(selectedObject.sceneObject);
      onJumpTo(
        selectedObject.sceneObject.getWorldPosition(V1).toArray(),
        box,
        selectedObject.sceneObject
      );
    });
  }, [onJumpTo, selectedObject]);

  useEffect(() => {
    if (!selectedSceneObject || selectedSceneObject.type === "host") {
      return;
    }

    preloadSubscription("/scene/:path/:exportName", {
      exportName: selectedSceneObject.exportName,
      path: selectedSceneObject.path,
    });
  }, [selectedSceneObject]);

  useEffect(() => {
    return compose([
      listen("trplx:requestAction", ({ action }) => {
        if (
          action === "viewFocusedCamera" &&
          selectedObject &&
          "isCamera" in selectedObject.sceneObject
        ) {
          setCamera(selectedObject.sceneObject as PerspectiveCamera, {
            column: selectedObject.column,
            line: selectedObject.line,
            path: selectedObject.path,
          });
        }
      }),
      listen("trplx:requestFocusSceneObject", (data) => {
        setSelected(data);
        send("trplx:onSceneObjectFocus", data);
      }),
    ]);
  }, [selectedObject, setCamera]);

  const onClick = useCallback(
    async (e: ThreeEvent<MouseEvent>) => {
      if (
        e.delta > 1 ||
        // Any scene objects that have this in their name will be excluded
        // Currently that's just the helpers inside ./components/helper.tsx
        e.object.name.includes("triplex_ignore")
      ) {
        return;
      }

      if (selected && e.object === selectedObject?.sceneObject) {
        // Ignore this event we're already selected.
        return;
      }

      // TODO: If clicking on a scene object when a selection is already
      // made this will fire A LOT OF TIMES. Need to investigate why.
      const data = findEditorData(rootPath, e.object, transform, sceneObjects);
      if (data) {
        e.stopPropagation();
        setSelected(data);
        onFocus({
          column: data.column,
          line: data.line,
          parentPath: data.parentPath,
          path: data.path,
        });
      }
    },
    [
      onFocus,
      rootPath,
      sceneObjects,
      selected,
      selectedObject?.sceneObject,
      transform,
    ]
  );

  const onMouseUp = useCallback(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (e: any) => {
      dragging.current = false;

      if (!e || !selectedObject || !selectedSceneObject) {
        return;
      }

      if (e.mode === "translate") {
        const position =
          selectedObject.space === "world"
            ? selectedObject.sceneObject.getWorldPosition(V1).toArray()
            : selectedObject.sceneObject.position.toArray();

        send("trplx:onConfirmSceneObjectProp", {
          column: selectedObject.column,
          line: selectedObject.line,
          path: selectedObject.path,
          propName: "position",
          propValue: position,
        });
      }

      if (e.mode === "rotate") {
        const rotation = selectedObject.sceneObject.rotation.toArray();
        rotation.pop();

        send("trplx:onConfirmSceneObjectProp", {
          column: selectedObject.column,
          line: selectedObject.line,
          path: selectedObject.path,
          propName: "rotation",
          propValue: rotation,
        });
      }

      if (e.mode === "scale") {
        const scale = selectedObject.sceneObject.scale.toArray();

        send("trplx:onConfirmSceneObjectProp", {
          column: selectedObject.column,
          line: selectedObject.line,
          path: selectedObject.path,
          propName: "scale",
          propValue: scale,
        });
      }
    },
    [selectedObject, selectedSceneObject]
  );

  useFrame(() => {
    if (selectedObject && selectedObject.sceneObject.parent === null) {
      // If the scene object gets removed from the scene unselect it.
      setSelected(undefined);
    }
  });

  const selectSceneObject = useCallback(
    (object: Object3D) => {
      const data = findEditorData(rootPath, object, transform, sceneObjects);
      if (data) {
        setSelected(data);
        // Create a new object to pick only what we need as it will be serialized later
        onFocus({
          column: data.column,
          line: data.line,
          parentPath: rootPath,
          path: data.path,
        });
      }
    },
    [onFocus, rootPath, sceneObjects, transform]
  );

  return (
    <group name="selection-group" onClick={onClick}>
      <SelectionContext.Provider value={selectSceneObject}>
        {children}
      </SelectionContext.Provider>

      {selectedObject && (
        <TransformControls
          enabled={
            !!selectedSceneObject && selectedSceneObject.transforms[transform]
          }
          mode={transform}
          object={selectedObject.sceneObject}
          onMouseDown={() => (dragging.current = true)}
          onMouseUp={onMouseUp}
          ref={transformControls}
        />
      )}
    </group>
  );
}
